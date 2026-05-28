import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export const FORMAS_PAGAMENTO: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de crédito",
  "04": "Cartão de débito",
  "05": "Crédito loja",
  "10": "Vale alimentação",
  "11": "Vale refeição",
  "12": "Vale presente",
  "13": "Vale combustível",
  "15": "Boleto bancário",
  "16": "Depósito bancário",
  "17": "Pix",
  "90": "Sem pagamento",
  "99": "Outros"
};

export const MODALIDADE_FRETE: Record<number, string> = {
  0: "Por conta do emitente (CIF)",
  1: "Por conta do destinatário (FOB)",
  2: "Por conta de terceiros",
  3: "Transporte próprio – emitente",
  4: "Transporte próprio – destinatário",
  9: "Sem ocorrência de transporte"
};

export const STATUS_NF_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AUTORIZADA: "Autorizada",
  CANCELADA: "Cancelada",
  REJEITADA: "Rejeitada"
};

export type NfeSummary = {
  id: string;
  numero: string;
  serie: string;
  status: string;
  statusLabel: string;
  destinatario: string;
  naturezaOperacao: string;
  dataEmissao: string | null;
  total: string;
  chaveAcesso: string | null;
  xmlUrl: string | null;
  danfeUrl: string | null;
};

export type NfeItem = {
  id: string;
  seq: number;
  produtoId: string | null;
  descricao: string;
  ncm: string;
  cest: string;
  cfop: string;
  unidade: string;
  gtin: string;
  origem: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  valorDesconto: number;
  valorFrete: number;
  // ICMS
  icmsCST: string;
  icmsCSOSN: string;
  icmsBC: number;
  icmsAliquota: number;
  icmsValor: number;
  // ICMS-ST
  icmsSTBC: number;
  icmsSTMVA: number;
  icmsSTAliquota: number;
  icmsSTValor: number;
  // FCP
  fcpAliquota: number;
  fcpValor: number;
  // IPI
  ipiCST: string;
  ipiCodEnq: string;
  ipiAliquota: number;
  ipiValor: number;
  // PIS
  pisCST: string;
  pisBC: number;
  pisAliquota: number;
  pisValor: number;
  // COFINS
  cofinsCST: string;
  cofinsBC: number;
  cofinsAliquota: number;
  cofinsValor: number;
  totalTributos: number;
};

export type NfePagamento = {
  id: string;
  forma: string;
  formaLabel: string;
  valor: number;
  bandeira: string;
  cnpjCred: string;
  tpIntegr: string;
};

export type NfeDetail = {
  id: string;
  numero: string;
  serie: string;
  status: string;
  statusLabel: string;
  tipoNF: number;
  finalidade: number;
  consumidorFinal: number;
  presencaComprador: number;
  naturezaOperacao: string;
  dataEmissao: string | null;
  dataSaida: string | null;
  modalidadeFrete: number;
  modalidadeFreteLabel: string;
  infAdic: string;
  infCpl: string;
  motivoRejeicao: string;
  chaveAcesso: string | null;
  xmlUrl: string | null;
  danfeUrl: string | null;
  clienteId: string | null;
  clienteNome: string;
  clienteDocumento: string;
  clienteIE: string;
  clienteEnderecoId: string | null;
  // Totais
  valorProdutos: number;
  valorDesconto: number;
  valorFrete: number;
  valorSeguro: number;
  valorOutras: number;
  valorBCICMS: number;
  valorICMS: number;
  valorBCICMSST: number;
  valorICMSST: number;
  valorFCP: number;
  valorIPI: number;
  valorPIS: number;
  valorCOFINS: number;
  valorTributos: number;
  total: number;
  itens: NfeItem[];
  pagamentos: NfePagamento[];
};

function n(v: unknown): number {
  return Number(v) || 0;
}

function s(v: unknown): string {
  return v ? String(v) : "";
}

export async function listNfeSummaries(): Promise<NfeSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const rows = await prisma.notaFiscal.findMany({
    where: scopedByTenantCompany(scope),
    include: {
      itens: false,
      pagamentos: false
    },
    orderBy: [{ criadoEm: "desc" }],
    take: 200
  });

  const clienteIds = [...new Set(rows.map((r) => r.clienteId).filter(Boolean))] as string[];
  const clientes = clienteIds.length
    ? await prisma.cliente.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, razaoSocial: true, nomeFantasia: true }
      })
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c.nomeFantasia ?? c.razaoSocial]));

  return rows.map((r) => ({
    id: r.id,
    numero: r.numero ?? "—",
    serie: r.serie ?? "—",
    status: r.status,
    statusLabel: STATUS_NF_LABEL[r.status] ?? r.status,
    destinatario: r.clienteId ? (clienteMap[r.clienteId] ?? "Cliente removido") : "Sem destinatário",
    naturezaOperacao: (r as Record<string, unknown>).naturezaOperacao as string ?? "",
    dataEmissao: (r as Record<string, unknown>).dataEmissao
      ? new Date((r as Record<string, unknown>).dataEmissao as Date).toLocaleDateString("pt-BR")
      : null,
    total: formatBrl(n(r.total)),
    chaveAcesso: r.chaveAcesso,
    xmlUrl: r.xmlUrl,
    danfeUrl: r.danfeUrl
  }));
}

export async function getNfeDetail(id: string): Promise<NfeDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const nf = await prisma.notaFiscal.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      itens: { orderBy: { seq: "asc" } },
      pagamentos: true
    }
  }) as Record<string, unknown> | null;

  if (!nf) return null;

  let clienteNome = "";
  let clienteDocumento = "";
  let clienteIE = "";
  if (nf.clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: nf.clienteId as string },
      select: { razaoSocial: true, nomeFantasia: true, documento: true, inscricaoEstadual: true }
    });
    if (cliente) {
      clienteNome = cliente.nomeFantasia ?? cliente.razaoSocial;
      clienteDocumento = cliente.documento;
      clienteIE = cliente.inscricaoEstadual ?? "";
    }
  }

  const modalidadeFrete = n(nf.modalidadeFrete);
  const status = s(nf.status);

  return {
    id: s(nf.id),
    numero: s(nf.numero) || "—",
    serie: s(nf.serie) || "—",
    status,
    statusLabel: STATUS_NF_LABEL[status] ?? status,
    tipoNF: n(nf.tipoNF) || 1,
    finalidade: n(nf.finalidade) || 1,
    consumidorFinal: n(nf.consumidorFinal),
    presencaComprador: n(nf.presencaComprador) || 1,
    naturezaOperacao: s(nf.naturezaOperacao),
    dataEmissao: nf.dataEmissao ? new Date(nf.dataEmissao as Date).toLocaleDateString("pt-BR") : null,
    dataSaida: nf.dataSaida ? new Date(nf.dataSaida as Date).toLocaleDateString("pt-BR") : null,
    modalidadeFrete,
    modalidadeFreteLabel: MODALIDADE_FRETE[modalidadeFrete] ?? String(modalidadeFrete),
    infAdic: s(nf.infAdic),
    infCpl: s(nf.infCpl),
    motivoRejeicao: s(nf.motivoRejeicao),
    chaveAcesso: nf.chaveAcesso as string | null,
    xmlUrl: nf.xmlUrl as string | null,
    danfeUrl: nf.danfeUrl as string | null,
    clienteId: nf.clienteId as string | null,
    clienteNome,
    clienteDocumento,
    clienteIE,
    clienteEnderecoId: null,
    valorProdutos: n(nf.valorProdutos),
    valorDesconto: n(nf.valorDesconto),
    valorFrete: n(nf.valorFrete),
    valorSeguro: n(nf.valorSeguro),
    valorOutras: n(nf.valorOutras),
    valorBCICMS: n(nf.valorBCICMS),
    valorICMS: n(nf.valorICMS),
    valorBCICMSST: n(nf.valorBCICMSST),
    valorICMSST: n(nf.valorICMSST),
    valorFCP: n(nf.valorFCP),
    valorIPI: n(nf.valorIPI),
    valorPIS: n(nf.valorPIS),
    valorCOFINS: n(nf.valorCOFINS),
    valorTributos: n(nf.valorTributos),
    total: n(nf.total),
    itens: ((nf.itens ?? []) as Record<string, unknown>[]).map((item) => ({
      id: s(item.id),
      seq: n(item.seq),
      produtoId: item.produtoId as string | null,
      descricao: s(item.descricao),
      ncm: s(item.ncm),
      cest: s(item.cest),
      cfop: s(item.cfop),
      unidade: s(item.unidade),
      gtin: s(item.gtin),
      origem: s(item.origem),
      quantidade: n(item.quantidade),
      valorUnitario: n(item.valorUnitario),
      valorBruto: n(item.valorBruto),
      valorDesconto: n(item.valorDesconto),
      valorFrete: n(item.valorFrete),
      icmsCST: s(item.icmsCST),
      icmsCSOSN: s(item.icmsCSOSN),
      icmsBC: n(item.icmsBC),
      icmsAliquota: n(item.icmsAliquota),
      icmsValor: n(item.icmsValor),
      icmsSTBC: n(item.icmsSTBC),
      icmsSTMVA: n(item.icmsSTMVA),
      icmsSTAliquota: n(item.icmsSTAliquota),
      icmsSTValor: n(item.icmsSTValor),
      fcpAliquota: n(item.fcpAliquota),
      fcpValor: n(item.fcpValor),
      ipiCST: s(item.ipiCST),
      ipiCodEnq: s(item.ipiCodEnq),
      ipiAliquota: n(item.ipiAliquota),
      ipiValor: n(item.ipiValor),
      pisCST: s(item.pisCST),
      pisBC: n(item.pisBC),
      pisAliquota: n(item.pisAliquota),
      pisValor: n(item.pisValor),
      cofinsCST: s(item.cofinsCST),
      cofinsBC: n(item.cofinsBC),
      cofinsAliquota: n(item.cofinsAliquota),
      cofinsValor: n(item.cofinsValor),
      totalTributos: n(item.totalTributos)
    })),
    pagamentos: ((nf.pagamentos ?? []) as Record<string, unknown>[]).map((p) => ({
      id: s(p.id),
      forma: s(p.forma),
      formaLabel: FORMAS_PAGAMENTO[s(p.forma)] ?? s(p.forma),
      valor: n(p.valor),
      bandeira: s(p.bandeira),
      cnpjCred: s(p.cnpjCred),
      tpIntegr: s(p.tpIntegr)
    }))
  };
}
