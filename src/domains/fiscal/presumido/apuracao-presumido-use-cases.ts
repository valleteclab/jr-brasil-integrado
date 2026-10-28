import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { classificarReceita, receitaDaNota, type ClassificacaoReceita } from "./classificacao-receita";
import { buscarFechamento, listarOutrasReceitas, type FechamentoResumo, type OutraReceitaResumo } from "./fechamento-use-cases";
import {
  CSLL_ALIQUOTA,
  DARF,
  IRPJ_ADICIONAL_ALIQUOTA,
  IRPJ_ADICIONAL_LIMITE_MENSAL,
  IRPJ_ALIQUOTA,
  PRESUNCOES,
  periodoDoTrimestre,
  vencimentoDoTrimestre,
  type TipoReceita
} from "./tabelas-presuncao";

/**
 * APURAÇÃO DO IRPJ/CSLL — LUCRO PRESUMIDO (e estimativa mensal do LUCRO REAL).
 *
 * O que o módulo entrega e a planilha do contador normalmente não mostra:
 *  - a receita CLASSIFICADA nota a nota, com o percentual de presunção e a base legal de cada uma;
 *  - obra por empreitada total a 8%/12% sobre a receita bruta INTEIRA, sem fracionar entre
 *    material e mão de obra (IN RFB 1.700/17 art. 33; ADN Cosit 6/97; SC Cosit 65/2022 e 138/2023;
 *    CARF, Acórdão 9101-002.542);
 *  - conferência cruzada com a retenção do tomador (1,2% x 4,8%, IN RFB 1.234/12), que denuncia
 *    classificação errada;
 *  - regime de CAIXA de verdade, puxando o recebido do contas a receber (IN RFB 1.700/17 art. 223).
 *
 * ESTIMATIVA GERENCIAL: o valor oficial é o apurado na ECF/DCTF pela contabilidade. Receitas fora
 * de nota fiscal (rendimento financeiro, aluguel, ganho de capital) precisam ser informadas à
 * parte — elas entram na base e o sistema não as conhece.
 */

export class PresumidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresumidoError";
  }
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type LinhaReceita = {
  notaId: string;
  modelo: string;
  numero: string;
  serie: string;
  /** Data que define a competência da apuração (emissão ou recebimento). */
  data: string;
  destinatario: string;
  /** Receita considerada (bruta da nota, ou o valor recebido no regime de caixa). */
  valor: number;
  valorNota: number;
  irrf: number;
  csllRetida: number;
  irrfPercentual: number;
  tipo: TipoReceita;
  rotulo: string;
  presuncaoIrpj: number;
  presuncaoCsll: number;
  baseIrpj: number;
  baseCsll: number;
  motivo: string;
  avisos: string[];
  obraContrato: string | null;
  /** Caixa: recebimento parcial da nota. */
  parcial: boolean;
};

export type GrupoReceita = {
  tipo: TipoReceita;
  rotulo: string;
  baseLegal: string;
  receita: number;
  presuncaoIrpj: number;
  presuncaoCsll: number;
  baseIrpj: number;
  baseCsll: number;
  notas: number;
};

export type ApuracaoPresumido = {
  empresa: { razaoSocial: string; cnpj: string; regime: string };
  periodo: { ano: number; trimestre: number; rotulo: string; inicio: string; fim: string; vencimento: string };
  regimeReceita: "COMPETENCIA" | "CAIXA";
  grupos: GrupoReceita[];
  linhas: LinhaReceita[];
  totais: {
    receita: number;
    baseIrpj: number;
    irpjNormal: number;
    irpjAdicional: number;
    irpjBruto: number;
    irrfRetido: number;
    irpjRecolher: number;
    baseCsll: number;
    csllDevida: number;
    csllRetida: number;
    csllRecolher: number;
    totalRecolher: number;
    limiteAdicional: number;
  };
  darf: { irpj: string; csll: string };
  /** Receitas fora de nota lançadas no trimestre (entram integralmente na base). */
  outrasReceitas: OutraReceitaResumo[];
  /** Preenchido quando o período já foi fechado — com a divergência, se a base mudou depois. */
  fechamento: FechamentoResumo | null;
  avisos: string[];
};

