import { PageHeader } from "@/components/shared/PageHeader";
import { getFiscalStatus } from "@/lib/services/fiscal-status";
import type { FiscalStatusResult } from "@/lib/services/fiscal-status";

// Cada visita refaz a checagem em tempo real (consulta os web services).
export const dynamic = "force-dynamic";

function horaBR(iso: string): string {
  // O servidor roda em UTC; força o fuso de Brasília para o horário exibido.
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function AdminStatusFiscalPage() {
  let dados: FiscalStatusResult | null = null;
  let loadError = "";
  try {
    dados = await getFiscalStatus();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível verificar os serviços fiscais.";
  }

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Status dos serviços fiscais">
        <p>Saúde dos web services de emissão (NF-e, NFC-e, NFS-e) e resumo das emissões nas últimas 24h.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível verificar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {dados && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "0 0 16px" }}>
            <span className="muted">Provedor ativo da plataforma:</span>
            <strong>{dados.provedorAtivo}</strong>
            <span className="muted">· Verificado em {horaBR(dados.verificadoEm)}</span>
            <span style={{ flex: 1 }} />
            <a className="btn-erp link" href="/admin/status-fiscal">↻ Atualizar</a>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginBottom: 24 }}>
            {dados.servicos.map((s, i) => (
              <div key={i} className="erp-card" style={{ margin: 0, borderLeft: `4px solid ${s.online ? "#1a9c4a" : "#c0392b"}` }}>
                <div className="erp-card-body" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{s.online ? "🟢" : "🔴"}</span>
                    <strong style={{ fontSize: 13.5 }}>{s.servico}</strong>
                  </div>
                  {s.detalhe && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.detalhe}</div>}
                  <div style={{ fontSize: 12, marginTop: 6, color: s.online ? "#1a7a3a" : "#a93226" }}>{s.mensagem}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{s.tempoMs} ms</div>
                </div>
              </div>
            ))}
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Emissões nas últimas 24h</h3></div>
            <div className="erp-card-body">
              {dados.resumo24h.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Nenhuma emissão nas últimas 24 horas.</p>
              ) : (
                <table className="erp-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Provedor</th><th>Modelo</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th style={{ textAlign: "right" }}>Autorizadas</th>
                      <th style={{ textAlign: "right" }}>Rejeitadas/Erro</th>
                      <th style={{ textAlign: "right" }}>Outras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.resumo24h.map((r, i) => (
                      <tr key={i}>
                        <td>{r.provedor}</td>
                        <td>{r.modelo}</td>
                        <td style={{ textAlign: "right" }}>{r.total}</td>
                        <td style={{ textAlign: "right", color: "#1a7a3a" }}>{r.autorizadas}</td>
                        <td style={{ textAlign: "right", color: r.rejeitadas ? "#a93226" : undefined }}>{r.rejeitadas}</td>
                        <td style={{ textAlign: "right" }}>{r.outras}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
