import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { ANEXOS, LIMITE_MEI, LIMITE_SIMPLES, SUBLIMITE_ICMS_ISS, aliquotaEfetiva, faixaDoAnexo, type TributoSimples } from "./tabelas-lc123";
import { grupoMonofasicoDoNcm } from "./monofasico-ncm";

/**
 * APURAÇÃO DO SIMPLES NACIONAL / MEI — o "plus" que o contador que só pega XML não entrega:
 *  - RBT12 e alíquota efetiva pela LC 123 (empresa nova proporcionalizada);
 *  - SEGREGAÇÃO de receitas: revenda de produtos MONOFÁSICOS (PIS/COFINS já pagos pela indústria)
 *    e com ICMS-ST (ICMS já retido) sai do DAS nas parcelas correspondentes — economia direta;
 *  - DAS estimado com/sem segregação, partilha por tributo, Fator R, sublimite e limites (MEI).
 * ESTIMATIVA GERENCIAL: o valor oficial é o do PGDAS-D — este relatório é o mapa para o contador
 * preencher a segregação lá (e conferir se ele está aproveitando).
 */

export class SimplesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimplesError";
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export type SegmentoReceita = {
  rotulo: string;
  valor: number;
  /** Tributos EXCLUÍDOS da alíquota nesta parcela (já recolhidos fora do DAS). */
  tributosExcluidos: TributoSimples[];
};

export type ApuracaoSimples = {
  regime: string;
  anexo: number | null;
  anexoNome: string | null;
  competencia: string;
  // Receitas
  receitaMes: number;
  receitaMonofasica: number;
  receitaSt: number;
  receitaMonofasicaSt: number;
  receitaServicos: number;
  receitaNormal: number;
  rbt12: number;
  rbt12Proporcionalizado: boolean;
  receitaAnoAtual: number;
  // Alíquotas
  faixa: number;
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  partilha: Array<{ tributo: TributoSimples; percentual: number; aliquotaEfetiva: number; valorSemSegregacao: number; valorComSegregacao: number }>;
  // DAS
  dasSemSegregacao: number;
  dasComSegregacao: number;
  economiaSegregacao: number;
  // Indicadores
  fatorR: number | null;
  fatorRAtingido: boolean | null;
  alertas: string[];
  // MEI
  mei: { limite: number; acumuladoAno: number; percentualConsumido: number; projecaoAnual: number; excedeu: boolean } | null;
  // Detalhe por mês (RBT12)
  meses: Array<{ competencia: string; receita: number }>;
  disclaimer: string;
};

/** Receita bruta de vendas do mês: notas AUTORIZADAS finalidade NORMAL menos devoluções de venda. */
async function receitaDoMes(scope: TenantScope, inicio: Date, fim: Date): Promise<number> {
  const [vendas, devolucoes] = await Promise.all([
    prisma.notaFiscal.aggregate({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: "AUTORIZADA",
        finalidade: "NORMAL",
        emitidaEm: { gte: inicio, lte: fim }
      },
      _sum: { total: true }
    }),
    // Devolução de VENDA (NF-e de entrada própria vinculada ao pedido) DEDUZ a receita bruta.
    prisma.notaFiscal.aggregate({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: "AUTORIZADA",
        finalidade: "DEVOLUCAO",
        pedidoVendaId: { not: null },
        emitidaEm: { gte: inicio, lte: fim }
      },
      _sum: { total: true }
    })
  ]);
  return round2(Number(vendas._sum.total ?? 0) - Number(devolucoes._sum.total ?? 0));
}

