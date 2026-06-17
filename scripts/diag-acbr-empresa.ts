import { prisma } from "../src/lib/db/prisma";
import { AcbrFiscalProvider } from "../src/domains/fiscal/providers/acbr-provider";
import { getFiscalRuntimeConfig } from "../src/domains/fiscal/application/fiscal-config-use-cases";
import type { ProviderContext } from "../src/domains/fiscal/providers/types";

async function diagEmpresa(emp: { id: string; tenantId: string; razaoSocial: string; cnpj: string }) {
  console.log("\n\n========================================");
  console.log(`EMPRESA: ${emp.razaoSocial} (CNPJ ${emp.cnpj})`);
  console.log("========================================");

  const localConfig = await prisma.configuracaoFiscal.findFirst({
    where: { empresaId: emp.id },
    select: { provedor: true, ambiente: true, logotipoInfo: true, certificadoInfo: true }
  });
  console.log("Config local:", localConfig);

  const runtime = await getFiscalRuntimeConfig({ tenantId: emp.tenantId, empresaId: emp.id });
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
  const cnpj = emp.cnpj.replace(/\D/g, "");
  const auth = { Authorization: `Bearer ${token}` };

  const empRes = await fetch(`${baseUrl}/empresas/${cnpj}`, { headers: { ...auth, Accept: "application/json" } });
  console.log(`\nGET /empresas/${cnpj} → ${empRes.status}`);
  if (empRes.ok) {
    const j = JSON.parse(await empRes.text());
    console.log("Campos config*:", Object.keys(j).filter((k) => k.startsWith("config_")));
  }

  const logoRes = await fetch(`${baseUrl}/empresas/${cnpj}/logotipo`, { headers: { ...auth, Accept: "image/*" } });
  console.log(`GET /empresas/${cnpj}/logotipo → ${logoRes.status} ${logoRes.headers.get("content-type") ?? ""}`);
  if (logoRes.ok) {
    const buf = Buffer.from(await logoRes.arrayBuffer());
    console.log(`  Logo bytes: ${buf.length}`);
  } else {
    console.log("  Logo body:", (await logoRes.text()).slice(0, 200));
  }

  // Últimas 5 notas (qualquer modelo/status) pra ver o que está sendo emitido
  const ultimas = await prisma.notaFiscal.findMany({
    where: { empresaId: emp.id },
    orderBy: { criadoEm: "desc" },
    take: 5,
    select: { id: true, numero: true, modelo: true, status: true, providerRef: true, criadoEm: true, motivo: true }
  });
  console.log("\nÚltimas 5 notas:", ultimas);
  const ultima = ultimas.find((n) => n.modelo === "NFE" && n.status === "AUTORIZADA" && n.providerRef);
  if (ultima?.providerRef) {
    const pdfRes = await fetch(`${baseUrl}/nfe/${ultima.providerRef}/pdf`, { headers: { ...auth, Accept: "application/pdf" } });
    console.log(`PDF status: ${pdfRes.status}`);
    if (pdfRes.ok) {
      const pdf = Buffer.from(await pdfRes.arrayBuffer());
      const pdfStr = pdf.toString("latin1");
      const imgCount = (pdfStr.match(/\/Subtype\s*\/Image/g) ?? []).length;
      const dctCount = (pdfStr.match(/\/DCTDecode/g) ?? []).length;
      console.log(`  PDF bytes: ${pdf.length}, imagens embutidas: ${imgCount}, JPEG (DCT): ${dctCount}`);
      const fs = await import("node:fs");
      fs.writeFileSync(`/tmp/nfe-${cnpj}.pdf`, pdf);
      console.log(`  PDF salvo em /tmp/nfe-${cnpj}.pdf`);
    } else {
      console.log("  PDF body:", (await pdfRes.text()).slice(0, 300));
    }
  }
}

async function main() {
  const empresas = await prisma.empresa.findMany({
    select: { id: true, tenantId: true, razaoSocial: true, cnpj: true }
  });
  console.log(`Empresas locais: ${empresas.length}`);
  for (const e of empresas) await diagEmpresa(e);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
