/**
 * Orquestrador do layout do DANFE — FORK de `cria-layout` da lib nfe-danfe-pdf, com UMA adição:
 * a seção `getImpostoReforma` (IBS/CBS) inserida logo após `getImposto`. As demais seções vêm da
 * lib via deep-import; como o layout encadeia o `y` sequencialmente, inserir a seção desloca o
 * restante automaticamente, sem recalcular posições fixas. Mantido o mais fiel possível ao upstream.
 */
import { DEFAULT_NFE } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/default";
import { getDadosAdicionais } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-dados-adicionais";
import { getDadosEmitente } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-dados-emitente";
import { getDestinatarioRemetente } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-destinatario-remetente";
import { getFaturaDuplicata } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-fatura-duplicata";
import { getHomologacao } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-homologacao";
import { getImposto } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-imposto";
import { getIss } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-iss";
import { getMenuItens } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-menu-itens";
import { getNotaCancelada } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-nota-cancelada";
import { getRecibo } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-recibo";
import { getTransporte } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-transporte";
import { getImpostoReforma } from "./get-imposto-reforma";

export async function criaLayout(a: any): Promise<void> {
  const { dest, emit, ide, infAdic, total, transp, cobr } = a.nf.NFe.infNFe;
  let y = 0;
  const finalEspacoDet = a.folha === 0 ? DEFAULT_NFE.finalTamanhoDet1 : DEFAULT_NFE.finalTamanhoDetDemais;

  if (ide.tpAmb === "2") {
    getHomologacao({ ...a, protNFe: a.nf.protNFe });
  } else if (ide.tpAmb === "1" && a.cancelada) {
    getNotaCancelada(a);
  }

  if (a.folha === 0) {
    y = getRecibo({ ...a, y, dest, emit, total, ide });
  }

  await getDadosEmitente({ ...a, emit, protNFe: a.nf.protNFe, y, ide, folha: a.folha });

  y = getDestinatarioRemetente({ ...a, dest, y: a.doc.y, ide });

  if (a.folha === 0) {
    y = getFaturaDuplicata({ ...a, cobr, y });
    y = getImposto({ ...a, total, y });
    // Adição do fork: quadro IBS/CBS/IS da Reforma (NT 2025.002), entre o imposto e o transporte.
    y = getImpostoReforma({ ...a, total, y });
    y = getTransporte({ ...a, transp, y });
    y = getIss({ ...a, emit, total, y });
    getDadosAdicionais({
      ...a,
      infAdic,
      finalEspacoDet,
      extra: { vTotTrib: total.ICMSTot.vTotTrib, emailDest: dest.email }
    });
  }

  y = getMenuItens({ ...a, y, finalEspacoDet });
}
