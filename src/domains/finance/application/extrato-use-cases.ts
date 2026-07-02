import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { authDaConta, contaTemCobranca, BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { consultarSaldo, consultarExtrato, type TransacaoExtrato } from "@/domains/finance/providers/sicoob-conta";

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
};

const RE_ANTECIPACAO = /antecip|desc(?:onto)?\.?\s*de?\s*t[ií]tulo|border[ôo]|liquidez\s+cooperativa/i;

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
  if (!contaTemCobranca(conta)) {
    throw new BoletoError(`A conta "${conta.nome}" não tem o credenciamento Sicoob configurado (Configurações → Contas financeiras).`);
  }
  const numeroConta = (conta.sicoobContaCorrente ?? "").replace(/\D+/g, "");
  if (!numeroConta) throw new BoletoError(`Informe o número da conta corrente Sicoob da conta "${conta.nome}" para consultar o extrato.`);

  const mes = Math.min(12, Math.max(1, Math.floor(params.mes)));
  const ano = Math.max(2000, Math.floor(params.ano));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaInicial = Math.min(ultimoDia, Math.max(1, Math.floor(params.diaInicial ?? 1)));
  const diaFinal = Math.min(ultimoDia, Math.max(diaInicial, Math.floor(params.diaFinal ?? ultimoDia)));

  const auth = await authDaConta(scope, conta);
  const [saldo, extrato] = await Promise.all([
    consultarSaldo(auth, numeroConta).catch(() => ({ saldo: null, saldoLimite: null, saldoBloqueado: null })),
    consultarExtrato(auth, { numeroContaCorrente: numeroConta, mes, ano, diaInicial, diaFinal })
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
  const linhas: LinhaConciliacao[] = [];
  let conciliadas = 0;
  let antecipacoesDetectadas = 0;

  for (const t of extrato.transacoes as TransacaoExtrato[]) {
    const dataBanco = parseDataExtrato(t.data);
    // Casa com o primeiro movimento do ERP não usado, de mesmo valor (±1 centavo) e data até 2 dias.
    const par = movRestantes.find(
      (m) => !m.usado &&
        Math.abs(m.valor - t.valor) <= 0.011 &&
        (!dataBanco || Math.abs(m.data.getTime() - dataBanco.getTime()) <= DOIS_DIAS)
    );
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
  return {
    conta: { id: conta.id, nome: conta.nome },
    periodo: { mes, ano, diaInicial, diaFinal },
    saldoBanco: saldo.saldo,
    saldoLimite: saldo.saldoLimite,
    saldoErp: Number(conta.saldoAtual),
    linhas,
    resumo: {
      conciliadas,
      soBanco: linhas.filter((l) => l.situacao === "SO_BANCO").length,
      soErp: linhas.filter((l) => l.situacao === "SO_ERP").length,
      antecipacoesDetectadas
    }
  };
}
