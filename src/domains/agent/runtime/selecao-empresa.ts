import { prisma } from "@/lib/db/prisma";
import type { AgentRole } from "../types";

/**
 * SELEÇÃO DE EMPRESA nos canais de chat quando o telefone opera VÁRIAS empresas (ex.: contador
 * com carteira de CNPJs). Regras de segurança:
 *  - A empresa ativa vem SEMPRE de um vínculo AgenteTelefone do PRÓPRIO telefone — nunca de texto
 *    digitado. Cliente A não alcança dados do cliente B.
 *  - Com 1 vínculo, comporta-se como sempre. Com N, o assistente pergunta qual empresa (lista
 *    numerada), fixa em ChatEmpresaAtiva e mostra a empresa ativa; "trocar empresa" alterna.
 */

export type VinculoEmpresa = {
  tenantId: string;
  empresaId: string;
  role: AgentRole;
  clienteId: string | null;
  empresaNome: string;
  cnpj: string;
};

export type ResolucaoEmpresa =
  | { tipo: "ok"; vinculo: VinculoEmpresa; multi: boolean }
  | { tipo: "responder"; mensagem: string }
  | { tipo: "nenhum" };

const fmtCnpj = (d: string) =>
  d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;

async function listarVinculos(telefone: string): Promise<VinculoEmpresa[]> {
  // Sufixo de 8 dígitos: Telegram/WhatsApp mandam formatos diferentes do cadastro (+55, DDD, 9).
  const sufixo = telefone.replace(/\D/g, "").slice(-8);
  if (!sufixo) return [];
  const rows = await prisma.agenteTelefone.findMany({
    where: { ativo: true, telefone: { contains: sufixo } },
    include: { empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } } }
  });
  return rows
    .map((r) => ({
      tenantId: r.tenantId,
      empresaId: r.empresaId,
      role: r.role as AgentRole,
      clienteId: r.clienteId ?? null,
      empresaNome: r.empresa?.nomeFantasia ?? r.empresa?.razaoSocial ?? "Empresa",
      cnpj: r.empresa?.cnpj ?? ""
    }))
    .sort((a, b) => a.empresaNome.localeCompare(b.empresaNome));
}

function menuEmpresas(vinculos: VinculoEmpresa[]): string {
  const linhas = vinculos.map((v, i) => `${i + 1}️⃣ ${v.empresaNome}${v.cnpj ? ` — ${fmtCnpj(v.cnpj)}` : ""}`);
  return `🏢 Seu número está vinculado a ${vinculos.length} empresas. Qual você quer acessar?\n\n${linhas.join("\n")}\n\nResponda com o número (ex.: 1).`;
}

/**
 * Resolve a empresa ativa do chat. `texto` é a mensagem recebida (para interpretar a seleção
 * numérica e o comando "trocar empresa"). Retornos:
 *  - ok: segue o fluxo normal com o vínculo (multi indica se deve exibir a empresa nas respostas);
 *  - responder: envie a mensagem ao usuário e NÃO processe o texto como pergunta;
 *  - nenhum: telefone sem vínculo de equipe (segue o fluxo de cliente final/ignora).
 */
export async function resolverEmpresaAtiva(params: { canal: string; chave: string; telefone: string; texto: string }): Promise<ResolucaoEmpresa> {
  const { canal, chave, telefone } = params;
  const texto = params.texto.trim().toLowerCase();
  const vinculos = await listarVinculos(telefone);
  if (!vinculos.length) return { tipo: "nenhum" };
  if (vinculos.length === 1) return { tipo: "ok", vinculo: vinculos[0], multi: false };

  const sessao = await prisma.chatEmpresaAtiva.findUnique({ where: { canal_chave: { canal, chave } } });

  // Comando de troca — reabre o seletor.
  if (["trocar", "trocar empresa", "empresas", "mudar empresa"].includes(texto)) {
    await prisma.chatEmpresaAtiva.upsert({
      where: { canal_chave: { canal, chave } },
      create: { canal, chave, tenantId: vinculos[0].tenantId, empresaId: vinculos[0].empresaId, aguardandoSelecao: true },
      update: { aguardandoSelecao: true }
    });
    return { tipo: "responder", mensagem: menuEmpresas(vinculos) };
  }

  // Aguardando a escolha: interpreta o número.
  if (sessao?.aguardandoSelecao) {
    const n = Number(texto.replace(/\D/g, ""));
    if (Number.isInteger(n) && n >= 1 && n <= vinculos.length) {
      const alvo = vinculos[n - 1];
      await prisma.chatEmpresaAtiva.update({
        where: { canal_chave: { canal, chave } },
        data: { tenantId: alvo.tenantId, empresaId: alvo.empresaId, aguardandoSelecao: false }
      });
      return {
        tipo: "responder",
        mensagem: `✅ Você está operando por *${alvo.empresaNome}*${alvo.cnpj ? ` (${fmtCnpj(alvo.cnpj)})` : ""}.\nTudo que fizer aqui vale para esta empresa. Envie "trocar empresa" para alternar.\n\nComo posso ajudar?`
      };
    }
    return { tipo: "responder", mensagem: `Não entendi. ${menuEmpresas(vinculos)}` };
  }

  // Sessão válida (a empresa ativa PRECISA estar entre os vínculos do telefone — segurança).
  if (sessao) {
    const ativo = vinculos.find((v) => v.empresaId === sessao.empresaId && v.tenantId === sessao.tenantId);
    if (ativo) return { tipo: "ok", vinculo: ativo, multi: true };
  }

  // Sem sessão → abre o seletor.
  await prisma.chatEmpresaAtiva.upsert({
    where: { canal_chave: { canal, chave } },
    create: { canal, chave, tenantId: vinculos[0].tenantId, empresaId: vinculos[0].empresaId, aguardandoSelecao: true },
    update: { aguardandoSelecao: true }
  });
  return { tipo: "responder", mensagem: menuEmpresas(vinculos) };
}

/** Empresa ativa para fluxos NÃO-textuais (ex.: foto de cupom): usa a sessão; sem sessão e multi → null. */
export async function empresaAtivaSemTexto(params: { canal: string; chave: string; telefone: string }): Promise<ResolucaoEmpresa> {
  const { canal, chave, telefone } = params;
  const vinculos = await listarVinculos(telefone);
  if (!vinculos.length) return { tipo: "nenhum" };
  if (vinculos.length === 1) return { tipo: "ok", vinculo: vinculos[0], multi: false };
  const sessao = await prisma.chatEmpresaAtiva.findUnique({ where: { canal_chave: { canal, chave } } });
  if (sessao && !sessao.aguardandoSelecao) {
    const ativo = vinculos.find((v) => v.empresaId === sessao.empresaId && v.tenantId === sessao.tenantId);
    if (ativo) return { tipo: "ok", vinculo: ativo, multi: true };
  }
  return { tipo: "responder", mensagem: menuEmpresas(vinculos) };
}
