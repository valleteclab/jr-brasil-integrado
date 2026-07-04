import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { getBankProvider, contaTemExtrato, bancoLabel } from "@/domains/finance/providers/bank-registry";
import type { TransacaoExtrato } from "@/domains/finance/providers/bank-provider";

/**
 * CONCILIAÇÃO BANCÁRIA (Sicoob Conta-Corrente v4): compara o extrato real do banco com os
 * movimentos financeiros do ERP no período e classifica cada linha:
 *  - CONCILIADO: transação do banco casada com um movimento do ERP (valor igual, data próxima);
 *  - SO_BANCO: está no extrato mas não no ERP (ex.: tarifas, crédito de ANTECIPAÇÃO DE RECEBÍVEIS);
 *  - SO_ERP: lançado no ERP mas não apareceu no banco (erro de lançamento ou data).
 * Créditos com cara de antecipação/desconto de títulos são sinalizados e casados com as operações
 * registradas na tela de Antecipação (valor líquido próximo) — cliente antecipa no Sicoob hoje.
 */

export type LinhaConciliacao = {
  origem: "BANCO" | "ERP";
  data: string | null;
  descricao: string;
  documento: string | null;
  valor: number;
  situacao: "CONCILIADO" | "SO_BANCO" | "SO_ERP";
  /** Crédito com cara de antecipação de recebíveis (descrição do extrato). */
  pareceAntecipacao: boolean;
  /** Antecipação registrada no ERP casada com este crédito (valor líquido ~igual, data próxima). */
  antecipacaoId: string | null;
  /** Descrição do movimento do ERP casado (quando CONCILIADO na visão do banco). */
  casadoCom: string | null;
};

export type ExtratoConciliado = {
  conta: { id: string; nome: string };
  periodo: { mes: number; ano: number; diaInicial: number; diaFinal: number };
  saldoBanco: number | null;
  saldoLimite: number | null;
  saldoErp: number;
  linhas: LinhaConciliacao[];
  resumo: { conciliadas: number; soBanco: number; soErp: number; antecipacoesDetectadas: number };
  /** Checklist da diferença entre o saldo do banco e o do ERP, para fechar a conciliação. */
  diferenca: {
    saldoBanco: number | null;
    saldoErp: number;
    diferenca: number | null;
    totalSoBanco: number;
    totalSoErp: number;
    /** true quando os itens só-no-banco menos os só-no-ERP explicam a diferença. */
    explicada: boolean;
  };
};

const RE_ANTECIPACAO = /antecip|desc(?:onto)?\.?\s*de?\s*t[ií]tulo|border[ôo]|liquidez\s+cooperativa/i;

// Palavras genéricas de extrato que não ajudam a distinguir uma linha da outra.
const STOPWORDS_EXTRATO = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "ref", "referente",
  "pagamento", "recebimento", "credito", "debito", "transferencia", "ted", "pix", "doc",
  "conta", "valor", "titulo", "boleto", "cobranca", "tarifa", "banco", "cliente", "sicoob"
]);

/** Tokens normalizados (sem acento, minúsculo, sem stopword) de uma descrição para comparação fuzzy. */
function tokensDescricao(texto: string): Set<string> {
  const limpo = (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const tokens = limpo.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS_EXTRATO.has(t));
  return new Set(tokens);
}

/** Similaridade de descrição (Jaccard 0–1) entre a linha do banco e o movimento do ERP. */
function similaridade(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uniao = a.size + b.size - inter;
  return uniao === 0 ? 0 : inter / uniao;
}

