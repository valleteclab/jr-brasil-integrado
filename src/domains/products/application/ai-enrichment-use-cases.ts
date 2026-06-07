/**
 * Enriquecimento de produtos por IA: a partir da DESCRIÇÃO (sem gastar cota do Cosmos), sugere
 * descrição limpa, categoria, NCM e CEST. O NCM é ANCORADO na tabela oficial (RAG: a IA escolhe
 * entre candidatos reais e validamos com findNcm), reduzindo alucinação. As sugestões vêm com
 * confiança e NUNCA são aplicadas direto na emissão — só preenchem o formulário para revisão.
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { callOpenRouter } from "@/domains/ai/openrouter-service";
import { findNcm, searchNcm, normalizeNcm } from "@/domains/fiscal/ncm-service";
import { listProductCategories } from "@/lib/services/products";
import { consultarGtinCosmos } from "./cosmos-service";

export type FiscalAiSuggestion = {
  descricaoLimpa: string | null;
  categoria: string | null;
  ncmSugerido: string | null;
  ncmDescricao: string | null;
  cest: string | null;
  marca: string | null;
  thumbnail: string | null;
  confianca: number;
  justificativa: string;
  /** Origem do NCM aceito: "COSMOS" (catálogo), "IA" (validada na tabela) ou "NENHUMA". */
  fonteNcm: "COSMOS" | "IA" | "NENHUMA";
  avisos: string[];
};

/** Extrai o primeiro objeto JSON de um texto (a IA às vezes embrulha em markdown/comentário). */
export function extractJsonObject(content: string): Record<string, unknown> {
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("A IA não retornou um objeto JSON válido.");
  return JSON.parse(content.slice(first, last + 1)) as Record<string, unknown>;
}

function extractJsonArray(content: string): Array<Record<string, unknown>> {
  const first = content.indexOf("[");
  const last = content.lastIndexOf("]");
  if (first < 0 || last < first) throw new Error("A IA não retornou uma lista JSON válida.");
  return JSON.parse(content.slice(first, last + 1)) as Array<Record<string, unknown>>;
}

/** Tenta o Cosmos (com cache) sem quebrar o fluxo se falhar/estourar a cota. */
async function tentarCosmos(scope: TenantScope, gtin?: string | null) {
  const g = (gtin ?? "").replace(/\D/g, "");
  if (g.length < 8) return null;
  try {
    return await consultarGtinCosmos(scope, g);
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "Você classifica produtos para um ERP fiscal brasileiro.",
  "Responda SOMENTE com JSON válido, sem markdown.",
  "Escolha o NCM APENAS entre os candidatos fornecidos (campo 'codigo'); se nenhum servir, use null.",
  "Nunca invente um NCM fora da lista. CEST só quando tiver certeza; senão null.",
  "confianca é um inteiro de 0 a 100."
].join(" ");

/** Sugere dados fiscais de UM produto a partir da descrição (e GTIN, se houver). */
export async function suggestProductFiscalWithAi(
  scope: TenantScope,
  input: { descricao: string; gtin?: string | null; ncmAtual?: string | null; marca?: string | null }
): Promise<FiscalAiSuggestion> {
  const descricao = (input.descricao ?? "").trim();
  if (descricao.length < 3) throw new Error("Informe uma descrição com ao menos 3 caracteres.");

  const cosmos = await tentarCosmos(scope, input.gtin);
  const termoBusca = [descricao, cosmos?.descricao].filter(Boolean).join(" ");
  const candidatos = await searchNcm(termoBusca, 15);
  const categoriasDisponiveis = await listProductCategories(scope);

  const content = await callOpenRouter(
    scope,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          instrucoes:
            "Sugira descricaoLimpa (nome comercial claro), categoria, ncmSugerido (código de 8 dígitos escolhido da lista de candidatos), cest, confianca (0-100) e justificativa curta. " +
            "A categoria DEVE ser escolhida exatamente da lista 'categoriasDisponiveis'; só proponha uma nova (curta) se nenhuma servir.",
          produto: {
            descricao,
            gtin: input.gtin ?? null,
            marca: input.marca ?? cosmos?.marca ?? null,
            ncmAtual: input.ncmAtual ?? null,
            dadosCosmos: cosmos ? { descricao: cosmos.descricao, ncm: cosmos.ncm, cest: cosmos.cest } : null
          },
          candidatosNcm: candidatos,
          categoriasDisponiveis,
          formato: {
            descricaoLimpa: "Água Mineral Natural sem Gás 500ml",
            categoria: "Bebidas",
            ncmSugerido: "22011000",
            cest: null,
            confianca: 90,
            justificativa: "Descrição e candidato NCM compatíveis."
          }
        })
      }
    ],
    { maxTokens: 500, temperature: 0 }
  );

  const obj = extractJsonObject(content);
  const avisos: string[] = [];

  const descricaoLimpa = typeof obj.descricaoLimpa === "string" && obj.descricaoLimpa.trim() ? obj.descricaoLimpa.trim() : null;
  const categoriaBruta = typeof obj.categoria === "string" && obj.categoria.trim() ? obj.categoria.trim() : null;
  // Canoniza para uma categoria existente quando casar (ignora acento/maiúscula) — evita duplicar.
  const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const categoria = categoriaBruta
    ? categoriasDisponiveis.find((c) => chave(c) === chave(categoriaBruta)) ?? categoriaBruta
    : null;
  let confianca = Number(obj.confianca) || 0;
  const justificativa = typeof obj.justificativa === "string" ? obj.justificativa.trim() : "";

  // NCM: prioriza o do Cosmos se válido; senão a sugestão da IA, validada na tabela oficial.
  let ncmSugerido: string | null = null;
  let fonteNcm: FiscalAiSuggestion["fonteNcm"] = "NENHUMA";
  const ncmCosmos = await findNcm(cosmos?.ncm);
  const ncmIa = await findNcm(typeof obj.ncmSugerido === "string" ? obj.ncmSugerido : null);

  if (ncmCosmos) {
    ncmSugerido = ncmCosmos.codigo;
    fonteNcm = "COSMOS";
  } else if (ncmIa) {
    ncmSugerido = ncmIa.codigo;
    fonteNcm = "IA";
  } else {
    const tentado = normalizeNcm(typeof obj.ncmSugerido === "string" ? obj.ncmSugerido : null);
    if (tentado) avisos.push(`A IA sugeriu o NCM ${tentado}, que não existe na tabela oficial — confira manualmente.`);
    else avisos.push("Não foi possível sugerir um NCM com segurança — informe manualmente.");
    confianca = Math.min(confianca, 30);
  }

  const ncmDescricao = ncmCosmos?.descricao ?? ncmIa?.descricao ?? null;
  const cest =
    (typeof obj.cest === "string" ? obj.cest.replace(/\D/g, "") : "") || (cosmos?.cest ?? "") || null;

  avisos.push("Sugestão de IA — confira o NCM/CEST com seu contador antes de emitir.");

  return {
    descricaoLimpa,
    categoria,
    ncmSugerido,
    ncmDescricao,
    cest,
    marca: cosmos?.marca ?? input.marca ?? null,
    thumbnail: cosmos?.thumbnail ?? null,
    confianca,
    justificativa,
    fonteNcm,
    avisos
  };
}

