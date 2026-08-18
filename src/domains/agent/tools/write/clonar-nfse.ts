import { prisma } from "@/lib/db/prisma";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { baixarNfseXmlPelaChave } from "@/domains/fiscal/providers/nacional-provider";
import type { AgentTool } from "../../types";

/**
 * CLONAR NFS-e: o servidor carrega a nota ORIGINAL (tomador, descrição, valor, código do
 * serviço extraídos do XML autorizado) e emite uma nova igual, aplicando só os ajustes
 * pedidos (trocar um trecho da descrição, nova descrição ou novo valor). Nada de pedir
 * dado por dado ao usuário — "clonar" vem pronto, como deve ser.
 * Mesmo protocolo de segurança do emitir_nfse: sem confirmar=true devolve o RESUMO.
 */

const dec = (v: string | null | undefined) => (v ? Number(v) : null);

type RetencoesClonadas = {
  issRetido: boolean;
  ir: number | null; pis: number | null; cofins: number | null; csll: number | null; inss: number | null;
};

function extrairDoXml(xml: string | null): {
  descricao: string | null; codigo: string | null; nbs: string | null; classTrib: string | null; tribIssqn: string | null;
  valor: number | null; retencoes: RetencoesClonadas;
} {
  const vazio: RetencoesClonadas = { issRetido: false, ir: null, pis: null, cofins: null, csll: null, inss: null };
  if (!xml) return { descricao: null, codigo: null, nbs: null, classTrib: null, tribIssqn: null, valor: null, retencoes: vazio };
  const plain = xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const tag = (t: string) => new RegExp(`<${t}>([\\d.]+)</${t}>`).exec(plain)?.[1] ?? null;
  const descricao = /<xDescServ>([\s\S]*?)<\/xDescServ>/.exec(plain)?.[1]?.trim() ?? null;
  const codigo = /<cTribNac>(\d{6})<\/cTribNac>/.exec(plain)?.[1] ?? null;
  const nbs = /<cNBS>(\d{9})<\/cNBS>/.exec(plain)?.[1] ?? null;
  const classTrib = /<cClassTrib>(\w{6,7})<\/cClassTrib>/.exec(plain)?.[1] ?? null;
  const tribIssqn = /<tribISSQN>(\d)<\/tribISSQN>/.exec(plain)?.[1] ?? null;
  const valor = dec(tag("vServ")) ?? dec(tag("vLiq"));
  // Retenções da original: ISS retido (tpRetISSQN=2) + federais em VALOR (vPis/vCofins/vRetCP/vRetIRRF/vRetCSLL).
  const retencoes: RetencoesClonadas = {
    issRetido: /<tpRetISSQN>2<\/tpRetISSQN>/.test(plain),
    pis: dec(tag("vPis")),
    cofins: dec(tag("vCofins")),
    inss: dec(tag("vRetCP")),
    ir: dec(tag("vRetIRRF")),
    csll: dec(tag("vRetCSLL"))
  };
  return { descricao, codigo, nbs, classTrib, tribIssqn, valor, retencoes };
}

/** Converte os VALORES retidos da original em alíquotas sobre a base (replica na clonada;
 *  se o valor da nota mudar, as retenções acompanham proporcionalmente). */
function retencoesParaInput(r: RetencoesClonadas, base: number) {
  if (base <= 0) return null;
  const aliq = (v: number | null) => (v && v > 0 ? { aliquota: (v / base) * 100 } : null);
  const input = {
    issRetido: r.issRetido,
    ir: aliq(r.ir), pis: aliq(r.pis), cofins: aliq(r.cofins), csll: aliq(r.csll), inss: aliq(r.inss)
  };
  const temAlgo = input.issRetido || input.ir || input.pis || input.cofins || input.csll || input.inss;
  return temAlgo ? input : null;
}

