/**
 * F0 — valida o transporte SOAP + TLS-mútuo da NF-e (modelo 55) contra a SEFAZ, SEM montar nota.
 *
 * Chama o NFeStatusServico4 (consStatServ → cStat 107 = serviço em operação). É a chamada mais
 * leve da SEFAZ e exercita todo o caminho de rede que a emissão vai usar: envelope SOAP 1.2,
 * Content-Type application/soap+xml e o certificado A1 da empresa como certificado de cliente.
 *
 * Uso:
 *   PFX_PATH=cert.pfx PFX_PASS=senha UF=RS tsx scripts/sefaz-status-test.ts
 *
 * Variáveis: PFX_PATH, PFX_PASS (obrigatórias); UF (sigla do emitente, padrão RS);
 *            AMBIENTE (HOMOLOGACAO padrão | PRODUCAO).
 */
import { readFileSync } from "node:fs";
import type { AmbienteFiscal } from "@prisma/client";
import { cUFFromUF, resolveSefazEndpoints } from "../src/domains/fiscal/providers/sefaz/endpoints";
import { NFE_NS, WSDL_NS, pickTag, postSoap, soapEnvelope } from "../src/domains/fiscal/providers/sefaz/soap";

async function main() {
  const pfxPath = process.env.PFX_PATH;
  const pfxPass = process.env.PFX_PASS;
  const uf = (process.env.UF ?? "RS").trim().toUpperCase();
  const ambiente = (process.env.AMBIENTE ?? "HOMOLOGACAO").trim().toUpperCase() as AmbienteFiscal;

  if (!pfxPath || !pfxPass) {
    console.error("Defina PFX_PATH e PFX_PASS (A1 .pfx ICP-Brasil). Ex.: PFX_PATH=cert.pfx PFX_PASS=senha UF=RS tsx scripts/sefaz-status-test.ts");
    process.exit(1);
  }

  const cert = { pfx: readFileSync(pfxPath), senha: pfxPass };
  const endpoints = resolveSefazEndpoints(uf, ambiente);
  const cUF = cUFFromUF(uf);
  const tpAmb = ambiente === "PRODUCAO" ? "1" : "2";

  const consStatServ =
    `<consStatServ versao="4.00" xmlns="${NFE_NS}">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ>` +
    `</consStatServ>`;
  const envelope = soapEnvelope(WSDL_NS.status, consStatServ);

  console.log(`→ ${ambiente} | UF ${uf} (cUF ${cUF}) | ${endpoints.statusServico}`);
  const res = await postSoap(endpoints.statusServico, envelope, cert);
  const cStat = pickTag(res.body, "cStat");
  const xMotivo = pickTag(res.body, "xMotivo");
  const tMed = pickTag(res.body, "tMed");

  console.log(`HTTP ${res.statusCode} | cStat ${cStat ?? "?"} | ${xMotivo ?? "(sem xMotivo)"}${tMed ? ` | tMed ${tMed}s` : ""}`);
  if (cStat === "107") {
    console.log("✅ Transporte SOAP + TLS-mútuo OK — SEFAZ em operação.");
  } else {
    console.log("⚠️  Resposta inesperada — confira o corpo abaixo:");
    console.log(res.body.slice(0, 2000));
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
