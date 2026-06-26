import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  salvarCertificado,
  getCertificadoInfo,
  CertificadoNacionalError
} from "@/domains/fiscal/application/certificado-use-cases";

/**
 * Guarda criptografada do certificado A1 (.pfx) para a emissão NACIONAL (NFS-e direto
 * na SEFIN). Diferente da rota /certificado (que repassa ao ACBr sem armazenar), aqui o
 * arquivo + senha são persistidos criptografados no model CertificadoDigital.
 */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const form = await request.formData();
    const file = form.get("file");
    const password = String(form.get("password") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione o arquivo do certificado (.pfx)." }, { status: 400 });
    }
    if (!password.trim()) {
      return NextResponse.json({ error: "Informe a senha do certificado." }, { status: 400 });
    }

    const pfxBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const resumo = await salvarCertificado(scope, {
      pfxBase64,
      senha: password,
      arquivoNome: file.name
    });

    return NextResponse.json(resumo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o certificado.";
    const status = error instanceof CertificadoNacionalError ? 400 : authErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const info = await getCertificadoInfo(scope);
    return NextResponse.json({ certificado: info });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar o certificado.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
