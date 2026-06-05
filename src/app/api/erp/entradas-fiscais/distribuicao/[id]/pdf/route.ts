import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { downloadDistributedNfeDocument } from "@/lib/services/nfe-distribution";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessao sem empresa." }, { status: 401 });
    const { body, contentType, filename } = await downloadDistributedNfeDocument(session.scope, params.id, "pdf");
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel baixar o DANFE.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
