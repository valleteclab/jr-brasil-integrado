import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getRetiradaParaRecibo } from "@/domains/sales/application/expedicao-use-cases";

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Recibo de retirada imprimível (80mm, mesma impressora térmica do cupom).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { retirada, empresa } = await getRetiradaParaRecibo(scope, params.id);
    const pedido = retirada.pedidoVenda;
    const clienteNome = pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor não identificado";
    const notas = pedido.notasFiscais.map((n) => `${n.modelo === "NFCE" ? "NFC-e" : "NF-e"} ${n.numero ?? ""}`).join(", ");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo de retirada ${esc(retirada.codigo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Courier New", monospace; width: 76mm; margin: 0 auto; padding: 4mm; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .empresa { font-weight: bold; font-size: 13px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .titulo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin: 4px 0; }
  .codigo { font-size: 34px; font-weight: bold; letter-spacing: 6px; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.qtd { width: 36px; }
  .aviso { font-size: 10px; margin-top: 6px; }
  @media print { body { width: auto; } }
</style>
</head>
<body onload="window.print()">
  <div class="center">
    <div class="empresa">${esc(empresa?.nomeFantasia ?? empresa?.razaoSocial)}</div>
    ${empresa?.cnpj ? `<div>CNPJ ${esc(empresa.cnpj)}</div>` : ""}
    <hr />
    <div class="titulo">RECIBO DE RETIRADA</div>
    <div>Apresente na EXPEDIÇÃO para retirar a mercadoria</div>
    <div class="codigo">${esc(retirada.codigo)}</div>
  </div>
  <hr />
  <div>Pedido: <b>${esc(pedido.numero)}</b></div>
  <div>Cliente: ${esc(clienteNome)}</div>
  ${notas ? `<div>Documento fiscal: ${esc(notas)}</div>` : ""}
  <div>Emitido em: ${retirada.criadoEm.toLocaleString("pt-BR")}</div>
  <hr />
  <table>
    ${pedido.itens
      .map((i) => `<tr><td class="qtd">${i.quantidade}x</td><td>${esc(i.produto.nome)} <small>(${esc(i.produto.sku)})</small></td></tr>`)
      .join("")}
  </table>
  <hr />
  <div class="aviso center">Válido para UMA retirada. A expedição confere o código no sistema antes de entregar.</div>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recibo não encontrado.";
    return new Response(`<p style="font-family:sans-serif">${message}</p>`, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
