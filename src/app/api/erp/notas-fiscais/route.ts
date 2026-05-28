import { NextResponse } from "next/server";
import { createNfe } from "@/domains/fiscal/emission/nfe-use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createNfe(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar NF-e.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
