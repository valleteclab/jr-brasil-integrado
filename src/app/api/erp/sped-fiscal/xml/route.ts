import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import {
  excluirSpedXmlsDaCompetencia,
  importarSpedXmls,
  listSpedXmlDocumentos,
  SpedError
} from "@/domains/fiscal/application/sped-use-cases";

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

// Remove TODOS os XMLs de uma competência (?ano=2026&mes=5) — para recomeçar o mês.
export async function DELETE(request: Request) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const ano = Number(url.searchParams.get("ano"));
    const mes = Number(url.searchParams.get("mes"));
    const r = await excluirSpedXmlsDaCompetencia(scope, ano, mes, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao limpar os XMLs da competência.";
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
