import type { ModeloFiscal, Prisma, StatusNotaFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";

const MODELOS: ModeloFiscal[] = ["NFE", "NFCE", "NFSE"];
const STATUS: StatusNotaFiscal[] = [
  "RASCUNHO",
  "PROCESSANDO",
  "AUTORIZADA",
  "CANCELADA",
  "REJEITADA",
  "DENEGADA",
  "ERRO",
  "SUBSTITUIDA"
];

export type ListFiscalNotesInput = {
  modelo?: string;
  status?: string;
  cliente?: string;
  numero?: string;
  periodoDias?: number;
  limite?: number;
};

/**
 * Lista notas fiscais da empresa e do ambiente fiscal ativos.
 * A consulta é limitada para não estourar o contexto do agente, mas também
 * retorna o total encontrado para ele explicar quando há mais resultados.
 */
export async function listFiscalNotes(scope: TenantScope, input: ListFiscalNotesInput) {
  const modelo = MODELOS.includes(input.modelo as ModeloFiscal) ? (input.modelo as ModeloFiscal) : undefined;
  const status = STATUS.includes(input.status as StatusNotaFiscal) ? (input.status as StatusNotaFiscal) : undefined;
  const cliente = input.cliente?.trim();
  const numero = input.numero?.trim();
  const chave = numero?.replace(/\D+/g, "");
  const documento = cliente?.replace(/\D+/g, "");
  const periodoDias = Number(input.periodoDias);
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const criadoDepoisDe =
    Number.isFinite(periodoDias) && periodoDias > 0
      ? new Date(Date.now() - Math.min(periodoDias, 3650) * 24 * 60 * 60 * 1000)
      : undefined;

  const where: Prisma.NotaFiscalWhereInput = {
    ...scopedByTenantCompanyAmbiente(scope),
    ...(modelo ? { modelo } : {}),
    ...(status ? { status } : {}),
    ...(criadoDepoisDe ? { criadoEm: { gte: criadoDepoisDe } } : {}),
    ...(cliente
      ? {
          OR: [
            { destinatarioNome: { contains: cliente, mode: "insensitive" } },
            ...(documento ? [{ destinatarioDocumento: { contains: documento } } as Prisma.NotaFiscalWhereInput] : [])
          ]
        }
      : {}),
    ...(numero
      ? {
          AND: [
            {
              OR: [
                { numero: { contains: numero, mode: "insensitive" } },
                { numeroNfse: { contains: numero, mode: "insensitive" } },
                ...(chave ? [{ chaveAcesso: { contains: chave } } as Prisma.NotaFiscalWhereInput] : [])
              ]
            }
          ]
        }
      : {})
  };

  const [totalEncontrado, notas] = await prisma.$transaction([
    prisma.notaFiscal.count({ where }),
    prisma.notaFiscal.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        modelo: true,
        numero: true,
        numeroNfse: true,
        serie: true,
        status: true,
        destinatarioNome: true,
        destinatarioDocumento: true,
        total: true,
        ambiente: true,
        chaveAcesso: true,
        providerRef: true,
        pedidoVenda: { select: { numero: true } },
        emitidaEm: true,
        autorizadaEm: true,
        criadoEm: true
      }
    })
  ]);

  return {
    totalEncontrado,
    exibidos: notas.length,
    limite,
    notas: notas.map((nota) => ({
      notaId: nota.id,
      modelo: nota.modelo,
      numero: nota.numeroNfse ?? nota.numero ?? "-",
      serie: nota.serie ?? "-",
      status: nota.status,
      destinatario: nota.destinatarioNome ?? "Consumidor não identificado",
      destinatarioDocumento: nota.destinatarioDocumento ?? null,
      total: Number(nota.total),
      pedido: nota.pedidoVenda?.numero ?? null,
      ambiente: nota.ambiente,
      chaveAcesso: nota.chaveAcesso ?? null,
      emitidaEm: (nota.emitidaEm ?? nota.criadoEm).toISOString(),
      autorizadaEm: nota.autorizadaEm?.toISOString() ?? null,
      pdfUrl:
        nota.providerRef && (nota.status === "AUTORIZADA" || nota.status === "CANCELADA")
          ? `/api/erp/fiscal/${nota.id}/pdf`
          : null
    }))
  };
}
