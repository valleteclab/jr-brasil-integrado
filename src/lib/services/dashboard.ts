import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type ItemCritico = {
  id: string;
  sku: string;
  nome: string;
  saldoAtual: number;
  minimo: number;
};

export type PedidoRecente = {
  id: string;
  numero: string;
  cliente: string;
  status: string;
  total: string;
};

export type DashboardData = {
  vendasMes: { total: string; totalNum: number; contagem: number } | null;
  aReceberAberto: { total: string; totalNum: number } | null;
  aPagarAberto: { total: string; totalNum: number } | null;
  notasAutorizadasMes: { contagem: number; valor: string; valorNum: number } | null;
  itensCriticos: { contagem: number; top5: ItemCritico[] } | null;
  pedidosRecentes: PedidoRecente[] | null;
  osAbertas: { contagem: number } | null;
  erros: string[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const scope = await getDevelopmentTenantScope();
  const base = scopedByTenantCompany(scope);
  const erros: string[] = [];

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

  // Vendas do mês
  let vendasMes: DashboardData["vendasMes"] = null;
  try {
    const pedidos = await prisma.pedidoVenda.findMany({
      where: {
        ...base,
        status: { in: ["AGUARDANDO_NOTA", "SEPARACAO", "ENVIADO", "ENTREGUE"] },
        confirmadoEm: { gte: inicioMes, lte: fimMes }
      },
      select: { total: true }
    });
    const totalNum = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    vendasMes = { total: formatBrl(totalNum), totalNum, contagem: pedidos.length };
  } catch (e) {
    erros.push(`Vendas: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // Contas a receber abertas (ABERTO ou PARCIAL)
  let aReceberAberto: DashboardData["aReceberAberto"] = null;
  try {
    const contas = await prisma.contaReceber.findMany({
      where: { ...base, status: { in: ["ABERTO", "PARCIAL"] } },
      select: { valor: true, valorPago: true }
    });
    const totalNum = contas.reduce(
      (acc, c) => acc + Number(c.valor) - Number(c.valorPago),
      0
    );
    aReceberAberto = { total: formatBrl(totalNum), totalNum };
  } catch (e) {
    erros.push(`A receber: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // Contas a pagar abertas (ABERTO ou PARCIAL)
  let aPagarAberto: DashboardData["aPagarAberto"] = null;
  try {
    const contas = await prisma.contaPagar.findMany({
      where: { ...base, status: { in: ["ABERTO", "PARCIAL"] } },
      select: { valor: true, valorPago: true }
    });
    const totalNum = contas.reduce(
      (acc, c) => acc + Number(c.valor) - Number(c.valorPago),
      0
    );
    aPagarAberto = { total: formatBrl(totalNum), totalNum };
  } catch (e) {
    erros.push(`A pagar: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // Notas fiscais autorizadas no mês
  let notasAutorizadasMes: DashboardData["notasAutorizadasMes"] = null;
  try {
    const notas = await prisma.notaFiscal.findMany({
      where: {
        ...base,
        status: "AUTORIZADA",
        autorizadaEm: { gte: inicioMes, lte: fimMes }
      },
      select: { valorTotal: true }
    });
    const valorNum = notas.reduce((acc, n) => acc + Number(n.valorTotal), 0);
    notasAutorizadasMes = { contagem: notas.length, valor: formatBrl(valorNum), valorNum };
  } catch (e) {
    erros.push(`NF-e: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // Itens críticos de estoque (saldo <= minimo e minimo > 0)
  let itensCriticos: DashboardData["itensCriticos"] = null;
  try {
    const saldos = await prisma.estoqueSaldo.findMany({
      where: { ...base },
      select: {
        quantidade: true,
        minimo: true,
        produto: { select: { id: true, sku: true, nome: true } }
      }
    });

    const criticos = saldos
      .filter((s) => Number(s.minimo) > 0 && Number(s.quantidade) <= Number(s.minimo))
      .map((s) => ({
        id: s.produto.id,
        sku: s.produto.sku,
        nome: s.produto.nome,
        saldoAtual: Number(s.quantidade),
        minimo: Number(s.minimo)
      }));

    // Deduplica por produto (pode ter múltiplos depósitos)
    const deduplicado = Array.from(
      criticos
        .reduce((map, item) => {
          const existing = map.get(item.id);
          if (!existing) {
            map.set(item.id, item);
          } else {
            map.set(item.id, {
              ...existing,
              saldoAtual: existing.saldoAtual + item.saldoAtual
            });
          }
          return map;
        }, new Map<string, ItemCritico>())
        .values()
    );

    itensCriticos = {
      contagem: deduplicado.length,
      top5: deduplicado
        .sort((a, b) => a.saldoAtual - b.saldoAtual)
        .slice(0, 5)
    };
  } catch (e) {
    erros.push(`Estoque crítico: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // Pedidos recentes (5 últimos)
  let pedidosRecentes: DashboardData["pedidosRecentes"] = null;
  try {
    const pedidos = await prisma.pedidoVenda.findMany({
      where: { ...base },
      orderBy: { criadoEm: "desc" },
      take: 5,
      select: {
        id: true,
        numero: true,
        status: true,
        total: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    });
    pedidosRecentes = pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      cliente: p.cliente.nomeFantasia ?? p.cliente.razaoSocial,
      status: p.status,
      total: formatBrl(Number(p.total))
    }));
  } catch (e) {
    erros.push(`Pedidos recentes: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  // OS abertas (não FATURADA/CANCELADA)
  let osAbertas: DashboardData["osAbertas"] = null;
  try {
    const contagem = await prisma.ordemServico.count({
      where: {
        ...base,
        status: { notIn: ["FATURADA", "CANCELADA"] }
      }
    });
    osAbertas = { contagem };
  } catch (e) {
    erros.push(`OS abertas: ${e instanceof Error ? e.message : "erro desconhecido"}`);
  }

  return {
    vendasMes,
    aReceberAberto,
    aPagarAberto,
    notasAutorizadasMes,
    itensCriticos,
    pedidosRecentes,
    osAbertas,
    erros
  };
}
