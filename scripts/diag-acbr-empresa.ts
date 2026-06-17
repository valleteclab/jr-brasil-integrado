import { prisma } from "../src/lib/db/prisma";
import { AcbrFiscalProvider } from "../src/domains/fiscal/providers/acbr-provider";
import type { ProviderContext } from "../src/domains/fiscal/providers/types";

/**
 * Diagnóstico: consulta o cadastro da empresa na ACBr e mostra se a logo está lá
 * (header X-Logotipo / propriedade no payload) + chama o endpoint do logotipo.
 *
 * Uso (na VPS):
 *   docker run --rm --network container:$(docker ps -q --filter name=erp_erp) \
 *     -e DATABASE_URL=... jrb-erp:tools npx tsx scripts/diag-acbr-empresa.ts
 */
async function main() {
  const empresa = await prisma.empresa.findFirst({
    select: { id: true, razaoSocial: true, cnpj: true }
  });
  if (!empresa) throw new Error("Sem empresa cadastrada.");

  const config = await prisma.configuracaoFiscal.findFirst({
    where: { empresaId: empresa.id },
    select: { provedor: true, ambiente: true, baseUrl: true, token: true, logotipoInfo: true }
  });
  if (!config) throw new Error("Sem ConfiguracaoFiscal.");

  console.log("== Empresa ==");
  console.log({ id: empresa.id, razao: empresa.razaoSocial, cnpj: empresa.cnpj });
  console.log("== Config local ==");
  console.log({
    provedor: config.provedor,
    ambiente: config.ambiente,
    baseUrl: config.baseUrl,
    tokenSet: Boolean(config.token),
    logotipoInfo: config.logotipoInfo
  });

  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: config.provedor,
    baseUrl: config.baseUrl,
    token: config.token ?? null,
    cscId: null,
    cscToken: null
  } as ProviderContext;

  const provider = new AcbrFiscalProvider();
  const access = provider as unknown as {
    resolveConfig: (c: ProviderContext) => { baseUrl: string };
    getAccessToken: (c: ProviderContext) => Promise<string>;
  };
  const { baseUrl } = access.resolveConfig(ctx);
  const token = await access.getAccessToken(ctx);
  console.log("\n== ACBr baseUrl ==", baseUrl);

  const cnpj = empresa.cnpj.replace(/\D/g, "");

  // 1. Estado da empresa no ACBr
  const empRes = await fetch(`${baseUrl}/empresas/${cnpj}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  console.log("\n== GET /empresas/{cnpj} ==", empRes.status);
  const empBody = await empRes.text();
  try {
    const parsed = JSON.parse(empBody);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(empBody.slice(0, 2000));
  }

  // 2. Logotipo da empresa (se a API expor)
  const logoRes = await fetch(`${baseUrl}/empresas/${cnpj}/logotipo`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "image/*,application/json" }
  });
  console.log("\n== GET /empresas/{cnpj}/logotipo ==", logoRes.status, logoRes.headers.get("content-type"));
  if (!logoRes.ok) {
    console.log(await logoRes.text().then((t) => t.slice(0, 800)));
  } else {
    const buf = Buffer.from(await logoRes.arrayBuffer());
    console.log(`Bytes recebidos: ${buf.length}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
