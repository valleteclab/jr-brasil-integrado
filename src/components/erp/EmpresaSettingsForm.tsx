"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import type { EmpresaPerfil } from "@/domains/company/application/company-use-cases";

type TipoNegocio = "VENDA" | "SERVICO" | "AMBOS";

const TIPOS: Array<{ value: TipoNegocio; label: string; descricao: string; pdv: string; oculta: string }> = [
  {
    value: "VENDA",
    label: "Vendas (peças / material)",
    descricao: "A empresa vende mercadorias (peças, material de construção). Emite NFC-e/NF-e.",
    pdv: "PDV de vendas — busca rápida de produtos e finalização com cupom.",
    oculta: "Esconde do menu: Ordens de Serviço."
  },
  {
    value: "SERVICO",
    label: "Serviços",
    descricao: "A empresa presta serviços (assistência, consultoria). Emite NFS-e.",
    pdv: "PDV de serviços — lança serviços e emite NFS-e.",
    oculta: "Esconde do menu: Compras, Estoque, Inventários, Fornecedores, Notas de entrada, Regras de finalidade."
  },
  {
    value: "AMBOS",
    label: "Vendas & Serviços",
    descricao: "A empresa vende peças e presta serviço (oficina, assistência técnica). Emite NFC-e/NF-e e NFS-e.",
    pdv: "PDV completo — peças e serviços na mesma tela; emite as duas notas.",
    oculta: "Mostra todos os módulos."
  }
];

type Segmento = "GERAL" | "AUTOPECAS" | "MATERIAL_CONSTRUCAO" | "MERCADO";

const SEGMENTOS: Array<{ value: Segmento; label: string; recurso: string }> = [
  { value: "GERAL", label: "Geral / outros", recurso: "Cadastro padrão, sem campos específicos de ramo." },
  { value: "AUTOPECAS", label: "Autopeças", recurso: "Habilita a Aplicação veicular no produto (que veículo a peça serve) e a busca por veículo." },
  { value: "MATERIAL_CONSTRUCAO", label: "Material de construção", recurso: "Cadastro padrão (recursos específicos do ramo virão no futuro)." },
  { value: "MERCADO", label: "Mercado / varejo", recurso: "Cadastro padrão." }
];

export function EmpresaSettingsForm({ initial }: { initial: EmpresaPerfil }) {
  const [nomeFantasia, setNomeFantasia] = useState(initial.nomeFantasia ?? "");
  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>(initial.tipoNegocio);
  const [segmento, setSegmento] = useState<Segmento>(initial.segmento);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selecionado = TIPOS.find((t) => t.value === tipoNegocio) ?? TIPOS[2];
  const segSelecionado = SEGMENTOS.find((s) => s.value === segmento) ?? SEGMENTOS[0];

  async function salvar() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/erp/configuracoes/empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomeFantasia, tipoNegocio, segmento })
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMessage("Dados da empresa salvos. O menu e o PDV se ajustam ao recarregar.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="erp-card">
      <div className="erp-card-head"><h3>Dados da empresa</h3></div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert info">{message}</div>}

      <div className="erp-form fiscal-form-grid">
        <label>
          Razão social
          <input value={initial.razaoSocial} readOnly />
        </label>
        <label>
          Nome fantasia
          <input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Nome de exibição" />
        </label>
      </div>

      <h4 style={{ margin: "1.25rem 0 0.5rem" }}>Tipo de negócio</h4>
      <p className="block-muted" style={{ marginTop: 0 }}>
        Define o modo de PDV recomendado e quais módulos aparecem no menu.
      </p>
      <div className="kpi-row" style={{ gap: "0.75rem" }}>
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTipoNegocio(t.value)}
            className="erp-card"
            style={{
              textAlign: "left",
              cursor: "pointer",
              padding: "0.85rem",
              border: tipoNegocio === t.value ? "2px solid var(--erp-accent, #2563eb)" : "1px solid var(--erp-line)",
              background: tipoNegocio === t.value ? "rgba(37,99,235,.06)" : "#fff"
            }}
          >
            <strong>{t.label}</strong>
            <small className="block-muted" style={{ marginTop: 4, display: "block" }}>{t.descricao}</small>
          </button>
        ))}
      </div>

      <div className="alert info" style={{ marginTop: "1rem" }}>
        <strong>PDV recomendado:</strong> {selecionado.pdv}
        <br />
        <span className="block-muted">{selecionado.oculta}</span>
      </div>

      <h4 style={{ margin: "1.25rem 0 0.5rem" }}>Segmento (ramo)</h4>
      <p className="block-muted" style={{ marginTop: 0 }}>
        Ativa recursos específicos do catálogo conforme o ramo, sem poluir os demais.
      </p>
      <label className="pdv-cliente" style={{ maxWidth: 360 }}>
        Ramo da empresa
        <select value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)}>
          {SEGMENTOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <div className="alert info" style={{ marginTop: "0.75rem" }}>{segSelecionado.recurso}</div>

      <div className="fiscal-step-actions" style={{ marginTop: "1rem" }}>
        <Button type="button" onClick={salvar} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
      </div>
    </div>
  );
}
