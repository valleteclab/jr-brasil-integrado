import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { checkoutSale, type CreateSaleInput } from "@/domains/sales/application/sale-use-cases";

// Checkout de balcão em um clique: cria + confirma + emite a nota (NFC-e/NF-e).
// Erros de emissão NÃO derrubam a requisição — voltam em `emitErro`, com a venda preservada.
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as CreateSaleInput & { modelo?: "NFE" | "NFCE" };
    const { modelo, ...sale } = body;
    const result = await checkoutSale(scope, sale, { modelo: modelo === "NFE" ? "NFE" : "NFCE" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao finalizar a venda.";
    // Falhas aqui são de criação/confirmação (cliente/itens/estoque), não de emissão.
    const isValidation =
      message.includes("obrigatório") ||
      message.includes("não encontrado") ||
      message.includes("Somente") ||
      message.includes("estoque");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}
