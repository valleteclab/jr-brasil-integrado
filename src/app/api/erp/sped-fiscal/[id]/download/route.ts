import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { getSpedArquivoConteudo, SpedError } from "@/domains/fiscal/application/sped-use-cases";

// Download do arquivo .txt da EFD ICMS/IPI (enviado ao contador para validar no PVA).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const { nomeArquivo, conteudo } = await getSpedArquivoConteudo(scope, params.id);
    // Converte para bytes ISO-8859-1 de verdade (acentos do pt-BR cabem em latin1).
    const corpo = Buffer.from(conteudo, "latin1");
    return new NextResponse(corpo, {
      headers: {
        // O PVA espera o arquivo em codificação latina (ISO-8859-1/Windows-1252).
        "Content-Type": "text/plain; charset=ISO-8859-1",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o arquivo SPED.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    if (error instanceof SpedError) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
