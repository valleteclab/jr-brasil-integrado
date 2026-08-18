import { prisma } from "@/lib/db/prisma";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import type { AgentTool } from "../../types";

/**
 * CLONAR NFS-e: o servidor carrega a nota ORIGINAL (tomador, descrição, valor, código do
 * serviço extraídos do XML autorizado) e emite uma nova igual, aplicando só os ajustes
 * pedidos (trocar um trecho da descrição, nova descrição ou novo valor). Nada de pedir
 * dado por dado ao usuário — "clonar" vem pronto, como deve ser.
 * Mesmo protocolo de segurança do emitir_nfse: sem confirmar=true devolve o RESUMO.
 */

const dec = (v: string | null | undefined) => (v ? Number(v) : null);

function extrairDoXml(xml: string | null): { descricao: string | null; codigo: string | null; valor: number | null } {
  if (!xml) return { descricao: null, codigo: null, valor: null };
  const plain = xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const descricao = /<xDescServ>([\s\S]*?)<\/xDescServ>/.exec(plain)?.[1]?.trim() ?? null;
  const codigo = /<cTribNac>(\d{6})<\/cTribNac>/.exec(plain)?.[1] ?? null;
  const valor = dec(/<vServ>([\d.]+)<\/vServ>/.exec(plain)?.[1]) ?? dec(/<vLiq>([\d.]+)<\/vLiq>/.exec(plain)?.[1]);
  return { descricao, codigo, valor };
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
        destinatarioNome: true, destinatarioDocumento: true, total: true, xml: true
      }
    });
    if (!original) {
      return { ok: false, data: null, error: `NFS-e autorizada nº ${numero ?? notaId} não encontrada nesta empresa.` };
    }

    const doXml = extrairDoXml(original.xml);
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

    const resumo = {
      baseadaNa: `NFS-e nº ${original.numeroNfse ?? original.numero}`,
      tomador: original.destinatarioNome,
      documento: original.destinatarioDocumento,
      descricao,
      valor,
      codigoServicoLc116: doXml.codigo
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
        servicos: [{ descricao, valor, codigoServicoLc116: doXml.codigo ?? undefined }]
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