const MODELOS_RECEITA = ["NFE", "NFCE", "NFSE"] as const;

/** Nota com o que a classificação precisa. */
const SELECT_NOTA = {
  id: true,
  modelo: true,
  numero: true,
  serie: true,
  emitidaEm: true,
  criadoEm: true,
  destinatarioNome: true,
  valorServicos: true,
  valorProdutos: true,
  valorIrRetido: true,
  valorCsllRetido: true,
  obraContrato: { select: { numero: true, modalidade: true } },
  itens: { select: { itemListaServico: true }, take: 1 }
} as const;

type NotaSelecionada = {
  id: string;
  modelo: string;
  numero: string | null;
  serie: string | null;
  emitidaEm: Date | null;
  criadoEm: Date;
  destinatarioNome: string | null;
  valorServicos: unknown;
  valorProdutos: unknown;
  valorIrRetido: unknown;
  valorCsllRetido: unknown;
  obraContrato: { numero: string; modalidade: string } | null;
  itens: Array<{ itemListaServico: string | null }>;
};

function montarLinha(nota: NotaSelecionada, valorConsiderado: number, data: Date, parcial: boolean): LinhaReceita {
  const valorNota = round2(receitaDaNota({
    valorServicos: Number(nota.valorServicos ?? 0),
    valorProdutos: Number(nota.valorProdutos ?? 0)
  }));
  const proporcao = valorNota > 0 ? valorConsiderado / valorNota : 1;
  const irrf = round2(Number(nota.valorIrRetido ?? 0) * (parcial ? proporcao : 1));
  const csllRetida = round2(Number(nota.valorCsllRetido ?? 0) * (parcial ? proporcao : 1));

  const classificacao: ClassificacaoReceita = classificarReceita({
    modelo: nota.modelo as never,
    itemListaServico: nota.itens[0]?.itemListaServico ?? null,
    modalidadeObra: (nota.obraContrato?.modalidade as never) ?? null,
    valorServicos: Number(nota.valorServicos ?? 0),
    valorProdutos: Number(nota.valorProdutos ?? 0),
    valorIrRetido: Number(nota.valorIrRetido ?? 0)
  });

  const presuncao = PRESUNCOES[classificacao.tipo];
  const valor = round2(valorConsiderado);
  return {
    notaId: nota.id,
    modelo: nota.modelo,
    numero: nota.numero ?? "",
    serie: nota.serie ?? "",
    data: data.toISOString(),
    destinatario: nota.destinatarioNome ?? "",
    valor,
    valorNota,
    irrf,
    csllRetida,
    irrfPercentual: valor > 0 ? irrf / valor : 0,
    tipo: classificacao.tipo,
    rotulo: classificacao.rotulo,
    presuncaoIrpj: presuncao.irpj,
    presuncaoCsll: presuncao.csll,
    baseIrpj: round2(valor * presuncao.irpj),
    baseCsll: round2(valor * presuncao.csll),
    motivo: classificacao.motivo,
    avisos: classificacao.avisos,
    obraContrato: nota.obraContrato?.numero ?? null,
    parcial
  };
}

/** Receita por COMPETÊNCIA: notas autorizadas emitidas dentro do trimestre. */
async function receitasPorCompetencia(scope: TenantScope, inicio: Date, fim: Date): Promise<LinhaReceita[]> {
  const notas = (await prisma.notaFiscal.findMany({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      status: "AUTORIZADA",
      modelo: { in: [...MODELOS_RECEITA] },
      emitidaEm: { gte: inicio, lt: fim }
    },
    select: SELECT_NOTA,
    orderBy: { emitidaEm: "asc" }
  })) as unknown as NotaSelecionada[];

  return notas
    .map((n) => montarLinha(n, receitaDaNota({
      valorServicos: Number(n.valorServicos ?? 0),
      valorProdutos: Number(n.valorProdutos ?? 0)
    }), n.emitidaEm ?? n.criadoEm, false))
    .filter((l) => l.valor > 0);
}

