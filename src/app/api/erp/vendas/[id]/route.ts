import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { deleteSale, editConfirmedSale, type EditSaleInput } from "@/domains/sales/application/sale-use-cases";

// EDITAR pedido em 'Aguardando nota' (antes de emitir a NF): troca itens/dados com estorno e
// reaplicação transacional de estoque, contas a receber e comissão.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as EditSaleInput;
    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json({ error: "Pedido deve ter ao menos um item." }, { status: 400 });
    }
    const pedido = await editConfirmedSale(scope, params.id, body);
    return NextResponse.json({ id: pedido.id, numero: pedido.numero, total: Number(pedido.total) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao editar venda.";
    const isValidation =
      message.includes("não encontrado") ||
      message.includes("Somente") ||
      message.includes("Há ") ||
      message.includes("ao menos") ||
      message.includes("insuficiente") ||
      message.includes("inativo");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

// EXCLUIR pedido de venda — restrito a perfil ADMIN (gate de servidor).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const pedido = await deleteSale(scope, params.id);
    return NextResponse.json({ id: pedido.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir venda.";
    const isValidation =
      message.includes("não encontrado") || message.includes("Só é possível") || message.includes("nota fiscal");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}
