"use client";

import { useEffect, useRef, useState } from "react";
import { impressaoAutoAtiva, setImpressaoAuto } from "./util-impressao";
import {
  metodoImpressao, setMetodoImpressao, impressoraQzSalva, setImpressoraQz,
  listarImpressorasQz, imprimirTesteQz, type MetodoImpressao
} from "./qz-print";

/**
 * Configuração de impressão do cupom POR MÁQUINA (localStorage). Botão que abre um painelzinho:
 *  - Método: Navegador (automático/quiosque) ou QZ Tray (impressão direta na impressora escolhida).
 *  - No QZ: conecta ao agente local, lista as impressoras, escolhe uma e imprime um teste.
 */
export function ImpressaoConfig() {
  const [aberto, setAberto] = useState(false);
  const [metodo, setMetodo] = useState<MetodoImpressao>("iframe");
  const [auto, setAuto] = useState(true);
  const [printer, setPrinter] = useState("");
  const [impressoras, setImpressoras] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMetodo(metodoImpressao());
    setAuto(impressaoAutoAtiva());
    setPrinter(impressoraQzSalva());
  }, []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  function trocarMetodo(m: MetodoImpressao) {
    setMetodo(m);
    setMetodoImpressao(m);
    setStatus("");
    if (m === "qz") void conectar();
  }

  async function conectar() {
    setBusy(true); setStatus("Conectando ao QZ Tray…");
    try {
      const list = await listarImpressorasQz();
      setImpressoras(list);
      if (!impressoraQzSalva() && list.length) escolher(list[0]);
      setStatus(`Conectado — ${list.length} impressora(s) encontrada(s).`);
    } catch {
      setStatus("Não conectou. O QZ Tray está instalado e aberto nesta máquina? (ícone na bandeja)");
    } finally {
      setBusy(false);
    }
  }

  function escolher(nome: string) {
    setPrinter(nome);
    setImpressoraQz(nome);
  }

  async function testar() {
    if (!printer) { setStatus("Escolha uma impressora primeiro."); return; }
    setBusy(true); setStatus("Enviando teste…");
    try {
      await imprimirTesteQz(printer);
      setStatus("Teste enviado! Confira se saiu na impressora.");
    } catch (e) {
      setStatus("Falha ao imprimir o teste: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setBusy(false);
    }
  }

  const resumo = metodo === "qz" ? (printer ? `QZ: ${printer}` : "QZ Tray") : "Navegador";

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button type="button" className="btn-erp light xs" onClick={() => setAberto((v) => !v)} title="Configurar impressão do cupom (nesta máquina)">
        🖨️ Impressão: {resumo}
      </button>

      {aberto && (
        <div style={{ position: "absolute", zIndex: 60, bottom: "calc(100% + 6px)", left: 0, width: 320, background: "#fff", border: "1px solid var(--erp-line)", borderRadius: 10, boxShadow: "0 12px 30px -10px rgba(0,0,0,.3)", padding: 14, fontSize: 13 }}>
          <strong style={{ fontSize: 13 }}>Impressão do cupom (nesta máquina)</strong>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="radio" name="metodo-impressao" checked={metodo === "iframe"} onChange={() => trocarMetodo("iframe")} style={{ marginTop: 3 }} />
              <span><strong>Navegador</strong><br /><span className="block-muted" style={{ fontSize: 11.5 }}>Automático; silencioso só no modo quiosque.</span></span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="radio" name="metodo-impressao" checked={metodo === "qz"} onChange={() => trocarMetodo("qz")} style={{ marginTop: 3 }} />
              <span><strong>QZ Tray (impressão direta)</strong><br /><span className="block-muted" style={{ fontSize: 11.5 }}>Sai direto na impressora escolhida, sem diálogo.</span></span>
            </label>
          </div>

          {metodo === "iframe" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input type="checkbox" checked={auto} onChange={(e) => { setImpressaoAuto(e.target.checked); setAuto(e.target.checked); }} />
              Imprimir automaticamente ao emitir
            </label>
          )}

          {metodo === "qz" && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={printer} onChange={(e) => escolher(e.target.value)} style={{ flex: 1, height: 30, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 6px" }}>
                  <option value="">{impressoras.length ? "Escolha a impressora…" : "Conecte para listar…"}</option>
                  {impressoras.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="button" className="btn-erp light xs" disabled={busy} onClick={conectar}>Conectar</button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn-erp primary xs" disabled={busy || !printer} onClick={testar}>Imprimir teste</button>
              </div>
              <span className="block-muted" style={{ fontSize: 11 }}>
                Precisa do <strong>QZ Tray</strong> instalado e aberto nesta máquina (qz.io). Na primeira impressão ele pede para permitir — marque &ldquo;lembrar&rdquo;.
              </span>
            </div>
          )}

          {status && <div style={{ marginTop: 10, fontSize: 12, color: status.startsWith("Falha") || status.startsWith("Não") ? "#b91c1c" : "#166534" }}>{status}</div>}
        </div>
      )}
    </div>
  );
}
