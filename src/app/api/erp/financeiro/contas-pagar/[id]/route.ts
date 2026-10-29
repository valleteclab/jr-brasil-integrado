import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { requireModulo, getSession } from "@/lib/auth/session";
import { deletePayable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { editPayable, type EditPayableInput } from "@/domains/finance/application/payable-edit-use-cases";

// EXCLUIR conta a pagar (sem pagamento) — restrito a perfil ADMIN (gate de servidor).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const conta = await deletePayable(scope, params.id);
    return NextResponse.json({ id: conta.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir conta a pagar.";
    const isValidation = message.includes("não encontrada") || message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

// EDITAR conta a pagar em aberto (vencimento, valor, forma, conta, documento, fornecedor).
// Exige o módulo financeiro — não é ação de ADMIN como a exclusão: corrigir o vencimento de uma
// nota de entrada é rotina de quem concilia, e tudo fica auditado.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as EditPayableInput;
    const conta = await editPayable(scope, params.id, body, session?.usuarioId);
    return NextResponse.json({ id: conta.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao editar conta a pagar.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}
