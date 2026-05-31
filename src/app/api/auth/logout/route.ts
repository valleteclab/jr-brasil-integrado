import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

// Logout: encerra a sessão atual e limpa o cookie.
export async function POST() {
  try {
    await destroySession();
  } catch {
    /* idempotente */
  }
  return NextResponse.json({ ok: true });
}
