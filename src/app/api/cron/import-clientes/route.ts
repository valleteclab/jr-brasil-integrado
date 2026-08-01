import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { importarClientes, parseClientesCsv } from "@/domains/customers/application/clientes-import";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Importação de CLIENTES da migração (CSV no corpo), rodando dentro do app contra o banco de
 * PRODUÇÃO. Protegida por CRON_SECRET (header `x-cron-secret`), fora do middleware de sessão.
 * A empresa é resolvida pelo CNPJ (sem hardcode). Idempotente por codigoExterno.
 *
 *   # dry-run (só relatório):
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/import-clientes?dry=1&cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: text/csv" --data-binary @clientes.csv
 *
 *   # gravar:
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/import-clientes?cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: text/csv" --data-binary @clientes.csv
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const dry = url.searchParams.get("dry") === "1" || url.searchParams.get("dry") === "true";
    const cnpjParam = normalizeDocumento(url.searchParams.get("cnpj") ?? "");
    if (!cnpjParam) return NextResponse.json({ error: "Informe ?cnpj= da empresa destino." }, { status: 400 });

    const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
    const empresa = empresas.find((e) => normalizeDocumento(e.cnpj) === cnpjParam);
    if (!empresa) return NextResponse.json({ error: "Empresa não encontrada pelo CNPJ." }, { status: 404 });

    const csv = await request.text();
    if (!csv.trim()) return NextResponse.json({ error: "Envie o CSV no corpo da requisição." }, { status: 400 });

    const { linhas, invalidas } = parseClientesCsv(csv);
    if (dry) {
      const semDoc = linhas.filter((l) => !l.documento).length;
      const semEnd = linhas.filter((l) => !l.cep).length;
      return NextResponse.json({
        dry: true,
        empresa: empresa.razaoSocial,
        total: linhas.length,
        invalidas,
        semDocumento: semDoc,
        semEndereco: semEnd,
        amostra: linhas.slice(0, 3)
      });
    }

    const r = await importarClientes({ tenantId: empresa.tenantId, empresaId: empresa.id }, linhas);
    return NextResponse.json({ empresa: empresa.razaoSocial, invalidas, ...r });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro na importação.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
