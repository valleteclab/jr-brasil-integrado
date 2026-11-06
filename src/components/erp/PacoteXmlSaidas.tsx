"use client";

import { useState } from "react";
import { competenciaRelativa } from "@/lib/periodo";

/**
 * Download em lote dos XMLs das notas de saída de um mês.
 *
 * A rota já existia (/api/erp/fiscal/pacote-contador), mas só tinha botão na home do plano
 * Emissor — quem usa o ERP completo não tinha como chegar nela e acabava baixando nota por
 * nota. Aqui ela aparece onde a pessoa está olhando as notas.
 *
 * O padrão é o MÊS ANTERIOR, porque mandar XML para o contador é tarefa de mês fechado.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

export function PacoteXmlSaidas() {
  const inicial = competenciaRelativa(-1);
  const [mes, setMes] = useState(inicial.mes);
  const [ano, setAno] = useState(inicial.ano);
  const [baixando, setBaixando] = useState(false);

  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];

  // O download passa por fetch (e não por <a href>) para que um erro de permissão ou de
  // sessão apareça como mensagem, em vez de baixar um .zip com JSON de erro dentro.
  async function baixar() {
    setBaixando(true);
    try {
      const res = await fetch(`/api/erp/fiscal/pacote-contador?mes=${mes}&ano=${ano}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Não foi possível gerar o pacote.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xmls-${ano}-${String(mes).padStart(2, "0")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível gerar o pacote.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="erp-card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ minWidth: 150 }}>
          <span>Mês</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={baixando}>
            {MESES.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 110 }}>
          <span>Ano</span>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} disabled={baixando}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-erp primary" onClick={() => void baixar()} disabled={baixando}>
          {baixando ? "Gerando o pacote…" : "⬇ Baixar XMLs do mês (.zip)"}
        </button>
      </div>
      <p className="field-hint" style={{ margin: "8px 0 0" }}>
        ZIP com os XMLs das notas de saída do mês — NF-e, NFC-e e NFS-e, autorizadas, canceladas e
        substituídas. Vem com um resumo do que entrou e, se alguma nota estiver sem XML guardado, a
        lista de quais são. Nota rejeitada ou com erro não entra: ela não tem XML autorizado.
      </p>
    </div>
  );
}
