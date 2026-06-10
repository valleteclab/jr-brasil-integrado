"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SpedAnaliseIa } from "@/domains/fiscal/application/sped-use-cases";

type Props = { arquivoId: string; analise: SpedAnaliseIa | null };

/**
 * Auditoria da apuração pela IA (OpenRouter): parecer, inconsistências e checklist.
 * A IA não gera o arquivo — apenas audita o resumo produzido pelo gerador determinístico.
 */
export function SpedAnaliseIaCard({ arquivoId, analise }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<SpedAnaliseIa | null>(analise);

  async function analisar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/${arquivoId}/analise-ia`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as SpedAnaliseIa & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível analisar com a IA.");
      setResultado({ texto: data.texto, geradoEm: data.geradoEm });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível analisar com a IA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>✦ Auditoria da apuração por IA</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--jr-mute)" }}>
            A IA confere o resumo (CST × CFOP, alíquotas, créditos × regime, avisos) e monta um
            checklist antes do envio ao contador. Ela não substitui a validação no PVA.
          </p>
        </div>
        <button type="button" className="button dark sm" onClick={analisar} disabled={busy}>
          {busy ? "Analisando…" : resultado ? "Reanalisar" : "Analisar com IA"}
        </button>
      </div>

      {erro && <p style={{ color: "var(--jr-danger)", fontSize: 13, margin: "10px 0 0" }}>{erro}</p>}

      {resultado && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--jr-slate)",
              background: "var(--jr-bg)",
              border: "1px solid var(--jr-line)",
              borderRadius: 8,
              padding: 14
            }}
          >
            {resultado.texto}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--jr-mute)" }}>
            Gerado em {new Date(resultado.geradoEm).toLocaleString("pt-BR")} — confira as conclusões com o contador.
          </p>
        </div>
      )}
    </div>
  );
}
