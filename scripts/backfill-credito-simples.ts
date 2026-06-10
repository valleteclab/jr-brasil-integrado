/**
 * Backfill do crédito de ICMS do Simples (LC 123, art. 23) em entradas JÁ importadas.
 *
 * Entradas importadas antes de 2026-06-10 não têm os campos novos preenchidos
 * (EntradaFiscal.informacoesComplementares e EntradaFiscalItemImposto.aliquotaCredSn/
 * valorCredSn). Este script relê o XML original de cada XmlImportacao com o parser
 * atual e preenche os campos nas entradas vinculadas — sem tocar em valores, estoque
 * ou status. Idempotente: pode rodar mais de uma vez.
 *
 * Uso: npx tsx scripts/backfill-credito-simples.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { parseNfeXml } from "../src/domains/products/xml/nfe-server-parser";

async function main() {
  const importacoes = await prisma.xmlImportacao.findMany({
    where: { xmlOriginal: { not: null } },
    select: {
      id: true,
      numero: true,
      emitenteNome: true,
      xmlOriginal: true,
      entradasFiscais: {
        select: {
          id: true,
          informacoesComplementares: true,
          itens: { select: { id: true, itemNumero: true } }
        }
      }
    }
  });

  let entradasAtualizadas = 0;
  let impostosAtualizados = 0;

  for (const imp of importacoes) {
    if (!imp.xmlOriginal || imp.entradasFiscais.length === 0) continue;
    let parsed;
    try {
      parsed = parseNfeXml(imp.xmlOriginal);
    } catch {
      continue;
    }
    const temCredEstruturado = parsed.items.some((i) => i.taxes.some((t) => (t.credSnValue ?? 0) > 0));
    if (!parsed.infCpl && !temCredEstruturado && parsed.creditoSimplesInfCpl <= 0) continue;

    for (const entrada of imp.entradasFiscais) {
      if (parsed.infCpl && !entrada.informacoesComplementares) {
        await prisma.entradaFiscal.update({
          where: { id: entrada.id },
          data: { informacoesComplementares: parsed.infCpl }
        });
        entradasAtualizadas++;
      }

      for (const item of entrada.itens) {
        const itemXml = parsed.items.find((i) => i.itemNumber === item.itemNumero);
        if (!itemXml) continue;
        const icms = itemXml.taxes.find((t) => t.tax === "ICMS");
        const credValor =
          icms?.credSnValue ??
          (!temCredEstruturado && parsed.creditoSimplesInfCpl > 0 && parsed.totalProducts > 0
            ? Math.round(((itemXml.totalValue / parsed.totalProducts) * parsed.creditoSimplesInfCpl + Number.EPSILON) * 100) / 100
            : null);
        if (!credValor || credValor <= 0) continue;
        const r = await prisma.entradaFiscalItemImposto.updateMany({
          where: { entradaFiscalItemId: item.id, tributo: "ICMS", valorCredSn: null },
          data: { aliquotaCredSn: icms?.credSnRate ?? null, valorCredSn: credValor }
        });
        impostosAtualizados += r.count;
      }
    }
    if (temCredEstruturado || parsed.creditoSimplesInfCpl > 0) {
      console.log(`NF ${imp.numero ?? "?"} (${imp.emitenteNome ?? "?"}): crédito do Simples detectado e aplicado.`);
    }
  }

  console.log(`\nConcluído: ${entradasAtualizadas} entrada(s) com infCpl preenchido, ${impostosAtualizados} imposto(s) com crédito do Simples.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
