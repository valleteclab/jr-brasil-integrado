import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type OrdemServicoSummary = {
  id: string;
  numero: string;
  cliente: string;
  clienteId: string;
  equipamento: string;
  placaOuSerial: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute" | "violet";
  total: string;
  totalServicos: string;
  totalPecas: string;
  previsaoEm: string | null;
  faturadoEm: string | null;
  criadoEm: string;
  canAddServico: boolean;
  canAddPeca: boolean;
  canFaturar: boolean;
};

export type OrdemServicoDetail = OrdemServicoSummary & {
  depositoId: string | null;
  problemaRelatado: string | null;
  diagnostico: string | null;
  observacoes: string | null;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  servicos: Array<{
    id: string;
    descricao: string;
    horas: string;
    valorHora: string;
    total: string;
  }>;
  pecas: Array<{
    id: string;
    produtoId: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    precoUnitario: string;
    total: string;
  }>;
};

export type OsFormData = {
  clientes: Array<{ id: string; label: string }>;
  produtos: Array<{ id: string; sku: string; nome: string; preco: number }>;
};

const STATUS_LABELS: Record<string, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_PECAS: "Aguardando peças",
  FINALIZADA_NAO_FATURADA: "Finalizada (não faturada)",
  FATURADA: "Faturada",
  CANCELADA: "Cancelada",
};

const STATUS_TONES: Record<string, "success" | "warn" | "danger" | "info" | "mute" | "violet"> = {
  ABERTA: "info",
  EM_ANDAMENTO: "warn",
  AGUARDANDO_PECAS: "warn",
  FINALIZADA_NAO_FATURADA: "violet",
  FATURADA: "success",
  CANCELADA: "danger",
};

function mapOs(os: {
  id: string;
  numero: string;
  clienteId: string;
  cliente: { razaoSocial: string; nomeFantasia?: string | null };
  equipamento: string;
  placaOuSerial: string | null;
  status: string;
  total: { toString(): string };
  totalServicos: { toString(): string };
  totalPecas: { toString(): string };
  previsaoEm: Date | null;
  faturadoEm: Date | null;
  criadoEm: Date;
}): OrdemServicoSummary {
  const editavel = !["FATURADA", "CANCELADA"].includes(os.status);
  const canFaturar = ["FINALIZADA_NAO_FATURADA", "EM_ANDAMENTO", "AGUARDANDO_PECAS"].includes(os.status);
  return {
    id: os.id,
    numero: os.numero,
    cliente: os.cliente.nomeFantasia ?? os.cliente.razaoSocial,
    clienteId: os.clienteId,
    equipamento: os.equipamento,
    placaOuSerial: os.placaOuSerial,
    status: os.status,
    statusLabel: STATUS_LABELS[os.status] ?? os.status,
    statusTone: STATUS_TONES[os.status] ?? "mute",
    total: formatBrl(Number(os.total)),
    totalServicos: formatBrl(Number(os.totalServicos)),
    totalPecas: formatBrl(Number(os.totalPecas)),
    previsaoEm: os.previsaoEm ? os.previsaoEm.toLocaleDateString("pt-BR") : null,
    faturadoEm: os.faturadoEm ? os.faturadoEm.toLocaleDateString("pt-BR") : null,
    criadoEm: os.criadoEm.toLocaleDateString("pt-BR"),
    canAddServico: editavel,
    canAddPeca: editavel,
    canFaturar,
  };
}

export async function listOrdensServico(): Promise<OrdemServicoSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const oss = await prisma.ordemServico.findMany({
      // Isola por ambiente: OS de homologação não aparecem em produção.
      where: scopedByTenantCompanyAmbiente(scope),
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      },
      orderBy: { criadoEm: "desc" },
    });
    return oss.map(mapOs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar ordens de serviço: ${message}`);
  }
}

export async function getOrdemServicoDetail(id: string): Promise<OrdemServicoDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const os = await prisma.ordemServico.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        servicos: { orderBy: { id: "asc" } },
        pecas: {
          include: { produto: { select: { nome: true, sku: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!os) return null;

    return {
      ...mapOs(os),
      depositoId: os.depositoId,
      problemaRelatado: os.problemaRelatado,
      diagnostico: os.diagnostico,
      observacoes: os.observacoes,
      condicaoPagamento: os.condicaoPagamento,
      formaPagamento: os.formaPagamento,
      servicos: os.servicos.map((s) => ({
        id: s.id,
        descricao: s.descricao,
        horas: Number(s.horas).toFixed(2),
        valorHora: formatBrl(Number(s.valorHora)),
        total: formatBrl(Number(s.total)),
      })),
      pecas: os.pecas.map((p) => ({
        id: p.id,
        produtoId: p.produtoId,
        produtoNome: p.produto.nome,
        produtoSku: p.produto.sku,
        quantidade: Number(p.quantidade),
        precoUnitario: formatBrl(Number(p.precoUnitario)),
        total: formatBrl(Number(p.total)),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar ordem de serviço: ${message}`);
  }
}

export async function listOsFormData(): Promise<OsFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const [clientes, produtos] = await Promise.all([
      prisma.cliente.findMany({
        where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
        select: { id: true, razaoSocial: true, nomeFantasia: true },
        orderBy: { razaoSocial: "asc" },
      }),
      prisma.produto.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: { id: true, sku: true, nome: true, precoVenda: true },
        orderBy: { nome: "asc" },
      }),
    ]);

    return {
      clientes: clientes.map((c) => ({
        id: c.id,
        label: c.nomeFantasia ?? c.razaoSocial,
      })),
      produtos: produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        preco: Number(p.precoVenda),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar dados para o formulário: ${message}`);
  }
}
