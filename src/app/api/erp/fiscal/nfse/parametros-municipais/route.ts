import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { consultarParametrosMunicipaisNfse } from "@/domains/fiscal/providers/nacional-provider";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico NFS-e nacional: o que o município administra na SEFIN para um código de serviço numa
 * competência (E0312 e afins). GET ?codigo=990101&competencia=2026-09-09[&municipio=2919553]
 * Usa o A1 da empresa (mTLS); município padrão = o do cadastro da empresa.
 */
export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const codigo = (url.searchParams.get("codigo") ?? "").replace(/\D/g, "");
    const competencia = url.searchParams.get("competencia") ?? new Date().toISOString().slice(0, 10);
    if (codigo.length !== 6 || !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: "Informe codigo (6 dígitos, ex.: 990101) e competencia (AAAA-MM-DD)." }, { status: 400 });
    }
    const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId }, select: { codigoMunicipioIbge: true } });
    const municipio = (url.searchParams.get("municipio") ?? empresa?.codigoMunicipioIbge ?? "").replace(/\D/g, "");
    if (municipio.length !== 7) return NextResponse.json({ error: "Município IBGE (7 dígitos) não informado nem cadastrado na empresa." }, { status: 400 });
    const runtime = await getFiscalRuntimeConfig(scope);
    if (!runtime.certificado?.pfx) return NextResponse.json({ error: "Certificado A1 não configurado nesta empresa." }, { status: 400 });
    const consultas = await consultarParametrosMunicipaisNfse({ municipio, codigo, competencia }, runtime.certificado, runtime.ambiente);
    return NextResponse.json({ municipio, codigo, competencia, ambiente: runtime.ambiente, consultas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar parâmetros municipais.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
