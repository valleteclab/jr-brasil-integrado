import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * CORREÇÃO PONTUAL (CRON_SECRET): muda a finalidade de itens de NF-e de ENTRADA de
 * MATERIAL_SERVICO_ICMS (CFOP 1.126/2.126) para MATERIAL_SERVICO_ISS (CFOP 1.128/2.128) — para
 * a empresa do CNPJ informado. DRY-RUN por padrão (mostra o que mudaria); aplica com { aplicar: true }.
 *
 *   curl -sS -X POST .../api/cron/corrigir-finalidade -H "x-cron-secret: <SECRET>" \
 *        -d '{"cnpj":"15130181000148"}'            # dry-run
 *        -d '{"cnpj":"15130181000148","aplicar":true}'   # aplica
 */
export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("x-cron-secret")?.trim() === secret;
}

const DE = "MATERIAL_SERVICO_ICMS" as const;
const PARA = "MATERIAL_SERVICO_ISS" as const;
const novoCfop = (c: string | null) => (c ? c.replace(/126$/, "128") : c);

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = (await request.json()) as { cnpj: string; aplicar?: boolean };
    const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) return NextResponse.json({ error: "Informe o CNPJ (14 dígitos)." }, { status: 400 });

    const empresa = await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true, tenantId: true, razaoSocial: true } });
    if (!empresa) return NextResponse.json({ error: `Empresa CNPJ ${cnpj} não encontrada.` }, { status: 404 });

    // Itens de entrada com a finalidade a corrigir.
    const itens = await prisma.entradaFiscalItem.findMany({
      where: { empresaId: empresa.id, tenantId: empresa.tenantId, finalidade: DE },
      select: {
        id: true, itemNumero: true, descricaoFornecedor: true, cfopEntradaDerivado: true, cfop: true, entradaFiscalId: true,
        entradaFiscal: { select: { numero: true, chaveAcesso: true } }
      },
      orderBy: { criadoEm: "asc" }
    });

    const notas = [...new Set(itens.map((i) => i.entradaFiscalId))];
    const amostra = itens.slice(0, 40).map((i) => ({
      nota: i.entradaFiscal?.numero ?? "—",
      item: i.itemNumero,
      descricao: i.descricaoFornecedor?.slice(0, 50),
      cfopDerivado: i.cfopEntradaDerivado,
      novoCfopDerivado: novoCfop(i.cfopEntradaDerivado)
    }));

    if (!body.aplicar) {
      return NextResponse.json({
        dryRun: true, empresa: empresa.razaoSocial,
        de: DE, para: PARA, itensAfetados: itens.length, notasAfetadas: notas.length, amostra
      });
    }

    // APLICA: finalidade + cfopEntradaDerivado dos itens; cfopPrincipal das notas (126→128).
    let itensAtualizados = 0;
    for (const i of itens) {
      await prisma.entradaFiscalItem.update({
        where: { id: i.id },
        data: { finalidade: PARA, cfopEntradaDerivado: novoCfop(i.cfopEntradaDerivado) }
      });
      itensAtualizados++;
    }
    // cfopPrincipal das notas afetadas (126→128), individual (replace por linha).
    const notasObj = await prisma.entradaFiscal.findMany({ where: { id: { in: notas } }, select: { id: true, cfopPrincipal: true } });
    let notasCfopAtualizadas = 0;
    for (const n of notasObj) {
      if (n.cfopPrincipal && /126$/.test(n.cfopPrincipal)) {
        await prisma.entradaFiscal.update({ where: { id: n.id }, data: { cfopPrincipal: novoCfop(n.cfopPrincipal) } });
        notasCfopAtualizadas++;
      }
    }
    return NextResponse.json({ aplicado: true, empresa: empresa.razaoSocial, itensAtualizados, notasAfetadas: notas.length, notasCfopAtualizadas });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha." }, { status: 400 });
  }
}
