import { NextResponse } from "next/server";
import { updateCliente, PlatformAdminError } from "@/lib/services/platform-admin";

// Edita nome e/ou slug (identificador) do cliente (tenant). Apenas dono da plataforma.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { nome?: string; slug?: string };
    const result = await updateCliente(params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar o cliente.";
    return NextResponse.json({ error: message }, { status: error instanceof PlatformAdminError ? 400 : 500 });
  }
}
