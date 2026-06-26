/**
 * F-Dist — exercita a Distribuição de DF-e (NFeDistribuicaoDFe) DIRETO no Ambiente Nacional (AN),
 * SEM montar nota: baixa o lote de documentos de interesse do CNPJ a partir de um NSU.
 *
 * Valida todo o caminho: envelope SOAP específico (nfeDistDFeInteresse), TLS-mútuo com A1,
 * descompactação gzip dos docZip e a classificação dos documentos (resumo NF-e, NF-e completa,
 * eventos). Espelha o scripts/sefaz-status-test.ts.
 *
 * Uso:
 *   PFX_PATH=cert.pfx PFX_PASS=senha UF=BA AMBIENTE=HOMOLOGACAO ULTNSU=0 tsx scripts/sefaz-distribuicao-test.ts
 *
 * Variáveis: PFX_PATH, PFX_PASS (obrigatórias); UF (sigla do interessado, padrão BA);
 *            AMBIENTE (HOMOLOGACAO padrão | PRODUCAO); ULTNSU (último NSU baixado, padrão "0").
 *
 * Obs.: o CNPJ é lido do próprio certificado A1 (campo CN do titular). Se não for possível extrair,
 *       informe via CNPJ=...
 */
import { readFileSync } from "node:fs";
import forge from "node-forge";
import type { AmbienteFiscal } from "@prisma/client";
import { consultarDistribuicaoDFe } from "../src/domains/fiscal/providers/sefaz/distribuicao";
import { AN_DISTRIBUICAO, cUFFromUF } from "../src/domains/fiscal/providers/sefaz/endpoints";

const onlyDigits = (s: string | undefined) => String(s ?? "").replace(/\D/g, "");

/** Extrai o CNPJ (14 dígitos) do CN do titular do A1, quando possível. */
function cnpjDoCertificado(pfx: Buffer, senha: string): string | undefined {
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))),
      senha
    );
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    const subject = certBag?.cert?.subject;
    const cn = subject?.getField("CN")?.value as string | undefined;
    const m = cn ? /(\d{14})/.exec(cn.replace(/\D/g, "")) : null;
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function main() {
  const pfxPath = process.env.PFX_PATH;
  const pfxPass = process.env.PFX_PASS;
  const uf = (process.env.UF ?? "BA").trim().toUpperCase();
  const ambiente = (process.env.AMBIENTE ?? "HOMOLOGACAO").trim().toUpperCase() as AmbienteFiscal;
  const ultNSU = (process.env.ULTNSU ?? "0").trim();

  if (!pfxPath || !pfxPass) {
    console.error(
      "Defina PFX_PATH e PFX_PASS (A1 .pfx ICP-Brasil). Ex.: PFX_PATH=cert.pfx PFX_PASS=senha UF=BA ULTNSU=0 tsx scripts/sefaz-distribuicao-test.ts"
    );
    process.exit(1);
  }

  const pfx = readFileSync(pfxPath);
  const cert = { pfx, senha: pfxPass };
  const cnpj = onlyDigits(process.env.CNPJ) || cnpjDoCertificado(pfx, pfxPass) || "";
  const cUFAutor = cUFFromUF(uf);

  if (!cnpj) {
    console.error("Não foi possível obter o CNPJ do certificado. Informe via CNPJ=00000000000000.");
    process.exit(1);
  }

  console.log(`→ ${ambiente} | UF ${uf} (cUF ${cUFAutor}) | CNPJ ${cnpj} | ultNSU ${ultNSU}`);
  console.log(`  endpoint: ${AN_DISTRIBUICAO[ambiente]}`);

  const r = await consultarDistribuicaoDFe({ cnpj, cUFAutor, ambiente, ultNSU, cert });

  console.log(
    `HTTP ${r.statusCode} | cStat ${r.cStat || "?"} | ${r.xMotivo || "(sem xMotivo)"} | ultNSU ${r.ultNSU || "?"} | maxNSU ${r.maxNSU || "?"}`
  );

  if (r.cStat === "138") {
    console.log(`✅ ${r.docs.length} documento(s) no lote:`);
  } else if (r.cStat === "137") {
    console.log("ℹ️  Nenhum documento novo (ultNSU já está no maxNSU).");
  } else if (r.cStat === "656") {
    console.log("⏳ Consumo indevido (656): aguarde ~1h antes de consultar novamente.");
    process.exitCode = 2;
  } else {
    console.log("⚠️  Resposta inesperada — corpo abaixo:");
    console.log(r.raw.slice(0, 2000));
    process.exitCode = 2;
  }

  for (const d of r.docs) {
    const partes = [
      `NSU ${d.nsu}`,
      d.tipo,
      d.chaveAcesso ? `chave ${d.chaveAcesso}` : undefined,
      d.emitenteNome ? `emit ${d.emitenteNome}` : undefined,
      d.emitenteDocumento ? `(${d.emitenteDocumento})` : undefined,
      d.valorNfe !== undefined ? `vNF ${d.valorNfe}` : undefined,
      d.tipoEvento ? `tpEvento ${d.tipoEvento}` : undefined,
      d.numeroProtocolo ? `nProt ${d.numeroProtocolo}` : undefined
    ].filter(Boolean);
    console.log(`  - ${partes.join(" | ")}`);
  }
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
