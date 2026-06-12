import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getPedidoVendaParaRecibo } from "@/domains/sales/application/sale-use-cases";

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Recibo de venda imprimível (80mm, mesma impressora térmica do cupom). O vendedor imprime no
// balcão e o cliente leva ao CAIXA para pagar — o nº da pré-venda identifica o pedido lá.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("caixa");
    const scope = await getDevelopmentTenantScope();
    const { pedido, empresa } = await getPedidoVendaParaRecibo(scope, params.id);
    const clienteNome = pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor não identificado";
    const total = Number(pedido.total);

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo de venda ${esc(pedido.numero)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Courier New", monospace; width: 76mm; margin: 0 auto; padding: 4mm; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .empresa { font-weight: bold; font-size: 13px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .titulo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin: 4px 0; }
  .numero { font-size: 26px; font-weight: bold; letter-spacing: 3px; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.r { text-align: right; white-space: nowrap; }
  .tot { font-size: 15px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; }
  .aviso { font-size: 11px; margin-top: 8px; font-weight: bold; }
  @media print { body { width: auto; } }
</style>
</head>
<body onload="window.print()">
  <div class="center">
    <div class="empresa">${esc(empresa?.nomeFantasia ?? empresa?.razaoSocial)}</div>
    ${empresa?.cnpj ? `<div>CNPJ ${esc(empresa.cnpj)}</div>` : ""}
    <hr />
    <div class="titulo">COMPROVANTE DE VENDA</div>
    <div>Não é documento fiscal</div>
    <div class="numero">${esc(pedido.numero)}</div>
  </div>
  <hr />
  <div>Cliente: ${esc(clienteNome)}</div>
  ${pedido.formaPagamento ? `<div>Pagamento: ${esc(pedido.formaPagamento)}</div>` : ""}
  <div>Emitido em: ${pedido.criadoEm.toLocaleString("pt-BR")}</div>
  <hr />
  <table>
    <thead><tr><td><b>Item</b></td><td class="r"><b>Qtd</b></td><td class="r"><b>Total</b></td></tr></thead>
    <tbody>
      ${pedido.itens
        .map(
          (i) => `<tr><td>${esc(i.produto.nome)}<br/><small>${esc(i.produto.sku)} · ${brl(Number(i.precoUnitario))}</small></td><td class="r">${i.quantidade}</td><td class="r">${brl(Number(i.total))}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>
  <hr />
  <table><tr class="tot"><td>TOTAL</td><td class="r">${brl(total)}</td></tr></table>
  <hr />
  <div class="aviso center">Apresente este recibo no CAIXA para efetuar o pagamento.</div>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recibo não encontrado.";
    return new Response(`<p style="font-family:sans-serif">${message}</p>`, {
      status: authErrorStatus(error, 404),
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
