import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { isAdminPerfil } from "@/lib/auth/modules";
import { publishRealtime } from "@/lib/realtime/broker";

/**
 * Comunicação interna: NOTIFICAÇÕES (sino no topo) + CHAT 1-a-1 entre usuários. Tempo real pelos
 * canais "notificacoes" e "chat" (o broker sinaliza por empresa; cada cliente refaz o seu fetch).
 */

/** Usuários (ativos) da empresa que têm um módulo — para notificar um SETOR (fan-out). */
export async function usuariosComModulo(scope: TenantScope, modulo: string): Promise<string[]> {
  const vinculos = await prisma.usuarioVinculo.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
    include: { perfil: { include: { permissoes: true } } }
  });
  return vinculos
    .filter((v) => isAdminPerfil(v.perfil.nome) || v.perfil.permissoes.some((p) => p.acao === "acessar" && p.modulo === modulo))
    .map((v) => v.usuarioId);
}

/** Cria uma notificação para um usuário OU para todos do SETOR (fan-out). Retorna quantas criou. */
export async function notificar(
  scope: TenantScope,
  input: { destinoUsuarioId?: string; setor?: string; tipo?: string; titulo: string; mensagem: string; link?: string | null }
): Promise<number> {
  const destinos = input.destinoUsuarioId
    ? [input.destinoUsuarioId]
    : input.setor
      ? await usuariosComModulo(scope, input.setor)
      : [];
  if (!destinos.length) return 0;
  await prisma.notificacao.createMany({
    data: destinos.map((destinoUsuarioId) => ({
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      destinoUsuarioId,
      tipo: input.tipo ?? "GERAL",
      titulo: input.titulo,
      mensagem: input.mensagem,
      link: input.link ?? null
    }))
  });
  publishRealtime(scope, "notificacoes");
  return destinos.length;
}

/** Notificações recentes do usuário + contagem de não lidas. */
export async function listarNotificacoes(scope: TenantScope, usuarioId: string) {
  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { ...scopedByTenantCompany(scope), destinoUsuarioId: usuarioId },
      orderBy: { criadoEm: "desc" },
      take: 30,
      select: { id: true, tipo: true, titulo: true, mensagem: true, link: true, lida: true, criadoEm: true }
    }),
    prisma.notificacao.count({ where: { ...scopedByTenantCompany(scope), destinoUsuarioId: usuarioId, lida: false } })
  ]);
  return { itens, naoLidas };
}

/** Marca uma notificação (ou todas) do usuário como lida. */
export async function marcarNotificacaoLida(scope: TenantScope, usuarioId: string, id?: string) {
  await prisma.notificacao.updateMany({
    where: { ...scopedByTenantCompany(scope), destinoUsuarioId: usuarioId, ...(id ? { id } : { lida: false }) },
    data: { lida: true }
  });
}

// ─── Chat 1-a-1 ──────────────────────────────────────────────────────────────

/** Usuários da empresa (para escolher com quem conversar), exceto o próprio. */
export async function listarUsuariosChat(scope: TenantScope, usuarioId: string) {
  const vinculos = await prisma.usuarioVinculo.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true, usuarioId: { not: usuarioId } },
    include: { usuario: { select: { id: true, nome: true } }, perfil: { select: { nome: true } } }
  });
  // Dedup por usuário (um usuário pode ter mais de um vínculo).
  const vistos = new Set<string>();
  const usuarios: Array<{ id: string; nome: string; perfil: string }> = [];
  for (const v of vinculos) {
    if (vistos.has(v.usuarioId)) continue;
    vistos.add(v.usuarioId);
    usuarios.push({ id: v.usuarioId, nome: v.usuario.nome, perfil: v.perfil.nome });
  }
  // Não lidas por remetente (para o badge de cada contato).
  const naoLidas = await prisma.mensagemInterna.groupBy({
    by: ["deUsuarioId"],
    where: { ...scopedByTenantCompany(scope), paraUsuarioId: usuarioId, lida: false },
    _count: { _all: true }
  });
  const naoLidasPor = new Map(naoLidas.map((n) => [n.deUsuarioId, n._count._all]));
  return usuarios
    .map((u) => ({ ...u, naoLidas: naoLidasPor.get(u.id) ?? 0 }))
    .sort((a, b) => b.naoLidas - a.naoLidas || a.nome.localeCompare(b.nome));
}

/** Total de mensagens de chat não lidas do usuário (badge geral). */
export async function contarChatNaoLido(scope: TenantScope, usuarioId: string): Promise<number> {
  return prisma.mensagemInterna.count({ where: { ...scopedByTenantCompany(scope), paraUsuarioId: usuarioId, lida: false } });
}

/** Conversa entre o usuário e outro (marca as recebidas como lidas). */
export async function abrirConversa(scope: TenantScope, usuarioId: string, comUsuarioId: string) {
  const mensagens = await prisma.mensagemInterna.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      OR: [
        { deUsuarioId: usuarioId, paraUsuarioId: comUsuarioId },
        { deUsuarioId: comUsuarioId, paraUsuarioId: usuarioId }
      ]
    },
    orderBy: { criadoEm: "asc" },
    take: 100,
    select: { id: true, deUsuarioId: true, texto: true, criadoEm: true }
  });
  await prisma.mensagemInterna.updateMany({
    where: { ...scopedByTenantCompany(scope), deUsuarioId: comUsuarioId, paraUsuarioId: usuarioId, lida: false },
    data: { lida: true }
  });
  return mensagens.map((m) => ({ id: m.id, minha: m.deUsuarioId === usuarioId, texto: m.texto, criadoEm: m.criadoEm.toISOString() }));
}

/** Envia uma mensagem de chat. */
export async function enviarMensagemInterna(scope: TenantScope, deUsuarioId: string, paraUsuarioId: string, texto: string) {
  const t = texto.trim();
  if (!t) throw new Error("Mensagem vazia.");
  if (paraUsuarioId === deUsuarioId) throw new Error("Não é possível enviar mensagem para si mesmo.");
  const msg = await prisma.mensagemInterna.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, deUsuarioId, paraUsuarioId, texto: t.slice(0, 2000) }
  });
  publishRealtime(scope, "chat");
  return { id: msg.id, minha: true, texto: msg.texto, criadoEm: msg.criadoEm.toISOString() };
}
