import type { FinalidadeNfe, ModeloFiscal, StatusNotaFiscal } from "@prisma/client";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type NotaFiscalSummary = {
  id: string;
  modelo: ModeloFiscal;
  modeloLabel: string;
  finalidade: FinalidadeNfe;
  /** Rótulo da finalidade quando não for Normal (Devolução/Complementar/Ajuste); senão null. */
  finalidadeLabel: string | null;
  numero: string;
  serie: string;
  status: StatusNotaFiscal;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute";
  destinatario: string;
  destinatarioDocumento: string;
  chaveAcesso: string;
  total: string;
  totalNumber: number;
  ambiente: string;
  emitidaEm: string;
  canCancel: boolean;
  canCorrect: boolean;
  canDownload: boolean;
  /** Clonar é suportado para notas de produto (NF-e/NFC-e). */
  canClone: boolean;
  /** Devolução exige NF-e autorizada com chave de acesso. */
  canDevolver: boolean;
  /** Pode ser excluída (admin): notas SEM validade fiscal (rascunho/erro/rejeitada/denegada). */
  canDelete: boolean;
};

const STATUS_LABEL: Record<StatusNotaFiscal, { label: string; tone: NotaFiscalSummary["statusTone"] }> = {
  RASCUNHO: { label: "Rascunho", tone: "mute" },
  PROCESSANDO: { label: "Processando", tone: "warn" },
  AUTORIZADA: { label: "Autorizada", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "danger" },
  REJEITADA: { label: "Rejeitada", tone: "danger" },
  DENEGADA: { label: "Denegada", tone: "danger" },
  ERRO: { label: "Erro", tone: "danger" }
};

const MODELO_LABEL: Record<ModeloFiscal, string> = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  NFSE: "NFS-e"
};

const FINALIDADE_LABEL: Record<FinalidadeNfe, string> = {
  NORMAL: "Normal",
  COMPLEMENTAR: "Complementar",
  AJUSTE: "Ajuste",
  DEVOLUCAO: "Devolução"
};

/** Rótulo de finalidade para exibir na UI — null quando Normal (não vira tag). */
function finalidadeLabel(finalidade: FinalidadeNfe): string | null {
  return finalidade === "NORMAL" ? null : FINALIDADE_LABEL[finalidade];
}

export async function listNotasFiscais(): Promise<NotaFiscalSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar notas fiscais.");
  }

  const scope = await getDevelopmentTenantScope();
  const notas = await prisma.notaFiscal.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: { criadoEm: "desc" },
    take: 200
  });

  return notas.map((nota) => {
    const status = STATUS_LABEL[nota.status];
    return {
      id: nota.id,
      modelo: nota.modelo,
      modeloLabel: MODELO_LABEL[nota.modelo],
      finalidade: nota.finalidade,
      finalidadeLabel: finalidadeLabel(nota.finalidade),
      numero: nota.numero ?? "-",
      serie: nota.serie ?? "-",
      status: nota.status,
      statusLabel: status.label,
      statusTone: status.tone,
      destinatario: nota.destinatarioNome ?? "-",
      destinatarioDocumento: nota.destinatarioDocumento ?? "",
      chaveAcesso: nota.chaveAcesso ?? "",
      total: formatBrl(Number(nota.total)),
      totalNumber: Number(nota.total),
      ambiente: nota.ambiente === "PRODUCAO" ? "Produção" : "Homologação",
      emitidaEm: nota.emitidaEm ? nota.emitidaEm.toLocaleString("pt-BR") : "-",
      canCancel: nota.status === "AUTORIZADA",
      canCorrect: nota.status === "AUTORIZADA" && nota.modelo !== "NFSE",
      // PDF/XML só fazem sentido quando a nota foi transmitida e está autorizada/cancelada.
      canDownload: Boolean(nota.providerRef) && (nota.status === "AUTORIZADA" || nota.status === "CANCELADA"),
      // Clonar reaproveita a tela de emissão (produto e serviço).
      canClone: true,
      // Não se gera devolução de uma devolução (nem de complementar/ajuste).
      canDevolver: nota.modelo === "NFE" && nota.status === "AUTORIZADA" && Boolean(nota.chaveAcesso) && nota.finalidade === "NORMAL",
      // Excluir (admin): só notas SEM validade fiscal. NUNCA AUTORIZADA/CANCELADA (documento legal).
      canDelete: ["RASCUNHO", "ERRO", "REJEITADA", "DENEGADA"].includes(nota.status)
    };
  });
}

export async function getNotaFiscalDetail(id: string) {
  const scope = await getDevelopmentTenantScope();
  const nota = await prisma.notaFiscal.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: {
      itens: { orderBy: { numeroItem: "asc" } },
      eventos: { orderBy: { criadoEm: "desc" } }
    }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }

  return nota;
}

export type NotaFiscalItemDetalhe = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: string;
  valorTotal: string;
};

export type NotaFiscalEventoDetalhe = {
  tipo: string;
  status: string;
  sequencia: number | null;
  protocolo: string;
  mensagem: string;
  criadoEm: string;
};

