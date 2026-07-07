"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Liberação de VENDA FATURADA (boleto/crediário) do cliente. Só o perfil FINANCEIRO libera/revoga;
 * os demais veem o status (e o caixa/PDV bloqueia a venda a prazo quando não está liberado).
 */

type Status = { liberada: boolean; por: string | null; em: string | null; obs: string | null; limiteCredito: number };

export function FaturadoLiberacaoCliente({ clienteId, podeFinanceiro }: { clienteId: string; podeFinanceiro: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/erp/clientes/${clienteId}/liberar-faturado`);
      const d = (await res.json().catch(() => ({}))) as { status?: Status | null };
      if (res.ok && d.status) { setStatus(d.status); setObs(d.status.obs ?? ""); }
    } catch { /* silencioso */ }
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function definir(liberada: boolean) {
    setBusy(true); setErro("");
    try {
      const res = await fetch(`/api/erp/clientes/${clienteId}/liberar-faturado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liberada, obs: obs || null })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao atualizar a liberação.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha.");
    } finally {
      setBusy(false);
    }
  }

  const liberada = status?.liberada ?? false;

  return (
    <div className="erp-card" style={{ gridColumn: "1 / -1", padding: 14, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <strong>Venda faturada (boleto/crediário)</strong>
        <span className={`pill ${liberada ? "success" : "danger"}`}>
          <span className="dot" />{liberada ? "Liberada" : "Bloqueada"}
        </span>
      </div>

      {status?.liberada && (status.por || status.em) && (
        <small className="block-muted" style={{ marginTop: 6 }}>
          Liberada {status.por ? `por ${status.por}` : ""}{status.em ? ` em ${new Date(status.em).toLocaleString("pt-BR")}` : ""}.
        </small>
      )}

      {erro && <div className="alert danger" style={{ marginTop: 8 }}>{erro}</div>}

      {podeFinanceiro ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Observação (opcional)
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: liberado após análise de crédito" style={{ height: 34 }} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!liberada
              ? <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => definir(true)}>{busy ? "..." : "✅ Liberar venda faturada"}</button>
              : <button type="button" className="btn-erp danger sm" disabled={busy} onClick={() => definir(false)}>{busy ? "..." : "Revogar liberação"}</button>}
          </div>
        </div>
      ) : (
        <small className="block-muted" style={{ marginTop: 8, display: "block" }}>
          {liberada ? "Cliente liberado para venda a prazo." : "Somente o setor financeiro pode liberar a venda faturada deste cliente."}
        </small>
      )}
    </div>
  );
}
