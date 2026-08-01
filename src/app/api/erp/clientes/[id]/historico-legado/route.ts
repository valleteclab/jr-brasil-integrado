import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export const dynamic = "force-dynamic";

/** Histórico do SISTEMA ANTERIOR do cliente (VendaMigrada — read-only, migração). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("clientes");
    const scope = await getDevelopmentTenantScope();
    const vendas = await prisma.vendaMigrada.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, clienteId: params.id },
      orderBy: { data: "desc" },
      take: 100,
      include: { itens: { select: { codigo: true, descricao: true, preco: true, quantidade: true, desconto: true, total: true } } }
    });
    return NextResponse.json({
      total: vendas.length,
      vendas: vendas.map((v) => ({
        numero: v.numero,
        tipo: v.tipo,
        data: v.data ? v.data.toISOString().slice(0, 10) : null,
        total: Number(v.total),
        itens: v.itens.map((i) => ({
          codigo: i.codigo, descricao: i.descricao, preco: Number(i.preco),
          quantidade: Number(i.quantidade), desconto: Number(i.desconto), total: Number(i.total)
        }))
      }))
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao carregar o histórico.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
  }
}
