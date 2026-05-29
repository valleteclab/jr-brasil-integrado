import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/shared/Button";
import { InventoryCount } from "@/components/erp/InventoryCount";
import { getInventoryDetail } from "@/lib/services/stock";
import type { InventoryDetail } from "@/lib/services/stock";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
};

export default async function InventarioDetailPage({ params }: Props) {
  let inventory: InventoryDetail | null = null;
  let loadError = "";

  try {
    inventory = await getInventoryDetail(params.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o inventário.";
  }

  if (!inventory && !loadError) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title={inventory ? `Inventário ${inventory.numero}` : "Inventário"}
        action={<Button href="/erp/estoque" variant="light">← Voltar ao estoque</Button>}
      >
        {inventory && (
          <p>
            Depósito: <strong>{inventory.depositoNome}</strong>
            {" · "}
            <StatusBadge tone={inventory.statusTone}>{inventory.statusLabel}</StatusBadge>
            {inventory.iniciadoEm && ` · Iniciado ${inventory.iniciadoEm}`}
            {inventory.finalizadoEm && ` · Finalizado ${inventory.finalizadoEm}`}
            {inventory.descricao && ` · ${inventory.descricao}`}
          </p>
        )}
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {inventory && <InventoryCount inventory={inventory} />}
    </>
  );
}
