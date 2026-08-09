"use client";

import { useState } from "react";

/** Importador de leads (dados abertos CNPJ) — UF + segmento/CNAE + modo Emissor + presente. */

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const SEGMENTOS = [
  { valor: "autopecas", rotulo: "Autopeças" },
  { valor: "oficinas", rotulo: "Oficinas mecânicas" },
  { valor: "mercados", rotulo: "Mercados / minimercados" },
  { valor: "materiais_construcao", rotulo: "Materiais de construção" },
  { valor: "servicos_gerais", rotulo: "Serviços — amplo p/ Emissor" },
  { valor: "", rotulo: "Somente CNAEs informados abaixo" }
];

const PRESENTE_PADRAO =
  "🎁 Diagnóstico fiscal GRATUITO do seu CNPJ (regime, obrigações e o que muda com a Reforma) + 1º mês grátis + guia do certificado digital A1 sem custo.";

type Resultado = {
  uf: string; disponivel: number; candidatosAvaliados: number;
  criados: number; pulados: number; foraDoPerfil: number; modoEmissor: boolean;
};

export function ImportadorLeadsPanel() {
  const [uf, setUf] = useState("DF");
  const [segmento, setSegmento] = useState("autopecas");
  const [cnaes, setCnaes] = useState("");
  const [quantidade, setQuantidade] = useState("20");
  const [modoEmissor, setModoEmissor] = useState(false);
  const [campanha, setCampanha] = useState("");
  const [presente, setPresente] = useState(PRESENTE_PADRAO);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function importar() {
    setRodando(true); setErro(""); setResultado(null);
    try {
      const res = await fetch("/api/admin/leads/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uf,
          segmento: segmento || undefined,
          cnaesLivres: cnaes.split(",").map((c) => c.trim()).filter(Boolean),
          quantidade: Number(quantidade) || 20,
          modoEmissor,
          campanha: campanha || undefined,
          presente
        })
      });
      const data = (await res.json()) as Resultado & { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha na importação.");
      setResultado(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na importação.");
    } finally { setRodando(false); }
  }

  return (
    <section className="erp-card" style={{ marginTop: 18 }}>
      <div className="erp-card-head">
        <h3>📥 Importador de leads (base pública de CNPJ)</h3>
        <span style={{ fontSize: 12.5, color: "var(--erp-mute, #64748b)" }}>
          empresas ativas da RFB por UF e segmento — caem direto no funil com a abordagem e o presente
        </span>
      </div>
      <div className="erp-form">
        <label>
          UF
          <select value={uf} onChange={(e) => setUf(e.target.value)}>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>
          Segmento
          <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
            {SEGMENTOS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
        </label>
        <label>
          Quantidade (máx. 100)
          <input inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="full">
          CNAEs adicionais (prefixos, separados por vírgula — ex.: 4530, 9602)
          <input value={cnaes} onChange={(e) => setCnaes(e.target.value)} placeholder="Opcional" />
        </label>
        <label>
          Campanha
          <input value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder={`prospeccao-${uf.toLowerCase()}`} />
        </label>
        <label className="check-row" style={{ alignSelf: "end" }}>
          <input type="checkbox" checked={modoEmissor} onChange={(e) => setModoEmissor(e.target.checked)} />
          Modo Emissor — só Simples/MEI (confere na Receita, mais lento)
        </label>
        <label className="full">
          🎁 Presente de abertura (vai na abordagem de cada lead)
          <textarea value={presente} onChange={(e) => setPresente(e.target.value)} rows={2} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px 16px" }}>
        <button type="button" className="btn-erp primary" disabled={rodando} onClick={() => void importar()}>
          {rodando ? "Importando…" : "Importar leads"}
        </button>
        {erro && <span style={{ color: "var(--erp-danger, #dc2626)", fontSize: 13 }}>{erro}</span>}
        {resultado && (
          <span style={{ fontSize: 13 }}>
            ✅ <strong>{resultado.criados}</strong> lead(s) criados em {resultado.uf}
            {" · "}base: {resultado.disponivel.toLocaleString("pt-BR")} empresas
            {resultado.pulados > 0 && ` · ${resultado.pulados} já no funil`}
            {resultado.foraDoPerfil > 0 && ` · ${resultado.foraDoPerfil} fora do perfil Simples/MEI`}
          </span>
        )}
      </div>
    </section>
  );
}