export async function apuracaoSimples(scope: TenantScope, params: { mes: number; ano: number }): Promise<ApuracaoSimples> {
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId },
    select: { regimeTributario: true, simplesAnexo: true, simplesFolhaMensal: true, tipoNegocio: true }
  });
  if (!empresa) throw new SimplesError("Empresa não encontrada.");

  const mes = Math.min(12, Math.max(1, Math.floor(params.mes)));
  const ano = Math.max(2000, Math.floor(params.ano));
  const inicioMes = new Date(ano, mes - 1, 1);
  const fimMes = new Date(ano, mes, 0, 23, 59, 59);
  const competencia = `${String(mes).padStart(2, "0")}/${ano}`;

  // ── Receita mês a mês dos 12 meses ANTERIORES (RBT12) + mês da apuração ──
  const meses: Array<{ competencia: string; receita: number }> = [];
  for (let k = 12; k >= 1; k--) {
    const ref = new Date(ano, mes - 1 - k, 1);
    const fimRef = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);
    const receita = await receitaDoMes(scope, ref, fimRef);
    meses.push({ competencia: `${String(ref.getMonth() + 1).padStart(2, "0")}/${ref.getFullYear()}`, receita });
  }
  const receitaMes = await receitaDoMes(scope, inicioMes, fimMes);

  const mesesComReceita = meses.filter((m) => m.receita > 0).length;
  const somaRbt12 = round2(meses.reduce((s, m) => s + m.receita, 0));
  // Empresa em início de atividade (LC 123 §2º): média dos meses com receita × 12.
  const rbt12Proporcionalizado = mesesComReceita > 0 && mesesComReceita < 12;
  const rbt12 = rbt12Proporcionalizado
    ? round2((somaRbt12 / mesesComReceita) * 12)
    : somaRbt12 > 0 ? somaRbt12 : receitaMes * 12; // 1º mês de vida: proporcionaliza o próprio mês

  // Receita acumulada no ANO-CALENDÁRIO (limites/MEI).
  const inicioAno = new Date(ano, 0, 1);
  const receitaAnoAteMes = await receitaDoMes(scope, inicioAno, fimMes);

  const alertas: string[] = [];
  const disclaimer =
    "Estimativa gerencial pela LC 123/2006 — o valor oficial do DAS é o calculado no PGDAS-D. Use este relatório para conferir a SEGREGAÇÃO de receitas com o contador.";

  // ── MEI: painel simplificado de limite ──
  if (empresa.regimeTributario === "MEI") {
    const pct = LIMITE_MEI > 0 ? round2((receitaAnoAteMes / LIMITE_MEI) * 100) : 0;
    const projecao = mes > 0 ? round2((receitaAnoAteMes / mes) * 12) : 0;
    if (pct >= 100) alertas.push(`Faturamento do ano (R$ ${receitaAnoAteMes.toFixed(2)}) JÁ PASSOU do limite do MEI (R$ ${LIMITE_MEI.toFixed(2)}) — fale com o contador sobre o desenquadramento (vira ME no Simples).`);
    else if (pct >= 80) alertas.push(`Atenção: já consumiu ${pct.toFixed(1)}% do limite anual do MEI. Passando de R$ ${LIMITE_MEI.toFixed(2)} (ou 20% a mais), há desenquadramento.`);
    if (projecao > LIMITE_MEI) alertas.push(`No ritmo atual, a projeção do ano é R$ ${projecao.toFixed(2)} — acima do limite do MEI. Planeje a migração para ME/Simples com antecedência.`);
    return {
      regime: "MEI",
      anexo: null,
      anexoNome: null,
      competencia,
      receitaMes,
      receitaMonofasica: 0,
      receitaSt: 0,
      receitaMonofasicaSt: 0,
      receitaServicos: 0,
      receitaNormal: receitaMes,
      rbt12,
      rbt12Proporcionalizado,
      receitaAnoAtual: receitaAnoAteMes,
      faixa: 0,
      aliquotaNominal: 0,
      aliquotaEfetiva: 0,
      partilha: [],
      dasSemSegregacao: 0,
      dasComSegregacao: 0,
      economiaSegregacao: 0,
      fatorR: null,
      fatorRAtingido: null,
      alertas,
      mei: { limite: LIMITE_MEI, acumuladoAno: receitaAnoAteMes, percentualConsumido: pct, projecaoAnual: projecao, excedeu: receitaAnoAteMes > LIMITE_MEI },
      meses,
      disclaimer:
        "MEI paga DAS-MEI fixo mensal (INSS + ICMS/ISS) — o painel acompanha o LIMITE anual e a projeção. " + disclaimer
    };
  }

  // ── Simples Nacional: anexo obrigatório ──
  const anexo = empresa.simplesAnexo ?? (empresa.tipoNegocio === "SERVICO" ? 3 : 1);
  if (!ANEXOS[anexo]) throw new SimplesError("Anexo do Simples inválido — configure na própria tela (1=Comércio, 2=Indústria, 3/4/5=Serviços).");
  if (!empresa.simplesAnexo) {
    alertas.push(`Anexo do Simples não configurado — usando o Anexo ${anexo} (sugerido pelo tipo do negócio). Confirme com o contador e salve na tela.`);
  }

  // ── SEGREGAÇÃO por item das notas do mês (monofásico / ICMS-ST) ──
  const itens = await prisma.notaFiscalItem.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nota: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: "AUTORIZADA",
        finalidade: "NORMAL",
        emitidaEm: { gte: inicioMes, lte: fimMes }
      }
    },
    select: {
      valorTotal: true,
      desconto: true,
      ncm: true,
      csosn: true,
      cstIcms: true,
      produto: { select: { fiscal: { select: { pisCofinsMonofasico: true, icmsSt: true } } } }
    }
  });
  const servicos = await prisma.notaFiscal.aggregate({
    where: { ...scopedByTenantCompanyAmbiente(scope), status: "AUTORIZADA", finalidade: "NORMAL", emitidaEm: { gte: inicioMes, lte: fimMes } },
    _sum: { valorServicos: true }
  });
  const receitaServicos = round2(Number(servicos._sum.valorServicos ?? 0));

  let receitaMonofasica = 0;
  let receitaSt = 0;
  let receitaMonofasicaSt = 0;
  for (const item of itens) {
    const liquido = Number(item.valorTotal) - Number(item.desconto);
    if (liquido <= 0) continue;
    // Monofásico: flag do cadastro fiscal OU NCM na lista de referência das leis.
    const mono = item.produto?.fiscal?.pisCofinsMonofasico || Boolean(grupoMonofasicoDoNcm(item.ncm));
    // ST (substituído): flag do cadastro OU a própria nota saiu como CSOSN 500 / CST 60.
    const st = item.produto?.fiscal?.icmsSt || item.csosn === "500" || item.cstIcms === "60";
    if (mono && st) receitaMonofasicaSt += liquido;
    else if (mono) receitaMonofasica += liquido;
    else if (st) receitaSt += liquido;
  }
  receitaMonofasica = round2(receitaMonofasica);
  receitaSt = round2(receitaSt);
  receitaMonofasicaSt = round2(receitaMonofasicaSt);
  const receitaNormal = round2(Math.max(0, receitaMes - receitaMonofasica - receitaSt - receitaMonofasicaSt - receitaServicos));

  // ── Alíquota efetiva e partilha ──
  const { efetiva, nominal, indiceFaixa } = aliquotaEfetiva(anexo, rbt12);
  const { faixa } = faixaDoAnexo(anexo, rbt12);

  const segmentos: SegmentoReceita[] = [
    { rotulo: "Revenda comum", valor: receitaNormal, tributosExcluidos: [] },
    { rotulo: "Monofásico (PIS/COFINS zerados)", valor: receitaMonofasica, tributosExcluidos: ["PIS", "COFINS"] },
    { rotulo: "ICMS-ST (ICMS zerado)", valor: receitaSt, tributosExcluidos: ["ICMS"] },
    { rotulo: "Monofásico + ST", valor: receitaMonofasicaSt, tributosExcluidos: ["PIS", "COFINS", "ICMS"] },
    { rotulo: "Serviços", valor: receitaServicos, tributosExcluidos: [] }
  ];

  const tributos = Object.keys(faixa.partilha) as TributoSimples[];
  const partilha = tributos.map((tributo) => {
    const percentual = faixa.partilha[tributo] ?? 0;
    const aliqTributo = (efetiva * percentual) / 100;
    const valorSem = round2((receitaMes * aliqTributo) / 100);
    const valorCom = round2(segmentos.reduce((s, seg) => s + (seg.tributosExcluidos.includes(tributo) ? 0 : (seg.valor * aliqTributo) / 100), 0));
    return { tributo, percentual, aliquotaEfetiva: Math.round(aliqTributo * 10000) / 10000, valorSemSegregacao: valorSem, valorComSegregacao: valorCom };
  });

  const dasSemSegregacao = round2(partilha.reduce((s, p) => s + p.valorSemSegregacao, 0));
  const dasComSegregacao = round2(partilha.reduce((s, p) => s + p.valorComSegregacao, 0));
  const economiaSegregacao = round2(dasSemSegregacao - dasComSegregacao);

  // ── Fator R (folha 12m / RBT12) — serviços ──
  const folhaMensal = empresa.simplesFolhaMensal != null ? Number(empresa.simplesFolhaMensal) : null;
  const fatorR = folhaMensal != null && rbt12 > 0 ? Math.round(((folhaMensal * 12) / rbt12) * 10000) / 100 : null;
  const fatorRAtingido = fatorR != null ? fatorR >= 28 : null;
  if (anexo === 5 && fatorRAtingido) {
    alertas.push(`Fator R de ${fatorR}% (≥ 28%): a empresa pode apurar pelo ANEXO III (alíquotas bem menores que o V). Confirme com o contador.`);
  }
  if (anexo === 3 && fatorR != null && !fatorRAtingido && folhaMensal != null) {
    alertas.push(`Fator R de ${fatorR}% (< 28%): se a atividade for sujeita ao Fator R, a apuração pode cair no ANEXO V. Confirme o enquadramento da atividade.`);
  }

  // ── Limites ──
  if (rbt12 > LIMITE_SIMPLES) alertas.push(`RBT12 (R$ ${rbt12.toFixed(2)}) acima do LIMITE do Simples (R$ ${LIMITE_SIMPLES.toFixed(2)}) — risco de exclusão do regime.`);
  else if (rbt12 > SUBLIMITE_ICMS_ISS) alertas.push(`RBT12 acima do SUBLIMITE de R$ ${SUBLIMITE_ICMS_ISS.toFixed(2)}: ICMS e ISS saem do DAS e passam a ser apurados por fora (regime normal estadual/municipal).`);
  if (economiaSegregacao > 0) {
    alertas.push(`Segregando monofásico/ST, o DAS estimado cai R$ ${economiaSegregacao.toFixed(2)} neste mês — confira se o PGDAS-D está sendo preenchido com essa segregação.`);
  }
  if (receitaMonofasica + receitaMonofasicaSt === 0 && anexo === 1) {
    alertas.push("Nenhuma receita monofásica identificada. Se a empresa revende autopeças, bebidas, medicamentos ou perfumaria, use o botão 'Detectar monofásicos por NCM' — pode haver economia não aproveitada.");
  }

  return {
    regime: empresa.regimeTributario,
    anexo,
    anexoNome: ANEXOS[anexo].nome,
    competencia,
    receitaMes,
    receitaMonofasica,
    receitaSt,
    receitaMonofasicaSt,
    receitaServicos,
    receitaNormal,
    rbt12,
    rbt12Proporcionalizado,
    receitaAnoAtual: receitaAnoAteMes,
    faixa: indiceFaixa + 1,
    aliquotaNominal: nominal,
    aliquotaEfetiva: efetiva,
    partilha,
    dasSemSegregacao,
    dasComSegregacao,
    economiaSegregacao,
    fatorR,
    fatorRAtingido,
    alertas,
    mei: null,
    meses,
    disclaimer
  };
}

