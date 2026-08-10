import { SignedXml } from "xml-crypto";
import type { EmitInput } from "@/domains/fiscal/providers/types";

/**
 * CENTI (municípios de GO — ex.: Posse 5218300): NFS-e no leiaute ABRASF do provedor,
 * transportada por REST JSON (Basic auth com as credenciais do PORTAL municipal do
 * contribuinte + XML assinado com o A1). Docs: nfse.centi.com.br/documentacao-nfs-e.html;
 * XSD: app.centi.com.br/files/nfse.xsd. Assinatura: RSA-SHA1 enveloped no
 * InfDeclaracaoPrestacaoServico (padrão ABRASF clássico, diferente do DPS nacional).
 */

export const CENTI_NS = "http://www.centi.com.br/files/nfse.xsd";

/** Municípios atendidos pelo CENTI que roteamos: IBGE → slug da API ({uf}/{cidade}). */
export const CENTI_MUNICIPIOS: Record<string, { uf: string; cidade: string }> = {
  "5218300": { uf: "go", cidade: "posse" }
};

const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dec = (v: number) => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);
const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

function cpfCnpjXml(documento: string): string {
  const d = onlyDigits(documento);
  return d.length === 11 ? `<CpfCnpj><Cpf>${d}</Cpf></CpfCnpj>` : `<CpfCnpj><Cnpj>${d}</Cnpj></CpfCnpj>`;
}

/** Data/hora local de Brasília no formato ABRASF (sem milissegundos). */
function agoraBrasilia(): string {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sp.getFullYear()}-${p(sp.getMonth() + 1)}-${p(sp.getDate())}T${p(sp.getHours())}:${p(sp.getMinutes())}:${p(sp.getSeconds())}-03:00`;
}

/**
 * Monta o GerarNfseEnvio (RPS ABRASF) a partir do nosso modelo normalizado.
 * Campos opcionais só entram quando temos o dado — o XSD do CENTI é tolerante
 * (minOccurs=0 na maioria), validado localmente pelo script de regressão.
 */
export function buildCentiGerarXml(input: EmitInput): { xml: string; rpsId: string } {
  const doc = input.document;
  const emit = input.emitter;
  const dest = doc.destinatario;
  const item = doc.itens.find((i) => i.servico) ?? doc.itens[0];
  if (!item) throw new Error("NFS-e CENTI: documento sem item de serviço.");

  const numero = String(input.numero);
  const serie = (doc.serie?.trim() || "1").slice(0, 5);
  const valor = Number(doc.itens.filter((i) => i.servico || i === item).reduce((s, i) => s + i.valorTotal, 0)) || item.valorTotal;
  const aliquota = Number(item.aliquotaIssInformada ?? 0);
  const valorIss = aliquota > 0 ? (valor * aliquota) / 100 : 0;
  // CENTI usa o item LC116 no formato "NN.NN" (máx. 5 chars) — convertemos do nosso 6 díg.
  const d6 = onlyDigits(item.itemListaServico).padStart(4, "0");
  const itemLista = `${d6.slice(0, 2)}.${d6.slice(2, 4)}`;
  const simples = emit.regime === "SIMPLES_NACIONAL" || emit.regime === "MEI" ? "1" : "2";
  const dataEmissao = agoraBrasilia();
  const rpsId = `Rps${numero}`;
  const infId = `Inf${numero}`;
  const discriminacao = [item.descricao, doc.informacoesComplementares].filter(Boolean).join(" | ").slice(0, 2000);

  const tomadorEndereco = dest?.endereco
    ? `<Endereco>` +
        `<Endereco>${esc(dest.endereco.logradouro ?? "")}</Endereco>` +
        `<Numero>${esc(dest.endereco.numero ?? "S/N")}</Numero>` +
        (dest.endereco.bairro ? `<Bairro>${esc(dest.endereco.bairro)}</Bairro>` : "") +
        (dest.endereco.codigoMunicipioIbge ? `<CodigoMunicipio>${onlyDigits(dest.endereco.codigoMunicipioIbge)}</CodigoMunicipio>` : "") +
        (dest.endereco.uf ? `<Uf>${esc(dest.endereco.uf)}</Uf>` : "") +
        (dest.endereco.cep ? `<Cep>${onlyDigits(dest.endereco.cep)}</Cep>` : "") +
      `</Endereco>`
    : "";

  const inf =
    `<InfDeclaracaoPrestacaoServico Id="${infId}">` +
      `<Rps Id="${rpsId}">` +
        `<IdentificacaoRps>` +
          `<Numero>${numero}</Numero>` +
          `<Serie>${esc(serie)}</Serie>` +
          `<Tipo>1</Tipo>` +
        `</IdentificacaoRps>` +
        `<DataEmissao>${dataEmissao}</DataEmissao>` +
        `<Status>1</Status>` +
      `</Rps>` +
      `<Competencia>${dataEmissao}</Competencia>` +
      `<Servico>` +
        `<Valores>` +
          `<ValorServicos>${dec(valor)}</ValorServicos>` +
          `<ValorIss>${dec(valorIss)}</ValorIss>` +
          `<Aliquota>${dec(aliquota)}</Aliquota>` +
        `</Valores>` +
        `<IssRetido>2</IssRetido>` +
        `<ItemListaServico>${itemLista}</ItemListaServico>` +
        `<Discriminacao>${esc(discriminacao)}</Discriminacao>` +
        `<CodigoMunicipio>${onlyDigits(emit.codigoMunicipioIbge)}</CodigoMunicipio>` +
        `<ExigibilidadeISS>1</ExigibilidadeISS>` +
        `<MunicipioIncidencia>${onlyDigits(emit.codigoMunicipioIbge)}</MunicipioIncidencia>` +
      `</Servico>` +
      `<Prestador>` +
        cpfCnpjXml(emit.cnpj) +
        (emit.inscricaoMunicipal ? `<InscricaoMunicipal>${esc(emit.inscricaoMunicipal)}</InscricaoMunicipal>` : "") +
      `</Prestador>` +
      (dest
        ? `<Tomador>` +
            `<IdentificacaoTomador>${cpfCnpjXml(dest.documento ?? "")}</IdentificacaoTomador>` +
            `<RazaoSocial>${esc(dest.nome ?? "Consumidor")}</RazaoSocial>` +
            tomadorEndereco +
            (dest.email ? `<Contato><Email>${esc(dest.email)}</Email></Contato>` : "") +
          `</Tomador>`
        : "") +
      `<OptanteSimplesNacional>${simples}</OptanteSimplesNacional>` +
      `<IncentivoFiscal>2</IncentivoFiscal>` +
    `</InfDeclaracaoPrestacaoServico>`;

  const xml = `<GerarNfseEnvio xmlns="${CENTI_NS}"><Rps>${inf}</Rps></GerarNfseEnvio>`;
  return { xml, rpsId: infId };
}

/** Assina o InfDeclaracaoPrestacaoServico (RSA-SHA1 enveloped — padrão ABRASF/CENTI). */
export function signCentiXml(xml: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  const xpath = `//*[local-name(.)='InfDeclaracaoPrestacaoServico']`;
  sig.addReference({ xpath, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA1 });
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return `<?xml version="1.0" encoding="utf-8"?>${sig.getSignedXml()}`;
}

