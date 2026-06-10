import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Health check para monitoramento externo (UptimeRobot, load balancer): verifica a
 * conectividade com o banco. 200 = saudável; 503 = banco fora. Não exige autenticação
 * (não passa pelo middleware — fora de /erp, /api/erp, /pdv, /admin) e não expõe dados.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