export type EntryItemFiscalSuggestion = {
  itemId: string;
  ncmSugerido: string | null;
  cest: string | null;
  categoria: string | null;
  descricaoLimpa: string | null;
  confianca: number;
  motivo: string;
};

/** Sugere dados fiscais em LOTE para os itens de uma entrada sem NCM/categoria definidos. */
export async function suggestEntryItemsFiscalWithAi(
  scope: TenantScope,
  entradaFiscalId: string
): Promise<EntryItemFiscalSuggestion[]> {
  const entrada = await prisma.entradaFiscal.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, id: entradaFiscalId },
    include: { itens: true }
  });
  if (!entrada) throw new Error("Entrada fiscal não encontrada.");

  // Foca nos itens sem NCM válido (os que mais precisam de ajuda); limita para caber no contexto.
  const alvos = entrada.itens.filter((i) => !normalizeNcm(i.ncm)).slice(0, 40);
  if (!alvos.length) return [];

  // RAG por item: candidatos de NCM reais para cada descrição.
  const comCandidatos = await Promise.all(
    alvos.map(async (item) => ({
      itemId: item.id,
      descricao: item.descricaoFornecedor,
      gtin: item.gtin,
      candidatos: await searchNcm(item.descricaoFornecedor, 8)
    }))
  );

  const content = await callOpenRouter(
    scope,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          instrucoes:
            "Para cada item, retorne itemId, ncmSugerido (8 dígitos escolhido dos candidatos do PRÓPRIO item, ou null), cest, categoria, descricaoLimpa, confianca (0-100) e motivo curto.",
          itens: comCandidatos,
          formato: [
            { itemId: "id", ncmSugerido: "22011000", cest: null, categoria: "Bebidas", descricaoLimpa: "Água Mineral 500ml", confianca: 85, motivo: "Candidato compatível." }
          ]
        })
      }
    ],
    { maxTokens: 1500, temperature: 0 }
  );

  const arr = extractJsonArray(content);

  // Valida cada NCM contra a tabela oficial; descarta os inexistentes.
  return Promise.all(
    arr.map(async (s) => {
      const ncm = await findNcm(typeof s.ncmSugerido === "string" ? s.ncmSugerido : null);
      return {
        itemId: String(s.itemId),
        ncmSugerido: ncm?.codigo ?? null,
        cest: (typeof s.cest === "string" ? s.cest.replace(/\D/g, "") : "") || null,
        categoria: typeof s.categoria === "string" && s.categoria.trim() ? s.categoria.trim() : null,
        descricaoLimpa: typeof s.descricaoLimpa === "string" && s.descricaoLimpa.trim() ? s.descricaoLimpa.trim() : null,
        confianca: ncm ? Number(s.confianca) || 0 : Math.min(Number(s.confianca) || 0, 30),
        motivo: ncm ? String(s.motivo || "") : `${String(s.motivo || "")} (NCM não validado na tabela oficial)`.trim()
      };
    })
  );
}