/**
 * Marca em massa como MONOFÁSICO os produtos cujo NCM está nas listas de lei (autopeças,
 * medicamentos/perfumaria, bebidas frias, combustíveis). Só ATIVA a flag (nunca desmarca) e
 * devolve o detalhamento por grupo para revisão com o contador.
 */
export async function detectarMonofasicosPorNcm(scope: TenantScope, usuarioId?: string): Promise<{ marcados: number; porGrupo: Record<string, number> }> {
  const fiscais = await prisma.produtoFiscal.findMany({
    where: { ...scopedByTenantCompany(scope), pisCofinsMonofasico: false },
    select: { id: true, ncm: true }
  });
  const porGrupo: Record<string, number> = {};
  const ids: string[] = [];
  for (const f of fiscais) {
    const grupo = grupoMonofasicoDoNcm(f.ncm);
    if (!grupo) continue;
    ids.push(f.id);
    porGrupo[grupo.descricao] = (porGrupo[grupo.descricao] ?? 0) + 1;
  }
  if (ids.length) {
    await prisma.produtoFiscal.updateMany({ where: { id: { in: ids } }, data: { pisCofinsMonofasico: true } });
    await prisma.$transaction(async (tx) => createAuditLog(tx, {
      scope, usuarioId, entidade: "ProdutoFiscal", entidadeId: "LOTE", acao: "MONOFASICO_NCM", payload: { marcados: ids.length, porGrupo }
    }));
  }
  return { marcados: ids.length, porGrupo };
}

/** Config do Simples na empresa (anexo + folha p/ Fator R) — editada na própria tela de apuração. */
export async function salvarConfigSimples(scope: TenantScope, input: { anexo?: number | null; folhaMensal?: number | null }, usuarioId?: string) {
  if (input.anexo != null && !ANEXOS[input.anexo]) throw new SimplesError("Anexo inválido (1 a 5).");
  const empresa = await prisma.empresa.update({
    where: { id: scope.empresaId },
    data: {
      ...(input.anexo !== undefined ? { simplesAnexo: input.anexo } : {}),
      ...(input.folhaMensal !== undefined ? { simplesFolhaMensal: input.folhaMensal != null ? round2(input.folhaMensal) : null } : {})
    }
  });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "Empresa", entidadeId: scope.empresaId, acao: "CONFIG_SIMPLES",
    payload: { anexo: input.anexo ?? null, folhaMensal: input.folhaMensal ?? null }
  }));
  return { anexo: empresa.simplesAnexo, folhaMensal: empresa.simplesFolhaMensal != null ? Number(empresa.simplesFolhaMensal) : null };
}
