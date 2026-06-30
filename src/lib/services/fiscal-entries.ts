import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type FiscalEntrySummary = {
  id: string;
  number: string;
  series: string;
  supplier: string;
  supplierDocument: string;
  receivedAt: string;
  issuedAt: string;
  status: string;
  rawStatus: string;
  statusTone: "success" | "warn" | "info" | "danger" | "mute";
  total: string;
  totalNumber: number;
  vinculation: string;
  vinculationTone: "success" | "warn" | "danger" | "mute";
  linkedItems: number;
  totalItems: number;
  canDelete: boolean;
  canReverse: boolean;
};

function formatDate(value?: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR").format(value);
}

function statusLabel(status: string): Pick<FiscalEntrySummary, "status" | "statusTone"> {
  if (status === "ESTOQUE_PROCESSADO") {
    return { status: "Registrada", statusTone: "success" };
  }

  if (status === "AGUARDANDO_CONFERENCIA") {
    return { status: "Em conferência", statusTone: "warn" };
  }

  if (status === "CONFERIDA") {
    return { status: "Conferida", statusTone: "info" };
  }

  if (status === "CANCELADA") {
    return { status: "Cancelada", statusTone: "danger" };
  }

  if (status === "ESTORNADA") {
    return { status: "Estornada", statusTone: "danger" };
  }

  return { status: "Rascunho", statusTone: "mute" };
}

function vinculationLabel(linkedItems: number, totalItems: number): Pick<FiscalEntrySummary, "vinculation" | "vinculationTone"> {
  if (totalItems === 0) {
    return { vinculation: "Sem itens", vinculationTone: "mute" };
  }

  if (linkedItems === totalItems) {
    return { vinculation: "Vinculada", vinculationTone: "success" };
  }

  if (linkedItems > 0) {
    return { vinculation: "Parcial", vinculationTone: "warn" };
  }

  return { vinculation: "Não vinculada", vinculationTone: "danger" };
}

export async function listFiscalEntrySummaries(): Promise<FiscalEntrySummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar notas fiscais de entrada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const entries = await prisma.entradaFiscal.findMany({
      // NÃO isola por ambiente: nota de entrada (compra de fornecedor) é documento REAL — deve
      // aparecer independentemente de a empresa estar emitindo em homologação ou produção. (O isolamento
      // por ambiente vale para as EMISSÕES da empresa, não para os documentos que ela recebe.)
      where: scopedByTenantCompany(scope),
      include: {
        fornecedor: true,
        itens: {
          select: {
            id: true,
            produtoId: true
          }
        }
      },
      orderBy: [
        { recebidaEm: "desc" },
        { criadoEm: "desc" }
      ]
    });

    return entries.map((entry) => {
      const totalItems = entry.itens.length;
      const linkedItems = entry.itens.filter((item) => Boolean(item.produtoId)).length;
      const status = statusLabel(entry.status);
      const vinculation = vinculationLabel(linkedItems, totalItems);
      const totalNumber = Number(entry.totalNota);

      return {
        id: entry.id,
        number: entry.numero || "Sem número",
        series: entry.serie || "",
        supplier: entry.fornecedor?.razaoSocial || "Fornecedor não identificado",
        supplierDocument: entry.fornecedor?.documento || "",
        receivedAt: formatDate(entry.recebidaEm ?? entry.criadoEm),
        issuedAt: formatDate(entry.emitidaEm),
        total: formatBrl(totalNumber),
        totalNumber,
        rawStatus: entry.status,
        linkedItems,
        totalItems,
        // Estornada já desfez o estoque → pode ser excluída (ESTOQUE_PROCESSADO exige estornar antes).
        canDelete: entry.status !== "ESTOQUE_PROCESSADO",
        canReverse: entry.status === "ESTOQUE_PROCESSADO",
        ...status,
        ...vinculation
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar notas fiscais de entrada: ${message}`);
  }
}
