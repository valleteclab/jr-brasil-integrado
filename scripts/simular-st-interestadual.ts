/**
 * CLI da SIMULAÇÃO de ST INTERESTADUAL (motor compartilhado em src/domains/fiscal/st-simulacao.ts;
 * a rota administrativa /api/admin/simular-st usa o MESMO motor — protegida por CRON_SECRET).
 *
 * Uso:
 *   npx tsx scripts/simular-st-interestadual.ts --empresa=<id|cnpj|nome> \
 *     --cliente-cnpj=<CNPJ real> --cliente-ie=<IE vinculada> --cliente-uf=<UF> \
 *     [--cliente-nome="..."] [--cidade="..."] [--ibge=...] [--cep=...] \
 *     [--mva=71.78] [--aliq-st=18] [--valor=100] [--provedores=SEFAZ,ACBR] \
 *     [--pfx=<caminho .pfx> --pfx-pass=<senha>]   # injeta o A1 no banco (ambiente de teste)
 *
 * A SEFAZ valida IE×CNPJ mesmo em homologação (cStat 234 se não vinculada) — use um cliente REAL
 * de outra UF. A nota de homologação não tem valor fiscal.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { encryptSecret } from "../src/lib/security/secret-crypto";
import { simularStInterestadual } from "../src/domains/fiscal/st-simulacao";

const arg = (k: string, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};

async function main() {
  // A1 opcional: grava o certificado da empresa no banco (necessário p/ o provedor SEFAZ assinar
  // quando o banco de teste ainda não o tem). Empresa resolvida pelo mesmo critério do motor.
  const pfxPath = arg("pfx");
  if (pfxPath) {
    const senha = arg("pfx-pass") || process.env.PFX_PASS || "";
    if (!senha) throw new Error("Informe --pfx-pass= (ou PFX_PASS) junto com --pfx=.");
    const cnpj = arg("empresa").replace(/\D+/g, "");
    const empresa = await prisma.empresa.findFirst({
      where: cnpj.length === 14 ? { cnpj } : { id: arg("empresa") }
    });
    if (!empresa) throw new Error(`Empresa não encontrada para carregar o A1: ${arg("empresa")}`);
    const pfx = readFileSync(pfxPath);
    await prisma.certificadoDigital.upsert({
      where: { empresaId: empresa.id },
      update: { pfxCriptografado: encryptSecret(pfx.toString("base64")), senhaCriptografada: encryptSecret(senha) },
      create: {
        tenantId: empresa.tenantId, empresaId: empresa.id,
        pfxCriptografado: encryptSecret(pfx.toString("base64")), senhaCriptografada: encryptSecret(senha),
        arquivoNome: pfxPath.split(/[\\/]/).pop() ?? "a1.pfx"
      }
    });
    console.log("Certificado A1 carregado no banco para a empresa (via --pfx).");
  }

  const r = await simularStInterestadual({
    empresa: arg("empresa"),
    clienteCnpj: arg("cliente-cnpj"),
    clienteIe: arg("cliente-ie"),
    clienteUf: arg("cliente-uf"),
    clienteNome: arg("cliente-nome") || undefined,
    cidade: arg("cidade") || undefined,
    ibge: arg("ibge") || undefined,
    cep: arg("cep") || undefined,
    mva: arg("mva") ? Number(arg("mva")) : undefined,
    aliqSt: arg("aliq-st") ? Number(arg("aliq-st")) : undefined,
    valor: arg("valor") ? Number(arg("valor")) : undefined,
    ncm: arg("ncm") || undefined,
    provedores: arg("provedores") ? arg("provedores").split(",").map((p) => p.trim()).filter(Boolean) : undefined
  });

  for (const linha of r.log) console.log(linha);
  console.log(`\n${"═".repeat(60)}\nRESUMO DA SIMULAÇÃO — ${r.empresa} (${r.ambiente})`);
  for (const res of r.resultados) {
    const st = res.status === "AUTORIZADA" ? "✔" : "✖";
    console.log(` ${st} ${res.provedor}: ${res.status}${res.motivo ? ` — ${res.motivo}` : ""}`);
    if (res.csosn) console.log(`   CSOSN/CST ${res.csosn} · CFOP ${res.cfop} · MVA ${res.mva}% · BC-ST ${res.baseSt} · vICMSST ${res.valorSt} · total ${res.totalNota}`);
    if (res.guiaGnre) console.log(`   GUIA GNRE: ${JSON.stringify(res.guiaGnre)}`);
  }
  console.log("\nEsperado: CSOSN 202 (Simples) ou CST 10, CFOP 6403, vICMSST > 0 e guia GNRE PENDENTE p/ a UF destino.");
  console.log("Cadastros de teste mantidos (prefixo TESTE-ST) — remova pelo cadastro quando quiser.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
