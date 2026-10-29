import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { OfxParseError, excluirImportacao, importarOfx } from "@/domains/finance/application/ofx-use-cases";

export const dynamic = "force-dynamic";

/** Importa um extrato/fatura em OFX para a conta financeira escolhida. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const form = await request.formData();
    const file = form.get("file");
    const contaBancariaId = String(form.get("contaBancariaId") ?? "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione o arquivo .ofx exportado no banco." }, { status: 400 });
    }
    if (!contaBancariaId) {
      return NextResponse.json({ error: "Escolha a conta financeira do extrato." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo acima de 8 MB. Exporte um período menor." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await importarOfx(scope, { contaBancariaId, arquivo: buffer, arquivoNome: file.name }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao importar o OFX.";
    const validacao = error instanceof OfxParseError || error instanceof FinanceValidationError;
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, validacao ? 400 : 500) });
  }
}

/** Desfaz uma importação inteira (arquivo na conta errada). Query: ?id=<importacaoId> */
export async function DELETE(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Informe a importação a excluir." }, { status: 400 });
    const r = await excluirImportacao(scope, id, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir a importação.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}
