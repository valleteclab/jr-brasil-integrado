import { NextResponse } from "next/server";
import { resolveEmpresaScope, PlatformAdminError } from "@/lib/services/platform-admin";
import { uploadFiscalCertificate, CertificateUploadError } from "@/domains/fiscal/application/fiscal-certificate-use-cases";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS envia o certificado A1 da empresa do cliente ao provedor.
export async function POST(request: Request, { params }: { params: { id: string; empresaId: string } }) {
  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    const formData = await request.formData();
    const file = formData.get("file");
    const password = String(formData.get("senha") ?? formData.get("password") ?? "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione o arquivo do certificado (.pfx/.p12)." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFiscalCertificate(scope, { buffer, filename: file.name, password });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar o certificado.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError || error instanceof CertificateUploadError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
