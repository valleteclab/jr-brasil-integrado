import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { formatBrl } from "@/lib/formatters/currency";

export type GastoItemRow = { descricao: string; quantidade: number | null; valor: number; valorFmt: string };

export type GastoRow = {
  id: string;
  estabelecimento: string;
  documento: string | null;
  categoria: string;
  data: string; // dd/mm/aaaa
  dataRaw: string; // ISO
  valorTotal: number;
  valorFmt: string;
  formaPagamento: string | null;
  origem: "PWA" | "WHATSAPP" | "MANUAL";
  status: "PENDENTE" | "CONFIRMADO";
  iaConfianca: number | null;
  lancadoFinanceiro: boolean;
  observacoes: string | null;
  imagemCupom: string | null;
  itens: GastoItemRow[];
};

export type GastosResumo = {
  total: number;
  totalFmt: string;
  quantidade: number;
  pendentes: number;
  porCategoria: Array<{ categoria: string; total: number; totalFmt: string; pct: number }>;
};

function fmtData(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

/** Lista os gastos do período (default 90 dias), opcionalmente filtrando por categoria. */
export async function listGastos(filtros?: { desde?: Date; categoria?: string }): Promise<GastoRow[]> {
  const scope = await getDevelopmentTenantScope();
  const desde = filtros?.desde ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const gastos = await prisma.gasto.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      data: { gte: desde },
      ...(filtros?.categoria ? { categoria: filtros.categoria } : {})
    },
    include: { itens: true },
    orderBy: { data: "desc" }
  });

  return gastos.map((g) => ({
    id: g.id,
    estabelecimento: g.estabelecimento,
    documento: g.documento,
    categoria: g.categoria,
    data: fmtData(g.data),
    dataRaw: g.data.toISOString(),
    valorTotal: Number(g.valorTotal),
    valorFmt: formatBrl(Number(g.valorTotal)),
    formaPagamento: g.formaPagamento,
    origem: g.origem,
    status: g.status,
    iaConfianca: g.iaConfianca,
    lancadoFinanceiro: g.lancadoFinanceiro,
    observacoes: g.observacoes,
    imagemCupom: g.imagemCupom,
    itens: g.itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade != null ? Number(i.quantidade) : null,
      valor: Number(i.valor),
      valorFmt: formatBrl(Number(i.valor))
    }))
  }));
}

/** Resumo do período: total, quantidade, pendentes e agregado por categoria (para o gráfico). */
export async function getGastosResumo(filtros?: { desde?: Date }): Promise<GastosResumo> {
  const scope = await getDevelopmentTenantScope();
  const desde = filtros?.desde ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const gastos = await prisma.gasto.findMany({
    where: { ...scopedByTenantCompany(scope), data: { gte: desde } },
    select: { valorTotal: true, categoria: true, status: true }
  });

  const total = gastos.reduce((s, g) => s + Number(g.valorTotal), 0);
  const pendentes = gastos.filter((g) => g.status === "PENDENTE").length;
  const mapa = new Map<string, number>();
  for (const g of gastos) mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + Number(g.valorTotal));
  const porCategoria = [...mapa.entries()]
    .map(([categoria, t]) => ({ categoria, total: t, totalFmt: formatBrl(t), pct: total > 0 ? Math.round((t / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  return { total, totalFmt: formatBrl(total), quantidade: gastos.length, pendentes, porCategoria };
}
