import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * ANTECIPAÇÃO DE RECEBÍVEIS (banco/factoring), sem integração bancária — v1 estruturada:
 *
 *  - os títulos selecionados são BAIXADOS pelo valor BRUTO (crédito na conta bancária, na data da
 *    operação) — a receita permanece íntegra no fluxo/DRE;
 *  - a taxa/deságio vira uma ContaPagar JÁ PAGA na mesma data ("Juros de antecipação" do plano de
 *    classificações), debitando a conta — despesa financeira aparece no fechamento mensal;
 *  - o saldo bancário termina com o LÍQUIDO (bruto − taxa), como no extrato real.
 *
 * Antes o cliente lançava as taxas manualmente e os relatórios não batiam; aqui os três efeitos
 * saem de uma operação só, com rastreio de quais títulos foram antecipados em cada operação.
 */

export class AntecipacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AntecipacaoError";
  }
}

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export type CriarAntecipacaoInput = {
  contaBancariaId: string;
  contaReceberIds: string[];
  /** Valor TOTAL da taxa/deságio em R$ (o percentual é convertido no front). */
  valorTaxa: number;
  dataOperacao?: Date;
  instituicao?: string | null;
  observacoes?: string | null;
};

export async function criarAntecipacao(scope: TenantScope, input: CriarAntecipacaoInput, usuarioId?: string) {
  const ids = [...new Set(input.contaReceberIds ?? [])];
  if (!ids.length) throw new AntecipacaoError("Selecione pelo menos um título para antecipar.");
  if (!input.contaBancariaId) throw new AntecipacaoError("Selecione a conta bancária que recebeu o crédito.");
  const valorTaxa = round2(Number(input.valorTaxa) || 0);
  if (valorTaxa < 0) throw new AntecipacaoError("A taxa não pode ser negativa.");
  const dataOperacao = input.dataOperacao ?? new Date();

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const contaBancaria = await tx.contaBancaria.findFirst({
      where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope), ativo: true }
    });
    if (!contaBancaria) throw new AntecipacaoError("Conta bancária não encontrada.");

    const titulos = await tx.contaReceber.findMany({
      where: { id: { in: ids }, ...scopedByTenantCompany(scope) },
      include: { cliente: { select: { razaoSocial: true, nomeFantasia: true } } }
    });
    if (titulos.length !== ids.length) {
      throw new AntecipacaoError("Um ou mais títulos não foram encontrados nesta empresa.");
    }
    for (const t of titulos) {
      if (!["ABERTO", "PARCIAL", "VENCIDO"].includes(t.status)) {
        throw new AntecipacaoError(`O título "${t.descricao}" não está em aberto (${t.status}).`);
      }
    }

    // Saldo devedor de cada título (o que o banco antecipa).
    const saldoDe = (t: (typeof titulos)[number]) =>
      round2(Number(t.valor) + Number(t.juros) + Number(t.multa) - Number(t.descontoBaixa) - Number(t.valorPago));
    const valorBruto = round2(titulos.reduce((s, t) => s + saldoDe(t), 0));
    if (valorBruto <= 0) throw new AntecipacaoError("Os títulos selecionados não têm saldo a antecipar.");
    if (valorTaxa >= valorBruto) throw new AntecipacaoError("A taxa não pode ser maior ou igual ao valor bruto antecipado.");
    const valorLiquido = round2(valorBruto - valorTaxa);

    const rotulo = `Antecipação de recebíveis ${dataOperacao.toLocaleDateString("pt-BR")}${input.instituicao?.trim() ? ` — ${input.instituicao.trim()}` : ""}`;

    const antecipacao = await tx.antecipacaoRecebivel.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        contaBancariaId: contaBancaria.id,
        instituicao: input.instituicao?.trim() || null,
        dataOperacao,
        valorBruto,
        valorTaxa,
        valorLiquido,
        observacoes: input.observacoes?.trim() || null
      }
    });

    // 1) Baixa cada título pelo saldo (BRUTO) com crédito na conta bancária.
    let saldoCorrente = Number(contaBancaria.saldoAtual);
    for (const t of titulos) {
      const saldoTitulo = saldoDe(t);
      const saldoAnterior = saldoCorrente;
      saldoCorrente = round2(saldoCorrente + saldoTitulo);
      await tx.contaReceber.update({
        where: { id: t.id },
        data: {
          valorPago: round2(Number(t.valorPago) + saldoTitulo),
          status: "PAGO",
          pagoEm: dataOperacao,
          formaPagamento: "ANTECIPACAO",
          contaBancariaId: contaBancaria.id,
          antecipacaoId: antecipacao.id
        }
      });
      await tx.movimentoFinanceiro.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: scope.ambiente ?? "HOMOLOGACAO",
          contaBancariaId: contaBancaria.id,
          contaReceberId: t.id,
          tipo: "CREDITO",
          origem: "ANTECIPACAO",
          descricao: `${rotulo}: ${t.descricao}`,
          valor: saldoTitulo,
          formaPagamento: "ANTECIPACAO",
          saldoAnterior,
          saldoPosterior: saldoCorrente,
          dataMovimento: dataOperacao,
          usuarioId: usuarioId ?? null
        }
      });
    }

    // 2) Taxa/deságio como despesa financeira PAGA ("Juros de antecipação" do plano, quando existir).
    let contaPagarTaxaId: string | null = null;
    if (valorTaxa > 0) {
      const classificacao = await tx.classificacaoFinanceira.findFirst({
        where: {
          ...scopedByTenantCompany(scope),
          ativo: true,
          tipo: "DESPESA",
          nome: { equals: "Juros de antecipação", mode: "insensitive" }
        },
        select: { id: true }
      });
      const contaTaxa = await tx.contaPagar.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: scope.ambiente ?? "HOMOLOGACAO",
          descricao: `Taxa de ${rotulo.charAt(0).toLowerCase()}${rotulo.slice(1)}`,
          origem: "ANTECIPACAO",
          vencimento: dataOperacao,
          valor: valorTaxa,
          valorPago: valorTaxa,
          status: "PAGO",
          pagoEm: dataOperacao,
          formaPagamento: "DEBITO_EM_CONTA",
          contaBancariaId: contaBancaria.id,
          classificacaoId: classificacao?.id ?? null,
          observacoes: `Deságio de ${titulos.length} título(s) antecipado(s) — bruto R$ ${valorBruto.toFixed(2)}, líquido R$ ${valorLiquido.toFixed(2)}.`
        }
      });
      contaPagarTaxaId = contaTaxa.id;
      const saldoAnterior = saldoCorrente;
      saldoCorrente = round2(saldoCorrente - valorTaxa);
      await tx.movimentoFinanceiro.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: scope.ambiente ?? "HOMOLOGACAO",
          contaBancariaId: contaBancaria.id,
          contaPagarId: contaTaxa.id,
          tipo: "DEBITO",
          origem: "ANTECIPACAO",
          descricao: `Taxa — ${rotulo}`,
          valor: valorTaxa,
          formaPagamento: "DEBITO_EM_CONTA",
          saldoAnterior,
          saldoPosterior: saldoCorrente,
          dataMovimento: dataOperacao,
          usuarioId: usuarioId ?? null
        }
      });
      await tx.antecipacaoRecebivel.update({ where: { id: antecipacao.id }, data: { contaPagarTaxaId } });
    }

    // 3) Saldo final da conta = anterior + bruto − taxa (= + líquido).
    await tx.contaBancaria.update({ where: { id: contaBancaria.id }, data: { saldoAtual: saldoCorrente } });

    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "AntecipacaoRecebivel",
      entidadeId: antecipacao.id,
      acao: "CREATE",
      payload: { titulos: ids.length, valorBruto, valorTaxa, valorLiquido, contaBancariaId: contaBancaria.id }
    });

    return { id: antecipacao.id, valorBruto, valorTaxa, valorLiquido, titulos: ids.length };
  }, TX_OPTIONS);
}

