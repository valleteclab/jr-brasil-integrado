/**
 * Consulta de parâmetros municipais na NFS-e Nacional (mTLS com A1) — diagnóstico do E0116.
 *   - /parametros_municipais/{cMun}/{CNPJ}  → o contribuinte está no CNC do ambiente? qual IM?
 *   - /parametros_municipais/{cMun}/{cServ}  → alíquotas/regimes do serviço no município.
 * Uso: PFX_PATH=... PFX_PASS=... COD_MUN=2919553 EMIT_CNPJ=15130181000148 tsx scripts/nfse-nacional-consulta.ts
 */
import { readFileSync } from "node:fs";
import https from "node:https";

const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };
const cMun = process.env.COD_MUN || "2919553";
const cnpj = process.env.EMIT_CNPJ || "15130181000148";
const cServ = process.env.CTRIB_NAC || "010101";
const pfx = readFileSync(req("PFX_PATH"));
const senha = req("PFX_PASS");

// Bases candidatas (produção restrita). Tentamos várias até achar a que responde.
const BASES = [
  "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
  "https://adn.producaorestrita.nfse.gov.br",
  "https://www.producaorestrita.nfse.gov.br/contribuinteisqn",
  "https://www.producaorestrita.nfse.gov.br"
];

function get(url: string): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const r = https.request(
      { method: "GET", hostname: u.hostname, path: u.pathname + u.search, pfx, passphrase: senha },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode ?? 0, body: d })); }
    );
    r.on("error", reject); r.end();
  });
}

async function main() {
  const paths = [
    `/parametros_municipais/${cMun}/${cnpj}`,
    `/parametros_municipais/${cMun}/${cServ}`
  ];
  for (const base of BASES) {
    for (const p of paths) {
      try {
        const { status, body } = await get(base + p);
        console.log(`\n[${status}] ${base}${p}`);
        if (status !== 404) console.log(body.slice(0, 1500));
      } catch (e) {
        console.log(`\n[ERR] ${base}${p} → ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
main().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });
