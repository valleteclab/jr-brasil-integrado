/**
 * Harness ISSnet-DF (NFS-e padrão nacional de Brasília) — monta o DPS com o MESMO
 * buildDpsXml+signDps do provider NACIONAL (SEFIN), embrulha em GerarNfseEnvio e
 * POSTa via SOAP no webservice do ISSnet (HOM). Valida envelope+schema+assinatura.
 *
 * Uso: PFX_PATH=cert.pfx PFX_PASS=senha npx tsx scripts/issnet-df-emit-test.ts
 * O DF exige leiaute nacional: DPS v1.00 (sem IBS/CBS) é aceito até a NT exigir 1.01.
 */
import { readFileSync } from "node:fs";
import https from "node:https";
import { buildDpsXml, signDps, pfxToPem } from "@/domains/fiscal/providers/nacional-provider";
import type { EmitInput, ProviderContext } from "@/domains/fiscal/providers/types";
import type { NormalizedFiscalDocument } from "@/domains/fiscal/types";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Defina ${name}`);
  return v;
}

const NS = "http://www.sped.fazenda.gov.br/nfse";
const HOM_HOST = "nfse.issnetonline.com.br";
const HOM_PATH = "/wsnfsenacional/homologacao/nfse.asmx";

const document = {
  modelo: "NFSE",
  finalidade: "NORMAL",
  naturezaOperacao: "Prestacao de servico",
  ambiente: "HOMOLOGACAO",
  provedor: "NACIONAL",
  serie: "900",
  destinatario: {
    nome: "TOMADOR DE TESTE LTDA",
    documento: "11444777000161",
    inscricaoEstadual: null,
    email: null,
    uf: "DF",
    endereco: null
  },
  formaPagamento: null,
  condicaoPagamento: null,
  informacoesComplementares: "Teste integracao ISSnet-DF (padrao nacional).",
  valorFrete: 0, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
  itens: [
    {
      produtoId: null, codigo: "SERV", descricao: "Servico de teste integracao ISSnet DF",
      ncm: null, cest: null, cfop: null, unidade: "UN", quantidade: 1,
      valorUnitario: 10, valorTotal: 10, desconto: 0, origem: null, regraTributariaId: null,
      servico: true, itemListaServico: "010101", codigoNbs: null,
      cClassTribServico: null, aliquotaIssInformada: null, baseIssInformada: null
    }
  ],
  retencoes: null,
  taxationType: null,
  obra: null,
  substituicao: null
} as unknown as NormalizedFiscalDocument;

const input = {
  document,
  emitter: {
    razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA",
    cnpj: process.env.EMIT_CNPJ || "15130181000148",
    inscricaoEstadual: null,
    inscricaoMunicipal: process.env.EMIT_IM || "987654",
    uf: "DF",
    codigoMunicipioIbge: process.env.COD_MUN || "5300108",
    regime: process.env.REGIME || "LUCRO_PRESUMIDO"
  },
  numero: Number(process.env.NUM || 1),
  totals: { valorServicos: 10, valorIss: 0 } as never,
  total: 10,
  integrationId: "issnet-df-test",
  computed: []
} as unknown as EmitInput;

const ctx = {
  ambiente: "HOMOLOGACAO",
  provedor: "NACIONAL",
  baseUrl: null, token: null, cscId: null, cscToken: null,
  certificado: { pfx: readFileSync(req("PFX_PATH")), senha: req("PFX_PASS") }
} as unknown as ProviderContext;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function soapCall(operacao: string, cabec: string, dados: string, pfx: Buffer, senha: string): Promise<{ status: number; corpo: string }> {
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${operacao} xmlns="${NS}">` +
    `<nfseCabecMsg>${esc(cabec)}</nfseCabecMsg>` +
    `<nfseDadosMsg>${esc(dados)}</nfseDadosMsg>` +
    `</${operacao}></soap:Body></soap:Envelope>`;
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        host: HOM_HOST, path: HOM_PATH, method: "POST",
        pfx, passphrase: senha, rejectUnauthorized: false, timeout: 60000,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `${NS}/${operacao}`,
          "User-Agent": "Mozilla/5.0",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: d }));
      }
    );
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
    r.write(body);
    r.end();
  });
}

async function main() {
  const { xml, id } = buildDpsXml(input, ctx);
  const { privateKeyPem, certPem } = pfxToPem(ctx.certificado!.pfx, ctx.certificado!.senha);
  const assinado = signDps(xml, privateKeyPem, certPem);
  console.log("DPS id:", id, "| bytes:", assinado.length);

  const corpoDps = assinado.replace(/^<\?xml[^>]*\?>/, "");
  const PROLOG = `<?xml version="1.0" encoding="utf-8"?>`;
  const combos: Array<[string, string, string]> = [
    ["prolog+ns-1.00", `${PROLOG}<cabecalho versao="1.00" xmlns="${NS}"><versaoDados>1.00</versaoDados></cabecalho>`, `${PROLOG}<GerarNfseEnvio xmlns="${NS}">${corpoDps}</GerarNfseEnvio>`],
    ["sem-ns-1.00", `<cabecalho versao="1.00"><versaoDados>1.00</versaoDados></cabecalho>`, `<GerarNfseEnvio xmlns="${NS}">${corpoDps}</GerarNfseEnvio>`],
    ["prolog-sem-ns", `${PROLOG}<cabecalho versao="1.00"><versaoDados>1.00</versaoDados></cabecalho>`, `${PROLOG}<GerarNfseEnvio xmlns="${NS}">${corpoDps}</GerarNfseEnvio>`],
    ["ns-1.01", `<cabecalho versao="1.01" xmlns="${NS}"><versaoDados>1.01</versaoDados></cabecalho>`, `<GerarNfseEnvio xmlns="${NS}">${corpoDps}</GerarNfseEnvio>`]
  ];
  for (const [nome, cabec, dados] of combos) {
    const r = await soapCall("GerarNfse", cabec, dados, ctx.certificado!.pfx, ctx.certificado!.senha);
    const plain = r.corpo.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const cods = [...new Set([...plain.matchAll(/<Codigo>([^<]+)<\/Codigo>/g)].map((m) => m[1]))];
    console.log(`[${nome}] status ${r.status} | ${cods.join(",") || plain.slice(0, 200)}`);
    if (!cods.includes("E183") && !cods.includes("E160")) {
      console.log(plain.slice(0, 1200));
      break;
    }
  }
}

main().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });
