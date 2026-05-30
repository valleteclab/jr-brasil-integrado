import { NextResponse } from "next/server";
import type { StatusNotaFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * Receptor de webhooks da Spedy (escopo: conta). A Spedy envia
 * `invoice.status_changed` (e variantes) a cada mudança de estado de um documento.
 * Identificamos a nota pelo `data.id`, que foi salvo em `NotaFiscal.providerRef`
 * na emissão. O endpoint é idempotente e SEMPRE responde 200 — qualquer erro é
 * logado e absorvido para evitar reentregas infinitas pela Spedy.
 *
 * IMPORTANTE: nunca logar token/credenciais. O payload do webhook não os contém.
 */

type SpedyAuthorization = {
  date?: string | null;
  protocol?: string | null;
};

type SpedyProcessingDetail = {
  status?: string | null;
  message?: string | null;
  code?: string | null;
};

type SpedyWebhookPayload = {
  id?: string;
  event?: string;
  data?: {
    id?: string;
    status?: string;
    model?: string;
    number?: string | number | null;
    accessKey?: string | null;
    authorization?: SpedyAuthorization | null;
    processingDetail?: SpedyProcessingDetail | null;
    company?: { federalTaxNumber?: string | null } | null;
  } | null;
};

/** Mapeia o status textual da Spedy para o nosso StatusNotaFiscal. */
function mapSpedyStatus(status: string | undefined): StatusNotaFiscal {
  switch ((status ?? "").toLowerCase()) {
    case "authorized":
      return "AUTORIZADA";
    case "rejected":
    case "denied":
      return "REJEITADA";
    case "canceled":
    case "disabled":
    case "removed":
      return "CANCELADA";
    default:
      return "PROCESSANDO";
  }
}

export async function POST(request: Request) {
  let payload: SpedyWebhookPayload | null = null;

  try {
    payload = (await request.json()) as SpedyWebhookPayload;
  } catch {
    // Corpo inválido: registra e responde 200 para não disparar retries.
    console.error("[webhook/spedy] payload inválido (JSON não parseável).");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const data = payload?.data;
    const providerRef = data?.id?.trim();

    if (!providerRef) {
      console.warn("[webhook/spedy] payload sem data.id; ignorado.");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Webhook é por conta: localizamos a nota sem escopo de sessão, apenas pelo providerRef.
    const nota = await prisma.notaFiscal.findFirst({ where: { providerRef } });

    if (!nota) {
      // Idempotente: nota não encontrada (ou ainda não persistida) não é erro.
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const status = mapSpedyStatus(data?.status);
    const chaveAcesso = data?.accessKey?.toString().trim() || null;
    const numero =
      data?.number !== undefined && data?.number !== null && String(data.number).trim()
        ? String(data.number).trim()
        : null;
    const protocolo = data?.authorization?.protocol?.toString().trim() || null;
    const motivo = data?.processingDetail?.message?.toString().trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.notaFiscal.update({
        where: { id: nota.id },
        data: {
          status,
          ...(chaveAcesso ? { chaveAcesso } : {}),
          ...(numero ? { numero } : {}),
          ...(protocolo ? { protocolo } : {}),
          ...(motivo ? { motivo } : {}),
          autorizadaEm: status === "AUTORIZADA" ? nota.autorizadaEm ?? new Date() : nota.autorizadaEm,
          canceladaEm: status === "CANCELADA" ? nota.canceladaEm ?? new Date() : nota.canceladaEm
        }
      });

      await createAuditLog(tx, {
        scope: { tenantId: nota.tenantId, empresaId: nota.empresaId },
        entidade: "NotaFiscal",
        entidadeId: nota.id,
        acao: "WEBHOOK_SPEDY",
        payload: {
          event: payload?.event ?? null,
          spedyStatus: data?.status ?? null,
          status,
          chave: chaveAcesso,
          numero,
          protocolo,
          code: data?.processingDetail?.code ?? null
        }
      });
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    // Erro inesperado: loga e ainda responde 200 para evitar retries infinitos.
    console.error(
      "[webhook/spedy] falha ao processar webhook:",
      error instanceof Error ? error.message : "erro desconhecido"
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
