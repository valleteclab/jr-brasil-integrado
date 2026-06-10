import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { SpedConfigForm } from "@/components/erp/sped/SpedConfigForm";
import { requireModulo } from "@/lib/auth/session";
import {
  getSpedConfiguracao,
  isSpedHabilitado,
  type SpedConfiguracaoView
} from "@/domains/fiscal/application/sped-use-cases";

export const dynamic = "force-dynamic";

export default async function SpedConfiguracaoPage() {
  const session = await requireModulo("sped-fiscal");
  if (!session.scope) throw new Error("Sessão sem empresa selecionada.");

  const habilitado = await isSpedHabilitado(session.scope.tenantId);
  if (!habilitado) {
    return (
      <>
        <PageHeader eyebrow="Financeiro & Fiscal" title="SPED Fiscal" />
        <div className="card" style={{ padding: 24, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Módulo não liberado</h3>
          <p style={{ color: "var(--jr-slate)" }}>
            O SPED Fiscal é um módulo adicional liberado pela plataforma. Fale com o suporte.
          </p>
        </div>
      </>
    );
  }

  let configuracao: SpedConfiguracaoView | null = null;
  let loadError = "";
  try {
    configuracao = await getSpedConfiguracao(session.scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a configuração.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal"
        title="Configurações do SPED Fiscal"
        action={<Button href="/erp/sped-fiscal" variant="light">← Voltar</Button>}
      >
        <p>Perfil do arquivo, contador responsável (registro 0100) e parâmetros da guia de ICMS.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error" style={{ marginBottom: 16 }}>
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {configuracao && <SpedConfigForm configuracao={configuracao} />}
    </>
  );
}
