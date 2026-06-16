/**
 * Limpa os dados de TESTE (homologação) de uma empresa antes de ir para produção:
 * apaga notas fiscais, pedidos de venda, caixa e seus movimentos; restaura o estoque dos
 * produtos vendidos para o valor importado (do arquivo). NÃO apaga os produtos.
 *
 * Uso (PRODUÇÃO): npx tsx scripts/limpar-homologacao.ts [--empresa=<id>] [--dry]
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";

const arg = (k: string, d = "") => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const DRY = process.argv.includes("--dry");
const EMPRESA_ID = arg("empresa", "cmqfut5v2000fhk8ghiobb9lo");

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error("Empresa não encontrada.");
  const w = { tenantId: empresa.tenantId, empresaId: empresa.id };
  console.log(`Empresa: ${empresa.razaoSocial}${DRY ? " · DRY" : ""}`);

  // Saldo do arquivo por código (= sku) para restaurar o estoque dos itens vendidos.
  const itens = JSON.parse(fs.readFileSync("scripts/seu-gama-inventario.json", "utf8")) as Array<{ codigo: string; qtd: number }>;
  const saldoArq = new Map<string, number>();
  for (const it of itens) saldoArq.set(it.codigo.toUpperCase(), Math.max(0, (saldoArq.get(it.codigo.toUpperCase()) ?? 0) + it.qtd));

  const nf = await prisma.notaFiscal.count({ where: w });
  const pv = await prisma.pedidoVenda.count({ where: w });
  const cx = await prisma.caixa.count({ where: w });
  const saidas = await prisma.estoqueMovimento.findMany({ where: { ...w, tipo: { in: ["SAIDA", "ESTORNO"] } }, select: { produtoId: true } });
  const prodVendidos = [...new Set(saidas.map((s) => s.produtoId))];
  console.log(`A apagar: notas=${nf} · pedidos=${pv} · caixas=${cx} · produtos com baixa de teste=${prodVendidos.length}`);

  if (DRY) { console.log("(dry) nada apagado."); return; }

  // 1) Restaura o estoque dos produtos vendidos no teste ao valor importado.
  let restaurados = 0;
  for (const pid of prodVendidos) {
    const p = await prisma.produto.findUnique({ where: { id: pid }, select: { sku: true } });
    const alvo = p ? saldoArq.get(p.sku.toUpperCase()) ?? 0 : 0;
    const upd = await prisma.estoqueSaldo.updateMany({ where: { ...w, produtoId: pid }, data: { quantidade: alvo } });
    if (upd.count > 0) restaurados++;
  }
  console.log(`Estoque restaurado em ${restaurados} produtos.`);

  // 2) Apaga movimentos de venda (mantém ENTRADA do import) e reservas.
  await prisma.estoqueMovimento.deleteMany({ where: { ...w, tipo: { in: ["SAIDA", "ESTORNO"] } } });
  await prisma.estoqueReserva.deleteMany({ where: w }).catch(() => {});

  // 3) Caixa (movimentos -> caixa).
  await prisma.caixaMovimento.deleteMany({ where: w });
  await prisma.caixa.deleteMany({ where: w });

  // 4) Notas fiscais (eventos/itens -> nota).
  await prisma.notaFiscalEvento.deleteMany({ where: w }).catch(() => {});
  await prisma.notaFiscalItem.deleteMany({ where: w }).catch(() => {});
  await prisma.notaFiscal.deleteMany({ where: w });

  // 5) Pedidos de venda (itens -> pedido) + financeiro vinculado.
  await prisma.contaReceber.deleteMany({ where: w }).catch(() => {});
  await prisma.movimentoFinanceiro.deleteMany({ where: w }).catch(() => {});
  await prisma.pedidoVendaItem.deleteMany({ where: w }).catch(() => {});
  await prisma.pedidoVenda.deleteMany({ where: w });

  const restNf = await prisma.notaFiscal.count({ where: w });
  const restPv = await prisma.pedidoVenda.count({ where: w });
  const restCx = await prisma.caixa.count({ where: w });
  console.log(`\nConcluído. Restantes: notas=${restNf} · pedidos=${restPv} · caixas=${restCx}.`);
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
