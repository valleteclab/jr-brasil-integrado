"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

type Props = {
  /** Competência sugerida (normalmente o mês anterior ao atual). */
  anoInicial: number;
  mesInicial: number;
};

// Gera a EFD ICMS/IPI de uma competência e leva direto para a apuração visual.
export function SpedGerarForm({ anoInicial, mesInicial }: Props) {
  const router = useRouter();
  const [ano, setAno] = useState(anoInicial);
  const [mes, setMes] = useState(mesInicial);
  const [finalidade, setFinalidade] = useState<"ORIGINAL" | "RETIFICADORA">("ORIGINAL");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 4 + i);

  async function gerar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/sped-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, finalidade })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Não foi possível gerar o arquivo SPED.");
      router.push(`/erp/sped-fiscal/${data.id}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o arquivo SPED.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <label className="field" style={{ minWidth: 160 }}>
        <span>Mês</span>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={busy}>
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1}>{nome}</option>
          ))}
        </select>
      </label>
      <label className="field" style={{ minWidth: 110 }}>
        <span>Ano</span>
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))} disabled={busy}>
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="field" style={{ minWidth: 170 }}>
        <span>Finalidade</span>
        <select value={finalidade} onChange={(e) => setFinalidade(e.target.value as "ORIGINAL" | "RETIFICADORA")} disabled={busy}>
          <option value="ORIGINAL">Original</option>
          <option value="RETIFICADORA">Retificadora</option>
        </select>
      </label>
      <button type="button" className="button primary" onClick={gerar} disabled={busy}>
        {busy ? "Gerando…" : "Gerar SPED da competência"}
      </button>
      {erro && <span style={{ color: "var(--jr-danger)", fontSize: 12 }}>{erro}</span>}
    </div>
  );
}
