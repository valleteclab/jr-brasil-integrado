import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getPedidoVendaParaRecibo } from "@/domains/sales/application/sale-use-cases";

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const num = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(v);

type ReciboData = Awaited<ReturnType<typeof getPedidoVendaParaRecibo>>;

// Status do pedido define a "intenção" do recibo: pré-venda (cliente ainda paga no caixa) ou
// comprovante de venda já finalizada (paga + sem nota, ou paga + com nota — ambos viram comprovante).
function classificarPedido(status: string) {
  if (status === "RASCUNHO" || status === "AGUARDANDO_PAGAMENTO") {
    return { tipo: "PRE_VENDA" as const, titulo: "COMPROVANTE DE PRÉ-VENDA", aviso: "Apresente este recibo no CAIXA para efetuar o pagamento." };
  }
  if (status === "CANCELADO") {
    return { tipo: "CANCELADO" as const, titulo: "COMPROVANTE DE VENDA", aviso: "VENDA CANCELADA — comprovante sem valor." };
  }
  return { tipo: "FINALIZADO" as const, titulo: "COMPROVANTE DE VENDA", aviso: "Documento sem valor fiscal — comprovante de venda." };
}

// Recibo térmico 80mm (impressora de cupom).
function recibo80mm({ pedido, empresa }: ReciboData): string {
  const clienteNome = pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor não identificado";
  const total = Number(pedido.total);
  const subtotal = Number(pedido.subtotal);
  const desconto = Number(pedido.desconto);
  const frete = Number(pedido.frete);
  const c = classificarPedido(pedido.status);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Recibo de venda ${esc(pedido.numero)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Courier New", monospace; width: 76mm; margin: 0 auto; padding: 4mm; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .empresa { font-weight: bold; font-size: 13px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .titulo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin: 4px 0; }
  .numero { font-size: 22px; font-weight: bold; letter-spacing: 3px; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; } td.r { text-align: right; white-space: nowrap; }
  .tot { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; }
  .aviso { font-size: 11px; margin-top: 8px; font-weight: bold; }
  @media print { body { width: auto; } }
</style></head>
<body onload="window.print()">
  <div class="center">
    <div class="empresa">${esc(empresa?.nomeFantasia ?? empresa?.razaoSocial)}</div>
    ${empresa?.cnpj ? `<div>CNPJ ${esc(empresa.cnpj)}</div>` : ""}
    <hr /><div class="titulo">${c.titulo}</div><div>Não é documento fiscal</div>
    <div class="numero">${esc(pedido.numero)}</div>
  </div>
  <hr />
  <div>Cliente: ${esc(clienteNome)}</div>
  ${pedido.formaPagamento ? `<div>Pagamento: ${esc(pedido.formaPagamento)}</div>` : ""}
  ${(pedido.vendedorRef?.nome ?? pedido.vendedor) ? `<div>Vendedor: ${esc((pedido.vendedorRef?.nome ?? pedido.vendedor))}</div>` : ""}
  <div>Emitido em: ${pedido.criadoEm.toLocaleString("pt-BR")}</div>
  <hr />
  <table><thead><tr><td><b>Item</b></td><td class="r"><b>Qtd</b></td><td class="r"><b>Total</b></td></tr></thead><tbody>
    ${pedido.itens.map((i) => `<tr><td>${esc(i.produto.nome)}<br/><small>${esc(i.produto.sku)} · ${brl(Number(i.precoUnitario))}/${esc(i.produto.unidade || "un")}</small></td><td class="r">${num(Number(i.quantidade))}</td><td class="r">${brl(Number(i.total))}</td></tr>`).join("")}
  </tbody></table>
  <hr />
  <table>
    ${subtotal && subtotal !== total ? `<tr><td>Subtotal</td><td class="r">${brl(subtotal)}</td></tr>` : ""}
    ${desconto > 0 ? `<tr><td>Desconto</td><td class="r">- ${brl(desconto)}</td></tr>` : ""}
    ${frete > 0 ? `<tr><td>Frete</td><td class="r">${brl(frete)}</td></tr>` : ""}
    <tr class="tot"><td>TOTAL</td><td class="r">${brl(total)}</td></tr>
  </table>
  <hr /><div class="aviso center">${esc(c.aviso)}</div>
</body></html>`;
}

// Recibo A4 (impressora comum / salvar em PDF) com logo, dados completos e estilo do orçamento.
function reciboA4({ pedido, empresa }: ReciboData): string {
  const accent = empresa?.corDestaque && /^#?[0-9a-fA-F]{6}$/.test(empresa.corDestaque)
    ? (empresa.corDestaque.startsWith("#") ? empresa.corDestaque : `#${empresa.corDestaque}`)
    : "#1f2937";
  const empNome = empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa";
  const endEmp = [
    [empresa?.enderecoLogradouro, empresa?.enderecoNumero].filter(Boolean).join(", "),
    empresa?.enderecoBairro,
    [empresa?.enderecoCidade, empresa?.enderecoUf].filter(Boolean).join(" - "),
    empresa?.enderecoCep ? `CEP ${empresa.enderecoCep}` : ""
  ].filter(Boolean).join(" · ");
  const contatoEmp = [empresa?.telefone, empresa?.email].filter(Boolean).join(" · ");

  const cli = pedido.cliente;
  const cliNome = cli ? (cli.nomeFantasia ? `${cli.nomeFantasia} (${cli.razaoSocial})` : cli.razaoSocial) : "Consumidor não identificado";
  const cliEnd = cli?.enderecos.find((e) => e.padrao) ?? cli?.enderecos[0] ?? null;
  const endCli = cliEnd
    ? [
        [cliEnd.logradouro, cliEnd.numero].filter(Boolean).join(", "),
        cliEnd.bairro,
        [cliEnd.cidade, cliEnd.uf].filter(Boolean).join(" - "),
        cliEnd.cep ? `CEP ${cliEnd.cep}` : ""
      ].filter(Boolean).join(" · ")
    : "";
  const cliContato = cli?.contatos.find((co) => co.principal) ?? cli?.contatos[0] ?? null;
  const contatoCli = cliContato ? [cliContato.nome, cliContato.telefone, cliContato.email].filter(Boolean).join(" · ") : "";

  const subtotal = Number(pedido.subtotal);
  const desconto = Number(pedido.desconto);
  const frete = Number(pedido.frete);
  const total = Number(pedido.total);
  const c = classificarPedido(pedido.status);

  const linhasItens = pedido.itens
    .map((i, idx) => `<tr>
      <td class="c">${idx + 1}</td>
      <td>${esc(i.produto.nome)}<span class="sku">${esc(i.produto.sku)}</span></td>
      <td class="c">${num(Number(i.quantidade))} ${esc(i.produto.unidade || "un")}</td>
      <td class="r">${brl(Number(i.precoUnitario))}</td>
      <td class="r">${brl(Number(i.total))}</td>
    </tr>`)
    .join("");

  const avisoBox = c.tipo === "PRE_VENDA"
    ? `<div class="aviso warn">⚠ ${esc(c.aviso)}</div>`
    : c.tipo === "CANCELADO"
      ? `<div class="aviso danger">⊘ ${esc(c.aviso)}</div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Recibo ${esc(pedido.numero)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; font-size: 13px; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 14mm 18mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid ${accent}; padding-bottom: 12px; }
  .head .logo { max-width: 200px; max-height: 80px; object-fit: contain; }
  .emp-nome { font-size: 18px; font-weight: 700; color: ${accent}; }
  .emp-info { font-size: 11px; color: #4b5563; margin-top: 4px; line-height: 1.5; max-width: 320px; }
  .doc-tit { text-align: right; }
  .doc-tit h1 { font-size: 22px; color: ${accent}; letter-spacing: 1px; }
  .doc-tit .num { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .doc-tit .meta { font-size: 11px; color: #4b5563; margin-top: 6px; line-height: 1.6; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${accent}1a; color: ${accent}; }
  .bloco { margin-top: 16px; }
  .bloco h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: ${accent}; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 6px; }
  .bloco .nome { font-weight: 600; font-size: 14px; }
  .bloco .sub { font-size: 11px; color: #4b5563; margin-top: 2px; line-height: 1.5; }
  table.itens { width: 100%; border-collapse: collapse; margin-top: 18px; }
  table.itens thead th { background: ${accent}; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; padding: 7px 8px; text-align: left; }
  table.itens thead th.c { text-align: center; } table.itens thead th.r { text-align: right; }
  table.itens tbody td { padding: 7px 8px; border-bottom: 1px solid #eef0f2; vertical-align: top; }
  table.itens td.c { text-align: center; } table.itens td.r { text-align: right; white-space: nowrap; }
  table.itens tbody tr:nth-child(even) { background: #fafafa; }
  .sku { display: block; font-size: 10px; color: #9ca3af; }
  .totais { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totais table { min-width: 280px; }
  .totais td { padding: 4px 8px; font-size: 13px; } .totais td.r { text-align: right; }
  .totais tr.grand td { font-size: 16px; font-weight: 700; color: ${accent}; border-top: 2px solid ${accent}; padding-top: 7px; }
  .cond { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cond .box { background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; padding: 10px 12px; }
  .cond .box .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
  .cond .box .val { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .obs { margin-top: 14px; font-size: 12px; color: #374151; white-space: pre-wrap; }
  .assinatura { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .assinatura .linha { border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; font-size: 11px; color: #6b7280; }
  .aviso { margin-top: 20px; padding: 12px; border-radius: 8px; text-align: center; font-weight: 600; }
  .aviso.warn { border: 1px dashed ${accent}; color: ${accent}; }
  .aviso.danger { border: 1px solid #b91c1c; color: #b91c1c; background: #fef2f2; }
  .rodape { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { width: auto; min-height: auto; padding: 0; } }
</style></head>
<body onload="window.print()">
  <div class="page">
    <div class="head">
      <div>
        ${empresa?.logoSistema ? `<img class="logo" src="${esc(empresa.logoSistema)}" alt="${esc(empNome)}" />` : `<div class="emp-nome">${esc(empNome)}</div>`}
        <div class="emp-info">
          ${empresa?.logoSistema ? `<div style="font-weight:600;color:#1f2937">${esc(empresa?.razaoSocial)}</div>` : ""}
          ${empresa?.cnpj ? `CNPJ ${esc(empresa.cnpj)}${empresa?.inscricaoEstadual ? ` · IE ${esc(empresa.inscricaoEstadual)}` : ""}<br/>` : ""}
          ${endEmp ? `${esc(endEmp)}<br/>` : ""}
          ${contatoEmp ? esc(contatoEmp) : ""}
        </div>
      </div>
      <div class="doc-tit">
        <h1>${esc(c.titulo)}</h1>
        <div class="num">Nº ${esc(pedido.numero)}</div>
        <div class="meta"><span class="badge">Não é documento fiscal</span><br/>Emissão: ${pedido.criadoEm.toLocaleString("pt-BR")}</div>
      </div>
    </div>

    <div class="bloco">
      <h3>Cliente</h3>
      <div class="nome">${esc(cliNome)}</div>
      <div class="sub">
        ${cli?.documento ? `Documento: ${esc(cli.documento)}${cli?.inscricaoEstadual ? ` · IE ${esc(cli.inscricaoEstadual)}` : ""}<br/>` : ""}
        ${endCli ? `${esc(endCli)}<br/>` : ""}
        ${contatoCli ? esc(contatoCli) : ""}
      </div>
    </div>

    <table class="itens">
      <thead><tr><th class="c" style="width:32px">#</th><th>Produto</th><th class="c" style="width:90px">Qtd</th><th class="r" style="width:110px">Preço un.</th><th class="r" style="width:120px">Total</th></tr></thead>
      <tbody>${linhasItens}</tbody>
    </table>

    <div class="totais">
      <table>
        ${subtotal && Math.abs(subtotal - total) > 0.005 ? `<tr><td>Subtotal</td><td class="r">${brl(subtotal)}</td></tr>` : ""}
        ${desconto > 0 ? `<tr><td>Desconto</td><td class="r">- ${brl(desconto)}</td></tr>` : ""}
        ${frete > 0 ? `<tr><td>Frete</td><td class="r">${brl(frete)}</td></tr>` : ""}
        <tr class="grand"><td>TOTAL</td><td class="r">${brl(total)}</td></tr>
      </table>
    </div>

    <div class="cond">
      ${pedido.formaPagamento ? `<div class="box"><div class="lbl">Forma de pagamento</div><div class="val">${esc(pedido.formaPagamento)}</div></div>` : ""}
      ${(pedido.vendedorRef?.nome ?? pedido.vendedor) ? `<div class="box"><div class="lbl">Vendedor</div><div class="val">${esc((pedido.vendedorRef?.nome ?? pedido.vendedor))}</div></div>` : ""}
    </div>

    ${pedido.observacoes ? `<div class="obs"><b>Observações:</b> ${esc(pedido.observacoes)}</div>` : ""}

    ${avisoBox}

    ${c.tipo === "FINALIZADO" ? `
    <div class="assinatura">
      <div class="linha">${esc(empNome)}</div>
      <div class="linha">${esc(cliNome)}</div>
    </div>` : ""}

    <div class="rodape">Documento sem valor fiscal — comprovante de venda.</div>
  </div>
</body></html>`;
}

// Recibo de venda imprimível. ?formato=a4 → A4 (impressora comum/PDF); padrão → 80mm térmico.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("caixa");
    const scope = await getDevelopmentTenantScope();
    const data = await getPedidoVendaParaRecibo(scope, params.id);
    const formato = new URL(request.url).searchParams.get("formato");
    const html = formato === "a4" ? reciboA4(data) : recibo80mm(data);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recibo não encontrado.";
    return new Response(`<p style="font-family:sans-serif">${message}</p>`, {
      status: authErrorStatus(error, 404),
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
