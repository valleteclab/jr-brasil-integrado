import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { confirmSale, createSale, invoiceSale } from "@/domains/sales/application/sale-use-cases";
import { resolverCliente, localizarProduto } from "../tools/write/resolver-venda";
import { emitirBoleto } from "../tools/write/emitir-boleto";
import { consultarOs } from "../tools/read/consultar-os";
import { searchProducts } from "../queries/product-queries";
import { sendTelegramBotoes, sendTelegramText, type BotaoInline, type TelegramRuntime } from "@/lib/telegram/telegram-service";

/**
 * FLUXOS GUIADOS do bot do Telegram (menu + botões, SEM IA): criar venda, consultar pedido,
 * faturar (NF), boletos, OS e busca de produto — máquina de estados determinística persistida em
 * TelegramVinculo.estado. A IA vira opção ("💬 Conversar com a IA") e fallback de texto livre.
 * Cada atendimento termina com "🏁 Encerrar", que limpa o estado e arquiva a conversa da IA.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type ItemFluxo = { produtoId: string; sku: string; nome: string; quantidade: number; preco: number };
type Estado =
  | { fluxo: "venda"; passo: "cliente" | "produto" | "quantidade" | "mais" | "forma" | "condicao" | "resumo"; clienteId?: string | null; clienteNome?: string; itens: ItemFluxo[]; pendente?: Omit<ItemFluxo, "quantidade">; forma?: string; condicao?: string }
  | { fluxo: "consultar"; passo: "numero" }
  | { fluxo: "faturar"; passo: "numero" }
  | { fluxo: "boleto"; passo: "numero" }
  | { fluxo: "produto"; passo: "termo" }
  | { fluxo: "ia" };

type Ctx = {
  runtime: TelegramRuntime & { tenantId: string; empresaId: string };
  scope: TenantScope;
  vinculo: { id: string; role: string; estado: unknown; chatId: string };
  chatId: string;
  baseUrl: string | null;
};

async function salvarEstado(ctx: Ctx, estado: Estado | null) {
  await prisma.telegramVinculo.update({ where: { id: ctx.vinculo.id }, data: { estado: estado === null ? undefined : (estado as object) } });
  if (estado === null) {
    await prisma.telegramVinculo.update({ where: { id: ctx.vinculo.id }, data: { estado: { fluxo: "ia" } } });
  }
}

const B = (text: string, data: string): BotaoInline => ({ text, data });
const NAV: BotaoInline[] = [B("🏠 Menu", "menu"), B("🏁 Encerrar", "encerrar")];

/** Menu principal (GESTOR vê tudo; VENDEDOR não fatura/cobra). */
export async function mostrarMenu(ctx: Ctx, titulo = "O que deseja fazer?") {
  const gestor = ctx.vinculo.role === "GESTOR";
  const linhas: BotaoInline[][] = [
    [B("🛒 Nova venda", "fluxo:venda")],
    [B("📋 Consultar pedido", "fluxo:consultar"), B("🔧 OS abertas", "fluxo:os")],
    ...(gestor ? [[B("🧾 Faturar (emitir NF)", "fluxo:faturar"), B("💳 Boletos do pedido", "fluxo:boleto")]] : []),
    [B("📦 Buscar produto", "fluxo:produto")],
    [B("💬 Conversar com a IA", "fluxo:ia")],
    [B("🏁 Encerrar atendimento", "encerrar")]
  ];
  await sendTelegramBotoes(ctx.runtime, ctx.chatId, titulo, linhas);
}

async function encerrar(ctx: Ctx) {
  await prisma.telegramVinculo.update({ where: { id: ctx.vinculo.id }, data: { estado: { fluxo: "ia" } } });
  // Arquiva a conversa da IA deste chat: o próximo atendimento começa com contexto limpo.
  await prisma.conversaAgente.updateMany({
    where: { tenantId: ctx.scope.tenantId, empresaId: ctx.scope.empresaId, canal: "TELEGRAM", telefone: ctx.chatId },
    data: { canal: "TELEGRAM_ARQ" }
  });
  await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Atendimento encerrado ✅ Obrigado!", [[B("🏠 Novo atendimento", "menu")]]);
}

