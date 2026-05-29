"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleFormData } from "@/lib/services/sales";

type Tipo = "VENDA_BALCAO" | "PEDIDO_FATURADO" | "ORCAMENTO" | "OS";

type ItemLinha = { produtoId: string; quantidade: number; precoUnitario: number };

const TIPOS: Array<{ id: Tipo; icon: string; titulo: string; sub: string }> = [
  { id: "VENDA_BALCAO", icon: "🛒", titulo: "Venda balcão", sub: "Saída imediata · NF + pagamento à vista" },
  { id: "PEDIDO_FATURADO", icon: "📦", titulo: "Pedido faturado", sub: "Faturamento com prazo · entrega ou retirada" },
  { id: "OS", icon: "🔧", titulo: "Ordem de Serviço", sub: "Oficina · serviços + peças aplicadas" },
  { id: "ORCAMENTO", icon: "📄", titulo: "Orçamento", sub: "Cotação com validade · sem baixa de estoque" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function AtendimentoWorkspace({ data, defaultTipo = "VENDA_BALCAO" }: { data: SaleFormData; defaultTipo?: Tipo }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState<ItemLinha[]>([]);
  const [descontoPct, setDescontoPct] = useState(0);
  const [observacoes, setObservacoes] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [validadeDias, setValidadeDias] = useState(30);
  const [prazoEntrega, setPrazoEntrega] = useState("5 dias úteis após aprovação");
  const [frete, setFrete] = useState("CIF (incluso)");
  // Ordem de serviço
  const [equipamento, setEquipamento] = useState("");
  const [placa, setPlaca] = useState("");
  const [problema, setProblema] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOs = tipo === "OS";
  const isOrcamento = tipo === "ORCAMENTO";
  const cliente = data.clientes.find((c) => c.id === clienteId) ?? null;

  const subtotal = useMemo(
    () => itens.reduce((total, item) => total + item.quantidade * item.precoUnitario, 0),
    [itens]
  );
  const descontoValor = Math.round(subtotal * (descontoPct / 100) * 100) / 100;
  const total = Math.max(subtotal - descontoValor, 0);

  function addItem() {
    setItens((current) => [...current, { produtoId: "", quantidade: 1, precoUnitario: 0 }]);
  }
  function updateItem(index: number, patch: Partial<ItemLinha>) {
    setItens((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function onSelectProduto(index: number, produtoId: string) {
    const produto = data.produtos.find((p) => p.id === produtoId);
    updateItem(index, { produtoId, precoUnitario: produto ? produto.preco : 0 });
  }
  function removeItem(index: number) {
    setItens((current) => current.filter((_, i) => i !== index));
  }

  function reset() {
    setClienteId("");
    setItens([]);
    setDescontoPct(0);
    setObservacoes("");
    setEquipamento("");
    setPlaca("");
    setProblema("");
    setError("");
  }

  async function salvar() {
    setError("");
    if (!clienteId) {
      setError("Selecione um cliente para continuar.");
      return;
    }
    if (isOs) {
      if (!equipamento.trim()) {
        setError("Informe o equipamento da ordem de serviço.");
        return;
      }
    } else {
      const itensValidos = itens.filter((item) => item.produtoId && item.quantidade > 0);
      if (!itensValidos.length) {
        setError("Adicione ao menos um item.");
        return;
      }
    }

    setSaving(true);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};
      const itensPayload = itens
        .filter((item) => item.produtoId && item.quantidade > 0)
        .map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade, precoUnitario: item.precoUnitario }));

      if (isOrcamento) {
        endpoint = "/api/erp/orcamentos";
        body = { clienteId, itens: itensPayload, validadeDias, desconto: descontoValor, vendedor, condicaoPagamento, observacaoVendedor: observacoes };
      } else if (isOs) {
        endpoint = "/api/erp/os";
        body = { clienteId, equipamento, placaOuSerial: placa, problemaRelatado: problema, observacoes };
      } else {
        endpoint = "/api/erp/vendas";
        body = {
          clienteId,
          canal: tipo === "VENDA_BALCAO" ? "BALCAO" : "FATURADO",
          itens: itensPayload,
          desconto: descontoValor,
          condicaoPagamento,
          observacoes
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível concluir o atendimento.");
      }

      if (isOrcamento) router.push("/erp/orcamentos");
      else if (isOs) router.push(payload.id ? `/erp/os/${payload.id}` : "/erp/os");
      else router.push("/erp/vendas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o atendimento.");
    } finally {
      setSaving(false);
    }
  }

  const acaoLabel = !clienteId
    ? "Selecione um cliente"
    : isOrcamento
      ? "Salvar orçamento"
      : isOs
        ? "Abrir ordem de serviço"
        : tipo === "VENDA_BALCAO"
          ? "Concluir venda"
          : "Faturar pedido";

  return (
    <>
      <div className="topbar-panel">
        <div>
          <div className="atend-crumbs">Operação / <b>Novo atendimento</b></div>
          <h1>Novo atendimento</h1>
          <p>Crie venda balcão, pedido faturado, ordem de serviço ou orçamento.</p>
        </div>
        <button type="button" className="button light" onClick={reset}>Limpar tudo</button>
      </div>

      <div className="atend-types">
        {TIPOS.map((op) => (
          <button
            key={op.id}
            type="button"
            className={`atend-type${tipo === op.id ? " active" : ""}`}
            onClick={() => setTipo(op.id)}
          >
            <span className="ic" aria-hidden="true">{op.icon}</span>
            <span>
              <strong>{op.titulo}</strong>
              <small>{op.sub}</small>
            </span>
          </button>
        ))}
      </div>

      {error && <div className="alert danger" style={{ marginBottom: 16 }}><strong>Atenção</strong><span>{error}</span></div>}

      <div className="atend-grid">
        <div className="atend-main">
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Cliente <small style={{ color: "var(--erp-danger)" }}>*obrigatório</small></h3>
            </div>
            <div className="atend-client">
              <span className="avatar" aria-hidden="true">{cliente ? "👤" : "👥"}</span>
              <div style={{ flex: 1 }}>
                <strong>{cliente ? cliente.label : "Consumidor final"}</strong>
                <small>{cliente?.documento || "Selecione o cliente do atendimento"}</small>
              </div>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ maxWidth: 240 }}>
                <option value="">Selecionar…</option>
                {data.clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isOs ? (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Equipamento e diagnóstico</h3></div>
              <div className="erp-form">
                <label className="full">Equipamento*<input value={equipamento} onChange={(e) => setEquipamento(e.target.value)} placeholder="Ex.: Trator John Deere 6110" /></label>
                <label>Placa / Nº de série<input value={placa} onChange={(e) => setPlaca(e.target.value)} /></label>
                <label className="full">Problema relatado<textarea value={problema} onChange={(e) => setProblema(e.target.value)} /></label>
              </div>
            </div>
          ) : (
            <div className="erp-card">
              <div className="erp-card-head">
                <h3>Itens</h3>
                <button type="button" className="button primary" onClick={addItem}>+ Adicionar item</button>
              </div>
              {itens.length === 0 ? (
                <div className="atend-empty">
                  <span className="cube" aria-hidden="true">⬚</span>
                  <strong>Nenhum item adicionado</strong>
                  <span>Adicione produtos para compor o atendimento.</span>
                  <button type="button" className="button primary" onClick={addItem}>+ Adicionar produto</button>
                </div>
              ) : (
                <div>
                  <div className="atend-item-row" style={{ color: "var(--erp-mute)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    <span>Produto</span><span>Qtd.</span><span>Preço unit.</span><span style={{ textAlign: "right" }}>Total</span><span />
                  </div>
                  {itens.map((item, index) => (
                    <div className="atend-item-row" key={index}>
                      <select value={item.produtoId} onChange={(e) => onSelectProduto(index, e.target.value)}>
                        <option value="">Selecione</option>
                        {data.produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} · {p.nome}</option>
                        ))}
                      </select>
                      <input type="number" min={1} value={item.quantidade} onChange={(e) => updateItem(index, { quantidade: Number(e.target.value) })} />
                      <input type="number" min={0} step="0.01" value={item.precoUnitario} onChange={(e) => updateItem(index, { precoUnitario: Number(e.target.value) })} />
                      <span className="row-total">{brl(item.quantidade * item.precoUnitario)}</span>
                      <button type="button" className="row-del" aria-label="Remover item" onClick={() => removeItem(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="erp-card">
            <div className="erp-card-head"><h3>Observações</h3></div>
            <div className="erp-form">
              <label className="full"><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Notas internas, instruções de entrega, observações ao cliente..." /></label>
            </div>
          </div>
        </div>

        <aside className="atend-rail">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Totais</h3></div>
            <div className="atend-total-row"><span>Itens ({itens.length})</span><span>{brl(subtotal)}</span></div>
            <div className="atend-total-row"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            <div className="atend-total-row">
              <span>Desconto global</span>
              <span>
                <input className="pct-input" type="number" min={0} max={100} value={descontoPct} onChange={(e) => setDescontoPct(Number(e.target.value))} /> %
              </span>
            </div>
            <div className="atend-total-row grand"><span>Total</span><strong>{brl(total)}</strong></div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>{isOrcamento ? "Validade & condições" : "Condições"}</h3></div>
            <div className="erp-form">
              {isOrcamento && (
                <label>Validade (dias)<input type="number" min={1} value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))} /></label>
              )}
              <label>Vendedor<input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor" /></label>
              <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: 30/60/90" /></label>
              <label>Prazo de entrega<input value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} /></label>
              <label>Frete
                <select value={frete} onChange={(e) => setFrete(e.target.value)}>
                  <option>CIF (incluso)</option>
                  <option>FOB (por conta do cliente)</option>
                  <option>Sem frete</option>
                </select>
              </label>
            </div>
          </div>

          <div className="erp-form">
            <button type="button" className="button primary" disabled={!clienteId || saving} onClick={salvar}>
              {saving ? "Processando…" : acaoLabel}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
