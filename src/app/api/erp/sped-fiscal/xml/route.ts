import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { importarSpedXmls, listSpedXmlDocumentos, SpedError } from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Lista os XMLs avulsos importados para o SPED.
export async function GET() {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const documentos = await listSpedXmlDocumentos(scope);
    return NextResponse.json({ documentos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar XMLs do SPED.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

// Importa um lote de XMLs (NF-e/NFC-e processadas e eventos de cancelamento).
export async function POST(request: Request) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { xmls?: string[] };
    const resultados = await importarSpedXmls(scope, body.xmls ?? [], session.usuarioId);
    return NextResponse.json({ resultados });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao importar XMLs.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}