/**
 * Receita por CAIXA: títulos do contas a receber BAIXADOS no trimestre e ligados a uma nota.
 * É a amarração que a IN RFB 1.700/2017, art. 223, exige (cada recebimento apontando a nota).
 */
async function receitasPorCaixa(
  scope: TenantScope,
  inicio: Date,
  fim: Date
): Promise<{ linhas: LinhaReceita[]; avisos: string[] }> {
  const titulos = await prisma.contaReceber.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      pagoEm: { gte: inicio, lt: fim },
      valorPago: { gt: 0 }
    },
    select: {
      id: true,
      valorPago: true,
      pagoEm: true,
      descricao: true,
      notaFiscalId: true,
      notaFiscal: { select: SELECT_NOTA }
    },
    orderBy: { pagoEm: "asc" }
  });

  const linhas: LinhaReceita[] = [];
  const avisos: string[] = [];
  let semNota = 0;
  let valorSemNota = 0;

  for (const titulo of titulos) {
    const nota = titulo.notaFiscal as unknown as NotaSelecionada | null;
    const recebido = round2(Number(titulo.valorPago ?? 0));
    if (!nota) {
      semNota += 1;
      valorSemNota += recebido;
      continue;
    }
    const valorNota = receitaDaNota({
      valorServicos: Number(nota.valorServicos ?? 0),
      valorProdutos: Number(nota.valorProdutos ?? 0)
    });
    linhas.push(montarLinha(nota, recebido, titulo.pagoEm ?? inicio, recebido < round2(valorNota)));
  }

  if (semNota > 0) {
    avisos.push(
      `${semNota} recebimento(s) do trimestre, somando ${valorSemNota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, ` +
        "não estão vinculados a nota fiscal e ficaram FORA da apuração. No regime de caixa cada recebimento precisa " +
        "apontar a nota correspondente (IN RFB 1.700/2017, art. 223) — vincule o título à nota ou informe a receita à parte."
    );
  }
  return { linhas, avisos };
}

