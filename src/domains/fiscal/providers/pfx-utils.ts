/**
 * Leitura do certificado A1 (.pfx / PKCS#12) → PEM (chave privada + certificado), para ASSINAR
 * documentos fiscais (NF-e/NFC-e via SEFAZ e NFS-e nacional). O mTLS das conexões usa o `pfx`
 * nativo do Node (OpenSSL 3), que já lê qualquer formato; o problema é só a ASSINATURA, que precisa
 * da chave/cert em PEM.
 *
 * O node-forge (JS puro) só lê PKCS#12 no esquema LEGADO (3DES/RC2). Certificados exportados por
 * OpenSSL 3.x / Windows recentes usam PBES2 + AES-256 e fazem o forge lançar "Unsupported PKCS12 PFX
 * data". Por isso, quando o forge falha, caímos para o OpenSSL do sistema (presente na imagem), que
 * lê tanto o formato moderno (nativo) quanto o legado (com -legacy).
 */
import forge from "node-forge";
import { execFileSync } from "node:child_process";

export type PfxPem = { privateKeyPem: string; certPem: string };

/** Caminho rápido: node-forge (cobre PFX no esquema legado). */
function viaForge(pfx: Buffer, senha: string): PfxPem {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), senha);
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error("Certificado A1 sem chave privada ou certificado.");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert)
  };
}

/**
 * Fallback via OpenSSL do sistema, para PFX que o forge não lê (OpenSSL 3: PBES2/AES-256). Lê o PFX
 * do stdin (/dev/stdin) para NÃO gravar o certificado em disco; a senha vai por variável de ambiente
 * (não aparece na linha de comando). Tenta o formato moderno e, se falhar, o legado (-legacy).
 */
function viaOpenssl(pfx: Buffer, senha: string): PfxPem {
  const base = ["pkcs12", "-in", "/dev/stdin", "-nodes", "-clcerts", "-passin", "env:__PFX_PASS"];
  const env = { ...process.env, __PFX_PASS: senha };
  const run = (extra: string[]) =>
    execFileSync("openssl", [...base, ...extra], { input: pfx, env, maxBuffer: 16 * 1024 * 1024 }).toString("utf8");
  let out: string;
  try {
    out = run([]);
  } catch {
    out = run(["-legacy"]);
  }
  const privateKeyPem =
    out.match(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/)?.[0] ?? null;
  const certPem = out.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0] ?? null;
  if (!privateKeyPem || !certPem) throw new Error("OpenSSL não extraiu chave/certificado do PFX.");
  return { privateKeyPem, certPem };
}

/** Lê o A1 .pfx → PEM. Tenta o forge e, se ele falhar (PFX moderno), cai para o OpenSSL do sistema. */
export function pfxToPem(pfx: Buffer, senha: string): PfxPem {
  try {
    return viaForge(pfx, senha);
  } catch (err) {
    try {
      return viaOpenssl(pfx, senha);
    } catch (osslErr) {
      const m1 = err instanceof Error ? err.message : String(err);
      const m2 = osslErr instanceof Error ? osslErr.message : String(osslErr);
      throw new Error(`Não foi possível ler o certificado A1 (.pfx) — verifique o arquivo e a senha. (${m1}${m2 ? `; OpenSSL: ${m2}` : ""})`);
    }
  }
}

/**
 * Opções de TLS-cliente (mTLS) a partir do A1 — em `key`/`cert` PEM, NÃO em `pfx`. O Node/OpenSSL 3
 * NÃO carrega PFX no esquema LEGADO (RC2-40, formato clássico do A1 ICP-Brasil exportado no Windows)
 * pela opção `pfx` (erro "Unsupported PKCS12 PFX data"); já key/cert em PEM ele aceita sem restrição.
 * Por isso convertemos o PFX aqui e passamos key/cert nas requisições https dos provedores diretos.
 */
export function pfxTlsOptions(cert: { pfx: Buffer; senha: string }): { key: string; cert: string } {
  const { privateKeyPem, certPem } = pfxToPem(cert.pfx, cert.senha);
  return { key: privateKeyPem, cert: certPem };
}