export type NotaFiscalDetalhe = {
  id: string;
  modeloLabel: string;
  finalidade: FinalidadeNfe;
  finalidadeLabel: string | null;
  numero: string;
  serie: string;
  status: StatusNotaFiscal;
  statusLabel: string;
  statusTone: NotaFiscalSummary["statusTone"];
  ambiente: string;
  naturezaOperacao: string;
  chaveAcesso: string;
  /** NF-e de devolução: chave da nota original referenciada. */
  chaveReferenciada: string;
  protocolo: string;
  motivo: string;
  destinatario: string;
  destinatarioDocumento: string;
  destinatarioEmail: string;
  emitidaEm: string;
  autorizadaEm: string;
  canceladaEm: string;
  total: string;
  valorProdutos: string;
  valorServicos: string;
  valorIcms: string;
  valorPis: string;
  valorCofins: string;
  valorIss: string;
  informacoesComplementares: string;
  itens: NotaFiscalItemDetalhe[];
  eventos: NotaFiscalEventoDetalhe[];
  canCancel: boolean;
  canCorrect: boolean;
  canDownload: boolean;
  canSync: boolean;
  canClone: boolean;
  canDevolver: boolean;
};

function fmtDateTime(d: Date | null): string {
  return d ? d.toLocaleString("pt-BR") : "—";
}

export async function getNotaFiscalDetalhe(id: string): Promise<NotaFiscalDetalhe | null> {
  const scope = await getDevelopmentTenantScope();
  const nota = await prisma.notaFiscal.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: {
      itens: { orderBy: { numeroItem: "asc" } },
      eventos: { orderBy: { criadoEm: "desc" } }
    }
  });
  if (!nota) return null;

  const status = STATUS_LABEL[nota.status];
  return {
    id: nota.id,
    modeloLabel: MODELO_LABEL[nota.modelo],
    finalidade: nota.finalidade,
    finalidadeLabel: finalidadeLabel(nota.finalidade),
    numero: nota.numero ?? "-",
    serie: nota.serie ?? "-",
    status: nota.status,
    statusLabel: status.label,
    statusTone: status.tone,
    ambiente: nota.ambiente === "PRODUCAO" ? "Produção" : "Homologação",
    naturezaOperacao: nota.naturezaOperacao ?? "—",
    chaveAcesso: nota.chaveAcesso ?? "",
    chaveReferenciada: nota.chaveReferenciada ?? "",
    protocolo: nota.protocolo ?? "",
    motivo: nota.motivo ?? "",
    destinatario: nota.destinatarioNome ?? "—",
    destinatarioDocumento: nota.destinatarioDocumento ?? "",
    destinatarioEmail: nota.destinatarioEmail ?? "",
    emitidaEm: fmtDateTime(nota.emitidaEm),
    autorizadaEm: fmtDateTime(nota.autorizadaEm),
    canceladaEm: fmtDateTime(nota.canceladaEm),
    total: formatBrl(Number(nota.total)),
    valorProdutos: formatBrl(Number(nota.valorProdutos)),
    valorServicos: formatBrl(Number(nota.valorServicos)),
    valorIcms: formatBrl(Number(nota.valorIcms)),
    valorPis: formatBrl(Number(nota.valorPis)),
    valorCofins: formatBrl(Number(nota.valorCofins)),
    valorIss: formatBrl(Number(nota.valorIss)),
    informacoesComplementares: nota.informacoesComplementares ?? "",
    itens: nota.itens.map((it) => ({
      numeroItem: it.numeroItem,
      codigo: it.codigo ?? "",
      descricao: it.descricao ?? "",
      ncm: it.ncm ?? "",
      cfop: it.cfop ?? "",
      unidade: it.unidade ?? "",
      quantidade: Number(it.quantidade),
      valorUnitario: formatBrl(Number(it.valorUnitario)),
      valorTotal: formatBrl(Number(it.valorTotal))
    })),
    eventos: nota.eventos.map((ev) => ({
      tipo: ev.tipo,
      status: ev.status,
      sequencia: ev.sequencia ?? null,
      protocolo: ev.protocolo ?? "",
      mensagem: ev.mensagem ?? "",
      criadoEm: fmtDateTime(ev.criadoEm)
    })),
    canCancel: nota.status === "AUTORIZADA",
    canCorrect: nota.status === "AUTORIZADA" && nota.modelo === "NFE",
    canDownload: Boolean(nota.providerRef) && (nota.status === "AUTORIZADA" || nota.status === "CANCELADA"),
    canSync: Boolean(nota.providerRef) && (nota.status === "PROCESSANDO" || nota.status === "AUTORIZADA"),
    canClone: true,
    canDevolver: nota.modelo === "NFE" && nota.status === "AUTORIZADA" && Boolean(nota.chaveAcesso) && nota.finalidade === "NORMAL"
  };
}

// ---------------------------------------------------------------------------
// Prefill para clonar / gerar devolução (reaproveita a tela de emissão avulsa)
// ---------------------------------------------------------------------------

export type EmissaoPrefillItem = {
  produtoId: string | null;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  origem: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
};

export type EmissaoPrefillServico = {
  descricao: string;
  valor: number;
  codigoServicoLc116: string;
};

export type EmissaoPrefill = {
  modo: "CLONE" | "DEVOLUCAO";
  origemId: string;
  origemLabel: string;
  origemChave: string | null;
  tipo: "NFE" | "NFCE" | "NFSE";
  finalidade: "NORMAL" | "DEVOLUCAO";
  naturezaOperacao: string;
  chaveReferenciada: string | null;
  notaOrigemId: string | null;
  clienteId: string | null;
  destinatario: { nome: string; documento: string; inscricaoEstadual: string; email: string };
  formaPagamento: string;
  condicaoPagamento: string;
  observacoes: string;
  frete: number;
  desconto: number;
  itens: EmissaoPrefillItem[];
  // NFS-e (clone de nota de serviço):
  servicos: EmissaoPrefillServico[];
  codigoServicoLc116: string;
  aliquotaIss: number;
  issRetido: boolean;
};

/**
 * Monta o prefill da tela de emissão a partir de uma nota existente.
 *  - CLONE: copia destinatário, itens e operação (finalidade Normal) para uma nova nota editável.
 *  - DEVOLUCAO: gera NF-e de devolução referenciando a chave da nota original (finalidade
 *    Devolução, natureza "Devolução de venda"); o CFOP é deixado em branco para o motor derivar
 *    o CFOP de devolução (1202/2202). Exige NF-e autorizada com chave de acesso.
 */
export async function getNotaFiscalPrefill(
  id: string,
  modo: "CLONE" | "DEVOLUCAO"
): Promise<EmissaoPrefill> {
  const scope = await getDevelopmentTenantScope();
  const nota = await prisma.notaFiscal.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { itens: { orderBy: { numeroItem: "asc" } } }
  });
  if (!nota) throw new Error("Nota fiscal não encontrada.");

  const isServico = nota.modelo === "NFSE";
  const tipo: EmissaoPrefill["tipo"] = isServico ? "NFSE" : nota.modelo === "NFCE" ? "NFCE" : "NFE";

  if (modo === "DEVOLUCAO") {
    if (nota.modelo !== "NFE") {
      throw new Error("A devolução só é aplicável a NF-e (modelo 55).");
    }
    if (nota.status !== "AUTORIZADA" || !nota.chaveAcesso) {
      throw new Error("Só é possível gerar devolução de uma NF-e autorizada (com chave de acesso).");
    }
  }

  const isDevolucao = modo === "DEVOLUCAO";
  const label = `${MODELO_LABEL[nota.modelo]} ${nota.numero ?? "-"}`;

  // NFS-e: reconstrói os serviços a partir dos itens persistidos da nota.
  const servicos: EmissaoPrefillServico[] = isServico
    ? nota.itens.map((it) => ({
        descricao: it.descricao ?? "",
        valor: Number(it.valorTotal),
        codigoServicoLc116: it.itemListaServico ?? ""
      }))
    : [];
  const primeiroItemServico = isServico ? nota.itens[0] : undefined;

  return {
    modo,
    origemId: nota.id,
    origemLabel: label,
    origemChave: nota.chaveAcesso ?? null,
    tipo,
    finalidade: isDevolucao ? "DEVOLUCAO" : "NORMAL",
    naturezaOperacao: isDevolucao ? "Devolução de venda" : (nota.naturezaOperacao ?? "Venda de mercadoria"),
    chaveReferenciada: isDevolucao ? (nota.chaveAcesso ?? null) : null,
    notaOrigemId: isDevolucao ? nota.id : null,
    clienteId: nota.clienteId ?? null,
    destinatario: {
      nome: nota.destinatarioNome ?? "",
      documento: nota.destinatarioDocumento ?? "",
      inscricaoEstadual: nota.destinatarioIe ?? "",
      email: nota.destinatarioEmail ?? ""
    },
    // Devolução não tem contraprestação financeira → "Sem pagamento" (tPag=90 na SEFAZ).
    formaPagamento: isDevolucao ? "Sem pagamento" : (nota.formaPagamento ?? ""),
    condicaoPagamento: nota.condicaoPagamento ?? "",
    observacoes: nota.informacoesComplementares ?? "",
    frete: Number(nota.valorFrete),
    desconto: Number(nota.valorDesconto),
    itens: isServico
      ? []
      : nota.itens.map((it) => ({
          produtoId: it.produtoId ?? null,
          codigo: it.codigo ?? "",
          descricao: it.descricao ?? "",
          ncm: it.ncm ?? "",
          // Devolução: CFOP em branco para o motor derivar o CFOP de devolução (1202/2202).
          cfop: isDevolucao ? "" : (it.cfop ?? ""),
          origem: it.origem ?? "0",
          unidade: it.unidade ?? "UN",
          quantidade: Number(it.quantidade),
          precoUnitario: Number(it.valorUnitario),
          desconto: Number(it.desconto)
        })),
    servicos,
    codigoServicoLc116: primeiroItemServico?.itemListaServico ?? "",
    aliquotaIss: primeiroItemServico?.aliquotaIss != null ? Number(primeiroItemServico.aliquotaIss) : 0,
    issRetido: nota.issRetido
  };
}
