import { NextResponse } from "next/server";
import { importNfeXml } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await requireModulo("entradas-fiscais");
    const body = await request.json() as { xmlText?: string };

    if (!body.xmlText?.trim()) {
      return NextResponse.json({ error: "Envie o conteúdo XML da NF-e." }, { status: 400 });
    }

    const scope = await getDevelopmentTenantScope();
    const entry = await importNfeXml(scope, body.xmlText);

    return NextResponse.json(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível importar o XML.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
