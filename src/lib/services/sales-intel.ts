import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";

/**
 * INTELIGÊNCIA DE VENDAS — visão de AÇÃO comercial (não contábil):
 *  - orçamentos travados (parados em análise / expirados) com valor e idade;
 *  - clientes esfriando (compraram — no legado OU no XERP — e sumiram);
 *  - ranking de clientes unificando as DUAS ERAS (VendaMigrada + PedidoVenda);
 *  - o que mais vende (itens do legado, base rica de 14 meses).
 * Tudo derivado do banco do tenant — nada fixo.
 */

const DIAS_TRAVADO = 7;
const DIAS_ESFRIANDO = 60;
const DIA_MS = 86400000;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR") : "—");

export type IntelVendas = Awaited<ReturnType<typeof getInteligenciaVendas>>;

export async function getInteligenciaVendas() {
  const scope = await getDevelopmentTenantScope();
  const base = scopedByTenantCompany(scope);
  const agora = Date.now();

  const [orcAbertos, pedidos, legadas, clientes] = await Promise.all([
    prisma.orcamento.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { in: ["EM_ANALISE", "APROVADO", "EXPIRADO"] } },
      select: {
        id: true, numero: true, status: true, total: true, criadoEm: true, validoAte: true, vendedor: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    }),
    prisma.pedidoVenda.findMany({
      where: { ...base, status: { notIn: ["RASCUNHO", "CANCELADO"] }, clienteId: { not: null } },
      select: { clienteId: true, total: true, criadoEm: true }
    }),
    prisma.vendaMigrada.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, clienteId: { not: null } },
      select: { clienteId: true, total: true, data: true }
    }),
    prisma.cliente.findMany({
      where: { ...base, status: "ATIVO" },
      select: {
        id: true, razaoSocial: true, nomeFantasia: true,
        contatos: { where: { principal: true }, select: { telefone: true, whatsapp: true, email: true }, take: 1 }
      }
    })
  ]);

  // ── Orçamentos travados: em análise há mais de N dias, ou expirados ──
  const travados = orcAbertos
    .map((o) => ({
      id: o.id,
      numero: o.numero,
      status: o.status,
      cliente: o.cliente?.nomeFantasia || o.cliente?.razaoSocial || "—",
      vendedor: o.vendedor || "—",
      valor: Number(o.total),
      valorFmt: brl(Number(o.total)),
      diasParado: Math.floor((agora - o.criadoEm.getTime()) / DIA_MS),
      validoAte: dataBR(o.validoAte)
    }))
    .filter((o) => o.status === "EXPIRADO" || o.diasParado >= DIAS_TRAVADO)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 25);
  const valorTravado = travados.reduce((s, o) => s + o.valor, 0);

  // ── Consolidação por cliente: legado + XERP ──
  type Acc = { legado: number; xerp: number; compras: number; ultima: Date | null };
  const porCliente = new Map<string, Acc>();
  const toca = (id: string) => {
    if (!porCliente.has(id)) porCliente.set(id, { legado: 0, xerp: 0, compras: 0, ultima: null });
    return porCliente.get(id)!;
  };
  for (const v of legadas) {
    const a = toca(v.clienteId as string);
    a.legado += Number(v.total); a.compras++;
    if (v.data && (!a.ultima || v.data > a.ultima)) a.ultima = v.data;
  }
  for (const p of pedidos) {
    const a = toca(p.clienteId as string);
    a.xerp += Number(p.total); a.compras++;
    if (!a.ultima || p.criadoEm > a.ultima) a.ultima = p.criadoEm;
  }
  const nomeDe = new Map(clientes.map((c) => [c.id, c.nomeFantasia || c.razaoSocial]));
  const contatoDe = new Map(clientes.map((c) => [c.id, c.contatos[0] ?? null]));

  const ranking = [...porCliente.entries()]
    .map(([id, a]) => ({
      id,
      nome: nomeDe.get(id) ?? "(cliente)",
      totalFmt: brl(a.legado + a.xerp),
      total: a.legado + a.xerp,
      legadoFmt: brl(a.legado),
      xerpFmt: brl(a.xerp),
      compras: a.compras,
      ultima: dataBR(a.ultima)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // ── Clientes esfriando: já compraram, sem compra há N dias — com contato p/ ação ──
  const esfriando = [...porCliente.entries()]
    .map(([id, a]) => ({ id, a }))
    .filter(({ a }) => a.ultima && agora - a.ultima.getTime() > DIAS_ESFRIANDO * DIA_MS)
    .map(({ id, a }) => {
      const contato = contatoDe.get(id);
      return {
        id,
        nome: nomeDe.get(id) ?? "(cliente)",
        total: a.legado + a.xerp,
        totalFmt: brl(a.legado + a.xerp),
        compras: a.compras,
        ultima: dataBR(a.ultima),
        diasSemComprar: Math.floor((agora - (a.ultima as Date).getTime()) / DIA_MS),
        fone: contato?.whatsapp || contato?.telefone || null,
        email: contato?.email ?? null
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);
  const valorEmRisco = esfriando.reduce((s, c) => s + c.total, 0);

  // ── O que mais vende (itens do legado — 14 meses de base) ──
  const grupos = await prisma.vendaMigradaItem.groupBy({
    by: ["descricao"],
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    _sum: { total: true, quantidade: true },
    _count: { _all: true },
    orderBy: { _sum: { total: "desc" } },
    take: 15
  });
  const topProdutos = grupos.map((g) => ({
    descricao: g.descricao,
    vendas: g._count._all,
    quantidade: Number(g._sum.quantidade ?? 0),
    totalFmt: brl(Number(g._sum.total ?? 0))
  }));

  const ativos90 = [...porCliente.values()].filter((a) => a.ultima && agora - a.ultima.getTime() <= 90 * DIA_MS).length;

  return {
    kpis: {
      valorTravadoFmt: brl(valorTravado),
      travadosQtd: travados.length,
      valorEmRiscoFmt: brl(valorEmRisco),
      esfriandoQtd: esfriando.length,
      clientesAtivos90: ativos90,
      clientesComHistorico: porCliente.size
    },
    travados,
    esfriando,
    ranking,
    topProdutos,
    parametros: { diasTravado: DIAS_TRAVADO, diasEsfriando: DIAS_ESFRIANDO }
  };
}
