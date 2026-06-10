import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import {
  definirFinalidadesSpedXml,
  excluirSpedXmlDocumento,
  getSpedXmlDetalhe,
  SpedError
} from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Detalhe do XML de entrada: itens com a finalidade efetiva (manual/regra/heurística) e crédito.
export async function GET(_request: Request, { params }: { params: { xmlId: string } }) {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const detalhe = await getSpedXmlDetalhe(scope, params.xmlId);
    return NextResponse.json(detalhe);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar o XML.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

// Define a finalidade manual da nota ("*" aplica a todos os itens) ou por item.
export async function PUT(request: Request, { params }: { params: { xmlId: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as {
      finalidade?: string | null;
      itens?: Record<string, string | null>;
    };
    // Forma simples: { finalidade } vale para a nota inteira; { itens } sobrepõe por item.
    const itens = body.itens ?? { "*": body.finalidade ?? null };
    const detalhe = await definirFinalidadesSpedXml(scope, params.xmlId, itens, session.usuarioId);
    return NextResponse.json(detalhe);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a finalidade.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

// Remove um XML avulso do SPED (ele deixa de entrar nas próximas gerações).
export async function DELETE(_request: Request, { params }: { params: { xmlId: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const r = await excluirSpedXmlDocumento(scope, params.xmlId, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir o XML.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}
