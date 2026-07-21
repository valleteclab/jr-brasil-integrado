import { PageHeader } from "@/components/shared/PageHeader";
import { CobrancasAdminPanel } from "@/components/admin/CobrancasAdminPanel";
import { listarCobrancasAdmin, type CobrancaClienteRow } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

/** Cobranças da plataforma — mensalidades dos clientes (Asaas) + NFS-e da mensalidade. */
export default async function AdminCobrancasPage() {
  let cobrancas: CobrancaClienteRow[] = [];
  let erro = "";
  try {
    cobrancas = await listarCobrancasAdmin();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível carregar as cobranças.";
  }
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Cobranças (mensalidades)">
        <p>
          Status das mensalidades de cada cliente direto do Asaas — <strong>pagas, pendentes e
          vencidas</strong> — e emissão da <strong>NFS-e da mensalidade</strong> pela sua empresa
          para enviar junto com a cobrança.
        </p>
      </PageHeader>
      {erro && <div className="system-error"><strong>Erro</strong><span>{erro}</span></div>}
      {!erro && <CobrancasAdminPanel inicial={cobrancas} />}
    </>
  );
}
