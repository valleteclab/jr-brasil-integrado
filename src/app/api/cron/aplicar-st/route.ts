import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * CLASSIFICAÇÃO DE ST/CEST do catálogo de autopeças (rota de operação, CRON_SECRET). Mapeia cada
 * produto para o CEST OFICIAL do segmento 01 (Convênio ICMS 92/2015) pela CATEGORIA gravada na
 * importação (família por tipo de peça) e marca ICMS-ST (mercadoria substituída → revenda sai
 * CST 60/CSOSN 500 + CFOP de ST, sem novo débito).
 *
 * Sem ?apply=1 é DRY-RUN (só relatório). A entrada fiscal continua sendo a fonte de verdade: ao
 * lançar a NF de compra, o sistema confirma/ajusta o ST memorizado. Validar o De/Para com o contador.
 *
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/aplicar-st?cnpj=43954482000121" \
 *        -H "x-cron-secret: <CRON_SECRET>"            # dry-run
 *   ... "?cnpj=...&apply=1"                            # grava
 */
export const dynamic = "force-dynamic";
export const maxDuration = 600;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

async function resolverEmpresa(cnpj: string) {
  const documento = normalizeDocumento(cnpj);
  if (!documento) return null;
  const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
  return empresas.find((e) => normalizeDocumento(e.cnpj) === documento) ?? null;
}

/**
 * De/Para categoria (família da importação) → CEST oficial do segmento 01 (autopeças).
 * Códigos conferidos contra a tabela Cest carregada no sistema (Convênio 92/2015).
 */
const CEST_POR_CATEGORIA: Array<{ re: RegExp; cest: string; rotulo: string; revisar?: boolean }> = [
  { re: /rolamento/i, cest: "0104900", rotulo: "01.049.00 Rolamentos" },
  { re: /embreagem|transmiss|mancal/i, cest: "0105000", rotulo: "01.050.00 Árvores de transmissão/mancais/engrenagens" },
  { re: /retentor/i, cest: "0100700", rotulo: "01.007.00 Juntas/gaxetas/vedação" },
  { re: /borracha/i, cest: "0100900", rotulo: "01.009.00 Batentes/buchas/coxins" },
  { re: /cardan|cruzeta|dire[çc][aã]o|suspens|homocin|freio|autope[çc]a/i, cest: "0107500", rotulo: "01.075.00 Partes/acessórios de veículos 8701-8705" },
  { re: /porca|parafuso|arruela|pino|chaveta|abra[çc]adeira|engraxadeira/i, cest: "0199900", rotulo: "01.999.00 Outras peças (catch-all)", revisar: true }
];

// Aplicação agrícola (TDP): CEST específico 01.045.00 — partes de máquinas agrícolas/rodoviárias.
const RE_AGRICOLA = /\bagr[ií]col|s[eé]rie verde|\btdp\b|\btrator|massey|valtra|valmet|john ?de|new ?holland|agrale|fendt|lavrale|enxada rotativa|adubadeira|encilade|colheit/i;

// Famílias fora de ST (não é mercadoria de revenda automotiva).
const RE_FORA = /ferramenta|sucata|servi[çc]o/i;

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const cnpj = url.searchParams.get("cnpj") ?? "43954482000121";
    const apply = url.searchParams.get("apply") === "1";

    const empresa = await resolverEmpresa(cnpj);
    if (!empresa) return NextResponse.json({ error: `Empresa com CNPJ ${cnpj} não encontrada.` }, { status: 404 });

    const produtos = await prisma.produto.findMany({
      where: { tenantId: empresa.tenantId, empresaId: empresa.id, ativo: true, tipo: "PRODUTO" },
      select: {
        id: true, sku: true, cest: true,
        categoria: { select: { nome: true } },
        aplicacoes: { select: { modelo: true, observacoes: true } },
        fiscal: { select: { id: true, cest: true, icmsSt: true } }
      }
    });

    type Plano = { id: string; fiscalId: string | null; cest: string; rotulo: string; revisar: boolean };
    const plano: Plano[] = [];
    const porRotulo = new Map<string, number>();
    let foraSt = 0, semRegra = 0, jaMarcados = 0;

    for (const p of produtos) {
      const cat = p.categoria?.nome ?? "";
      if (RE_FORA.test(cat)) { foraSt++; continue; }
      if (p.fiscal?.icmsSt && p.fiscal?.cest) { jaMarcados++; continue; }

      const aplic = p.aplicacoes.map((a) => `${a.modelo ?? ""} ${a.observacoes ?? ""}`).join(" ");
      let escolhido: { cest: string; rotulo: string; revisar?: boolean } | null = null;
      // Agrícola tem CEST próprio e vence a família genérica.
      if (RE_AGRICOLA.test(`${cat} ${aplic}`)) {
        escolhido = { cest: "0104500", rotulo: "01.045.00 Partes de máquinas agrícolas/rodoviárias", revisar: true };
      } else {
        for (const r of CEST_POR_CATEGORIA) {
          if (r.re.test(cat)) { escolhido = r; break; }
        }
      }
      if (!escolhido) { semRegra++; continue; }
      porRotulo.set(escolhido.rotulo, (porRotulo.get(escolhido.rotulo) ?? 0) + 1);
      plano.push({ id: p.id, fiscalId: p.fiscal?.id ?? null, cest: escolhido.cest, rotulo: escolhido.rotulo, revisar: Boolean(escolhido.revisar) });
    }

    let atualizados = 0;
    if (apply) {
      for (const item of plano) {
        await prisma.produto.update({ where: { id: item.id }, data: { cest: item.cest } });
        if (item.fiscalId) {
          await prisma.produtoFiscal.update({ where: { id: item.fiscalId }, data: { cest: item.cest, icmsSt: true } });
        }
        atualizados++;
      }
    }

    return NextResponse.json({
      empresa: { razaoSocial: empresa.razaoSocial },
      modo: apply ? "APLICADO" : "DRY-RUN (nada gravado — use ?apply=1)",
      aviso: "CEST do Convênio 92/2015 por família; ICMS-ST marcado como substituído (revenda CST 60/CSOSN 500). A entrada fiscal confirma/ajusta na 1ª compra. Validar De/Para com o contador.",
      totais: {
        produtos: produtos.length,
        classificados: plano.length,
        aRevisar: plano.filter((x) => x.revisar).length,
        foraDeSt: foraSt,
        semRegra,
        jaMarcados,
        atualizados
      },
      porCest: Object.fromEntries([...porRotulo.entries()].sort((a, b) => b[1] - a[1]))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na classificação de ST.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