export const clonarNfse: AgentTool = {
  name: "clonar_nfse",
  description:
    "CLONA uma NFS-e existente: carrega tomador, descrição, valor e código do serviço da nota original AUTOMATICAMENTE (não pergunte esses dados ao usuário). Ajustes opcionais: substituirDe/substituirPor (troca um trecho da descrição, ex.: 'julho'→'agosto'), novaDescricao (substitui inteira) ou novoValor. Fluxo: 1) chame SEM confirmar → recebe o resumo pronto; 2) mostre ao usuário e peça EMITIR; 3) chame de novo com confirmar=true. AÇÃO IRREVERSÍVEL na confirmação.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número da NFS-e original (ou use notaId)." },
      notaId: { type: "string", description: "Id da nota original (alternativa ao número)." },
      substituirDe: { type: "string", description: "Trecho da descrição original a trocar (ex.: 'julho')." },
      substituirPor: { type: "string", description: "Texto que entra no lugar (ex.: 'agosto')." },
      novaDescricao: { type: "string", description: "Descrição completa nova (substitui a original inteira)." },
      novoValor: { type: "number", description: "Valor novo (opcional; padrão = valor da original)." },
      confirmar: { type: "boolean", description: "true SOMENTE após o usuário responder EMITIR ao resumo." }
    }
  },
  handler: async (scope, args) => {
    const numero = args.numero ? String(args.numero).replace(/\D/g, "") : null;
    const notaId = args.notaId ? String(args.notaId) : null;
    if (!numero && !notaId) return { ok: false, data: null, error: "Informe o número ou o notaId da NFS-e original." };

    const original = await prisma.notaFiscal.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        modelo: "NFSE",
        status: "AUTORIZADA",
        ...(notaId ? { id: notaId } : { OR: [{ numero }, { numeroNfse: numero }] })
      },
      orderBy: { criadoEm: "desc" },
      select: {
        id: true, numero: true, numeroNfse: true, clienteId: true,
        destinatarioNome: true, destinatarioDocumento: true, total: true, xml: true, chaveAcesso: true, providerRef: true, ambiente: true
      }
    });
    if (!original) {
      return { ok: false, data: null, error: `NFS-e autorizada nº ${numero ?? notaId} não encontrada nesta empresa.` };
    }

    // Notas antigas (ACBr) não têm o XML salvo — baixa da SEFIN pela chave (mTLS com o A1)
    // e persiste para as próximas clonagens.
    let xmlOriginal = original.xml;
    if (!xmlOriginal || xmlOriginal.length < 100) {
      const chaveNacional = (original.chaveAcesso ?? original.providerRef ?? "").replace(/\D/g, "");
      if (chaveNacional.length === 50) {
        const runtime = await getFiscalRuntimeConfig(scope);
        if (runtime.certificado?.pfx) {
          xmlOriginal = await baixarNfseXmlPelaChave(chaveNacional, runtime.certificado, original.ambiente ?? runtime.ambiente);
          if (xmlOriginal) {
            await prisma.notaFiscal.update({ where: { id: original.id }, data: { xml: xmlOriginal } });
          }
        }
      }
      if (!xmlOriginal) {
        return { ok: false, data: null, error: "Não consegui recuperar o XML da nota original (nem no banco, nem na SEFIN). Sem ele a clonagem fiel não é possível — verifique o certificado A1 e a chave da nota." };
      }
    }
    const doXml = extrairDoXml(xmlOriginal);
    let descricao = args.novaDescricao
      ? String(args.novaDescricao)
      : doXml.descricao ?? "Serviços prestados conforme nota anterior.";
    if (!args.novaDescricao && args.substituirDe && args.substituirPor) {
      const de = String(args.substituirDe);
      const para = String(args.substituirPor);
      // troca acento/caixa-insensível de TODAS as ocorrências
      const alvo = de.normalize("NFD").replace(/[̀-ͯ]/g, "");
      descricao = descricao.replace(
        new RegExp(alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        para
      );
      // fallback: se a original tinha acento no trecho, tenta a forma literal também
      descricao = descricao.replace(new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), para);
    }
    const valor = args.novoValor != null ? Number(args.novoValor) : doXml.valor ?? Number(original.total);

    const baseOriginal = doXml.valor ?? Number(original.total);
    const retInput = retencoesParaInput(doXml.retencoes, baseOriginal);
    const fator = baseOriginal > 0 ? valor / baseOriginal : 1;
    const resumo = {
      baseadaNa: `NFS-e nº ${original.numeroNfse ?? original.numero}`,
      tomador: original.destinatarioNome,
      documento: original.destinatarioDocumento,
      descricao,
      valor,
      codigoServicoLc116: doXml.codigo,
      codigoNbs: doXml.nbs,
      classificacaoTributaria: doXml.classTrib,
      naturezaIss: doXml.tribIssqn === "2" ? "Imunidade (sem ISS)" : doXml.tribIssqn === "3" ? "Exportação" : doXml.tribIssqn === "4" ? "Não incidência (sem ISS)" : "Tributável",
      retencoes: retInput
        ? {
            issRetido: doXml.retencoes.issRetido,
            irrf: doXml.retencoes.ir ? Number((doXml.retencoes.ir * fator).toFixed(2)) : null,
            inss: doXml.retencoes.inss ? Number((doXml.retencoes.inss * fator).toFixed(2)) : null,
            csll: doXml.retencoes.csll ? Number((doXml.retencoes.csll * fator).toFixed(2)) : null,
            pis: doXml.retencoes.pis ? Number((doXml.retencoes.pis * fator).toFixed(2)) : null,
            cofins: doXml.retencoes.cofins ? Number((doXml.retencoes.cofins * fator).toFixed(2)) : null
          }
        : null
    };

    if (args.confirmar !== true) {
      return {
        ok: true,
        data: { resumo, instrucao: "Mostre este resumo ao usuário e peça para responder EMITIR. Então chame clonar_nfse novamente com os MESMOS argumentos + confirmar=true." }
      };
    }

    try {
      const nota = await emitServiceInvoiceAvulsa(scope, {
        receiver: original.clienteId
          ? { clienteId: original.clienteId }
          : { nome: original.destinatarioNome ?? "Tomador", documento: (original.destinatarioDocumento ?? "").replace(/\D/g, "") },
        aliquotaIss: null,
        observacoes: null,
        retencoes: retInput,
        tribIssqnCodigo: doXml.tribIssqn ?? null,
        servicos: [{ descricao, valor, codigoServicoLc116: doXml.codigo ?? undefined, codigoNbs: doXml.nbs ?? undefined, cClassTrib: doXml.classTrib ?? undefined }]
      });
      return {
        ok: true,
        data: {
          notaId: nota.id,
          numeroNota: nota.numeroNfse ?? nota.numero,
          status: nota.status,
          chaveAcesso: nota.chaveAcesso,
          motivo: nota.motivo,
          pdfUrl: `/api/erp/fiscal/${nota.id}/pdf`,
          clonadaDe: resumo.baseadaNa
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao clonar a NFS-e." };
    }
  }
};
