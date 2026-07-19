"use client";

import { useState } from "react";
import type { MonitorReformaAdminData } from "@/domains/fiscal/application/reforma-monitor-use-cases";

/**
 * Painel do MONITOR da Reforma Tributária (/admin/reforma — só o dono do SaaS):
 * prontidão do sistema, calendário da transição e as fontes oficiais vigiadas (com os documentos
 * já catalogados). "Verificar agora" força uma varredura e mostra o que apareceu de novo.
 */

const CALENDARIO = [
  { ano: "2026", txt: "Ano-teste: destaque informativo IBS 0,1% + CBS 0,9% nos documentos", status: "✅ sistema pronto (NF-e/NFC-e destacam)" },
  { ano: "2027", txt: "CBS pra valer (fim de PIS/COFINS), Imposto Seletivo, split payment (piloto)", status: "🔴 maior entrega — aguardando regulamentação final" },
  { ano: "2029–2032", txt: "Transição gradual ICMS/ISS → IBS (redução por ano)", status: "⏳ regras por tabela, ano a ano" },
  { ano: "2033", txt: "Sistema pleno — ICMS e ISS extintos", status: "⏳" },
];

export function ReformaMonitorPanel({ inicial }: { inicial: MonitorReformaAdminData }) {
  const [dados, setDados] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState("");
  const [erro, setErro] = useState("");

  async function verificarAgora() {
    setBusy(true);
    setErro("");
    setResultado("");
    try {
      const res = await fetch("/api/admin/reforma", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        fontes?: Array<{ fonte: string; itens: number; novos: string[]; erro?: string }>;
        notificacoes?: number;
      };
      if (!res.ok) throw new Error(d.error || "Falha na verificação.");
      const novos = (d.fontes ?? []).flatMap((f) => f.novos);
      const errosFonte = (d.fontes ?? []).filter((f) => f.erro).map((f) => `${f.fonte}: ${f.erro}`);
      setResultado(
        (novos.length
          ? `🔔 ${novos.length} novidade(s): ${novos.slice(0, 5).join(" · ")}`
          : "Nenhuma novidade nas fontes oficiais desde a última verificação.") +
        (errosFonte.length ? ` | ⚠ Fontes com erro: ${errosFonte.join("; ")}` : "")
      );
      const atual = await fetch("/api/admin/reforma").then((r) => r.json());
      if (atual?.fontes) setDados(atual);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na verificação.");
    } finally {
      setBusy(false);
    }
  }

  const p = dados.prontidao;
  const pTone = p.nfeProducaoComIbsCbs === true ? "success" : p.nfeProducaoComIbsCbs === false ? "danger" : "info";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Prontidão */}
      <div className={`alert ${pTone}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>
          <strong>{p.nfeProducaoComIbsCbs === false ? "🚨 Atenção" : "🛡️ Prontidão IBS/CBS"}</strong>
          <br /><span style={{ fontSize: 13 }}>{p.detalhe}</span>
        </span>
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={verificarAgora}>
          {busy ? "Verificando fontes…" : "🔄 Verificar agora"}
        </button>
      </div>
      {resultado && <div className="alert success" style={{ margin: 0 }}><span>{resultado}</span></div>}
      {erro && <div className="alert danger" style={{ margin: 0 }}><span>{erro}</span></div>}

      {/* Calendário da transição */}
      <div className="erp-card" style={{ padding: 16 }}>
        <strong style={{ fontSize: 14 }}>📅 Calendário da transição</strong>
        <table className="erp-table" style={{ marginTop: 10 }}>
          <thead><tr><th style={{ width: 90 }}>Quando</th><th>O que muda</th><th>Status no XERP</th></tr></thead>
          <tbody>
            {CALENDARIO.map((c) => (
              <tr key={c.ano}>
                <td><strong>{c.ano}</strong></td>
                <td>{c.txt}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="block-muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Detalhes, checklist da entrega 2027 e estratégia do split payment: <code>docs/REFORMA-ROADMAP.md</code> no repositório.
        </p>
      </div>

      {/* Fontes monitoradas */}
      {dados.fontes.map((f) => (
        <div key={f.id} className="erp-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              <strong>📡 {f.nome}</strong>
              <br /><span className="block-muted" style={{ fontSize: 12 }}>
                {f.itens.length} documento(s) catalogado(s)
                {f.verificadoEm ? ` · última verificação ${new Date(f.verificadoEm).toLocaleString("pt-BR")}` : " · ainda não verificada"}
              </span>
            </span>
            <a className="btn-erp light xs" href={f.url} target="_blank" rel="noreferrer">Abrir fonte ↗</a>
          </div>
          {f.itens.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Ver documentos catalogados</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                {f.itens.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          )}
        </div>
      ))}

      <p className="block-muted" style={{ fontSize: 12, margin: 0 }}>
        O monitor roda sozinho 1× por dia. Documento novo em qualquer fonte → aviso no sino dos
        administradores da plataforma. A prontidão confere que as notas de produção seguem saindo
        com o grupo IBS/CBS.
      </p>
    </div>
  );
}