export async function apuracaoPresumido(
  scope: TenantScope,
  params: { ano: number; trimestre: number }
): Promise<ApuracaoPresumido> {
  const { ano, trimestre } = params;
  if (!Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) {
    throw new PresumidoError("Trimestre inválido: informe de 1 a 4.");
  }
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new PresumidoError("Ano inválido.");
  }

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { razaoSocial: true, cnpj: true, regimeTributario: true }
  });
  if (!empresa) throw new PresumidoError("Empresa não encontrada no escopo atual.");

  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { regimeReceitaCaixa: true }
  });
  const regimeReceita = config?.regimeReceitaCaixa ? "CAIXA" : "COMPETENCIA";

  const { inicio, fim, meses } = periodoDoTrimestre(ano, trimestre);
  const avisos: string[] = [];

  const { linhas, avisos: avisosCaixa } =
    regimeReceita === "CAIXA"
      ? await receitasPorCaixa(scope, inicio, fim)
      : { linhas: await receitasPorCompetencia(scope, inicio, fim), avisos: [] as string[] };
  avisos.push(...avisosCaixa);

  // Agrupamento por tipo de receita.
  const porTipo = new Map<TipoReceita, GrupoReceita>();
  for (const linha of linhas) {
    const atual = porTipo.get(linha.tipo) ?? {
      tipo: linha.tipo,
      rotulo: PRESUNCOES[linha.tipo].rotulo,
      baseLegal: PRESUNCOES[linha.tipo].base,
      receita: 0,
      presuncaoIrpj: PRESUNCOES[linha.tipo].irpj,
      presuncaoCsll: PRESUNCOES[linha.tipo].csll,
      baseIrpj: 0,
      baseCsll: 0,
      notas: 0
    };
    atual.receita = round2(atual.receita + linha.valor);
    atual.baseIrpj = round2(atual.baseIrpj + linha.baseIrpj);
    atual.baseCsll = round2(atual.baseCsll + linha.baseCsll);
    atual.notas += 1;
    porTipo.set(linha.tipo, atual);
  }
  // Receitas fora de nota (rendimento de aplicação, aluguel, ganho de capital): entram
  // INTEGRALMENTE na base, sem presunção (Lei 9.430/96, art. 25 II e art. 29 II).
  const outrasReceitas = await listarOutrasReceitas(scope, { inicio, fim });
  const totalOutras = round2(outrasReceitas.reduce((acc, r) => acc + r.valor, 0));
  if (totalOutras > 0) {
    const p = PRESUNCOES.OUTRAS_RECEITAS;
    porTipo.set("OUTRAS_RECEITAS", {
      tipo: "OUTRAS_RECEITAS",
      rotulo: p.rotulo,
      baseLegal: p.base,
      receita: totalOutras,
      presuncaoIrpj: p.irpj,
      presuncaoCsll: p.csll,
      baseIrpj: totalOutras,
      baseCsll: totalOutras,
      notas: outrasReceitas.length
    });
  }

  const grupos = [...porTipo.values()].sort((a, b) => b.receita - a.receita);

  const receita = round2(linhas.reduce((s, l) => s + l.valor, 0));
  const baseIrpj = round2(grupos.reduce((s, g) => s + g.baseIrpj, 0));
  const baseCsll = round2(grupos.reduce((s, g) => s + g.baseCsll, 0));
  const irrfRetido = round2(linhas.reduce((s, l) => s + l.irrf, 0));
  const csllRetida = round2(linhas.reduce((s, l) => s + l.csllRetida, 0));

  const limiteAdicional = IRPJ_ADICIONAL_LIMITE_MENSAL * meses;
  const irpjNormal = round2(baseIrpj * IRPJ_ALIQUOTA);
  const irpjAdicional = round2(Math.max(baseIrpj - limiteAdicional, 0) * IRPJ_ADICIONAL_ALIQUOTA);
  const irpjBruto = round2(irpjNormal + irpjAdicional);
  const irpjRecolher = round2(irpjBruto - irrfRetido);
  const csllDevida = round2(baseCsll * CSLL_ALIQUOTA);
  const csllRecolher = round2(csllDevida - csllRetida);
  const totalRecolher = round2(Math.max(irpjRecolher, 0) + Math.max(csllRecolher, 0));

  // Avisos gerais do período.
  const comAviso = linhas.filter((l) => l.avisos.length > 0).length;
  if (comAviso > 0) {
    avisos.push(`${comAviso} nota(s) com ponto de conferência na classificação — veja a coluna de avisos na lista.`);
  }
  if (irpjRecolher < 0) {
    avisos.push("O IRRF retido supera o IRPJ devido no trimestre: o saldo negativo não é 'a pagar' — é crédito a compensar nos períodos seguintes.");
  }
  if (totalOutras === 0) {
    avisos.push(
      "Nenhuma receita fora de nota lançada no trimestre. Rendimento de aplicação financeira, aluguel e ganho de capital entram na base — lance em 'Outras receitas' se houver."
    );
  }
  if (empresa.regimeTributario === "LUCRO_REAL") {
    avisos.push(
      "Empresa no LUCRO REAL: estes percentuais valem para a ESTIMATIVA MENSAL por receita bruta (Lei 9.430/96, art. 2º). O ajuste anual depende do resultado contábil e do LALUR."
    );
  }

  return {
    empresa: { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj, regime: empresa.regimeTributario },
    periodo: {
      ano,
      trimestre,
      rotulo: `${trimestre}º trimestre de ${ano}`,
      inicio: inicio.toISOString(),
      fim: new Date(fim.getTime() - 1).toISOString(),
      vencimento: vencimentoDoTrimestre(ano, trimestre).toISOString()
    },
    regimeReceita,
    grupos,
    linhas,
    totais: {
      receita,
      baseIrpj,
      irpjNormal,
      irpjAdicional,
      irpjBruto,
      irrfRetido,
      irpjRecolher,
      baseCsll,
      csllDevida,
      csllRetida,
      csllRecolher,
      totalRecolher,
      limiteAdicional
    },
    darf: { irpj: DARF.irpjPresumido, csll: DARF.csllPresumido },
    outrasReceitas,
    fechamento: await buscarFechamento(scope, "IRPJ_CSLL", ano, trimestre, totalRecolher),
    avisos
  };
}
