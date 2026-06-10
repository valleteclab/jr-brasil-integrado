import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { CiapManager } from "@/components/erp/sped/CiapManager";
import { requireModulo } from "@/lib/auth/session";
import { isSpedHabilitado, listCiapBens, type CiapBemView } from "@/domains/fiscal/application/sped-use-cases";

export const dynamic = "force-dynamic";

export default async function CiapPage() {
  const session = await requireModulo("sped-fiscal");
  if (!session.scope) throw new Error("Sessão sem empresa selecionada.");

  if (!(await isSpedHabilitado(session.scope.tenantId))) {
    return (
      <>
        <PageHeader eyebrow="Financeiro & Fiscal" title="CIAP" />
        <div className="card" style={{ padding: 24, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Módulo não liberado</h3>
          <p style={{ color: "var(--jr-slate)" }}>O SPED Fiscal é um módulo adicional liberado pela plataforma.</p>
        </div>
      </>
    );
  }

  let bens: CiapBemView[] = [];
  let loadError = "";
  try {
    bens = await listCiapBens(session.scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os bens do CIAP.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal · SPED Fiscal"
        title="CIAP — crédito do ativo imobilizado (bloco G)"
        action={<Button href="/erp/sped-fiscal" variant="light">← Voltar</Button>}
      >
        <p>
          O ICMS de bens do ativo credita em até 48 parcelas mensais × fator de saídas tributadas
          (LC 87/96). Os bens abaixo entram no bloco G de cada SPED gerado; o crédito mensal vai à
          apuração via E111 (configure o código de ajuste da sua UF nas Configurações do SPED).
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error" style={{ marginBottom: 16 }}>
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      <CiapManager bens={bens} />
    </>
  );
}
