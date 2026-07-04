import type { AgentTool } from "../../types";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";

/**
 * Emite uma NFS-e (nota fiscal de serviço) avulsa. Ação IRREVERSÍVEL — exige `confirmar: true`, que o
 * agente só envia após o usuário responder EMITIR. Tomador por clienteId (use consultar_cliente) ou
 * avulso (nome + documento). Serviços: descrição + valor. LC116/alíquota opcionais (padrão da empresa).
 */
export const emitirNfse: AgentTool = {
  name: "emitir_nfse",
  description:
    "Emite uma NFS-e (nota de serviço). AÇÃO IRREVERSÍVEL (Prefeitura/Nacional). Fluxo obrigatório: 1) mostre o resumo (tomador, serviço, valor); 2) peça o usuário responder EMITIR; 3) só então chame com confirmar=true. Tomador: use clienteId (de consultar_cliente) OU informe nome+documento. Informe os serviços (descrição e valor).",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id do tomador cadastrado (de consultar_cliente). Se ausente, informe nome+documento." },
      nome: { type: "string", description: "Nome do tomador (quando não há clienteId)." },
      documento: { type: "string", description: "CPF/CNPJ do tomador (quando não há clienteId)." },
      servicos: {
        type: "array",
        description: "Serviços prestados.",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string" },
            valor: { type: "number" },
            codigoServicoLc116: { type: "string", description: "Código LC116 do serviço (opcional; usa o padrão da empresa)." }
          },
          required: ["descricao", "valor"]
        }
      },
      aliquotaIss: { type: "number", description: "Alíquota de ISS em % (opcional; sobrepõe a regra)." },
      observacoes: { type: "string", description: "Observações (opcional)." },
      confirmar: { type: "boolean", description: "OBRIGATÓRIO true — só envie após o usuário confirmar com EMITIR." }
    },
    required: ["servicos", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Emissão não confirmada. Mostre o resumo e peça o usuário responder EMITIR; então chame de novo com confirmar=true." };
    }
    const servicos = Array.isArray(args.servicos) ? (args.servicos as Array<Record<string, unknown>>) : [];
    if (!servicos.length) return { ok: false, data: null, error: "Informe ao menos um serviço (descrição e valor)." };
    const clienteId = args.clienteId ? String(args.clienteId) : null;
    if (!clienteId && !(args.nome && args.documento)) {
      return { ok: false, data: null, error: "Informe o tomador: clienteId OU nome + documento (CPF/CNPJ)." };
    }

    try {
      const nota = await emitServiceInvoiceAvulsa(scope, {
        receiver: clienteId
          ? { clienteId }
          : { nome: String(args.nome), documento: String(args.documento).replace(/\D+/g, "") },
        aliquotaIss: args.aliquotaIss != null ? Number(args.aliquotaIss) : null,
        observacoes: args.observacoes ? String(args.observacoes) : null,
        servicos: servicos.map((s) => ({
          descricao: String(s.descricao ?? ""),
          valor: Number(s.valor) || 0,
          codigoServicoLc116: s.codigoServicoLc116 ? String(s.codigoServicoLc116) : undefined
        }))
      });
      return {
        ok: true,
        data: {
          notaId: nota.id,
          numeroNota: nota.numeroNfse ?? nota.numero,
          status: nota.status,
          chaveAcesso: nota.chaveAcesso,
          motivo: nota.motivo,
          pdfUrl: `/api/erp/fiscal/${nota.id}/pdf`
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao emitir a NFS-e." };
    }
  }
};
