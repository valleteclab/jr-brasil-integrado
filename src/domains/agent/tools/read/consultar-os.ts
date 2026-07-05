import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { AgentTool } from "../../types";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Status de Ordens de Serviço pelo agente (web/WhatsApp/Telegram). GESTOR/VENDEDOR veem qualquer
 * OS da empresa; CLIENTE só as próprias (o handler recebe clienteId no scope da conversa via
 * argumento injetado pelas queries de cliente — aqui filtramos pelo clienteId quando presente).
 */
const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_PECAS: "Aguardando peças",
  FINALIZADA_NAO_FATURADA: "Finalizada (a faturar)",
  FATURADA: "Faturada",
  CANCELADA: "Cancelada"
};

export const consultarOs: AgentTool = {
  name: "consultar_os",
  description:
    "Consulta Ordens de Serviço: por número (ex.: OS-000012), por cliente (nome) ou as mais recentes em aberto. Retorna status, equipamento, técnico, previsão e total.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR", "CLIENTE"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número da OS (ex.: OS-000012). Opcional." },
      cliente: { type: "string", description: "Nome (ou parte) do cliente para filtrar. Opcional." },
      apenasAbertas: { type: "boolean", description: "true = só OS não concluídas/canceladas (padrão true quando não há número)." },
      clienteId: { type: "string", description: "Id do cliente solicitante (injetado pelo canal quando o papel é CLIENTE)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const numero = typeof args.numero === "string" ? args.numero.trim() : "";
    const clienteNome = typeof args.cliente === "string" ? args.cliente.trim() : "";
    const apenasAbertas = args.apenasAbertas !== false;
    // Cliente final: o canal injeta args.clienteId (nunca confiamos no que o modelo mandar para
    // outros papéis — o run-agent-turn força o valor quando role=CLIENTE).
    const clienteIdScope = typeof args.clienteId === "string" && args.clienteId ? args.clienteId : null;

    const where: Prisma.OrdemServicoWhereInput = { ...scopedByTenantCompany(scope) };
    if (numero) where.numero = { contains: numero, mode: "insensitive" };
    if (clienteIdScope) where.clienteId = clienteIdScope;
    else if (clienteNome) {
      where.cliente = {
        OR: [
          { razaoSocial: { contains: clienteNome, mode: "insensitive" } },
          { nomeFantasia: { contains: clienteNome, mode: "insensitive" } }
        ]
      };
    }
    if (!numero && apenasAbertas) where.status = { notIn: ["CANCELADA", "FATURADA"] };

    const ordens = await prisma.ordemServico.findMany({
      where,
      orderBy: { atualizadoEm: "desc" },
      take: numero ? 3 : 10,
      select: {
        numero: true,
        status: true,
        equipamento: true,
        placaOuSerial: true,
        previsaoEm: true,
        total: true,
        criadoEm: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        tecnicoResponsavel: { select: { nome: true } }
      }
    });

    return {
      ok: true,
      data: {
        total: ordens.length,
        ordens: ordens.map((o) => ({
          numero: o.numero,
          status: STATUS_LABEL[o.status] ?? o.status,
          cliente: o.cliente.nomeFantasia ?? o.cliente.razaoSocial,
          equipamento: o.equipamento,
          placaOuSerial: o.placaOuSerial,
          tecnico: o.tecnicoResponsavel?.nome ?? null,
          previsao: o.previsaoEm ? o.previsaoEm.toLocaleDateString("pt-BR") : null,
          total: Number(o.total),
          abertaEm: o.criadoEm.toLocaleDateString("pt-BR")
        }))
      }
    };
  }
};
