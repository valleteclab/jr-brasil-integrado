import { PageHeader } from "@/components/shared/PageHeader";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listNfseDistributionDocuments } from "@/lib/services/nfse-distribution";
import { prisma } from "@/lib/db/prisma";
import { NfseDistribuicaoList } from "@/components/erp/NfseDistribuicaoList";

export const dynamic = "force-dynamic";

export default async function NfseRecebidasPage() {
  let documents: Awaited<ReturnType<typeof listNfseDistributionDocuments>> = [];
  let ultimaSync: string | null = null;
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [docs, cfg] = await Promise.all([
      listNfseDistributionDocuments(scope),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { nfseDistSyncEm: true } })
    ]);
    documents = docs;
    ultimaSync = cfg?.nfseDistSyncEm?.toISOString() ?? null;
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
      <NfseDistribuicaoList documents={documents} ultimaSync={ultimaSync} />
    </>
  );
}
