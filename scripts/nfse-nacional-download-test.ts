/** Descobre os endpoints de download (DANFSE PDF / XML) da NFS-e nacional via mTLS. */
import { readFileSync } from "node:fs";
import https from "node:https";

const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };
const chave = req("CHAVE");
const pfx = readFileSync(req("PFX_PATH"));
const senha = req("PFX_PASS");

function get(url: string): Promise<{ status: number; ctype: string; head: string; len: number }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const r = https.request({ method: "GET", hostname: u.hostname, path: u.pathname, pfx, passphrase: senha }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode ?? 0, ctype: String(res.headers["content-type"] ?? ""), head: body.subarray(0, 80).toString("latin1").replace(/[\r\n]+/g, " "), len: body.length });
      });
    });
    r.on("error", reject); r.end();
  });
}

const BASES = ["https://sefin.nfse.gov.br/SefinNacional", "https://adn.nfse.gov.br", "https://sefin.nfse.gov.br"];
const PATHS = [`/danfse/${chave}`, `/nfse/${chave}`, `/DFe/${chave}`];

(async () => {
  for (const b of BASES) for (const p of PATHS) {
    try { const r = await get(b + p); console.log(`[${r.status}] ${r.ctype || "?"} len=${r.len} :: ${b}${p}\n     ${r.head}`); }
    catch (e) { console.log(`[ERR] ${b}${p} → ${e instanceof Error ? e.message : e}`); }
  }
})();
