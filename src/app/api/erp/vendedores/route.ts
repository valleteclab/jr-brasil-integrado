import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { listVendedores, createVendedor } from "@/domains/sales/application/comissao-use-cases";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const vendedores = await listVendedores(scope);
    return NextResponse.json(
      vendedores.map((v) => ({
        id: v.id,
        nome: v.nome,
        email: v.email,
        percentualComissao: Number(v.percentualComissao),
        ativo: v.ativo
      }))
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar vendedores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Cadastro de vendedor (percentual de comissão) — restrito a ADMIN.
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const vendedor = await createVendedor(scope, body);
    return NextResponse.json({ id: vendedor.id, nome: vendedor.nome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar vendedor.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation = message.includes("Informe") || message.includes("Já existe") || message.includes("Percentual");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}
