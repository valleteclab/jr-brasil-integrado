import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { uploadFiscalLogotipo, LogotipoUploadError } from "@/domains/fiscal/application/fiscal-certificate-use-cases";

// Envia a logo da empresa emitente ao provedor (ACBr) — aparece no DANFE/DANFCE/DANFSE.
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione o arquivo de imagem da logo (PNG/JPEG)." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFiscalLogotipo(scope, {
      buffer,
      filename: file.name,
      mimeType: file.type
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar a logo.";
    return NextResponse.json({ error: message }, { status: error instanceof LogotipoUploadError ? 400 : 500 });
  }
}
