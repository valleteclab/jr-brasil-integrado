import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  getCertificadoInfo,
  CertificadoNacionalError
} from "@/domains/fiscal/application/certificado-use-cases";
import { distribuirCertificadoFiscal, CertificateUploadError } from "@/domains/fiscal/application/fiscal-certificate-use-cases";

/**
 * Upload ÚNICO do certificado A1 (.pfx): persiste criptografado (emissão direta SEFAZ /
 * NFS-e Nacional) E repassa aos provedores em uso (ACBr/Spedy) — distribuirCertificadoFiscal.
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await distribuirCertificadoFiscal(scope, {
      buffer,
      filename: file.name,
      password
    });

    return NextResponse.json({ ...result.resumo, message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o certificado.";
    const status = error instanceof CertificadoNacionalError || error instanceof CertificateUploadError ? 400 : authErrorStatus(error);
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