function resumoVenda(e: Extract<Estado, { fluxo: "venda" }>): string {
  const linhas = e.itens.map((i) => `• ${i.quantidade}× ${i.nome} (${i.sku}) — ${BRL.format(i.preco * i.quantidade)}`);
  const total = e.itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  return [
    `Cliente: ${e.clienteNome ?? "Consumidor (anônimo)"}`,
    ...linhas,
    `Total: ${BRL.format(total)}`,
    e.forma ? `Pagamento: ${e.forma}${e.condicao ? ` · ${e.condicao}` : ""}` : ""
  ].filter(Boolean).join("\n");
}

/** Pós-ações após criar/consultar um pedido (conforme papel e status). */
function botoesPos(numero: string, gestor: boolean, status?: string): BotaoInline[][] {
  const podeConfirmar = gestor && (!status || status === "RASCUNHO" || status === "AGUARDANDO_PAGAMENTO");
  return [
    ...(podeConfirmar ? [[B("✔️ Confirmar pedido", `pos:conf:${numero}`)]] : []),
    ...(gestor ? [[B("🧾 Emitir NF-e", `pos:nfe:${numero}`), B("🧾 NFC-e", `pos:nfce:${numero}`)], [B("💳 Boletos do pedido", `pos:bol:${numero}`)]] : []),
    NAV
  ];
}

// ─── Ações dos botões (callback_query) ───────────────────────────────────────

