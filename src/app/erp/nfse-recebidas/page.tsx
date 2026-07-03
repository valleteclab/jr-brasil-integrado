import { PageHeader } from "@/components/shared/PageHeader";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listNfseDistributionDocuments } from "@/lib/services/nfse-distribution";
import { listContasFinanceiras, listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";
import { listClassificacoes } from "@/domains/finance/application/classificacao-use-cases";
import { prisma } from "@/lib/db/prisma";
import { NfseDistribuicaoList } from "@/components/erp/NfseDistribuicaoList";

export const dynamic = "force-dynamic";

export default async function NfseRecebidasPage() {
  let documents: Awaited<ReturnType<typeof listNfseDistributionDocuments>> = [];
  let ultimaSync: string | null = null;
  let formasPagamento: { id: string; nome: string; tipo?: string; contaBancariaId?: string | null }[] = [];
  let contas: { id: string; nome: string; tipo: string; banco?: string | null }[] = [];
  let classificacoes: { id: string; nome: string; grupo: string }[] = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [docs, cfg, formas, contasFin, classifs] = await Promise.all([
      listNfseDistributionDocuments(scope),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { nfseDistSyncEm: true } }),
      listFormasPagamentoAtivas(scope),
      listContasFinanceiras(scope),
      listClassificacoes(scope)
    ]);
    documents = docs;
    ultimaSync = cfg?.nfseDistSyncEm?.toISOString() ?? null;
    formasPagamento = formas;
    contas = contasFin.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, banco: c.banco }));
    classificacoes = classifs.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as NFS-e.";
  }

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="NFS-e do Ambiente Nacional">
        <p>NFS-e do seu CNPJ sincronizadas direto do Sistema Nacional — as que você emitiu e as recebidas como tomador.</p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <NfseDistribuicaoList
        documents={documents}
        ultimaSync={ultimaSync}
        formasPagamento={formasPagamento}
        contas={contas}
        classificacoes={classificacoes}
      />
    </>
  );
}
