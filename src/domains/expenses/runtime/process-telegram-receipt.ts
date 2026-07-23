import type { TenantScope } from "@/lib/auth/dev-session";
import { baixarTelegramArquivoBase64, sendTelegramText, type TelegramRuntime } from "@/lib/telegram/telegram-service";
import { criarGastoDeCupom } from "@/domains/expenses/application/gasto-use-cases";
import { empresaAtivaSemTexto } from "@/domains/agent/runtime/selecao-empresa";

function fmtMoeda(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/**
 * Processa uma FOTO de cupom recebida no Telegram (mesmo fluxo do WhatsApp): só staff autorizado
 * (papel GESTOR/VENDEDOR do vínculo) lança gasto — clientes finais são ignorados pelo chamador.
 * Multi-empresa: a foto entra na EMPRESA ATIVA da sessão; sem sessão, pede a seleção antes.
 * O gasto entra CONFIRMADO direto (quem manda pelo chat é autorizado). Nunca lança.
 */
export async function processTelegramReceipt(input: {
  runtime: TelegramRuntime;
  scope: TenantScope;
  chatId: string;
  telefone: string | null;
  fileId: string;
}): Promise<void> {
  const { runtime, chatId, fileId } = input;
  let scope = input.scope;

  try {
    // Empresa ATIVA do chat (telefone em várias empresas usa a sessão; sem sessão → pede a seleção).
    if (input.telefone) {
      const resolucao = await empresaAtivaSemTexto({ canal: "TELEGRAM", chave: chatId, telefone: input.telefone });
      if (resolucao.tipo === "responder") {
        await sendTelegramText(runtime, chatId, `Antes de lançar o cupom, escolha a empresa.\n\n${resolucao.mensagem}`);
        return;
      }
      if (resolucao.tipo === "ok") {
        scope = { tenantId: resolucao.vinculo.tenantId, empresaId: resolucao.vinculo.empresaId };
      }
    }

    const base64 = await baixarTelegramArquivoBase64(runtime, fileId);
    if (!base64) {
      await sendTelegramText(runtime, chatId, "Não consegui baixar a imagem do cupom (limite 6 MB). Pode reenviar?");
      return;
    }
    const r = await criarGastoDeCupom(scope, { imagem: base64, origem: "TELEGRAM", confirmarDireto: true });
    const dataFmt = r.data ? ` em ${r.data.split("-").reverse().join("/")}` : "";
    const resumo =
      `✅ Gasto lançado:\n${r.estabelecimento} — R$ ${fmtMoeda(r.valorTotal)}${dataFmt}\n` +
      `Categoria: ${r.categoria} · ${r.itens.length} item(ns)\n` +
      `Para corrigir ou excluir: /erp/gastos`;
    await sendTelegramText(runtime, chatId, resumo);
  } catch (e) {
    await sendTelegramText(runtime, chatId, `Não consegui ler o cupom: ${e instanceof Error ? e.message : "erro"}.`).catch(() => undefined);
  }
}