function parseDataExtrato(v: string | null): Date | null {
  if (!v) return null;
  // Formatos comuns do canal: "dd/mm/aaaa" ou ISO.
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function extratoConciliado(
  scope: TenantScope,
  contaBancariaId: string,
  params: { mes: number; ano: number; diaInicial?: number; diaFinal?: number }
): Promise<ExtratoConciliado> {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, ...scopedByTenantCompany(scope), ativo: true } });
  if (!conta) throw new BoletoError("Conta bancária não encontrada.");
  if (!contaTemExtrato(conta)) {
    throw new BoletoError(`Extrato/conciliação por API está disponível apenas para contas Sicoob configuradas. O ${bancoLabel(conta)} não expõe extrato por API (use Open Finance/arquivo).`);
  }
  const numeroConta = (conta.sicoobContaCorrente ?? "").replace(/\D+/g, "");
  if (!numeroConta) throw new BoletoError(`Informe o número da conta corrente Sicoob da conta "${conta.nome}" para consultar o extrato.`);

  const mes = Math.min(12, Math.max(1, Math.floor(params.mes)));
  const ano = Math.max(2000, Math.floor(params.ano));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaInicial = Math.min(ultimoDia, Math.max(1, Math.floor(params.diaInicial ?? 1)));
  const diaFinal = Math.min(ultimoDia, Math.max(diaInicial, Math.floor(params.diaFinal ?? ultimoDia)));

  const provider = await getBankProvider(scope, conta);
  const [saldo, extrato] = await Promise.all([
    provider.consultarSaldo(numeroConta).catch(() => ({ saldo: null, saldoLimite: null, saldoBloqueado: null })),
    provider.consultarExtrato(numeroConta, { mes, ano, diaInicial, diaFinal })
  ]);

  // Movimentos do ERP no período (saldo bancário é global — sem filtro de ambiente).
  const inicio = new Date(ano, mes - 1, diaInicial, 0, 0, 0);
  const fim = new Date(ano, mes - 1, diaFinal, 23, 59, 59);
  const movimentos = await prisma.movimentoFinanceiro.findMany({
    where: { ...scopedByTenantCompany(scope), contaBancariaId: conta.id, dataMovimento: { gte: inicio, lte: fim } },
    orderBy: { dataMovimento: "asc" },
    select: { id: true, tipo: true, valor: true, descricao: true, dataMovimento: true }
  });
  const movRestantes = movimentos.map((m) => ({
    id: m.id,
    valor: (m.tipo === "DEBITO" ? -1 : 1) * Number(m.valor),
    descricao: m.descricao,
    tokens: tokensDescricao(m.descricao),
    data: m.dataMovimento,
    usado: false
  }));

  // Antecipações do ERP num intervalo folgado (o crédito pode cair dias depois da operação).
  const antecipacoes = await prisma.antecipacaoRecebivel.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      contaBancariaId: conta.id,
      dataOperacao: { gte: new Date(inicio.getTime() - 7 * 86400000), lte: new Date(fim.getTime() + 7 * 86400000) }
    },
    select: { id: true, valorLiquido: true, dataOperacao: true }
  });

  const DOIS_DIAS = 2 * 86400000;
  const CINCO_DIAS = 5 * 86400000;
  const linhas: LinhaConciliacao[] = [];
  let conciliadas = 0;
  let antecipacoesDetectadas = 0;

  for (const t of extrato.transacoes as TransacaoExtrato[]) {
    const dataBanco = parseDataExtrato(t.data);
    const tokensBanco = tokensDescricao(`${t.descricao} ${t.informacoesComplementares ?? ""}`);
    // Casa pelo VALOR (±1 centavo) e, entre os candidatos, escolhe o de melhor pontuação:
    // data mais próxima + maior semelhança de descrição. Assim, vários lançamentos de mesmo
    // valor no mês não se emparelham na ordem errada.
    let par: (typeof movRestantes)[number] | null = null;
    let melhorPontos = -Infinity;
    for (const m of movRestantes) {
      if (m.usado || Math.abs(m.valor - t.valor) > 0.011) continue;
      const distDias = dataBanco ? Math.abs(m.data.getTime() - dataBanco.getTime()) : 0;
      // Aceita até 2 dias sempre; até 5 dias só se a descrição tiver alguma semelhança.
      const sim = similaridade(tokensBanco, m.tokens);
      if (distDias > DOIS_DIAS && !(distDias <= CINCO_DIAS && sim >= 0.34)) continue;
      const pontos = sim * 100 - distDias / 86400000; // descrição pesa mais que 1 dia de distância
      if (pontos > melhorPontos) { melhorPontos = pontos; par = m; }
    }
    if (par) par.usado = true;

    const textoLinha = `${t.descricao} ${t.informacoesComplementares ?? ""}`;
    const pareceAntecipacao = t.valor > 0 && RE_ANTECIPACAO.test(textoLinha);
    let antecipacaoId: string | null = null;
    if (pareceAntecipacao) {
      antecipacoesDetectadas++;
      const op = antecipacoes.find(
        (a) => Math.abs(Number(a.valorLiquido) - t.valor) <= 0.02 &&
          (!dataBanco || Math.abs(a.dataOperacao.getTime() - dataBanco.getTime()) <= 5 * 86400000)
      );
      antecipacaoId = op?.id ?? null;
    }

    if (par) conciliadas++;
    linhas.push({
      origem: "BANCO",
      data: dataBanco ? dataBanco.toISOString() : t.data,
      descricao: t.descricao || "(sem descrição)",
      documento: t.numeroDocumento,
      valor: t.valor,
      situacao: par ? "CONCILIADO" : "SO_BANCO",
      pareceAntecipacao,
      antecipacaoId,
      casadoCom: par?.descricao ?? null
    });
  }

  for (const m of movRestantes.filter((x) => !x.usado)) {
    linhas.push({
      origem: "ERP",
      data: m.data.toISOString(),
      descricao: m.descricao,
      documento: null,
      valor: m.valor,
      situacao: "SO_ERP",
      pareceAntecipacao: false,
      antecipacaoId: null,
      casadoCom: null
    });
  }

  linhas.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));

  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const totalSoBanco = round2(linhas.filter((l) => l.situacao === "SO_BANCO").reduce((s, l) => s + l.valor, 0));
  const totalSoErp = round2(linhas.filter((l) => l.situacao === "SO_ERP").reduce((s, l) => s + l.valor, 0));
  const saldoErp = Number(conta.saldoAtual);
  const diferenca = saldo.saldo != null ? round2(saldo.saldo - saldoErp) : null;
  // Os lançamentos pendentes (só-banco menos só-ERP) devem explicar a diferença de saldo.
  const explicada = diferenca != null && Math.abs(diferenca - round2(totalSoBanco - totalSoErp)) <= 0.02;

  return {
    conta: { id: conta.id, nome: conta.nome },
    periodo: { mes, ano, diaInicial, diaFinal },
    saldoBanco: saldo.saldo,
    saldoLimite: saldo.saldoLimite,
    saldoErp,
    linhas,
    resumo: {
      conciliadas,
      soBanco: linhas.filter((l) => l.situacao === "SO_BANCO").length,
      soErp: linhas.filter((l) => l.situacao === "SO_ERP").length,
      antecipacoesDetectadas
    },
    diferenca: { saldoBanco: saldo.saldo, saldoErp, diferenca, totalSoBanco, totalSoErp, explicada }
  };
}
