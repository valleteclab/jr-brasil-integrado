import type { TenantScope } from "@/lib/auth/dev-session";
import { callOpenRouterVision } from "@/domains/ai/openrouter-service";
import { DESPESA_CATEGORIAS, canonizarCategoria } from "../categorias";

export type CupomItem = { descricao: string; quantidade: number | null; valor: number };
export type CupomExtraido = {
  estabelecimento: string;
  documento: string | null;
  data: string | null; // YYYY-MM-DD
  valorTotal: number;
  categoria: string;
  confianca: number;
  itens: CupomItem[];
};

/** Extrai o primeiro objeto JSON do texto (mesmo padrão do ai-enrichment). */
function extractJsonObject(content: string): Record<string, unknown> {
  const ini = content.indexOf("{");
  const fim = content.lastIndexOf("}");
  if (ini === -1 || fim === -1 || fim <= ini) throw new Error("Resposta da IA sem JSON válido.");
  return JSON.parse(content.slice(ini, fim + 1)) as Record<string, unknown>;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Lê uma foto de cupom fiscal por IA (visão) e devolve os dados estruturados. NÃO persiste.
 * A imagem pode ser uma URL http (ex.: mídia do WhatsApp) ou um data URL base64.
 */
export async function extrairCupomComIa(scope: TenantScope, imageUrl: string): Promise<CupomExtraido> {
  const systemPrompt =
    "Você lê cupons fiscais/recibos brasileiros e extrai os dados em JSON. Responda SOMENTE com JSON " +
    "válido, sem markdown. Valores em número (use ponto decimal). Datas em YYYY-MM-DD.";

  const prompt = JSON.stringify({
    instrucao:
      "Extraia os dados deste cupom fiscal. Escolha a categoria que melhor descreve a despesa, " +
      "EXATAMENTE da lista 'categorias'. Liste os itens do cupom (descrição, quantidade e valor).",
    categorias: DESPESA_CATEGORIAS,
    formato: {
      estabelecimento: "nome da loja/empresa",
      documento: "CNPJ (só dígitos) ou null",
      data: "YYYY-MM-DD ou null",
      valorTotal: 0,
      categoria: "uma da lista",
      confianca: "0 a 100",
      itens: [{ descricao: "...", quantidade: 1, valor: 0 }]
    }
  });

  const content = await callOpenRouterVision(scope, { prompt, systemPrompt, imageUrl, maxTokens: 1500 });
  const obj = extractJsonObject(content);

  const itensRaw = Array.isArray(obj.itens) ? (obj.itens as Array<Record<string, unknown>>) : [];
  const itens: CupomItem[] = itensRaw
    .map((i) => ({
      descricao: String(i.descricao ?? "").trim(),
      quantidade: i.quantidade != null ? toNumber(i.quantidade) : null,
      valor: toNumber(i.valor)
    }))
    .filter((i) => i.descricao);

  const valorTotal = toNumber(obj.valorTotal) || itens.reduce((s, i) => s + i.valor, 0);
  const confianca = Math.max(0, Math.min(100, Math.round(toNumber(obj.confianca))));
  const documentoDig = String(obj.documento ?? "").replace(/\D/g, "");

  return {
    estabelecimento: String(obj.estabelecimento ?? "").trim() || "Estabelecimento não identificado",
    documento: documentoDig || null,
    data: typeof obj.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.data) ? obj.data : null,
    valorTotal: Math.round(valorTotal * 100) / 100,
    categoria: canonizarCategoria(typeof obj.categoria === "string" ? obj.categoria : null),
    confianca,
    itens
  };
}
