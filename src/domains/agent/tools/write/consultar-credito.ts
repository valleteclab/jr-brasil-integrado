import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { consultarCredito } from "@/domains/credito/application/consulta-credito-use-cases";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Consulta de crédito (bureau) de um cliente PF/PJ. DEBITA 1 consulta da carteira de créditos (ou
 * reusa o cache de 60 dias sem custo). Aceita o documento direto ou clienteBusca (resolve o cadastro).
 */
export const consultarCreditoTool: AgentTool = {
  name: "consultar_credito",
  description:
    "Consulta o CRÉDITO de um cliente no bureau (PF Boa Vista / PJ SQOD): score, decisão (aprovado/analisar/reprovado), restrições (protestos/pendências/cheques/ações), limite sugerido e link do laudo em PDF. Informe o documento (CPF/CNPJ) OU clienteBusca (nome/CNPJ do cadastro). CUSTA 1 consulta da carteira de créditos (reusa cache de 60 dias sem custo). Mostre o resumo ao usuário; confirme antes de forçar nova consulta.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      documento: { type: "string", description: "CPF (11) ou CNPJ (14) a consultar. Opcional se informar clienteBusca." },
      clienteBusca: { type: "string", description: "Nome ou CNPJ de um cliente do cadastro (resolve o documento e vincula a consulta)." },
      forcar: { type: "boolean", description: "true = ignora o cache e consulta de novo (novo custo). Padrão false." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    let documento = normalizeDocumento(String(args.documento ?? ""));
    let clienteId: string | null = null;

    const busca = args.clienteBusca ? String(args.clienteBusca).trim() : "";
    if (busca) {
      const digitos = busca.replace(/\D/g, "");
      const cli = await prisma.cliente.findFirst({
        where: {
          ...scopedByTenantCompany(scope),
          OR: [
            ...(digitos.length >= 8 ? [{ documento: { contains: digitos } }] : []),
            { razaoSocial: { contains: busca, mode: "insensitive" as const } },
            { nomeFantasia: { contains: busca, mode: "insensitive" as const } }
          ]
        },
        select: { id: true, documento: true, razaoSocial: true }
      });
      if (!cli) return { ok: false, data: null, error: `Cliente "${busca}" não encontrado no cadastro.` };
      clienteId = cli.id;
      if (!documento) documento = normalizeDocumento(cli.documento);
    }

    if (documento.length !== 11 && documento.length !== 14) {
      return { ok: false, data: null, error: "Informe um CPF (11) ou CNPJ (14) válido, ou um clienteBusca com documento cadastrado." };
    }

    try {
      const r = await consultarCredito(scope, { documento, clienteId, forcar: args.forcar === true });
      const n = r.normalizado;
      return {
        ok: true,
        data: {
          tipoPessoa: r.tipoPessoa,
          nome: n.nome,
          decisao: n.decisao,
          parecer: n.parecer,
          score: n.score,
          faixa: n.faixa,
          probabilidadeInadimplencia: n.probabilidadeInadimplencia,
          capacidadePagamento: n.capacidadePagamento,
          limiteRecomendado: n.limiteRecomendado,
          rendaOuFaturamento: n.rendaOuFaturamento,
          restricoes: n.restricoes,
          temRestricao: n.temRestricao,
          pdf: n.pdfUrl,
          emCache: r.emCache,
          custo: r.custo,
          consultadoEm: r.consultadoEm
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha na consulta de crédito." };
    }
  }
};
