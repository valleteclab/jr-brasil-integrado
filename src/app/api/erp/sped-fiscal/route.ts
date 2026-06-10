import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { gerarSpedArquivo, listSpedArquivos, SpedError } from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Lista os arquivos SPED gerados da empresa.
export async function GET() {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const arquivos = await listSpedArquivos(scope);
    return NextResponse.json({ arquivos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar arquivos SPED.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

// Gera (ou regera) o arquivo SPED de uma competência.
export async function POST(request: Request) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as {
      ano?: number;
      mes?: number;
      finalidade?: string;
    };
    const resultado = await gerarSpedArquivo(
      scope,
      {
        ano: Number(body.ano),
        mes: Number(body.mes),
        finalidade: body.finalidade === "RETIFICADORA" ? "RETIFICADORA" : "ORIGINAL"
      },
      session.usuarioId
    );
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o arquivo SPED.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}
