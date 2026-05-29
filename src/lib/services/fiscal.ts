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
      canCorrect: nota.status === "AUTORIZADA" && nota.modelo !== "NFSE"
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
