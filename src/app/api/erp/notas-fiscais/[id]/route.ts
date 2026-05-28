import { NextResponse } from "next/server";
import { updateNfe, deleteNfeDraft, buildNfePayload } from "@/domains/fiscal/emission/nfe-use-cases";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    await updateNfe(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar NF-e.";
    const status = message.includes("não encontrada") ? 404 : message.includes("Somente rascunhos") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteNfeDraft(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir NF-e.";
    const status = message.includes("não encontrada") ? 404 : message.includes("Somente rascunhos") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const payload = await buildNfePayload(params.id);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar payload NF-e.";
    return NextResponse.json({ error: message }, { status: message.includes("não encontrada") ? 404 : 500 });
  }
}
