import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmissoesFiltro } from "@/components/admin/EmissoesFiltro";
import { listEmissoesFiscais, listClienteOptions } from "@/lib/services/platform-admin";
import type { EmissoesFiscaisResultado, ClienteOption } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

type SearchParams = { status?: string; modelo?: string; tenantId?: string; busca?: string };

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default async function AdminEmissoesPage({ searchParams }: { searchParams: SearchParams }) {
  const filtro = {
    status: searchParams.status,
    modelo: searchParams.modelo,
    tenantId: searchParams.tenantId,
    busca: searchParams.busca
  };

  let resultado: EmissoesFiscaisResultado | null = null;
  let clientes: ClienteOption[] = [];
  let loadError = "";

  try {
    [resultado, clientes] = await Promise.all([listEmissoesFiscais(filtro), listClienteOptions()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as emissões fiscais.";
  }

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Emissões fiscais">
        <p>Monitora NF-e, NFC-e e NFS-e de todos os clientes da plataforma.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {resultado && (
        <>
          <div className="kpi-row">
            <KpiCard label="Autorizadas" value={String(resultado.resumo.autorizadas)} tone="success" />
            <KpiCard label="Processando" value={String(resultado.resumo.processando)} tone="info" />
            <KpiCard label="Com problema" value={String(resultado.resumo.comProblema)} tone={resultado.resumo.comProblema > 0 ? "danger" : "default"} />
            <KpiCard label="Canceladas" value={String(resultado.resumo.canceladas)} tone="warn" />
            <KpiCard label="Total" value={String(resultado.resumo.total)} />
          </div>

          <EmissoesFiltro clientes={clientes} valoresAtuais={filtro} />

          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Empresa</th>
                  <th>Modelo</th>
                  <th>Número/Série</th>
                  <th>Destinatário</th>
                  <th className="num">Valor</th>
                  <th>Ambiente</th>
                  <th>Status</th>
                  <th>Motivo</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-st">
                        <h4>Nenhuma emissão encontrada</h4>
                        <p>Ajuste os filtros para ver as emissões fiscais dos clientes.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {resultado.itens.map((n) => (
                  <tr key={n.id}>
                    <td><strong>{n.tenantNome}</strong></td>
                    <td>{n.empresaNome}</td>
                    <td>{n.modelo}</td>
                    <td className="mono">{n.numero ?? "—"}{n.serie ? ` / ${n.serie}` : ""}</td>
                    <td>{n.destinatario ?? "—"}</td>
                    <td className="num bold">{n.valorTotal}</td>
                    <td>{n.ambiente}</td>
                    <td><StatusBadge tone={n.statusTone}>{n.statusLabel}</StatusBadge></td>
                    <td>{n.motivo ?? "—"}</td>
                    <td>{formatarData(n.emitidaEm ?? n.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
