import type { AgentTool } from "../../types";
import { suggestProductFiscalWithAi } from "@/domains/products/application/ai-enrichment-use-cases";

export const sugerirFiscalProduto: AgentTool = {
  name: "sugerir_fiscal_produto",
  description:
    "Sugere descrição limpa, categoria, NCM e CEST para um produto antes do cadastro. Use quando o gestor não informar NCM/CEST. A sugestão consulta GTIN quando disponível, escolhe o NCM apenas entre candidatos da tabela oficial e cruza CEST pelo NCM. Mostre código, descrição, confiança, fonte e avisos no resumo; permita correção antes de cadastrar.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      descricao: { type: "string", description: "Descrição comercial detalhada do produto." },
      gtin: { type: "string", description: "GTIN/EAN opcional; melhora a precisão quando disponível." },
      marca: { type: "string", description: "Marca opcional." }
    },
    required: ["descricao"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    try {
      const sugestao = await suggestProductFiscalWithAi(scope, {
        descricao: String(args.descricao ?? ""),
        gtin: args.gtin ? String(args.gtin) : null,
        marca: args.marca ? String(args.marca) : null
      });
      return {
        ok: true,
        data: {
          descricao: sugestao.descricaoLimpa,
          categoria: sugestao.categoria,
          marca: sugestao.marca,
          ncm: sugestao.ncmSugerido,
          ncmDescricao: sugestao.ncmDescricao,
          cest: sugestao.cest,
          confianca: sugestao.confianca,
          fonteNcm: sugestao.fonteNcm,
          justificativa: sugestao.justificativa,
          avisos: sugestao.avisos
        }
      };
    } catch (error) {
      return {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : "Não foi possível sugerir a classificação fiscal."
      };
    }
  }
};
