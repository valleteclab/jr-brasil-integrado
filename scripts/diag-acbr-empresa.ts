import { prisma } from "../src/lib/db/prisma";
import { AcbrFiscalProvider } from "../src/domains/fiscal/providers/acbr-provider";
import { getFiscalRuntimeConfig } from "../src/domains/fiscal/application/fiscal-config-use-cases";
import type { ProviderContext } from "../src/domains/fiscal/providers/types";

/**
 * Diagnóstico: consulta o cadastro da empresa na ACBr e mostra se a logo está lá.
 */
async function main() {
  const empresa = await prisma.empresa.findFirst({
    select: { id: true, tenantId: true, razaoSocial: true, cnpj: true }
  });
  if (!empresa) throw new Error("Sem empresa cadastrada.");

  const localConfig = await prisma.configuracaoFiscal.findFirst({
    where: { empresaId: empresa.id },
    select: { provedor: true, ambiente: true, logotipoInfo: true, certificadoInfo: true }
  });

  console.log("== Empresa ==");
  console.log({ id: empresa.id, razao: empresa.razaoSocial, cnpj: empresa.cnpj });
  console.log("== Config local ==");
  console.log(localConfig);

  const runtime = await getFiscalRuntimeConfig({ tenantId: empresa.tenantId, empresaId: empresa.id });

  const ctx: ProviderContext = {
    ambiente: runtime.ambiente,
    provedor: runtime.provider,
    baseUrl: runtime.baseUrl,
    token: runtime.token,
    cscId: runtime.cscId,
    cscToken: runtime.cscToken
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

  // Última NF-e autorizada: baixa o PDF e checa se tem imagem embutida.
  const ultima = await prisma.notaFiscal.findFirst({
    where: { empresaId: empresa.id, modelo: "NFE", status: "AUTORIZADA", providerRef: { not: null } },
    orderBy: { criadoEm: "desc" },
    select: { id: true, numero: true, providerRef: true, modelo: true, criadoEm: true }
  });
  console.log("\n== Última NF-e autorizada ==", ultima);
  if (ultima?.providerRef) {
    const pdfRes = await fetch(`${baseUrl}/nfe/${ultima.providerRef}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" }
    });
    console.log(`PDF status: ${pdfRes.status}`);
    if (pdfRes.ok) {
      const pdf = Buffer.from(await pdfRes.arrayBuffer());
      console.log(`PDF bytes: ${pdf.length}`);
      // Procura marcadores de imagem dentro do PDF.
      const pdfStr = pdf.toString("latin1");
      const imgCount = (pdfStr.match(/\/Subtype\s*\/Image/g) ?? []).length;
      const dctCount = (pdfStr.match(/\/DCTDecode/g) ?? []).length;
      const flateCount = (pdfStr.match(/\/FlateDecode/g) ?? []).length;
      console.log(`Imagens (/Subtype /Image): ${imgCount}`);
      console.log(`Streams JPEG (/DCTDecode): ${dctCount}`);
      console.log(`Streams FlateDecode: ${flateCount}`);
      // Salva pro user inspecionar.
      const fs = await import("node:fs");
      fs.writeFileSync("/tmp/nfe-ultima.pdf", pdf);
      console.log("PDF salvo em /tmp/nfe-ultima.pdf");
    }
  }

  // Lista de endpoints/configs alternativos pra ver se existe DANFE config explícito.
  console.log("\n== GET /empresas (lista, primeiras) ==");
  const list = await fetch(`${baseUrl}/empresas?$top=2`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  console.log(`status ${list.status}, body:`);
  console.log((await list.text()).slice(0, 1500));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
