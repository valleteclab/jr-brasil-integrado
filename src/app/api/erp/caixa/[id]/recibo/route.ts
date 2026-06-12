import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getCaixaReciboData } from "@/domains/cashier/application/cashier-use-cases";

function esc(v: string | null | undefined): string {
  return (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Rótulos amigáveis das formas de pagamento (mesmos códigos do PDV/caixa).
const FORMA_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO_DEBITO: "Cartão débito",
  CARTAO_CREDITO: "Cartão crédito",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  CREDIARIO: "Crediário",
  OUTRO: "Outro"
};
const formaLabel = (id: string) => FORMA_LABEL[id] ?? id;

// Espelho do caixa imprimível (80mm, mesma impressora térmica do cupom): leitura "X" com o caixa
// aberto ou recibo de fechamento "Z" quando já fechado. Substitui a antiga Redução Z.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { empresa, caixa, resumo, diferenca } = await getCaixaReciboData(scope, params.id);
    const fechado = caixa.status === "FECHADO";
    const titulo = fechado ? "FECHAMENTO DE CAIXA (Z)" : "LEITURA DE CAIXA (X)";

    const linha = (rotulo: string, valor: string, opts?: { forte?: boolean; neg?: boolean }) =>
      `<tr class="${opts?.forte ? "forte" : ""}"><td>${esc(rotulo)}</td><td class="v${opts?.neg ? " neg" : ""}">${esc(valor)}</td></tr>`;

    // Linhas por forma de pagamento (todas as vendas do turno, não só dinheiro).
    const porForma = resumo.porForma.length
      ? resumo.porForma.map((f) => linha(`  ${formaLabel(f.forma)}`, brl(f.valor))).join("")
      : `<tr><td colspan="2" class="mut">  (sem recebimentos)</td></tr>`;

    const difClasse = diferenca == null ? "" : diferenca === 0 ? "ok" : "neg";
    const difTexto =
      diferenca == null
        ? "—"
        : `${brl(diferenca)} ${diferenca === 0 ? "(conferido)" : diferenca > 0 ? "(sobra)" : "(falta)"}`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(titulo)} ${esc(caixa.operador)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Courier New", monospace; width: 76mm; margin: 0 auto; padding: 4mm; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .empresa { font-weight: bold; font-size: 13px; }
  .titulo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin: 6px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.v { text-align: right; white-space: nowrap; }
  td.v.neg { font-weight: bold; }
  tr.forte td { font-weight: bold; border-top: 1px solid #000; padding-top: 3px; }
  .sec { font-weight: bold; margin: 6px 0 2px; }
  .mut { color: #444; }
  .neg { color: #000; }
  .ok { font-weight: bold; }
  .meta td { font-size: 11px; }
  .rodape { font-size: 10px; margin-top: 8px; }
  @media print { body { width: auto; } }
</style>
</head>
<body onload="window.print()">
  <div class="center">
    <div class="empresa">${esc(empresa?.nomeFantasia ?? empresa?.razaoSocial)}</div>
    ${empresa?.cnpj ? `<div>CNPJ ${esc(empresa.cnpj)}</div>` : ""}
    <div class="titulo">${esc(titulo)}</div>
  </div>
  <hr />
  <table class="meta">
    ${linha("Operador", caixa.operador)}
    ${linha("Abertura", caixa.abertoEm.toLocaleString("pt-BR"))}
    ${linha("Fechamento", fechado && caixa.fechadoEm ? caixa.fechadoEm.toLocaleString("pt-BR") : "— (em aberto)")}
    ${linha("Impresso em", new Date().toLocaleString("pt-BR"))}
  </table>
  <hr />
  <div class="sec">RECEBIMENTOS POR FORMA</div>
  <table>
    ${porForma}
    ${linha("TOTAL VENDAS", `${brl(resumo.totalVendas)}  (${resumo.qtdVendas})`, { forte: true })}
  </table>
  <hr />
  <div class="sec">CONFERÊNCIA DA GAVETA (dinheiro)</div>
  <table>
    ${linha("Fundo de troco", brl(resumo.saldoInicial))}
    ${linha("(+) Suprimentos", brl(resumo.totalSuprimentos))}
    ${linha("(-) Sangrias", brl(resumo.totalSangrias))}
    ${linha("(=) Esperado em dinheiro", brl(resumo.esperadoDinheiro), { forte: true })}
    ${caixa.saldoFinalInformado != null ? linha("Contado na gaveta", brl(caixa.saldoFinalInformado)) : ""}
    ${diferenca != null ? `<tr class="forte"><td>Diferença</td><td class="v ${difClasse}">${esc(difTexto)}</td></tr>` : ""}
  </table>
  ${caixa.observacaoFechamento ? `<hr /><div><b>Obs.:</b> ${esc(caixa.observacaoFechamento)}</div>` : ""}
  <hr />
  <div class="rodape center">Documento gerencial — sem valor fiscal.</div>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Caixa não encontrado.";
    return new Response(`<p style="font-family:sans-serif">${message}</p>`, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
