import { NextResponse } from "next/server";
import { authErrorStatus } from "@/lib/auth/http";
import {
  getCommercialLead,
  updateCommercialLead
} from "@/domains/platform-sales/application/commercial-lead-use-cases";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    return NextResponse.json(await getCommercialLead(context.params.id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o lead." },
      { status: authErrorStatus(error, 404) }
    );
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await updateCommercialLead(context.params.id, body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar o lead." },
      { status: authErrorStatus(error, 400) }
    );
  }
}
