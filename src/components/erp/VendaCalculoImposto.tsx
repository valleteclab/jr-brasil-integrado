"use client";

import { CalculoImpostoPanel } from "./EspelhoFiscal";

/**
 * Painel "Cálculo de imposto" (formato Bling) embutido no detalhe do pedido de venda.
 * Wrapper client: a página é server component e o painel precisa de props função.
 * Calcula uma vez ao montar (itens do pedido são fixos), via /api/erp/vendas/[id]/preview-nota.
 */
export function VendaCalculoImposto({ id, modelo = "NFE" }: { id: string; modelo?: "NFE" | "NFCE" }) {
  return (
    <CalculoImpostoPanel
      endpoint={`/api/erp/vendas/${id}/preview-nota`}
      buildBody={() => ({ modelo })}
      deps={[id, modelo]}
    />
  );
}
