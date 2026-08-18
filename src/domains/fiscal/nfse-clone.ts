import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AmbienteFiscal } from "@prisma/client";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { baixarNfseXmlPelaChave } from "@/domains/fiscal/providers/nacional-provider";

/**
 * Motor COMPARTILHADO de clonagem de NFS-e (tela + agente): resgata o XML autorizado
 * (banco → SEFIN pela chave, persistindo) e extrai TODOS os dados fiscais da original —
 * descrição, códigos (LC116/NBS/cClassTrib), natureza do ISS (tribISSQN), valor e
 * retenções (ISS retido + federais). Nasceu da saga da nota 49 da Câmara de LEM
 * (ACBr antiga, sem XML no banco, sem ISS e com retenções federais).
 */

export type RetencoesValores = {
  issRetido: boolean;
  ir: number | null;
  pis: number | null;
  cofins: number | null;
  csll: number | null;
  inss: number | null;
};

export type DadosNfseOriginal = {
  descricao: string | null;
  codigoLc116: string | null;
  codigoNbs: string | null;
  cClassTrib: string | null;
  /** tribISSQN do DPS: 1 tributável · 2 imunidade · 3 exportação · 4 não incidência. */
  tribIssqn: string | null;
  valor: number | null;
  retencoes: RetencoesValores;
};

const dec = (v: string | null | undefined) => (v ? Number(v) : null);

export function extrairDadosNfseXml(xml: string | null): DadosNfseOriginal {
  const vazio: DadosNfseOriginal = {
    descricao: null, codigoLc116: null, codigoNbs: null, cClassTrib: null, tribIssqn: null, valor: null,
    retencoes: { issRetido: false, ir: null, pis: null, cofins: null, csll: null, inss: null }
  };
  if (!xml) return vazio;
  const plain = xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const tag = (t: string) => new RegExp(`<${t}>([\\d.]+)</${t}>`).exec(plain)?.[1] ?? null;
  return {
    descricao: /<xDescServ>([\s\S]*?)<\/xDescServ>/.exec(plain)?.[1]?.trim() ?? null,
    codigoLc116: /<cTribNac>(\d{6})<\/cTribNac>/.exec(plain)?.[1] ?? null,
    codigoNbs: /<cNBS>(\d{9})<\/cNBS>/.exec(plain)?.[1] ?? null,
    cClassTrib: /<cClassTrib>(\w{6,7})<\/cClassTrib>/.exec(plain)?.[1] ?? null,
    tribIssqn: /<tribISSQN>(\d)<\/tribISSQN>/.exec(plain)?.[1] ?? null,
    valor: dec(tag("vServ")) ?? dec(tag("vLiq")),
    retencoes: {
      issRetido: /<tpRetISSQN>2<\/tpRetISSQN>/.test(plain),
      pis: dec(tag("vPis")),
      cofins: dec(tag("vCofins")),
      inss: dec(tag("vRetCP")),
      ir: dec(tag("vRetIRRF")),
      csll: dec(tag("vRetCSLL"))
    }
  };
}

/** Valores retidos → alíquotas sobre a base (replicáveis em qualquer valor de nota). */
export function retencoesValoresParaAliquotas(r: RetencoesValores, base: number) {
  const aliq = (v: number | null) => (v && v > 0 && base > 0 ? Number(((v / base) * 100).toFixed(6)) : null);
  return { issRetido: r.issRetido, ir: aliq(r.ir), pis: aliq(r.pis), cofins: aliq(r.cofins), csll: aliq(r.csll), inss: aliq(r.inss) };
}

/** tribISSQN do DPS → tipoOperacao/taxationType usado no wizard e na emissão avulsa. */
export function tribIssqnParaTaxationType(tribIssqn: string | null): string | null {
  switch (tribIssqn) {
    case "2": return "immune";
    case "3": return "exportation";
    case "4": return "nonIncidence";
    default: return null; // 1/ausente = padrão do wizard (tributável no município)
  }
}

/**
 * Garante o XML autorizado da nota: usa o do banco; ausente (notas antigas do ACBr),
 * baixa da SEFIN pela chave nacional com o A1 da empresa e PERSISTE para as próximas.
 */
export async function resgatarXmlNfse(
  scope: TenantScope,
  nota: { id: string; xml: string | null; chaveAcesso: string | null; providerRef: string | null; ambiente: AmbienteFiscal | null }
): Promise<string | null> {
  if (nota.xml && nota.xml.length >= 100) return nota.xml;
  const chave = (nota.chaveAcesso ?? nota.providerRef ?? "").replace(/\D/g, "");
  if (chave.length !== 50) return null;
  const runtime = await getFiscalRuntimeConfig(scope);
  if (!runtime.certificado?.pfx) return null;
  const xml = await baixarNfseXmlPelaChave(chave, runtime.certificado, nota.ambiente ?? runtime.ambiente);
  if (xml) {
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { xml } });
  }
  return xml;
}
