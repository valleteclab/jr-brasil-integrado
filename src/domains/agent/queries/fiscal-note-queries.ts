import type { ModeloFiscal, Prisma, StatusNotaFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { correspondeBusca } from "@/lib/search/normalize";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { normalizeDocumento } from "@/lib/fiscal/documento";

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
  const documento = normalizeDocumento(cliente);
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
    // Filtro por nome do cliente sai do WHERE (acentos) e e feito em memoria abaixo;
    // documento (so digitos) continua no banco.
    ...(cliente && documento
      ? { OR: [{ destinatarioDocumento: { contains: documento } } as Prisma.NotaFiscalWhereInput] }
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

  // Com filtro de cliente por NOME, busca um lote maior e filtra acento-insensivel
  // em memoria (correspondeBusca) — o contains do banco nao casa acentos.
  const filtraPorNome = Boolean(cliente && !documento);
  const [totalBruto, notasBrutas] = await prisma.$transaction([
    prisma.notaFiscal.count({ where }),
    prisma.notaFiscal.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: filtraPorNome ? 400 : limite,
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

  const notas = (filtraPorNome
    ? notasBrutas.filter((n) => correspondeBusca(cliente as string, n.destinatarioNome, n.destinatarioDocumento))
    : notasBrutas
  ).slice(0, limite);
  const totalEncontrado = filtraPorNome ? notas.length : totalBruto;

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

/** Detalhe fiscal completo para consulta antes de enviar, cancelar ou auditar uma nota. */
export async function getFiscalNoteDetail(
  scope: TenantScope,
  input: { notaId?: string; numero?: string }
) {
  const notaId = input.notaId?.trim();
  const numero = input.numero?.trim();
  if (!notaId && !numero) return { encontrado: false, motivo: "Informe o notaId ou o número da nota." };

  if (!notaId && numero) {
    const candidatas = await prisma.notaFiscal.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        OR: [
          { numero: { equals: numero, mode: "insensitive" } },
          { numeroNfse: { equals: numero, mode: "insensitive" } }
        ]
      },
      orderBy: { criadoEm: "desc" },
      take: 4,
      select: { id: true, modelo: true, numero: true, numeroNfse: true, serie: true, status: true, destinatarioNome: true, total: true }
    });
    if (candidatas.length > 1) {
      return {
        encontrado: false,
        motivo: "Há mais de uma nota com esse número. Escolha pelo modelo/série e consulte novamente usando o notaId.",
        candidatas: candidatas.map((nota) => ({
          notaId: nota.id,
          modelo: nota.modelo,
          numero: nota.numeroNfse ?? nota.numero,
          serie: nota.serie,
          status: nota.status,
          destinatario: nota.destinatarioNome,
          total: Number(nota.total)
        }))
      };
    }
  }

  const nota = await prisma.notaFiscal.findFirst({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      ...(notaId
        ? { id: notaId }
        : {
            OR: [
              { numero: { equals: numero, mode: "insensitive" } },
              { numeroNfse: { equals: numero, mode: "insensitive" } }
            ]
          })
    },
    select: {
      id: true,
      modelo: true,
      finalidade: true,
      numero: true,
      numeroNfse: true,
      serie: true,
      status: true,
      ambiente: true,
      naturezaOperacao: true,
      chaveAcesso: true,
      protocolo: true,
      motivo: true,
      destinatarioNome: true,
      destinatarioDocumento: true,
      destinatarioEmail: true,
      total: true,
      valorProdutos: true,
      valorServicos: true,
      valorIcms: true,
      valorIcmsSt: true,
      valorIpi: true,
      valorPis: true,
      valorCofins: true,
      valorIss: true,
      valorTotalTributos: true,
      valorLiquido: true,
      formaPagamento: true,
      condicaoPagamento: true,
      informacoesComplementares: true,
      emitidaEm: true,
      autorizadaEm: true,
      canceladaEm: true,
      providerRef: true,
      pedidoVenda: { select: { numero: true } },
      ordemServico: { select: { numero: true } },
      itens: {
        orderBy: { numeroItem: "asc" },
        select: {
          numeroItem: true,
          codigo: true,
          descricao: true,
          ncm: true,
          cfop: true,
          unidade: true,
          quantidade: true,
          valorUnitario: true,
          valorTotal: true,
          valorIcms: true,
          valorIcmsSt: true,
          valorIpi: true,
          valorPis: true,
          valorCofins: true,
          valorIss: true
        }
      },
      eventos: {
        orderBy: { criadoEm: "desc" },
        take: 10,
        select: { tipo: true, status: true, protocolo: true, mensagem: true, criadoEm: true }
      }
    }
  });

  if (!nota) return { encontrado: false, motivo: "Nota fiscal não encontrada na empresa e no ambiente ativos." };
  return {
    encontrado: true,
    notaId: nota.id,
    modelo: nota.modelo,
    finalidade: nota.finalidade,
    numero: nota.numeroNfse ?? nota.numero ?? "-",
    serie: nota.serie ?? "-",
    status: nota.status,
    ambiente: nota.ambiente,
    naturezaOperacao: nota.naturezaOperacao,
    chaveAcesso: nota.chaveAcesso,
    protocolo: nota.protocolo,
    motivo: nota.motivo,
    destinatario: nota.destinatarioNome,
    destinatarioDocumento: nota.destinatarioDocumento,
    destinatarioEmail: nota.destinatarioEmail,
    total: Number(nota.total),
    valorProdutos: Number(nota.valorProdutos),
    valorServicos: Number(nota.valorServicos),
    impostos: {
      icms: Number(nota.valorIcms),
      icmsSt: Number(nota.valorIcmsSt),
      ipi: Number(nota.valorIpi),
      pis: Number(nota.valorPis),
      cofins: Number(nota.valorCofins),
      iss: Number(nota.valorIss),
      totalTributos: Number(nota.valorTotalTributos)
    },
    valorLiquido: Number(nota.valorLiquido),
    formaPagamento: nota.formaPagamento,
    condicaoPagamento: nota.condicaoPagamento,
    informacoesComplementares: nota.informacoesComplementares,
    pedido: nota.pedidoVenda?.numero ?? null,
    ordemServico: nota.ordemServico?.numero ?? null,
    emitidaEm: nota.emitidaEm?.toISOString() ?? null,
    autorizadaEm: nota.autorizadaEm?.toISOString() ?? null,
    canceladaEm: nota.canceladaEm?.toISOString() ?? null,
    pdfUrl: nota.providerRef ? `/api/erp/fiscal/${nota.id}/pdf` : null,
    xmlUrl: nota.providerRef ? `/api/erp/fiscal/${nota.id}/xml` : null,
    itens: nota.itens.map((item) => ({
      numeroItem: item.numeroItem,
      codigo: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm,
      cfop: item.cfop,
      unidade: item.unidade,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valorUnitario),
      valorTotal: Number(item.valorTotal),
      impostos: {
        icms: Number(item.valorIcms),
        icmsSt: Number(item.valorIcmsSt),
        ipi: Number(item.valorIpi),
        pis: Number(item.valorPis),
        cofins: Number(item.valorCofins),
        iss: Number(item.valorIss)
      }
    })),
    eventos: nota.eventos.map((evento) => ({
      tipo: evento.tipo,
      status: evento.status,
      protocolo: evento.protocolo,
      mensagem: evento.mensagem,
      criadoEm: evento.criadoEm.toISOString()
    }))
  };
}
