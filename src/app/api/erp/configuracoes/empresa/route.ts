import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getEmpresaPerfil, updateEmpresaPerfil } from "@/domains/company/application/company-use-cases";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const perfil = await getEmpresaPerfil(scope);
    return NextResponse.json(perfil);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os dados da empresa.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const perfil = await updateEmpresaPerfil(scope, await request.json());
    return NextResponse.json(perfil);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar os dados da empresa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
