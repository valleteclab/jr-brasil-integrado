import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Contas a receber EM ABERTO para o agente (chat/WhatsApp) localizar o título a cobrar (boleto/Pix).
 * Filtra por nome/documento do cliente quando informado. Devolve saldo em aberto por título.
 */
export async function listOpenReceivables(
  scope: TenantScope,
  input: { cliente?: string; limite?: number }
) {
  const termo = input.cliente?.trim();
  const titulos = await prisma.contaReceber.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] },
      ...(termo
        ? {
            cliente: {
              OR: [
                { razaoSocial: { contains: termo, mode: "insensitive" } },
                { nomeFantasia: { contains: termo, mode: "insensitive" } },
                { documento: { contains: termo.replace(/\D+/g, "") } }
              ]
            }
          }
        : {})
    },
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      boleto: { select: { status: true, linhaDigitavel: true } },
      pixCobranca: { select: { status: true } }
    },
    orderBy: { vencimento: "asc" },
    take: Math.min(Math.max(Number(input.limite) || 20, 1), 50)
  });

  return titulos.map((t) => {
    const saldo = Math.round(
      (Number(t.valor) + Number(t.juros) + Number(t.multa) - Number(t.descontoBaixa) - Number(t.valorPago)) * 100
    ) / 100;
    return {
      contaReceberId: t.id,
      cliente: t.cliente ? (t.cliente.nomeFantasia ?? t.cliente.razaoSocial) : "Consumidor",
      descricao: t.descricao,
      valorEmAberto: saldo,
      vencimento: t.vencimento.toISOString().slice(0, 10),
      status: t.status,
      jaTemBoleto: Boolean(t.boleto && t.boleto.status !== "ERRO"),
      jaTemPix: Boolean(t.pixCobranca && t.pixCobranca.status === "ATIVA")
    };
  });
}
