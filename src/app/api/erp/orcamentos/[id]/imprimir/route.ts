import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getOrcamentoParaImpressao } from "@/domains/sales-quote/application/quote-use-cases";

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const dataBR = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR") : "—");

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ANALISE: "Em análise",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  APROVADO: "Aprovado",
  EXPIRADO: "Expirado",
  REJEITADO: "Rejeitado",
  CONVERTIDO: "Convertido em pedido"
};

// Documento de orçamento imprimível em A4 (logo + dados da empresa, cliente, itens, totais,
// validade e condições). Abre com window.print() para imprimir ou salvar como PDF.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { orcamento, empresa } = await getOrcamentoParaImpressao(scope, params.id);

    const accent = (empresa?.corDestaque && /^#?[0-9a-fA-F]{6}$/.test(empresa.corDestaque))
      ? (empresa.corDestaque.startsWith("#") ? empresa.corDestaque : `#${empresa.corDestaque}`)
      : "#1f2937";

    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa";
    const endEmp = [
      [empresa?.enderecoLogradouro, empresa?.enderecoNumero].filter(Boolean).join(", "),
      empresa?.enderecoBairro,
      [empresa?.enderecoCidade, empresa?.enderecoUf].filter(Boolean).join(" - "),
      empresa?.enderecoCep ? `CEP ${empresa.enderecoCep}` : ""
    ].filter(Boolean).join(" · ");
    const contatoEmp = [empresa?.telefone, empresa?.email].filter(Boolean).join(" · ");

    const cli = orcamento.cliente;
    const cliNome = cli.nomeFantasia ? `${cli.nomeFantasia} (${cli.razaoSocial})` : cli.razaoSocial;
    const cliEnd = cli.enderecos[0];
    const endCli = cliEnd
      ? [
          [cliEnd.logradouro, cliEnd.numero].filter(Boolean).join(", "),
          cliEnd.bairro,
          [cliEnd.cidade, cliEnd.uf].filter(Boolean).join(" - "),
          cliEnd.cep ? `CEP ${cliEnd.cep}` : ""
        ].filter(Boolean).join(" · ")
      : "";
    const contato = cli.contatos[0];
    const contatoCli = contato ? [contato.nome, contato.telefone, contato.email].filter(Boolean).join(" · ") : "";

    const subtotal = Number(orcamento.subtotal);
    const desconto = Number(orcamento.desconto);
    const total = Number(orcamento.total);

    const linhasItens = orcamento.itens
      .map(
        (i, idx) => `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(i.produto.nome)}<span class="sku">${esc(i.produto.sku)}</span></td>
        <td class="c">${i.quantidade} ${esc(i.produto.unidade || "un")}</td>
        <td class="r">${brl(Number(i.precoUnitario))}</td>
        <td class="r">${brl(Number(i.total))}</td>
      </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Orçamento ${esc(orcamento.numero)}</title>
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
  .totais table { min-width: 250px; }
  .totais td { padding: 4px 8px; font-size: 13px; }
  .totais td.r { text-align: right; }
  .totais tr.grand td { font-size: 16px; font-weight: 700; color: ${accent}; border-top: 2px solid ${accent}; padding-top: 7px; }
  .cond { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .cond .box { background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; padding: 10px 12px; }
  .cond .box .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
  .cond .box .val { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .obs { margin-top: 14px; font-size: 12px; color: #374151; white-space: pre-wrap; }
  .rodape { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { width: auto; min-height: auto; padding: 0; } }
</style>
</head>
<body onload="window.print()">
  <div class="page">
    <div class="head">
      <div>
        ${empresa?.logoSistema ? `<img class="logo" src="${esc(empresa.logoSistema)}" alt="${esc(empresaNome)}" />` : `<div class="emp-nome">${esc(empresaNome)}</div>`}
        <div class="emp-info">
          ${empresa?.logoSistema ? `<div style="font-weight:600;color:#1f2937">${esc(empresa?.razaoSocial)}</div>` : ""}
          ${empresa?.cnpj ? `CNPJ ${esc(empresa.cnpj)}${empresa?.inscricaoEstadual ? ` · IE ${esc(empresa.inscricaoEstadual)}` : ""}<br/>` : ""}
          ${endEmp ? `${esc(endEmp)}<br/>` : ""}
          ${contatoEmp ? esc(contatoEmp) : ""}
        </div>
      </div>
      <div class="doc-tit">
        <h1>ORÇAMENTO</h1>
        <div class="num">Nº ${esc(orcamento.numero)}</div>
        <div class="meta">
          <span class="badge">${esc(STATUS_LABEL[orcamento.status] ?? orcamento.status)}</span><br/>
          Emissão: ${dataBR(orcamento.criadoEm)}<br/>
          Válido até: <b>${dataBR(orcamento.validoAte)}</b>
        </div>
      </div>
    </div>

    <div class="bloco">
      <h3>Cliente</h3>
      <div class="nome">${esc(cliNome)}</div>
      <div class="sub">
        ${cli.documento ? `Documento: ${esc(cli.documento)}${cli.inscricaoEstadual ? ` · IE ${esc(cli.inscricaoEstadual)}` : ""}<br/>` : ""}
        ${endCli ? `${esc(endCli)}<br/>` : ""}
        ${contatoCli ? esc(contatoCli) : ""}
      </div>
    </div>

    <table class="itens">
      <thead>
        <tr><th class="c" style="width:32px">#</th><th>Produto</th><th class="c" style="width:90px">Qtd</th><th class="r" style="width:110px">Preço un.</th><th class="r" style="width:120px">Total</th></tr>
      </thead>
      <tbody>${linhasItens}</tbody>
    </table>

    <div class="totais">
      <table>
        <tr><td>Subtotal</td><td class="r">${brl(subtotal)}</td></tr>
        ${desconto > 0 ? `<tr><td>Desconto</td><td class="r">- ${brl(desconto)}</td></tr>` : ""}
        <tr class="grand"><td>TOTAL</td><td class="r">${brl(total)}</td></tr>
      </table>
    </div>

    <div class="cond">
      <div class="box"><div class="lbl">Condição de pagamento</div><div class="val">${esc(orcamento.condicaoPagamento || "A combinar")}</div></div>
      <div class="box"><div class="lbl">Vendedor</div><div class="val">${esc(orcamento.vendedor || "—")}</div></div>
    </div>

    ${orcamento.observacaoVendedor ? `<div class="obs"><b>Observações:</b> ${esc(orcamento.observacaoVendedor)}</div>` : ""}

    <div class="rodape">
      Este orçamento é válido até ${dataBR(orcamento.validoAte)}. Valores e disponibilidade sujeitos a alteração após o vencimento.
    </div>
  </div>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orçamento não encontrado.";
    return new Response(`<p style="font-family:sans-serif">${message}</p>`, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
