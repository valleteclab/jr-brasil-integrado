/**
 * Assinatura XMLDSig da NF-e (mesma mecânica ICP-Brasil do provedor NACIONAL): enveloped + C14N +
 * RSA-SHA256, com a Reference apontando para o `Id` do elemento assinado. A `<Signature>` fica como
 * irmã desse elemento, logo após ele (`<infNFe>` na NF-e, `<infEvento>` nos eventos, `<infInut>` na
 * inutilização).
 */
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

/** Lê o A1 .pfx → PEM (chave privada + certificado). */
export function pfxToPem(pfx: Buffer, senha: string): { privateKeyPem: string; certPem: string } {
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
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  sig.addReference({ xpath: ref, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256 });
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
