import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { consultarRetirada, ExpedicaoError } from "@/domains/sales/application/expedicao-use-cases";

// Conferência do recibo na expedição: consulta a retirada pelo código impresso.
export async function GET(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const codigo = new URL(request.url).searchParams.get("codigo") ?? "";
    const r = await consultarRetirada(scope, codigo);
    return NextResponse.json({
      id: r.id,
      codigo: r.codigo,
      status: r.status,
      criadoEm: r.criadoEm.toISOString(),
      entreguePor: r.entreguePor,
      entregueEm: r.entregueEm?.toISOString() ?? null,
      pedido: {
        id: r.pedidoVenda.id,
        numero: r.pedidoVenda.numero,
        total: Number(r.pedidoVenda.total),
        clienteNome: r.pedidoVenda.cliente
          ? (r.pedidoVenda.cliente.nomeFantasia ?? r.pedidoVenda.cliente.razaoSocial)
          : "Consumidor não identificado",
        notas: r.pedidoVenda.notasFiscais.map((n) => `${n.modelo === "NFCE" ? "NFC-e" : "NF-e"} ${n.numero ?? ""}`),
        itens: r.pedidoVenda.itens.map((i) => ({
          produtoNome: i.produto.nome,
          produtoSku: i.produto.sku,
          quantidade: i.quantidade
        }))
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o recibo.";
    return NextResponse.json({ error: message }, { status: error instanceof ExpedicaoError ? 400 : 500 });
  }
}
