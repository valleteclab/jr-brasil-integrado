import { Button } from "@/components/shared/Button";
import { DataTable } from "@/components/erp/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listNfeSummaries, type NfeSummary } from "@/lib/services/notas-fiscais";

export const dynamic = "force-dynamic";

type BadgeTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";

function nfeTone(status: string): BadgeTone {
  if (status === "AUTORIZADA") return "success";
  if (status === "RASCUNHO") return "mute";
  if (status === "REJEITADA") return "danger";
  if (status === "CANCELADA") return "warn";
  return "mute";
}

export default async function NfePage() {
  let notas: NfeSummary[] = [];
  let loadError = "";

  try {
    notas = await listNfeSummaries();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as notas fiscais.";
  }

  const totais = {
    rascunho: notas.filter((n) => n.status === "RASCUNHO").length,
    autorizada: notas.filter((n) => n.status === "AUTORIZADA").length,
    rejeitada: notas.filter((n) => n.status === "REJEITADA").length
  };

  return (
    <>
      <PageHeader
        eyebrow="Fiscal"
        title="NF-e emitidas"
        action={<Button href="/erp/fiscal/nova">Nova NF-e</Button>}
      >
        <p>Emissão de Nota Fiscal Eletrônica modelo 55. Gerencie rascunhos, autorizações e cancelamentos.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid four">
        <div className="kpi-card">
          <span className="kpi-label">Total</span>
          <span className="kpi-value">{notas.length}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Rascunhos</span>
          <span className="kpi-value">{totais.rascunho}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Autorizadas</span>
          <span className="kpi-value success">{totais.autorizada}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Rejeitadas</span>
          <span className="kpi-value danger">{totais.rejeitada}</span>
        </div>
      </div>

      <section className="panel">
        <div className="erp-toolbar">
          <strong>{notas.length} notas fiscais</strong>
          <span>Histórico de emissões desta empresa.</span>
        </div>
        <DataTable
          headers={["Nº / Série", "Destinatário", "Natureza", "Emissão", "Total", "Status", "Ações"]}
          isEmpty={!notas.length}
          empty='Nenhuma NF-e emitida. Clique em "Nova NF-e" para começar.'
        >
          {notas.map((nf) => (
            <tr key={nf.id}>
              <td className="mono">{nf.numero} / {nf.serie}</td>
              <td>{nf.destinatario}</td>
              <td>{nf.naturezaOperacao || "—"}</td>
              <td>{nf.dataEmissao ?? "—"}</td>
              <td className="numeric">{nf.total}</td>
              <td>
                <StatusBadge tone={nfeTone(nf.status)}>{nf.statusLabel}</StatusBadge>
              </td>
              <td>
                <div className="row-actions">
                  {nf.status === "RASCUNHO" && (
                    <Button href={`/erp/fiscal/${nf.id}`} variant="light">Editar</Button>
                  )}
                  {nf.danfeUrl && (
                    <a href={nf.danfeUrl} target="_blank" rel="noopener noreferrer" className="button light">
                      DANFE
                    </a>
                  )}
                  {nf.xmlUrl && (
                    <a href={nf.xmlUrl} target="_blank" rel="noopener noreferrer" className="button light">
                      XML
                    </a>
                  )}
                  {nf.chaveAcesso && (
                    <span className="mono text-xs">{nf.chaveAcesso.slice(0, 16)}…</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  );
}
