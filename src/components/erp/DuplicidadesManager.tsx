"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Revisão de despesas lançadas duas vezes.
 *
 * A mesma despesa entra por caminhos diferentes — extrato (conciliação), nota de entrada, NFS-e
 * recebida, lançamento manual — e até agora nada comparava o conjunto. Aqui os pares suspeitos
 * aparecem com o motivo, e mesclar move os vínculos para a conta que fica.
 */

type Lado = { id: string; descricao: string; valor: number; data: string; origem: string | null; pago: boolean };
type Par = { manter: Lado; remover: Lado; pontuacao: number; motivos: string[] };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const ORIGEM: Record<string, string> = {
  CONCILIACAO: "extrato bancário",
  NFSE: "NFS-e recebida",
  FATURA_CARTAO: "fatura do cartão"
};
const origemLabel = (o: string | null) => (o ? (ORIGEM[o] ?? o.toLowerCase()) : "lançamento manual");

export function DuplicidadesManager({ paresIniciais }: { paresIniciais: Par[] }) {
  const router = useRouter();
  const [pares, setPares] = useState(paresIniciais);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function mesclar(par: Par) {
    const ok = window.confirm(
      `Manter "${par.manter.descricao}" (${brl(par.manter.valor)}) e APAGAR "${par.remover.descricao}"?\n\n` +
        "A nota fiscal vinculada, se houver, passa para a conta que fica. Esta ação não pode ser desfeita."
    );
    if (!ok) return;
    setBusyId(par.remover.id);
    setErro("");
    try {
      const r = await fetch("/api/erp/financeiro/duplicidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manterId: par.manter.id, removerId: par.remover.id })
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Não foi possível mesclar.");
      setPares((cur) => cur.filter((p) => p.remover.id !== par.remover.id));
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao mesclar as despesas.");
    } finally {
      setBusyId(null);
    }
  }

  if (!pares.length) {
    return (
      <div className="alert info">
        <span className="lead">Nenhuma duplicidade encontrada.</span>
        <span>Foram comparadas as contas a pagar dos últimos 120 dias, por valor, data, fornecedor e descrição.</span>
      </div>
    );
  }

  return (
    <>
      <div className="alert warning" style={{ marginBottom: 12 }}>
        <span className="lead">{pares.length} possível(is) duplicidade(s).</span>
        <span>
          Confira antes de mesclar: duas despesas iguais no mesmo período podem ser legítimas (duas compras do
          mesmo valor). Mesclar mantém a conta por onde o dinheiro saiu e apaga a outra.
        </span>
      </div>

      {erro && (
        <div className="alert danger">
          <span className="lead">Erro:</span>
          <span>{erro}</span>
        </div>
      )}

      {pares.map((par) => (
        <article key={par.remover.id} className="erp-card" style={{ marginBottom: 12, padding: 14 }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong>{brl(par.manter.valor)}</strong>
            <span className="pill warn">{par.pontuacao}% de chance de ser a mesma despesa</span>
          </header>
          <p className="field-hint" style={{ margin: "6px 0 10px" }}>
            Por quê: {par.motivos.join(" · ")}
          </p>

          <table className="erp-table">
            <thead>
              <tr>
                <th>Fica</th>
                <th>Some</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{par.manter.descricao}</strong>
                  <span className="sublabel">
                    {data(par.manter.data)} · {origemLabel(par.manter.origem)} · {par.manter.pago ? "paga" : "em aberto"}
                  </span>
                </td>
                <td>
                  {par.remover.descricao}
                  <span className="sublabel">
                    {data(par.remover.data)} · {origemLabel(par.remover.origem)} · {par.remover.pago ? "paga" : "em aberto"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <footer style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn-erp primary sm"
              disabled={busyId === par.remover.id}
              onClick={() => void mesclar(par)}
            >
              {busyId === par.remover.id ? "Mesclando…" : "É a mesma despesa — mesclar"}
            </button>
            <button
              type="button"
              className="btn-erp ghost sm"
              onClick={() => setPares((cur) => cur.filter((p) => p.remover.id !== par.remover.id))}
            >
              São despesas diferentes
            </button>
          </footer>
        </article>
      ))}
    </>
  );
}