export async function handleTelegramCallback(ctx: Ctx, data: string): Promise<void> {
  const gestor = ctx.vinculo.role === "GESTOR";
  const estado = (ctx.vinculo.estado ?? null) as Estado | null;

  if (data === "menu") { await salvarEstado(ctx, { fluxo: "ia" }); await mostrarMenu(ctx); return; }
  if (data === "encerrar") { await encerrar(ctx); return; }
  if (data === "fluxo:ia") {
    await salvarEstado(ctx, { fluxo: "ia" });
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Modo livre: escreva o que precisa (consultas, relatórios, ações). Para voltar aos botões, toque em Menu.", [NAV]);
    return;
  }

  if (data === "fluxo:venda") {
    await salvarEstado(ctx, { fluxo: "venda", passo: "cliente", itens: [] });
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, "🛒 Nova venda\n\nQuem é o cliente? Digite o nome ou CNPJ/CPF — ou:", [[B("👤 Consumidor (sem cadastro)", "venda:anonimo")], NAV]);
    return;
  }
  if (data === "venda:anonimo" && estado?.fluxo === "venda") {
    await salvarEstado(ctx, { ...estado, clienteId: null, clienteNome: undefined, passo: "produto" });
    await sendTelegramText(ctx.runtime, ctx.chatId, "Qual produto? Digite o código (SKU) ou parte do nome.");
    return;
  }
  if (data.startsWith("venda:cli:") && estado?.fluxo === "venda") {
    const id = data.slice("venda:cli:".length);
    const cli = await prisma.cliente.findFirst({ where: { id, ...scopedByTenantCompany(ctx.scope) }, select: { id: true, razaoSocial: true, nomeFantasia: true } });
    if (!cli) { await sendTelegramText(ctx.runtime, ctx.chatId, "Cliente não encontrado — digite o nome de novo."); return; }
    await salvarEstado(ctx, { ...estado, clienteId: cli.id, clienteNome: cli.nomeFantasia ?? cli.razaoSocial, passo: "produto" });
    await sendTelegramText(ctx.runtime, ctx.chatId, `Cliente: ${cli.nomeFantasia ?? cli.razaoSocial} ✅\n\nQual produto? Digite o código (SKU) ou parte do nome.`);
    return;
  }
  if (data.startsWith("venda:prod:") && estado?.fluxo === "venda") {
    const id = data.slice("venda:prod:".length);
    const p = await prisma.produto.findFirst({ where: { id, ...scopedByTenantCompany(ctx.scope) }, select: { id: true, sku: true, nome: true, precoVenda: true } });
    if (!p) { await sendTelegramText(ctx.runtime, ctx.chatId, "Produto não encontrado — digite o código de novo."); return; }
    await salvarEstado(ctx, { ...estado, pendente: { produtoId: p.id, sku: p.sku, nome: p.nome, preco: Number(p.precoVenda) }, passo: "quantidade" });
    await sendTelegramText(ctx.runtime, ctx.chatId, `${p.nome} (${p.sku}) — ${BRL.format(Number(p.precoVenda))}\n\nQuantidade?`);
    return;
  }
  if (data === "venda:mais" && estado?.fluxo === "venda") {
    await salvarEstado(ctx, { ...estado, passo: "produto" });
    await sendTelegramText(ctx.runtime, ctx.chatId, "Qual o próximo produto? Digite o código ou nome.");
    return;
  }
  if (data === "venda:fechar" && estado?.fluxo === "venda") {
    await salvarEstado(ctx, { ...estado, passo: "forma" });
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Forma de pagamento:", [
      [B("Pix", "venda:forma:Pix"), B("Dinheiro", "venda:forma:Dinheiro")],
      [B("Boleto", "venda:forma:Boleto"), B("Cartão", "venda:forma:Cartão")],
      NAV
    ]);
    return;
  }
  if (data.startsWith("venda:forma:") && estado?.fluxo === "venda") {
    const forma = data.slice("venda:forma:".length);
    if (forma === "Boleto") {
      await salvarEstado(ctx, { ...estado, forma, passo: "condicao" });
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Condição do boleto:", [
        [B("30 dias", "venda:cond:30 dias"), B("30/60", "venda:cond:30/60")],
        [B("30/60/90", "venda:cond:30/60/90"), B("À vista", "venda:cond:À vista")],
        NAV
      ]);
    } else {
      const novo: Estado = { ...estado, forma, condicao: "À vista", passo: "resumo" };
      await salvarEstado(ctx, novo);
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Confira:\n\n${resumoVenda(novo)}\n\nCriar a pré-venda?`, [[B("✅ Criar pré-venda", "venda:criar"), B("❌ Cancelar", "menu")]]);
    }
    return;
  }
  if (data.startsWith("venda:cond:") && estado?.fluxo === "venda") {
    const novo: Estado = { ...estado, condicao: data.slice("venda:cond:".length), passo: "resumo" };
    await salvarEstado(ctx, novo);
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Confira:\n\n${resumoVenda(novo)}\n\nCriar a pré-venda?`, [[B("✅ Criar pré-venda", "venda:criar"), B("❌ Cancelar", "menu")]]);
    return;
  }
  if (data === "venda:criar" && estado?.fluxo === "venda") {
    if (!estado.itens.length) { await sendTelegramText(ctx.runtime, ctx.chatId, "Nenhum item na venda — recomece pelo menu."); return; }
    try {
      const pedido = await createSale(ctx.scope, {
        clienteId: estado.clienteId ?? null,
        canal: "BALCAO",
        statusInicial: "AGUARDANDO_PAGAMENTO",
        formaPagamento: estado.forma,
        condicaoPagamento: estado.condicao,
        itens: estado.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.preco }))
      });
      await salvarEstado(ctx, { fluxo: "ia" });
      await sendTelegramBotoes(
        ctx.runtime,
        ctx.chatId,
        `📝 Pré-venda ${pedido.numero} criada — total ${BRL.format(Number(pedido.total))}.\n\nPróximo passo:`,
        botoesPos(pedido.numero, gestor, "AGUARDANDO_PAGAMENTO")
      );
    } catch (e) {
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `❌ Não consegui criar: ${e instanceof Error ? e.message : "erro"}`, [NAV]);
    }
    return;
  }

  // Pós-ações do pedido (GESTOR).
  if (data.startsWith("pos:conf:")) {
    if (!gestor) { await sendTelegramText(ctx.runtime, ctx.chatId, "Confirmação de pedido é ação do gestor."); return; }
    const numero = data.slice("pos:conf:".length);
    const pedido = await prisma.pedidoVenda.findFirst({ where: { numero, ...scopedByTenantCompany(ctx.scope) }, select: { id: true, status: true, formaPagamento: true } });
    if (!pedido) { await sendTelegramText(ctx.runtime, ctx.chatId, `Pedido ${numero} não encontrado.`); return; }
    try {
      if (pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_PAGAMENTO") await confirmSale(ctx.scope, pedido.id);
      const boletoAuto = /boleto/i.test(pedido.formaPagamento ?? "") ? " Boletos das parcelas gerados automaticamente." : "";
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `✔️ Pedido ${numero} confirmado (estoque baixado, financeiro gerado).${boletoAuto}`, botoesPos(numero, gestor, "CONFIRMADO"));
    } catch (e) {
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `❌ ${e instanceof Error ? e.message : "Falha ao confirmar."}`, [NAV]);
    }
    return;
  }
  if (data.startsWith("pos:nfe:") || data.startsWith("pos:nfce:")) {
    if (!gestor) { await sendTelegramText(ctx.runtime, ctx.chatId, "Emissão de nota é ação do gestor."); return; }
    const modelo = data.startsWith("pos:nfce:") ? "NFCE" as const : "NFE" as const;
    const numero = data.slice(modelo === "NFCE" ? "pos:nfce:".length : "pos:nfe:".length);
    const pedido = await prisma.pedidoVenda.findFirst({ where: { numero, ...scopedByTenantCompany(ctx.scope) }, select: { id: true, status: true } });
    if (!pedido) { await sendTelegramText(ctx.runtime, ctx.chatId, `Pedido ${numero} não encontrado.`); return; }
    try {
      if (pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_PAGAMENTO") await confirmSale(ctx.scope, pedido.id);
      const nota = await invoiceSale(ctx.scope, pedido.id, { modelo });
      const pdf = ctx.baseUrl ? `${ctx.baseUrl}/api/erp/fiscal/${nota.id}/pdf` : `/api/erp/fiscal/${nota.id}/pdf`;
      await sendTelegramBotoes(
        ctx.runtime,
        ctx.chatId,
        `🧾 ${modelo === "NFCE" ? "NFC-e" : "NF-e"} nº ${nota.numero} ${nota.status}.\nChave: ${nota.chaveAcesso ?? "—"}\nPDF: ${pdf}`,
        [[B("💳 Boletos do pedido", `pos:bol:${numero}`)], NAV]
      );
    } catch (e) {
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `❌ ${e instanceof Error ? e.message : "Falha ao emitir a nota."}`, [NAV]);
    }
    return;
  }
  if (data.startsWith("pos:bol:")) {
    if (!gestor) { await sendTelegramText(ctx.runtime, ctx.chatId, "Boleto é ação do gestor."); return; }
    const numero = data.slice("pos:bol:".length);
    const r = await emitirBoleto.handler(ctx.scope, { pedidoNumero: numero });
    if (!r.ok) { await sendTelegramBotoes(ctx.runtime, ctx.chatId, `❌ ${r.error}`, botoesPos(numero, gestor)); return; }
    const d = r.data as { emitidos: number; boletos: Array<{ titulo: string; valor: number; vencimento: string; linhaDigitavel: string | null; pdfUrl: string }> };
    const linhas = d.boletos.map((b) => `• ${b.titulo} — ${BRL.format(b.valor)} venc. ${b.vencimento}\n  Linha digitável: ${b.linhaDigitavel ?? "—"}\n  PDF: ${ctx.baseUrl ?? ""}${b.pdfUrl}`);
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, `💳 ${d.emitidos} boleto(s) emitido(s):\n\n${linhas.join("\n\n")}`, [NAV]);
    return;
  }
  if (data.startsWith("ped:")) {
    await mostrarPedido(ctx, data.slice("ped:".length));
    return;
  }

  // Fluxos de consulta.
  if (data === "fluxo:consultar" || data === "fluxo:faturar" || data === "fluxo:boleto") {
    const fluxo = data === "fluxo:consultar" ? "consultar" as const : data === "fluxo:faturar" ? "faturar" as const : "boleto" as const;
    await salvarEstado(ctx, { fluxo, passo: "numero" });
    const recentes = await prisma.pedidoVenda.findMany({
      where: { ...scopedByTenantCompany(ctx.scope) },
      orderBy: { criadoEm: "desc" },
      take: 5,
      select: { numero: true, status: true, total: true }
    });
    const botoes = recentes.map((p) => [B(`${p.numero} · ${p.status} · ${BRL.format(Number(p.total))}`, `ped:${p.numero}`)]);
    const rotulo = fluxo === "consultar" ? "consultar" : fluxo === "faturar" ? "faturar (emitir NF)" : "emitir boletos";
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Digite o número do pedido para ${rotulo} (ex.: PV-000012) — ou escolha um recente:`, [...botoes, NAV]);
    return;
  }
  if (data === "fluxo:os") {
    const r = await consultarOs.handler(ctx.scope, { apenasAbertas: true });
    const d = r.data as { total: number; ordens: Array<{ numero: string; status: string; cliente: string; equipamento: string; tecnico: string | null; previsao: string | null }> };
    const texto = d.total
      ? d.ordens.map((o) => `🔧 ${o.numero} — ${o.status}\n   ${o.cliente} · ${o.equipamento}${o.tecnico ? ` · téc. ${o.tecnico}` : ""}${o.previsao ? ` · prev. ${o.previsao}` : ""}`).join("\n\n")
      : "Nenhuma OS em aberto. 🎉";
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, texto, [NAV]);
    return;
  }
  if (data === "fluxo:produto") {
    await salvarEstado(ctx, { fluxo: "produto", passo: "termo" });
    await sendTelegramText(ctx.runtime, ctx.chatId, "Digite o código (SKU/fabricante) ou parte do nome do produto:");
    return;
  }

  // Callback desconhecido/estado perdido → menu.
  await mostrarMenu(ctx, "Não entendi essa ação — escolha de novo:");
}

// ─── Texto digitado dentro de um fluxo ───────────────────────────────────────

/** Trata o texto quando há fluxo ativo. Retorna false para cair na IA (modo livre). */
export async function handleTelegramTexto(ctx: Ctx, texto: string): Promise<boolean> {
  const t = texto.trim();
  if (/^\/?(menu|start|inicio|começar|comecar)$/i.test(t)) {
    await salvarEstado(ctx, { fluxo: "ia" });
    await mostrarMenu(ctx, "Olá! 👋 O que deseja fazer?");
    return true;
  }

  const estado = (ctx.vinculo.estado ?? null) as Estado | null;
  if (!estado || estado.fluxo === "ia") return false; // modo livre → IA

  if (estado.fluxo === "venda") {
    if (estado.passo === "cliente") {
      const r = await resolverCliente(ctx.scope, { clienteBusca: t });
      if (r.erro) {
        // Ambíguo/não achou: oferece candidatos como botões.
        const digitos = t.replace(/\D/g, "");
        const candidatos = await prisma.cliente.findMany({
          where: {
            ...scopedByTenantCompany(ctx.scope),
            OR: [
              { razaoSocial: { contains: t, mode: "insensitive" } },
              { nomeFantasia: { contains: t, mode: "insensitive" } },
              ...(digitos.length >= 8 ? [{ documento: { contains: digitos } }] : [])
            ]
          },
          select: { id: true, razaoSocial: true, nomeFantasia: true },
          take: 4
        });
        if (!candidatos.length) { await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Nenhum cliente para "${t}". Digite de novo — ou:`, [[B("👤 Consumidor (sem cadastro)", "venda:anonimo")], NAV]); return true; }
        await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Qual destes?", [...candidatos.map((c) => [B(c.nomeFantasia ?? c.razaoSocial, `venda:cli:${c.id}`)]), NAV]);
        return true;
      }
      const cli = r.id ? await prisma.cliente.findUnique({ where: { id: r.id }, select: { razaoSocial: true, nomeFantasia: true } }) : null;
      await salvarEstado(ctx, { ...estado, clienteId: r.id ?? null, clienteNome: cli ? (cli.nomeFantasia ?? cli.razaoSocial) : undefined, passo: "produto" });
      await sendTelegramText(ctx.runtime, ctx.chatId, `Cliente: ${cli ? (cli.nomeFantasia ?? cli.razaoSocial) : "Consumidor"} ✅\n\nQual produto? Digite o código (SKU) ou parte do nome.`);
      return true;
    }
    if (estado.passo === "produto") {
      const achado = await localizarProduto(ctx.scope, t);
      if (achado.erro || !achado.produto) {
        const sugestoes = await searchProducts(ctx.scope, { termo: t, limite: 4 });
        if (!sugestoes.length) { await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Não achei "${t}". Tente outro código ou nome.`, [NAV]); return true; }
        await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Qual destes?", [...sugestoes.map((p) => [B(`${p.sku} · ${p.nome.slice(0, 40)} · ${BRL.format(p.precoVenda)}`, `venda:prod:${p.id}`)]), NAV]);
        return true;
      }
      const p = achado.produto;
      await salvarEstado(ctx, { ...estado, pendente: { produtoId: p.id, sku: p.sku, nome: p.nome, preco: Number(p.precoVenda) }, passo: "quantidade" });
      await sendTelegramText(ctx.runtime, ctx.chatId, `${p.nome} (${p.sku}) — ${BRL.format(Number(p.precoVenda))}\n\nQuantidade?`);
      return true;
    }
    if (estado.passo === "quantidade") {
      const qtd = Number(t.replace(",", "."));
      if (!Number.isFinite(qtd) || qtd <= 0) { await sendTelegramText(ctx.runtime, ctx.chatId, "Quantidade inválida — digite um número (ex.: 4)."); return true; }
      if (!estado.pendente) { await salvarEstado(ctx, { ...estado, passo: "produto" }); await sendTelegramText(ctx.runtime, ctx.chatId, "Qual produto? Digite o código."); return true; }
      const itens = [...estado.itens, { ...estado.pendente, quantidade: qtd }];
      const novo: Estado = { ...estado, itens, pendente: undefined, passo: "mais" };
      await salvarEstado(ctx, novo);
      await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Itens até agora:\n${resumoVenda(novo)}\n\nAdicionar mais itens?`, [[B("➕ Mais itens", "venda:mais"), B("✅ Fechar venda", "venda:fechar")], NAV]);
      return true;
    }
    // Nos passos de botão (mais/forma/condicao/resumo), texto solto reapresenta as opções.
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, "Use os botões acima para continuar — ou:", [NAV]);
    return true;
  }

  if (estado.fluxo === "consultar" && estado.passo === "numero") {
    await mostrarPedido(ctx, t);
    return true;
  }
  if (estado.fluxo === "faturar" && estado.passo === "numero") {
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Emitir nota do pedido ${t.toUpperCase()}:`, [[B("🧾 NF-e (com cliente)", `pos:nfe:${t.toUpperCase()}`), B("🧾 NFC-e (consumidor)", `pos:nfce:${t.toUpperCase()}`)], NAV]);
    return true;
  }
  if (estado.fluxo === "boleto" && estado.passo === "numero") {
    await handleTelegramCallback(ctx, `pos:bol:${t.toUpperCase()}`);
    return true;
  }
  if (estado.fluxo === "produto" && estado.passo === "termo") {
    const lista = await searchProducts(ctx.scope, { termo: t, limite: 8 });
    const texto2 = lista.length
      ? lista.map((p) => `📦 ${p.sku} — ${p.nome}\n   ${BRL.format(p.precoVenda)} / ${p.unidade}`).join("\n\n")
      : `Nenhum produto para "${t}".`;
    await sendTelegramBotoes(ctx.runtime, ctx.chatId, texto2, [NAV]);
    return true;
  }

  return false;
}

async function mostrarPedido(ctx: Ctx, numeroBruto: string) {
  const numero = numeroBruto.trim().toUpperCase();
  const gestor = ctx.vinculo.role === "GESTOR";
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { numero: { contains: numero, mode: "insensitive" }, ...scopedByTenantCompany(ctx.scope) },
    orderBy: { criadoEm: "desc" },
    select: {
      numero: true, status: true, total: true, formaPagamento: true, condicaoPagamento: true, criadoEm: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      itens: { select: { quantidade: true, precoUnitario: true, produto: { select: { nome: true, sku: true } } } },
      notasFiscais: { select: { numero: true, status: true, modelo: true } }
    }
  });
  if (!pedido) { await sendTelegramBotoes(ctx.runtime, ctx.chatId, `Pedido "${numero}" não encontrado.`, [NAV]); return; }
  const itens = pedido.itens.map((i) => `• ${Number(i.quantidade)}× ${i.produto.nome} (${i.produto.sku})`).join("\n");
  const notas = pedido.notasFiscais.map((n) => `🧾 ${n.modelo} nº ${n.numero ?? "—"} — ${n.status}`).join("\n");
  await sendTelegramBotoes(
    ctx.runtime,
    ctx.chatId,
    [
      `📋 ${pedido.numero} — ${pedido.status}`,
      `Cliente: ${pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor"}`,
      itens,
      `Total: ${BRL.format(Number(pedido.total))}${pedido.formaPagamento ? ` · ${pedido.formaPagamento}` : ""}${pedido.condicaoPagamento ? ` · ${pedido.condicaoPagamento}` : ""}`,
      notas
    ].filter(Boolean).join("\n"),
    botoesPos(pedido.numero, gestor, pedido.status)
  );
}
