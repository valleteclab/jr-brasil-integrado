import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { SimplesWorkspace } from "@/components/erp/SimplesWorkspace";
import { apuracaoSimples, type ApuracaoSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function SimplesPage() {
  if (!(await moduloLiberadoNoScope("fiscalHabilitado"))) return <ModuloBloqueado titulo="Fiscal indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId },
    select: { regimeTributario: true, simplesAnexo: true, simplesFolhaMensal: true }
  });

  const regime = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
  const ehSimplesOuMei = ["SIMPLES_NACIONAL", "MEI", "SIMPLES_EXCESSO_SUBLIMITE"].includes(regime);

  let inicial: ApuracaoSimples | null = null;
  if (ehSimplesOuMei) {
    const hoje = new Date();
    inicial = await apuracaoSimples(scope, { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() }).catch(() => null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Fiscal · Simples Nacional"
        title={regime === "MEI" ? "Painel do MEI" : "Apuração do Simples Nacional"}
        action={<Button href="/erp/relatorios" variant="light">← Relatórios</Button>}
      >
        <p>
          DAS estimado pela LC 123 com <strong>segregação de receitas</strong> — produtos monofásicos
          (PIS/COFINS pagos pela indústria) e com ICMS-ST saem das parcelas correspondentes do DAS.
          É a conferência de que o PGDAS-D está aproveitando a economia. MEI: acompanhamento do limite anual.
        </p>
      </PageHeader>
      {!ehSimplesOuMei ? (
        <div className="erp-card" style={{ padding: 20 }}>
          Esta empresa está no regime <strong>{regime.replace(/_/g, " ").toLowerCase()}</strong> — a apuração do
          Simples não se aplica. Use a Apuração de impostos em Relatórios (débito/crédito por tributo).
        </div>
      ) : (
        <SimplesWorkspace
          inicial={inicial}
          anexoSalvo={empresa?.simplesAnexo ?? null}
          folhaSalva={empresa?.simplesFolhaMensal != null ? Number(empresa.simplesFolhaMensal) : null}
        />
      )}
    </>
  );
}
