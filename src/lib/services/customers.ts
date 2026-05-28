import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type CustomerSummary = {
  id: string;
  name: string;
  document: string;
  status: string;
  segment?: string;
  creditLimit: string;
  creditUsed: string;
  paymentTerms?: string;
};

export async function listCustomerSummaries(): Promise<CustomerSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar clientes.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const customers = await prisma.cliente.findMany({
      where: scopedByTenantCompany(scope),
      orderBy: { razaoSocial: "asc" },
      take: 50
    });

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.nomeFantasia ?? customer.razaoSocial,
      document: customer.documento,
      status: customer.status,
      segment: customer.segmento ?? undefined,
      creditLimit: formatBrl(Number(customer.limiteCredito)),
      creditUsed: formatBrl(Number(customer.creditoUsado)),
      paymentTerms: customer.condicaoPagamento ?? undefined
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar clientes: ${message}`);
  }
}
