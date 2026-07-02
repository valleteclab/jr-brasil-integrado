"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuiaResumo } from "@/domains/fiscal/application/guia-use-cases";

/**
 * GUIAS GNRE a recolher (ICMS-ST interestadual retido pelo remetente, Conv. ICMS 142/2018):
 * a guia deve ser emitida no portal GNRE Online e recolhida ANTES da saída da mercadoria —
 * uma via acompanha o transporte. Aqui o operador controla pendências e registra o pagamento.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

const TIPO_LABEL: Record<string, string> = {
  GNRE_ICMS_ST: "ICMS-ST (Conv. 142/2018)",
  GNRE_DIFAL: "DIFAL (EC 87/2015)"
};

export function GuiasWorkspace({ guias }: { guias: GuiaResumo[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function marcarPaga(g: GuiaResumo) {
    const numeroGuia = window.prompt(
      `Nº da guia GNRE recolhida para ${g.ufFavorecida} (valor ${brl(g.valor)}) — emitida no portal gnre.pe.gov.br:`,
      g.numeroGuia ?? ""
    );
    if (numeroGuia === null) return;
    setBusyId(g.id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/fiscal/guias/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAGA", numeroGuia, pagoEm: new Date().toISOString().slice(0, 10) })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível marcar como paga.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar a guia.");
    } finally {
      setBusyId(null);
    }
  }

  async function reabrir(g: GuiaResumo) {
    setBusyId(g.id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/fiscal/guias/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDENTE" })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível reabrir a guia.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar a guia.");
    } finally {
      setBusyId(null);
    }
  }

  const pendentes = guias.filter((g) => g.status === "PENDENTE");

  return (
    <section>
      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {pendentes.length > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          <strong>⚠ {pendentes.length} guia(s) pendente(s)</strong>
          <span>
            {" "}O ICMS-ST interestadual deve ser recolhido POR OPERAÇÃO, antes da saída da mercadoria — a via
            da GNRE acompanha o transporte (Conv. ICMS 142/2018, cl. 18ª). Emita em{" "}
            <a href="https://www.gnre.pe.gov.br" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>gnre.pe.gov.br</a>.
          </span>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>NF-e</th><th>Tipo</th><th>UF favorecida</th><th className="num">Valor</th>
              <th>Emitida em</th><th>Situação</th><th>Nº guia</th><th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((g) => (
              <tr key={g.id}>
                <td>
                  <strong className="mono">{g.nota.numero ?? "—"}</strong>
                  <small className="block-muted">total {brl(g.nota.total)}{g.nota.status === "CANCELADA" ? " · NOTA CANCELADA" : ""}</small>
                </td>
                <td>{TIPO_LABEL[g.tipo] ?? g.tipo}</td>
                <td><strong>{g.ufFavorecida}</strong></td>
                <td className="num"><strong>{brl(g.valor)}</strong></td>
                <td>{dataBr(g.nota.emitidaEm)}</td>
                <td>
                  <span className={`pill ${g.status === "PENDENTE" ? "warn" : g.status === "PAGA" ? "success" : "mute"}`}>
                    <span className="dot" />{g.status.toLowerCase()}{g.pagoEm ? ` em ${dataBr(g.pagoEm)}` : ""}
                  </span>
                </td>
                <td className="mono">{g.numeroGuia ?? "—"}</td>
                <td className="actions">
                  {g.status === "PENDENTE" && (
                    <button type="button" className="btn-erp primary xs" disabled={busyId === g.id} onClick={() => marcarPaga(g)}>
                      {busyId === g.id ? "..." : "Registrar pagamento"}
                    </button>
                  )}
                  {g.status === "PAGA" && (
                    <button type="button" className="btn-erp ghost xs" disabled={busyId === g.id} onClick={() => reabrir(g)}>
                      {busyId === g.id ? "..." : "Reabrir"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!guias.length && (
              <tr><td colSpan={8}><div className="empty-st"><h4>Nenhuma guia</h4><p>Guias GNRE aparecem aqui automaticamente quando uma NF-e interestadual retém ICMS-ST (produto com regra de MVA para a UF de destino).</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
