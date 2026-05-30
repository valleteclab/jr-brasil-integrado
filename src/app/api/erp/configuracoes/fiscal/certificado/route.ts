import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { uploadFiscalCertificate, CertificateUploadError } from "@/domains/fiscal/application/fiscal-certificate-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const form = await request.formData();
    const file = form.get("file");
    const password = String(form.get("password") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione o arquivo do certificado (.pfx)." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFiscalCertificate(scope, { buffer, filename: file.name, password });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar o certificado.";
    const status = error instanceof CertificateUploadError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
