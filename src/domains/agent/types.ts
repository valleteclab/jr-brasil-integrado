import type { TenantScope } from "@/lib/auth/dev-session";

/** Papel de quem conversa com o agente. CLIENTE é usado só na fase WhatsApp. */
export type AgentRole = "GESTOR" | "VENDEDOR" | "CLIENTE";

/** JSON Schema mínimo aceito pela API OpenAI/OpenRouter para parâmetros de tool. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** Rascunho criado por uma write tool — vira card "abrir para confirmar" na UI. */
export type AgentDraft = {
  tipo: "ORCAMENTO" | "PEDIDO_VENDA" | "CLIENTE";
  id: string;
  numero?: string | null;
  total?: number | null;
  href: string;
};

/** Resultado de um handler de tool. `data` é serializado e devolvido ao modelo. */
export type ToolResult = {
  ok: boolean;
  data: unknown;
  /** Quando a tool criou um rascunho, descreve-o para a UI surfaçar o link. */
  draft?: AgentDraft;
  error?: string;
};

export type AgentTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  mode: "read" | "write";
  roles: AgentRole[];
  handler: (scope: TenantScope, args: Record<string, unknown>) => Promise<ToolResult>;
};