export type AntecipacaoResumo = {
  id: string;
  data: string;
  instituicao: string;
  contaBancaria: string;
  titulos: number;
  valorBruto: string;
  valorTaxa: string;
  valorLiquido: string;
  observacoes: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type TituloAntecipavel = {
  id: string;
  cliente: string;
  descricao: string;
  numeroDocumento: string;
  vencimento: string;
  vencido: boolean;
  saldo: string;
  saldoNum: number;
  formaPagamento: string;
};

/** Títulos em aberto (com saldo) elegíveis para antecipação, ordenados por vencimento. */
export async function listTitulosAntecipaveis(scope: TenantScope): Promise<TituloAntecipavel[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const rows = await prisma.contaReceber.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
    orderBy: { vencimento: "asc" },
    include: { cliente: { select: { razaoSocial: true, nomeFantasia: true } } }
  });
  return rows
    .map((t) => {
      const saldo = round2(Number(t.valor) + Number(t.juros) + Number(t.multa) - Number(t.descontoBaixa) - Number(t.valorPago));
      return {
        id: t.id,
        cliente: t.cliente.nomeFantasia || t.cliente.razaoSocial,
        descricao: t.descricao,
        numeroDocumento: t.numeroDocumento ?? "—",
        vencimento: DATE_FMT.format(t.vencimento),
        vencido: t.vencimento < hoje,
        saldo: BRL.format(saldo),
        saldoNum: saldo,
        formaPagamento: t.formaPagamento ?? "—"
      };
    })
    .filter((t) => t.saldoNum > 0);
}

export async function listAntecipacoes(scope: TenantScope): Promise<AntecipacaoResumo[]> {
  const rows = await prisma.antecipacaoRecebivel.findMany({
    where: scopedByTenantCompanyAmbiente(scope),
    orderBy: { dataOperacao: "desc" },
    take: 50,
    include: {
      contaBancaria: { select: { nome: true } },
      _count: { select: { recebiveis: true } }
    }
  });
  return rows.map((a) => ({
    id: a.id,
    data: DATE_FMT.format(a.dataOperacao),
    instituicao: a.instituicao ?? "—",
    contaBancaria: a.contaBancaria.nome,
    titulos: a._count.recebiveis,
    valorBruto: BRL.format(Number(a.valorBruto)),
    valorTaxa: BRL.format(Number(a.valorTaxa)),
    valorLiquido: BRL.format(Number(a.valorLiquido)),
    observacoes: a.observacoes
  }));
}
