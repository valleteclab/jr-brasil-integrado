import { PageHeader } from "@/components/shared/PageHeader";
import { FinalidadeRulesCrud } from "@/components/erp/FinalidadeRulesCrud";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function RegrasFinalidadePage() {
  let fornecedores: Array<{ id: string; nome: string }> = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const rows = await prisma.fornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true }
    });
    fornecedores = rows.map((row) => ({ id: row.id, nome: row.razaoSocial }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os fornecedores.";
  }

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Regras de finalidade (entrada)">
        <p>
          Mapeie NCM, CFOP de origem ou fornecedor para a finalidade do item (revenda, uso/consumo,
          imobilizado, industrialização). Na importação da NF-e, a finalidade define o CFOP de entrada,
          o crédito de impostos e se o item movimenta estoque.
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <FinalidadeRulesCrud fornecedores={fornecedores} />
    </>
  );
}
