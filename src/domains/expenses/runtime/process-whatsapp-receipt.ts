import { prisma } from "@/lib/db/prisma";
import { getWhatsappRuntime, sendWhatsappText } from "@/lib/whatsapp/whatsapp-service";
import { criarGastoDeCupom } from "@/domains/expenses/application/gasto-use-cases";

/** Baixa a mídia do WhatsApp (Z-API) e converte em data URL base64 (cap 6MB). */
async function baixarImagemBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function fmtMoeda(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/**
 * Processa uma FOTO de cupom recebida no WhatsApp: só telefones AUTORIZADOS (gestor/vendedor em
 * AgenteTelefone) registram gasto — clientes finais são ignorados. Lê o cupom por IA, cria o gasto
 * (origem WHATSAPP, status PENDENTE) e responde com um resumo. Nunca lança (webhook responde 200).
 */
export async function processWhatsappReceipt(input: { telefone: string; imageUrl: string }): Promise<void> {
  const telefone = input.telefone.replace(/\D/g, "");
  if (!telefone || !input.imageUrl) return;

  const autorizado = await prisma.agenteTelefone.findFirst({ where: { telefone, ativo: true } });
  if (!autorizado || autorizado.role === "CLIENTE") return; // só staff autorizado

  const scope = { tenantId: autorizado.tenantId, empresaId: autorizado.empresaId };
  const whats = await getWhatsappRuntime(scope);
  if (!whats?.ativo) return;

  try {
    const base64 = await baixarImagemBase64(input.imageUrl);
    if (!base64) {
      await sendWhatsappText(whats, telefone, "Não consegui baixar a imagem do cupom. Pode reenviar?");
      return;
    }
    const r = await criarGastoDeCupom(scope, { imagem: base64, origem: "WHATSAPP", confirmarDireto: true });
    const dataFmt = r.data ? ` em ${r.data.split("-").reverse().join("/")}` : "";
    const resumo =
      `✅ Gasto lançado:\n${r.estabelecimento} — R$ ${fmtMoeda(r.valorTotal)}${dataFmt}\n` +
      `Categoria: ${r.categoria} · ${r.itens.length} item(ns)\n` +
      `Para corrigir ou excluir: /erp/gastos`;
    await sendWhatsappText(whats, telefone, resumo);
  } catch (e) {
    await sendWhatsappText(whats, telefone, `Não consegui ler o cupom: ${e instanceof Error ? e.message : "erro"}.`);
  }
}
