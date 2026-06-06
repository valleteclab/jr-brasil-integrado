/**
 * Investigação pontual: por que o CFOP de entrada derivado de um item veio como veio.
 * Uso: npx tsx scripts/investigar-nota.ts <chaveAcesso>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const chave = process.argv[2] || "29260632113251000179550010000099411040654924";

  const entrada = await prisma.entradaFiscal.findFirst({
    where: { chaveAcesso: chave },
    include: {
      empresa: { select: { razaoSocial: true, enderecoUf: true } },
      fornecedor: { select: { razaoSocial: true, uf: true } },
      itens: {
        orderBy: { itemNumero: "asc" },
        include: { impostos: true }
      }
    }
  });

  if (!entrada) {
    console.log("Entrada não encontrada para a chave", chave);
    return;
  }

  console.log("=== NOTA ===");
  console.log("Número/Série:", entrada.numero, "/", entrada.serie);
  console.log("CFOP principal:", entrada.cfopPrincipal);
  console.log("Empresa (destinatário):", entrada.empresa?.razaoSocial, "| UF:", entrada.empresa?.enderecoUf);
  console.log("Fornecedor (emitente):", entrada.fornecedor?.razaoSocial, "| UF:", entrada.fornecedor?.uf);
  const interestadual = Boolean(entrada.empresa?.enderecoUf && entrada.fornecedor?.uf && entrada.empresa.enderecoUf !== entrada.fornecedor.uf);
  console.log("Operação:", interestadual ? "INTERESTADUAL (2xxx)" : "INTERNA (1xxx)");
  console.log("");

  for (const item of entrada.itens) {
    const icms = item.impostos.find((i) => i.tributo === "ICMS");
    console.log(`— Item ${item.itemNumero}: ${item.descricaoFornecedor}`);
    console.log(`   CFOP do XML (saída do fornecedor): ${item.cfop}`);
    console.log(`   ICMS  CST: ${icms?.cst ?? "-"}  CSOSN: ${icms?.csosn ?? "-"}`);
    console.log(`   Finalidade: ${item.finalidade}  (origem: ${item.finalidadeOrigem})`);
    console.log(`   CFOP entrada derivado: ${item.cfopEntradaDerivado}`);
    console.log(`   Movimenta estoque: ${item.movimentaEstoque}`);
    console.log("");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
