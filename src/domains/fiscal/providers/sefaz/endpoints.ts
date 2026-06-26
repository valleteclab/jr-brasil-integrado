/**
 * Tabela de autorizadoras da NF-e (modelo 55) por UF + endpoints dos web services 4.00.
 *
 * Diferente da NFS-e nacional (URL única na SEFIN), a NF-e é autorizada por UF: cada estado tem
 * sua SEFAZ ou delega para uma SEFAZ Virtual (SVRS/SVAN). Começamos pela SVRS, que cobre 16 UFs.
 * URLs verificadas no portal SVRS em jun/2026 (https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos).
 * Demais autorizadoras (SP, MG, PR, RS, BA, GO, MT, MS, PE, AM) e contingência (SVC) entram depois.
 */
import type { AmbienteFiscal } from "@prisma/client";

export type SefazEndpoints = {
  autorizacao: string;
  retAutorizacao: string;
  consultaProtocolo: string;
  statusServico: string;
  inutilizacao: string;
  recepcaoEvento: string;
  consultaCadastro?: string;
};

/** Código IBGE da UF (cUF) — usado na chave de acesso e nas consultas. */
export const CODIGO_UF: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53"
};

const SVRS_PROD: SefazEndpoints = {
  autorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  statusServico: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  inutilizacao: "https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  recepcaoEvento: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
  consultaCadastro: "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx"
};

const SVRS_HOM: SefazEndpoints = {
  autorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  statusServico: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  inutilizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
  recepcaoEvento: "https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx"
  // consultaCadastro não publicado para homologação no portal SVRS.
};

// BA (Bahia) — autorizadora PRÓPRIA (não usa SVRS/SVAN). Produção em nfe.sefaz.ba.gov.br,
// homologação em hnfe.sefaz.ba.gov.br. URLs verificadas no wsnfe_4.00_mod55 (referência sped-nfe).
const BA_PROD: SefazEndpoints = {
  autorizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
  retAutorizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  statusServico: "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
  inutilizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx",
  recepcaoEvento: "https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  consultaCadastro: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx"
};

const BA_HOM: SefazEndpoints = {
  autorizacao: "https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
  retAutorizacao: "https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  consultaProtocolo: "https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  statusServico: "https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
  inutilizacao: "https://hnfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx",
  recepcaoEvento: "https://hnfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  consultaCadastro: "https://hnfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx"
};

/** UFs cuja NF-e é autorizada pela SVRS. */
const UF_SVRS = new Set([
  "AC", "AL", "AP", "CE", "DF", "ES", "PA", "PB", "PI", "RJ", "RN", "RO", "RR", "SC", "SE", "TO"
]);

/** UFs com autorizadora PRÓPRIA já suportada (cada uma com seu conjunto de endpoints). */
const UF_PROPRIA: Record<string, { PRODUCAO: SefazEndpoints; HOMOLOGACAO: SefazEndpoints }> = {
  BA: { PRODUCAO: BA_PROD, HOMOLOGACAO: BA_HOM }
};

/** Autorizadora (conjunto de endpoints) para a UF + ambiente. Lança se a UF ainda não é suportada. */
export function resolveSefazEndpoints(uf: string, ambiente: AmbienteFiscal): SefazEndpoints {
  const sigla = (uf ?? "").trim().toUpperCase();
  const propria = UF_PROPRIA[sigla];
  if (propria) {
    return ambiente === "PRODUCAO" ? propria.PRODUCAO : propria.HOMOLOGACAO;
  }
  if (UF_SVRS.has(sigla)) {
    return ambiente === "PRODUCAO" ? SVRS_PROD : SVRS_HOM;
  }
  const suportadas = [...Object.keys(UF_PROPRIA), ...UF_SVRS].sort().join(", ");
  throw new Error(
    `UF ${sigla || "(vazia)"} ainda não suportada pelo provedor SEFAZ (suportadas: ${suportadas}).`
  );
}

export function cUFFromUF(uf: string): string {
  const code = CODIGO_UF[(uf ?? "").trim().toUpperCase()];
  if (!code) throw new Error(`UF inválida para cUF: "${uf}".`);
  return code;
}
