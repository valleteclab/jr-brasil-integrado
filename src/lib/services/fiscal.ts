import type { ModeloFiscal, StatusNotaFiscal } from "@prisma/client";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type NotaFiscalSummary = {
  id: string;
  modelo: ModeloFiscal;
  modeloLabel: string;
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
      canDownload: Boolean(nota.providerRef) && (nota.status === "AUTORIZADA" || nota.status === "CANCELADA")
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
  numero: string;
  serie: string;
  status: StatusNotaFiscal;
  statusLabel: string;
  statusTone: NotaFiscalSummary["statusTone"];
  ambiente: string;
  naturezaOperacao: string;
  chaveAcesso: string;
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
    numero: nota.numero ?? "-",
    serie: nota.serie ?? "-",
    status: nota.status,
    statusLabel: status.label,
    statusTone: status.tone,
    ambiente: nota.ambiente === "PRODUCAO" ? "Produção" : "Homologação",
    naturezaOperacao: nota.naturezaOperacao ?? "—",
    chaveAcesso: nota.chaveAcesso ?? "",
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
    canSync: Boolean(nota.providerRef) && (nota.status === "PROCESSANDO" || nota.status === "AUTORIZADA")
  };
}
