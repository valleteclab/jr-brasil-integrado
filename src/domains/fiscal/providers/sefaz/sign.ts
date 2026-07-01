/**
 * Assinatura XMLDSig da NF-e: enveloped + C14N, com a Reference apontando para o `Id` do elemento
 * assinado. A `<Signature>` fica como irmã desse elemento, logo após ele (`<infNFe>` na NF-e,
 * `<infEvento>` nos eventos, `<infInut>` na inutilização).
 *
 * IMPORTANTE: o leiaute da NF-e (4.00) FIXA os algoritmos da assinatura em **RSA-SHA1 / SHA-1** (o
 * XSD usa valores fixos) — diferente da NFS-e nacional, que usa SHA-256. Usar SHA-256 aqui causa a
 * rejeição cStat 215 "Algorithm attribute does not equal its fixed value".
 */
import { SignedXml } from "xml-crypto";

// pfxToPem é reexportado do util compartilhado (forge + fallback OpenSSL p/ PFX moderno OpenSSL 3).
export { pfxToPem } from "../pfx-utils";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

/**
 * Assina genericamente um XML referenciando o elemento cujo local-name é `refLocalName` (ex.:
 * "infNFe", "infEvento", "infInut"). A `<Signature>` é inserida logo APÓS esse elemento (mesma
 * mecânica de todos os documentos da SEFAZ: enveloped + C14N + RSA-SHA256, Reference por `#Id`).
 * Retorna o XML assinado (sem prólogo — vai dentro do envelope da mensagem).
 */
export function signXml(xml: string, refLocalName: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const ref = `//*[local-name(.)='${refLocalName}']`;
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  sig.addReference({ xpath: ref, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA1 });
  sig.computeSignature(xml, { location: { reference: ref, action: "after" } });
  return sig.getSignedXml();
}

/**
 * Assina a NF-e. `xml` deve conter `<NFe>...<infNFe Id="NFe<chave>">...</infNFe></NFe>`. Retorna o
 * XML com a `<Signature>` inserida após o `infNFe` (sem prólogo — vai dentro do enviNFe).
 */
export function signNfe(xml: string, privateKeyPem: string, certPem: string): string {
  return signXml(xml, "infNFe", privateKeyPem, certPem);
}