/** XML de cancelamento (Pedido ABRASF) — assinado no InfPedidoCancelamento. */
export function buildCentiCancelarXml(params: {
  chaveOuNumeroNfse: string;
  cnpjPrestador: string;
  inscricaoMunicipal: string | null;
  codigoMunicipioIbge: string;
  codigoCancelamento?: string;
}): { xml: string } {
  const id = `Canc${onlyDigits(params.chaveOuNumeroNfse).slice(-12) || "1"}`;
  const xml =
    `<CancelarNfseEnvio xmlns="${CENTI_NS}">` +
      `<Pedido>` +
        `<InfPedidoCancelamento Id="${id}">` +
          `<IdentificacaoNfse>` +
            `<Numero>${onlyDigits(params.chaveOuNumeroNfse)}</Numero>` +
            cpfCnpjXml(params.cnpjPrestador) +
            (params.inscricaoMunicipal ? `<InscricaoMunicipal>${esc(params.inscricaoMunicipal)}</InscricaoMunicipal>` : "") +
            `<CodigoMunicipio>${onlyDigits(params.codigoMunicipioIbge)}</CodigoMunicipio>` +
          `</IdentificacaoNfse>` +
          `<CodigoCancelamento>${params.codigoCancelamento ?? "2"}</CodigoCancelamento>` +
        `</InfPedidoCancelamento>` +
      `</Pedido>` +
    `</CancelarNfseEnvio>`;
  return { xml };
}

/** Assina o InfPedidoCancelamento do cancelamento CENTI. */
export function signCentiCancelamento(xml: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  const xpath = `//*[local-name(.)='InfPedidoCancelamento']`;
  sig.addReference({ xpath, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA1 });
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return `<?xml version="1.0" encoding="utf-8"?>${sig.getSignedXml()}`;
}

/** Chamada REST do CENTI: Basic auth + JSON {usuario, senha, xml}. */
export async function centiApiCall(params: {
  operacao: "gerar" | "cancelar";
  municipio: { uf: string; cidade: string };
  usuario: string;
  senha: string;
  xmlAssinado: string;
}): Promise<{ status: number; body: string }> {
  const url = `https://api.centi.com.br/nfe/${params.operacao}/${params.municipio.uf}/${params.municipio.cidade}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${params.usuario}:${params.senha}`).toString("base64")}`
    },
    body: JSON.stringify({ usuario: params.usuario, senha: params.senha, xml: params.xmlAssinado }),
    signal: AbortSignal.timeout(60000)
  });
  return { status: res.status, body: await res.text() };
}

/** Extrai erros (ListaMensagemRetorno) e dados da NFS-e do retorno CENTI. */
export function parseCentiRetorno(body: string): {
  erros: Array<{ codigo: string; mensagem: string }>;
  numeroNfse?: string;
  codigoVerificacao?: string;
  chaveNacional?: string;
  xmlNota?: string;
} {
  const plain = body.replace(/\\"/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const erros = [...plain.matchAll(/<Codigo>([^<]+)<\/Codigo>\s*<Mensagem>([^<]+)<\/Mensagem>/g)]
    .map((m) => ({ codigo: m[1], mensagem: m[2] }));
  const numeroNfse = /<InfNfse[^>]*>[\s\S]*?<Numero>(\d+)<\/Numero>/.exec(plain)?.[1];
  const codigoVerificacao = /<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/.exec(plain)?.[1];
  const chaveNacional = /<ChaveAcessoNacional>([A-Za-z0-9]{40,50})<\/ChaveAcessoNacional>/.exec(plain)?.[1];
  const xmlNota = /<CompNfse[\s\S]*?<\/CompNfse>/.exec(plain)?.[0];
  return { erros, numeroNfse, codigoVerificacao, chaveNacional, xmlNota };
}
