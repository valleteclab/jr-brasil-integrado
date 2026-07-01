import { PageHeader } from "@/components/shared/PageHeader";
import { ContasFinanceirasManager } from "@/components/erp/ContasFinanceirasManager";
import { SicoobCobrancaConfig } from "@/components/erp/SicoobCobrancaConfig";
import { listContasFinanceiras } from "@/domains/finance/application/payment-config-use-cases";
import { listConfigCobranca, type ConfigCobrancaConta } from "@/domains/finance/application/boleto-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function ContasFinanceirasPage() {
  let contas: Array<{ id: string; nome: string; tipo: string; banco: string; agencia: string; conta: string; chavePix: string; tipoChavePix: string; saldoInicial: number; ativo: boolean }> = [];
  let configCobranca: ConfigCobrancaConta[] = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const rows = await listContasFinanceiras(scope);
    configCobranca = await listConfigCobranca(scope);
    contas = rows.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      banco: c.banco ?? "",
      agencia: c.agencia ?? "",
      conta: c.conta ?? "",
      chavePix: c.chavePix ?? "",
      tipoChavePix: c.tipoChavePix ?? "",
      saldoInicial: Number(c.saldoInicial),
      ativo: c.ativo
    }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as contas financeiras.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Contas financeiras">
        <p>
          Cadastre as contas de onde a empresa <strong>paga</strong> suas obrigações: caixa, contas
          bancárias e cartões. Vinculadas às formas de pagamento, permitem relatórios de quanto saiu
          por conta nas contas a pagar.
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <ContasFinanceirasManager initial={contas} />
      {!loadError && <SicoobCobrancaConfig contas={configCobranca} />}
    </>
  );
}
