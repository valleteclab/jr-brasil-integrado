import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { PresumidoWorkspace } from "@/components/erp/PresumidoWorkspace";
import { apuracaoPresumido, type ApuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { listarObras } from "@/domains/fiscal/presumido/obras-use-cases";
import { trimestreDoMes } from "@/domains/fiscal/presumido/tabelas-presuncao";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

/** Apuração do IRPJ/CSLL das empresas no Lucro Presumido (e estimativa mensal do Lucro Real). */
export default async function PresumidoPage() {
  if (!(await moduloLiberadoNoScope("fiscalHabilitado"))) return <ModuloBloqueado titulo="Fiscal indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId },
    select: { regimeTributario: true }
  });
  const regime = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
  const aplicavel = regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL";

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const trimestre = trimestreDoMes(hoje.getMonth() + 1);

  let inicial: ApuracaoPresumido | null = null;
  let obras: Awaited<ReturnType<typeof listarObras>> = [];
  if (aplicavel) {
    inicial = await apuracaoPresumido(scope, { ano, trimestre }).catch(() => null);
    obras = await listarObras(scope).catch(() => []);
  }

  return (
    <>
      <PageHeader
        eyebrow="Fiscal · Lucro Presumido / Real"
        title="Apuração do IRPJ e da CSLL"
        action={<Button href="/erp/relatorios" variant="light">← Relatórios</Button>}
      >
        <p>
          Receita do trimestre <strong>classificada nota a nota</strong>, com o percentual de presunção e a base legal de
          cada uma. Obra por <strong>empreitada total</strong> entra a 8% (IRPJ) e 12% (CSLL) sobre a receita bruta inteira —
          sem separar material de mão de obra. O sistema ainda confere a classificação contra a retenção do tomador.
        </p>
      </PageHeader>

      {!aplicavel ? (
        <div className="erp-card" style={{ padding: 20 }}>
          Esta empresa está no regime <strong>{regime.replace(/_/g, " ").toLowerCase()}</strong> — esta apuração é do Lucro
          Presumido e do Lucro Real. Para Simples/MEI use o <a href="/erp/fiscal/simples">painel do Simples</a>.
        </div>
      ) : (
        <PresumidoWorkspace inicial={inicial} obrasIniciais={obras} anoInicial={ano} trimestreInicial={trimestre} mesInicial={hoje.getMonth() + 1} />
      )}
    </>
  );
}
