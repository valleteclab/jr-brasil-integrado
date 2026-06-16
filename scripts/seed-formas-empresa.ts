/** Semeia as formas de pagamento padrão em uma empresa (idempotente). Uso: --empresa=<id> */
import { prisma } from "../src/lib/db/prisma";
import { seedFormasPagamentoPadrao } from "../src/domains/finance/application/payment-config-use-cases";

const empId = process.argv.find((a) => a.startsWith("--empresa="))?.split("=")[1] || "cmqfut5v2000fhk8ghiobb9lo";

async function main() {
  const e = await prisma.empresa.findUnique({ where: { id: empId }, select: { tenantId: true, razaoSocial: true } });
  if (!e) throw new Error("Empresa não encontrada.");
  const n = await seedFormasPagamentoPadrao({ tenantId: e.tenantId, empresaId: empId });
  const total = await prisma.formaPagamento.count({ where: { empresaId: empId } });
  console.log(`${e.razaoSocial}: ${n} formas criadas · total agora ${total}`);
}
main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
