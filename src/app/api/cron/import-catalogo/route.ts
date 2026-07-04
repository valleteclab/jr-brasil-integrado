import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { analisarCatalogo, importarCatalogo } from "@/domains/products/application/catalogo-jr-import";

/**
 * Importação do catálogo de autopeças (CSV do cliente) na EMPRESA da JR Brasil, rodando dentro do
 * app contra o banco de PRODUÇÃO (VPS). Rota de operação, protegida pelo CRON_SECRET (header
 * `x-cron-secret`), como os demais crons — fora do middleware de sessão.
 *
 * O CSV vai no CORPO da requisição (text/csv). A empresa é resolvida pelo CNPJ (sem hardcode de id).
 *
 *   # dry-run (só relatório, não grava):
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/import-catalogo?dry=1&cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: text/csv" \
 *        --data-binary @"docs/CATALOGO JR ATUALIZADO.csv"
 *
 *   # gravar de verdade (idempotente por SKU — re-rodar é seguro):
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/import-catalogo?cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: text/csv" \
 *        --data-binary @"docs/CATALOGO JR ATUALIZADO.csv"
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

async function resolverEmpresa(cnpj: string) {
  const digitos = cnpj.replace(/\D/g, "");
  if (!digitos) return null;
  // Compara por dígitos (o cadastro pode ter máscara).
  const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
  return empresas.find((e) => (e.cnpj ?? "").replace(/\D/g, "") === digitos) ?? null;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const dry = url.searchParams.get("dry") === "1" || url.searchParams.get("dry") === "true";
    const cnpj = url.searchParams.get("cnpj") ?? "43954482000121";
    const limit = Number(url.searchParams.get("limit") ?? "0") || 0;

    const csv = await request.text();
    if (!csv.trim()) return NextResponse.json({ error: "Envie o CSV no corpo da requisição." }, { status: 400 });

    if (dry) {
      const r = analisarCatalogo(csv, { limit });
      return NextResponse.json({
        dry: true,
        total: r.total,
        validos: r.validos,
        porFamilia: r.porFamilia,
        porNcm: r.porNcm,
        revisarCount: r.revisarCount,
        revisar: r.revisar.slice(0, 200),
        amostra: r.amostra
      });
    }

    const empresa = await resolverEmpresa(cnpj);
    if (!empresa) return NextResponse.json({ error: `Empresa com CNPJ ${cnpj} não encontrada.` }, { status: 404 });
    const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };

    const res = await importarCatalogo(scope, csv, { limit });
    return NextResponse.json({ empresa: { id: empresa.id, razaoSocial: empresa.razaoSocial }, ...res });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na importação.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
