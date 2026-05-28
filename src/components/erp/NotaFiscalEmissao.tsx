"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { calcularImpostos, somarTotaisNfe, type TaxCalculationResult } from "@/domains/fiscal/calculation/tax-calculator";
import type { ErpProductSummary } from "@/lib/services/products";
import type { CustomerSummary } from "@/lib/services/customers";
import { FORMAS_PAGAMENTO, MODALIDADE_FRETE } from "@/lib/services/notas-fiscais";

// ─── Types ───────────────────────────────────────────────────────────────────

type NfeItem = {
  _id: string;
  seq: number;
  produtoId: string;
  descricao: string;
  ncm: string;
  cest: string;
  cfop: string;
  unidade: string;
  gtin: string;
  origem: string;
  quantidade: number;
  valorUnitario: number;
  valorDesconto: number;
  valorFrete: number;
  // Fiscal
  icmsCST: string;
  icmsCSOSN: string;
  icmsAliquota: number;
  icmsReducaoBC: number;
  icmsSTMVA: number;
  icmsSTAliquota: number;
  fcpAliquota: number;
  ipiCST: string;
  ipiCodEnq: string;
  ipiAliquota: number;
  pisCST: string;
  pisAliquota: number;
  cofinsCST: string;
  cofinsAliquota: number;
};

type NfePag = {
  _id: string;
  forma: string;
  valor: number;
};

type Props = {
  products: ErpProductSummary[];
  customers: CustomerSummary[];
  regimeEmpresa?: string;
  ufEmpresa?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

let _seq = 0;
function uid() {
  return `item-${Date.now()}-${++_seq}`;
}

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function dec(v: string | number | undefined) {
  const n = Number(String(v ?? "0").replace(",", ".")) || 0;
  return n;
}

function emptyItem(seq: number): NfeItem {
  return {
    _id: uid(), seq,
    produtoId: "", descricao: "", ncm: "", cest: "", cfop: "5102",
    unidade: "UN", gtin: "", origem: "0",
    quantidade: 1, valorUnitario: 0, valorDesconto: 0, valorFrete: 0,
    icmsCST: "", icmsCSOSN: "", icmsAliquota: 0, icmsReducaoBC: 0,
    icmsSTMVA: 0, icmsSTAliquota: 0, fcpAliquota: 0,
    ipiCST: "", ipiCodEnq: "", ipiAliquota: 0,
    pisCST: "07", pisAliquota: 0, cofinsCST: "07", cofinsAliquota: 0
  };
}

function itemValorBruto(item: NfeItem) {
  return Math.round(item.quantidade * item.valorUnitario * 100) / 100;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NotaFiscalEmissao({ products, customers, regimeEmpresa = "REGIME_NORMAL", ufEmpresa = "BA" }: Props) {
  const router = useRouter();

  // ── Header state ────────────────────────────────────────────────────────────
  const [clienteId, setClienteId] = useState("");
  const [naturezaOperacao, setNaturezaOperacao] = useState("Venda de mercadoria");
  const [serie, setSerie] = useState("001");
  const [dataEmissao, setDataEmissao] = useState(today);
  const [finalidade, setFinalidade] = useState("1");
  const [consumidorFinal, setConsumidorFinal] = useState("0");
  const [presencaComprador, setPresencaComprador] = useState("1");
  const [modalidadeFrete, setModalidadeFrete] = useState("9");
  const [valorFrete, setValorFrete] = useState("0");
  const [valorSeguro, setValorSeguro] = useState("0");
  const [valorOutras, setValorOutras] = useState("0");
  const [infAdic, setInfAdic] = useState("");

  // ── Items state ──────────────────────────────────────────────────────────────
  const [itens, setItens] = useState<NfeItem[]>([emptyItem(1)]);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  // ── Pagamentos state ─────────────────────────────────────────────────────────
  const [pagamentos, setPagamentos] = useState<NfePag[]>([{ _id: uid(), forma: "01", valor: 0 }]);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"cabecalho" | "itens" | "pagamento" | "revisao">("cabecalho");

  // ── Calculations ─────────────────────────────────────────────────────────────
  const calculosItens = useMemo<TaxCalculationResult[]>(() => {
    return itens.map((item) => calcularImpostos({
      regime: regimeEmpresa as "REGIME_NORMAL" | "SIMPLES_NACIONAL",
      ufOrigem: ufEmpresa,
      ufDestino: ufEmpresa,
      tipoDestinatario: consumidorFinal === "1" ? "CONSUMIDOR_FINAL" : "CONTRIBUINTE_ICMS",
      valorBruto: itemValorBruto(item),
      desconto: item.valorDesconto,
      icmsCST: item.icmsCST || undefined,
      icmsCSOSN: item.icmsCSOSN || undefined,
      icmsAliquota: item.icmsAliquota || undefined,
      icmsReducaoBC: item.icmsReducaoBC || undefined,
      icmsSTMVA: item.icmsSTMVA || undefined,
      icmsSTAliquota: item.icmsSTAliquota || undefined,
      fcpAliquota: item.fcpAliquota || undefined,
      ipiCST: item.ipiCST || undefined,
      ipiAliquota: item.ipiAliquota || undefined,
      pisCST: item.pisCST || undefined,
      pisAliquota: item.pisAliquota || undefined,
      cofinsCST: item.cofinsCST || undefined,
      cofinsAliquota: item.cofinsAliquota || undefined
    }));
  }, [itens, regimeEmpresa, ufEmpresa, consumidorFinal]);

  const totais = useMemo(() => {
    return somarTotaisNfe(
      itens.map((item, i) => ({
        valorBruto: itemValorBruto(item),
        desconto: item.valorDesconto,
        frete: item.valorFrete,
        calculo: calculosItens[i]
      }))
    );
  }, [itens, calculosItens]);

  const totalNF = totais.vNF + dec(valorFrete) + dec(valorSeguro) + dec(valorOutras);

  // ── Item helpers ─────────────────────────────────────────────────────────────
  const fillFromProduct = useCallback((idx: number, produtoId: string) => {
    const prod = products.find((p) => p.id === produtoId);
    if (!prod) return;

    setItens((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      item.produtoId = produtoId;
      item.descricao = prod.name;
      item.ncm = prod.ncm ?? "";
      item.cest = prod.cest ?? "";
      item.cfop = prod.cfopInState ?? "5102";
      item.unidade = prod.unit ?? "UN";
      item.gtin = prod.barcode ?? "";
      item.origem = prod.origin ?? "0";
      // Price
      const priceRaw = prod.price.replace(/[^\d,]/g, "").replace(",", ".");
      item.valorUnitario = Number(priceRaw) || 0;
      // Fiscal
      item.icmsCST = prod.icmsCst ?? "";
      item.icmsCSOSN = prod.icmsCsosn ?? "";
      item.icmsAliquota = dec(prod.icmsRate);
      item.icmsReducaoBC = dec(prod.icmsReducaoBC);
      item.icmsSTMVA = dec(prod.icmsSTMVA);
      item.icmsSTAliquota = dec(prod.icmsSTAliquota);
      item.fcpAliquota = dec(prod.fcpAliquota);
      item.ipiCST = prod.ipiCst ?? "";
      item.ipiCodEnq = prod.ipiCodEnq ?? "";
      item.ipiAliquota = dec(prod.ipiRate);
      item.pisCST = prod.pisCst ?? "07";
      item.pisAliquota = dec(prod.pisRate);
      item.cofinsCST = prod.cofinsCst ?? "07";
      item.cofinsAliquota = dec(prod.cofinsRate);
      next[idx] = item;
      return next;
    });
  }, [products]);

  const updateItem = useCallback(<K extends keyof NfeItem>(idx: number, field: K, value: NfeItem[K]) => {
    setItens((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const addItem = useCallback(() => {
    setItens((prev) => {
      const next = [...prev, emptyItem(prev.length + 1)];
      setActiveItem(next[next.length - 1]._id);
      return next;
    });
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItens((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, seq: i + 1 })));
  }, []);

  // ── Payment helpers ───────────────────────────────────────────────────────────
  const updatePag = useCallback(<K extends keyof NfePag>(idx: number, field: K, value: NfePag[K]) => {
    setPagamentos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const addPag = useCallback(() => {
    setPagamentos((prev) => [...prev, { _id: uid(), forma: "01", valor: 0 }]);
  }, []);

  const removePag = useCallback((idx: number) => {
    setPagamentos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!naturezaOperacao) { setError("Informe a natureza da operação."); return; }
    if (itens.length === 0 || itens.every((i) => !i.descricao)) { setError("Adicione ao menos um item."); return; }
    if (pagamentos.length === 0) { setError("Adicione ao menos uma forma de pagamento."); return; }

    setSaving(true);
    setError("");

    try {
      const body = {
        clienteId: clienteId || undefined,
        naturezaOperacao,
        serie,
        finalidade: Number(finalidade),
        consumidorFinal: Number(consumidorFinal),
        presencaComprador: Number(presencaComprador),
        dataEmissao,
        modalidadeFrete: Number(modalidadeFrete),
        valorFrete: dec(valorFrete),
        valorSeguro: dec(valorSeguro),
        valorOutras: dec(valorOutras),
        infAdic: infAdic || undefined,
        regimeEmpresa,
        ufOrigem: ufEmpresa,
        ufDestino: ufEmpresa,
        itens: itens.filter((it) => it.descricao).map((item) => ({
          produtoId: item.produtoId || undefined,
          seq: item.seq,
          descricao: item.descricao,
          ncm: item.ncm || undefined,
          cest: item.cest || undefined,
          cfop: item.cfop,
          unidade: item.unidade,
          gtin: item.gtin || undefined,
          origem: item.origem || "0",
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorBruto: itemValorBruto(item),
          valorDesconto: item.valorDesconto || undefined,
          icmsCST: item.icmsCST || undefined,
          icmsCSOSN: item.icmsCSOSN || undefined,
          icmsAliquota: item.icmsAliquota || undefined,
          icmsReducaoBC: item.icmsReducaoBC || undefined,
          icmsSTMVA: item.icmsSTMVA || undefined,
          icmsSTAliquota: item.icmsSTAliquota || undefined,
          fcpAliquota: item.fcpAliquota || undefined,
          ipiCST: item.ipiCST || undefined,
          ipiCodEnq: item.ipiCodEnq || undefined,
          ipiAliquota: item.ipiAliquota || undefined,
          pisCST: item.pisCST || undefined,
          pisAliquota: item.pisAliquota || undefined,
          cofinsCST: item.cofinsCST || undefined,
          cofinsAliquota: item.cofinsAliquota || undefined
        })),
        pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: p.valor }))
      };

      const res = await fetch("/api/erp/notas-fiscais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao salvar NF-e.");
      }

      const data = await res.json();
      router.push(`/erp/fiscal?saved=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar NF-e.");
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="nfe-form">
      {/* Tab nav */}
      <div className="nfe-tabs">
        {(["cabecalho", "itens", "pagamento", "revisao"] as const).map((tab) => (
          <button
            key={tab}
            className={`nfe-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {{ cabecalho: "1. Cabeçalho", itens: "2. Itens", pagamento: "3. Pagamento", revisao: "4. Revisão" }[tab]}
          </button>
        ))}
      </div>

      {/* ── Tab: Cabeçalho ─────────────────────────────────────────────────── */}
      {activeTab === "cabecalho" && (
        <div className="nfe-section">
          <h3>Dados gerais da nota</h3>
          <div className="form-grid">
            <label className="field span2">
              <span>Natureza da operação *</span>
              <input value={naturezaOperacao} onChange={(e) => setNaturezaOperacao(e.target.value)} placeholder="Ex: Venda de mercadoria" />
            </label>
            <label className="field">
              <span>Série</span>
              <input value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={3} />
            </label>
            <label className="field">
              <span>Data de emissão</span>
              <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
            </label>
          </div>

          <h3>Destinatário</h3>
          <div className="form-grid">
            <label className="field span2">
              <span>Cliente</span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">— Selecione (opcional) —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.document}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Consumidor final</span>
              <select value={consumidorFinal} onChange={(e) => setConsumidorFinal(e.target.value)}>
                <option value="0">Não (B2B)</option>
                <option value="1">Sim (B2C)</option>
              </select>
            </label>
            <label className="field">
              <span>Presença do comprador</span>
              <select value={presencaComprador} onChange={(e) => setPresencaComprador(e.target.value)}>
                <option value="0">Não se aplica</option>
                <option value="1">Operação presencial</option>
                <option value="2">Internet</option>
                <option value="3">Teleatendimento</option>
                <option value="4">NFC-e entrega domicílio</option>
                <option value="9">Outros</option>
              </select>
            </label>
          </div>

          <h3>Finalidade e transporte</h3>
          <div className="form-grid">
            <label className="field">
              <span>Finalidade</span>
              <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)}>
                <option value="1">1 – Normal</option>
                <option value="2">2 – Complementar</option>
                <option value="3">3 – Ajuste</option>
                <option value="4">4 – Devolução</option>
              </select>
            </label>
            <label className="field">
              <span>Modalidade de frete</span>
              <select value={modalidadeFrete} onChange={(e) => setModalidadeFrete(e.target.value)}>
                {Object.entries(MODALIDADE_FRETE).map(([k, v]) => (
                  <option key={k} value={k}>{k} – {v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Frete (R$)</span>
              <input type="number" min="0" step="0.01" value={valorFrete} onChange={(e) => setValorFrete(e.target.value)} />
            </label>
            <label className="field">
              <span>Seguro (R$)</span>
              <input type="number" min="0" step="0.01" value={valorSeguro} onChange={(e) => setValorSeguro(e.target.value)} />
            </label>
            <label className="field">
              <span>Outras despesas (R$)</span>
              <input type="number" min="0" step="0.01" value={valorOutras} onChange={(e) => setValorOutras(e.target.value)} />
            </label>
          </div>

          <h3>Informações adicionais</h3>
          <div className="form-grid">
            <label className="field span4">
              <span>Inf. complementares ao fisco</span>
              <textarea rows={3} value={infAdic} onChange={(e) => setInfAdic(e.target.value)} placeholder="Informações adicionais para o SEFAZ..." />
            </label>
          </div>

          <div className="nfe-step-footer">
            <Button onClick={() => setActiveTab("itens")}>Próximo: Itens →</Button>
          </div>
        </div>
      )}

      {/* ── Tab: Itens ─────────────────────────────────────────────────────── */}
      {activeTab === "itens" && (
        <div className="nfe-section">
          <div className="erp-toolbar">
            <strong>{itens.length} {itens.length === 1 ? "item" : "itens"}</strong>
            <Button variant="light" onClick={addItem}>+ Adicionar item</Button>
          </div>

          {itens.map((item, idx) => {
            const calc = calculosItens[idx];
            const vBruto = itemValorBruto(item);
            const isOpen = activeItem === item._id;

            return (
              <div key={item._id} className={`nfe-item-card${isOpen ? " open" : ""}`}>
                {/* Summary row */}
                <div className="nfe-item-header" onClick={() => setActiveItem(isOpen ? null : item._id)}>
                  <span className="nfe-item-seq">{item.seq}</span>
                  <span className="nfe-item-desc">{item.descricao || <em>Item sem descrição</em>}</span>
                  <span className="nfe-item-qtd">{item.quantidade} {item.unidade}</span>
                  <span className="nfe-item-total">{brl(vBruto)}</span>
                  <span className="nfe-item-tax">Tributos: {brl(calc.totalTributos)}</span>
                  <button type="button" className="nfe-item-toggle">{isOpen ? "▲" : "▼"}</button>
                  <button type="button" className="nfe-item-remove" onClick={(e) => { e.stopPropagation(); removeItem(idx); }}>✕</button>
                </div>

                {/* Detail form */}
                {isOpen && (
                  <div className="nfe-item-body">
                    {/* Product picker */}
                    <div className="form-grid">
                      <label className="field span4">
                        <span>Produto do cadastro (preenche campos automaticamente)</span>
                        <select value={item.produtoId} onChange={(e) => { updateItem(idx, "produtoId", e.target.value); fillFromProduct(idx, e.target.value); }}>
                          <option value="">— Digitar manualmente —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Product data */}
                    <div className="form-section-title">Dados do produto/serviço</div>
                    <div className="form-grid">
                      <label className="field span2">
                        <span>Descrição *</span>
                        <input value={item.descricao} onChange={(e) => updateItem(idx, "descricao", e.target.value)} />
                      </label>
                      <label className="field">
                        <span>NCM</span>
                        <input value={item.ncm} onChange={(e) => updateItem(idx, "ncm", e.target.value)} maxLength={8} placeholder="00000000" />
                      </label>
                      <label className="field">
                        <span>CEST</span>
                        <input value={item.cest} onChange={(e) => updateItem(idx, "cest", e.target.value)} maxLength={7} />
                      </label>
                      <label className="field">
                        <span>CFOP *</span>
                        <input value={item.cfop} onChange={(e) => updateItem(idx, "cfop", e.target.value)} maxLength={4} />
                      </label>
                      <label className="field">
                        <span>Unidade</span>
                        <input value={item.unidade} onChange={(e) => updateItem(idx, "unidade", e.target.value)} maxLength={6} />
                      </label>
                      <label className="field">
                        <span>GTIN / EAN</span>
                        <input value={item.gtin} onChange={(e) => updateItem(idx, "gtin", e.target.value)} />
                      </label>
                      <label className="field">
                        <span>Origem (0–8)</span>
                        <select value={item.origem} onChange={(e) => updateItem(idx, "origem", e.target.value)}>
                          <option value="0">0 – Nacional</option>
                          <option value="1">1 – Estrangeira (importação direta)</option>
                          <option value="2">2 – Estrangeira (adquirida internamente)</option>
                          <option value="3">3 – Nacional – conteúdo ≥ 40% importado</option>
                          <option value="4">4 – Nacional – prod. com processos produtivos básicos</option>
                          <option value="5">5 – Nacional – conteúdo &lt; 40% importado</option>
                          <option value="6">6 – Estrangeira – importação direta sem similar nacional</option>
                          <option value="7">7 – Estrangeira – adquirida no mercado interno sem similar</option>
                          <option value="8">8 – Nacional – conteúdo ≥ 70% importado</option>
                        </select>
                      </label>
                    </div>

                    {/* Quantities and prices */}
                    <div className="form-section-title">Quantidades e valores</div>
                    <div className="form-grid">
                      <label className="field">
                        <span>Qtd *</span>
                        <input type="number" min="0.001" step="0.001" value={item.quantidade} onChange={(e) => updateItem(idx, "quantidade", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Valor unitário (R$) *</span>
                        <input type="number" min="0" step="0.01" value={item.valorUnitario} onChange={(e) => updateItem(idx, "valorUnitario", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Desconto (R$)</span>
                        <input type="number" min="0" step="0.01" value={item.valorDesconto} onChange={(e) => updateItem(idx, "valorDesconto", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Frete item (R$)</span>
                        <input type="number" min="0" step="0.01" value={item.valorFrete} onChange={(e) => updateItem(idx, "valorFrete", dec(e.target.value))} />
                      </label>
                      <div className="field nfe-subtotal">
                        <span>Valor bruto</span>
                        <strong>{brl(vBruto)}</strong>
                      </div>
                    </div>

                    {/* ICMS */}
                    <div className="form-section-title">ICMS</div>
                    <div className="form-grid">
                      <label className="field">
                        <span>CST (regime normal)</span>
                        <select value={item.icmsCST} onChange={(e) => updateItem(idx, "icmsCST", e.target.value)}>
                          <option value="">—</option>
                          <option value="00">00 – Tributada integralmente</option>
                          <option value="10">10 – Tributada e com cobr. de ICMS por ST</option>
                          <option value="20">20 – Com redução de BC</option>
                          <option value="30">30 – Isenta ou não tributada c/ ICMS-ST</option>
                          <option value="40">40 – Isenta</option>
                          <option value="41">41 – Não tributada</option>
                          <option value="50">50 – Suspensão</option>
                          <option value="51">51 – Diferimento</option>
                          <option value="60">60 – ICMS cobrado anteriormente por ST</option>
                          <option value="70">70 – Redução de BC c/ ICMS-ST</option>
                          <option value="90">90 – Outros</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>CSOSN (Simples Nacional)</span>
                        <select value={item.icmsCSOSN} onChange={(e) => updateItem(idx, "icmsCSOSN", e.target.value)}>
                          <option value="">—</option>
                          <option value="101">101 – Tributada c/ permissão crédito</option>
                          <option value="102">102 – Tributada s/ permissão crédito</option>
                          <option value="103">103 – Isenção do ICMS para faixa</option>
                          <option value="201">201 – Tributada c/ perm. crédito e ICMS-ST</option>
                          <option value="202">202 – Tributada s/ perm. crédito e ICMS-ST</option>
                          <option value="203">203 – Isenção s/ perm. crédito e ICMS-ST</option>
                          <option value="300">300 – Imune</option>
                          <option value="400">400 – Não tributada pelo Simples</option>
                          <option value="500">500 – ICMS cobrado por ST ou por antecipação</option>
                          <option value="900">900 – Outros</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Alíquota ICMS (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={item.icmsAliquota} onChange={(e) => updateItem(idx, "icmsAliquota", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Redução BC (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={item.icmsReducaoBC} onChange={(e) => updateItem(idx, "icmsReducaoBC", dec(e.target.value))} />
                      </label>
                    </div>

                    {/* ICMS-ST */}
                    <div className="form-section-title">ICMS-ST</div>
                    <div className="form-grid">
                      <label className="field">
                        <span>MVA (%)</span>
                        <input type="number" min="0" step="0.01" value={item.icmsSTMVA} onChange={(e) => updateItem(idx, "icmsSTMVA", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Alíquota ST (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={item.icmsSTAliquota} onChange={(e) => updateItem(idx, "icmsSTAliquota", dec(e.target.value))} />
                      </label>
                      {calc.icmsST && (
                        <div className="field nfe-subtotal">
                          <span>ICMS-ST calculado</span>
                          <strong>{brl(calc.icmsST.valor)}</strong>
                          <small>BC ST: {brl(calc.icmsST.baseCalculo)}</small>
                        </div>
                      )}
                    </div>

                    {/* FCP + IPI */}
                    <div className="form-section-title">FCP / IPI</div>
                    <div className="form-grid">
                      <label className="field">
                        <span>FCP (%)</span>
                        <input type="number" min="0" max="5" step="0.01" value={item.fcpAliquota} onChange={(e) => updateItem(idx, "fcpAliquota", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>IPI CST</span>
                        <select value={item.ipiCST} onChange={(e) => updateItem(idx, "ipiCST", e.target.value)}>
                          <option value="">— Sem IPI —</option>
                          <option value="50">50 – Saída tributada</option>
                          <option value="99">99 – Outras saídas</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Alíquota IPI (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={item.ipiAliquota} onChange={(e) => updateItem(idx, "ipiAliquota", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>Código de enquadramento IPI</span>
                        <input value={item.ipiCodEnq} onChange={(e) => updateItem(idx, "ipiCodEnq", e.target.value)} maxLength={3} placeholder="999" />
                      </label>
                    </div>

                    {/* PIS / COFINS */}
                    <div className="form-section-title">PIS / COFINS</div>
                    <div className="form-grid">
                      <label className="field">
                        <span>PIS CST</span>
                        <select value={item.pisCST} onChange={(e) => updateItem(idx, "pisCST", e.target.value)}>
                          <option value="01">01 – Op. tributável alíquota básica</option>
                          <option value="02">02 – Op. tributável alíquota diferenciada</option>
                          <option value="05">05 – Op. tributável por ST</option>
                          <option value="07">07 – Op. isenta da contribuição</option>
                          <option value="08">08 – Op. sem incidência</option>
                          <option value="09">09 – Op. com suspensão</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Alíquota PIS (%)</span>
                        <input type="number" min="0" max="10" step="0.01" value={item.pisAliquota} onChange={(e) => updateItem(idx, "pisAliquota", dec(e.target.value))} />
                      </label>
                      <label className="field">
                        <span>COFINS CST</span>
                        <select value={item.cofinsCST} onChange={(e) => updateItem(idx, "cofinsCST", e.target.value)}>
                          <option value="01">01 – Op. tributável alíquota básica</option>
                          <option value="02">02 – Op. tributável alíquota diferenciada</option>
                          <option value="05">05 – Op. tributável por ST</option>
                          <option value="07">07 – Op. isenta da contribuição</option>
                          <option value="08">08 – Op. sem incidência</option>
                          <option value="09">09 – Op. com suspensão</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Alíquota COFINS (%)</span>
                        <input type="number" min="0" max="10" step="0.01" value={item.cofinsAliquota} onChange={(e) => updateItem(idx, "cofinsAliquota", dec(e.target.value))} />
                      </label>
                    </div>

                    {/* Tax summary */}
                    <div className="nfe-tax-summary">
                      <span>ICMS {brl(calc.icms.valor)}</span>
                      {calc.icmsST && <span>ICMS-ST {brl(calc.icmsST.valor)}</span>}
                      {calc.fcp && <span>FCP {brl(calc.fcp.valor)}</span>}
                      {calc.ipi && <span>IPI {brl(calc.ipi.valor)}</span>}
                      <span>PIS {brl(calc.pis.valor)}</span>
                      <span>COFINS {brl(calc.cofins.valor)}</span>
                      <strong>Total tributos: {brl(calc.totalTributos)}</strong>
                    </div>

                    {calc.warnings.map((w, i) => (
                      <div key={i} className="system-warning">{w}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Items totals */}
          <div className="nfe-totals-bar">
            <span>Produtos: {brl(totais.vProd)}</span>
            {totais.vDesc > 0 && <span>Desconto: −{brl(totais.vDesc)}</span>}
            <span>ICMS: {brl(totais.vICMS)}</span>
            {totais.vICMSST > 0 && <span>ICMS-ST: {brl(totais.vICMSST)}</span>}
            {totais.vIPI > 0 && <span>IPI: {brl(totais.vIPI)}</span>}
            <span>PIS: {brl(totais.vPIS)}</span>
            <span>COFINS: {brl(totais.vCOFINS)}</span>
            <strong>Subtotal NF: {brl(totais.vNF)}</strong>
          </div>

          <div className="nfe-step-footer">
            <Button variant="light" onClick={() => setActiveTab("cabecalho")}>← Anterior</Button>
            <Button onClick={() => setActiveTab("pagamento")}>Próximo: Pagamento →</Button>
          </div>
        </div>
      )}

      {/* ── Tab: Pagamento ──────────────────────────────────────────────────── */}
      {activeTab === "pagamento" && (
        <div className="nfe-section">
          <div className="erp-toolbar">
            <strong>Formas de pagamento</strong>
            <Button variant="light" onClick={addPag}>+ Adicionar forma</Button>
          </div>

          {pagamentos.map((pag, idx) => (
            <div key={pag._id} className="nfe-pag-row">
              <label className="field">
                <span>Forma</span>
                <select value={pag.forma} onChange={(e) => updatePag(idx, "forma", e.target.value)}>
                  {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => (
                    <option key={k} value={k}>{k} – {v}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor (R$)</span>
                <input type="number" min="0" step="0.01" value={pag.valor} onChange={(e) => updatePag(idx, "valor", dec(e.target.value))} />
              </label>
              {pagamentos.length > 1 && (
                <button type="button" className="btn-remove-pag" onClick={() => removePag(idx)}>✕</button>
              )}
            </div>
          ))}

          <div className="nfe-pag-totals">
            <span>Total itens + despesas: <strong>{brl(totalNF)}</strong></span>
            <span>Total pago: <strong>{brl(pagamentos.reduce((s, p) => s + p.valor, 0))}</strong></span>
            {Math.abs(pagamentos.reduce((s, p) => s + p.valor, 0) - totalNF) > 0.01 && (
              <span className="warn">⚠ Divergência no valor pago</span>
            )}
          </div>

          <div className="nfe-step-footer">
            <Button variant="light" onClick={() => setActiveTab("itens")}>← Anterior</Button>
            <Button onClick={() => setActiveTab("revisao")}>Próximo: Revisão →</Button>
          </div>
        </div>
      )}

      {/* ── Tab: Revisão ────────────────────────────────────────────────────── */}
      {activeTab === "revisao" && (
        <div className="nfe-section">
          <h3>Resumo da nota fiscal</h3>

          <div className="nfe-review-grid">
            <div className="nfe-review-block">
              <strong>Natureza</strong>
              <span>{naturezaOperacao}</span>
            </div>
            <div className="nfe-review-block">
              <strong>Série / Data</strong>
              <span>{serie} · {dataEmissao}</span>
            </div>
            <div className="nfe-review-block">
              <strong>Destinatário</strong>
              <span>{customers.find((c) => c.id === clienteId)?.name ?? "Sem destinatário"}</span>
            </div>
            <div className="nfe-review-block">
              <strong>Finalidade</strong>
              <span>{{ "1": "Normal", "2": "Complementar", "3": "Ajuste", "4": "Devolução" }[finalidade]}</span>
            </div>
          </div>

          <table className="data-table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Descrição</th>
                <th>CFOP</th>
                <th className="numeric">Qtd</th>
                <th className="numeric">Unit.</th>
                <th className="numeric">Bruto</th>
                <th className="numeric">ICMS</th>
                <th className="numeric">ICMS-ST</th>
                <th className="numeric">IPI</th>
                <th className="numeric">PIS</th>
                <th className="numeric">COFINS</th>
                <th className="numeric">Tributos</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => {
                const calc = calculosItens[idx];
                return (
                  <tr key={item._id}>
                    <td>{item.seq}</td>
                    <td>{item.descricao || "—"}</td>
                    <td className="mono">{item.cfop}</td>
                    <td className="numeric">{item.quantidade}</td>
                    <td className="numeric">{brl(item.valorUnitario)}</td>
                    <td className="numeric">{brl(itemValorBruto(item))}</td>
                    <td className="numeric">{brl(calc.icms.valor)}</td>
                    <td className="numeric">{brl(calc.icmsST?.valor ?? 0)}</td>
                    <td className="numeric">{brl(calc.ipi?.valor ?? 0)}</td>
                    <td className="numeric">{brl(calc.pis.valor)}</td>
                    <td className="numeric">{brl(calc.cofins.valor)}</td>
                    <td className="numeric">{brl(calc.totalTributos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="nfe-totals-final">
            <div><span>Valor produtos</span><strong>{brl(totais.vProd)}</strong></div>
            {totais.vDesc > 0 && <div><span>Desconto</span><strong>−{brl(totais.vDesc)}</strong></div>}
            {dec(valorFrete) > 0 && <div><span>Frete</span><strong>{brl(dec(valorFrete))}</strong></div>}
            {dec(valorSeguro) > 0 && <div><span>Seguro</span><strong>{brl(dec(valorSeguro))}</strong></div>}
            {dec(valorOutras) > 0 && <div><span>Outras despesas</span><strong>{brl(dec(valorOutras))}</strong></div>}
            <div><span>ICMS</span><strong>{brl(totais.vICMS)}</strong></div>
            {totais.vICMSST > 0 && <div><span>ICMS-ST</span><strong>{brl(totais.vICMSST)}</strong></div>}
            {totais.vFCP > 0 && <div><span>FCP</span><strong>{brl(totais.vFCP)}</strong></div>}
            {totais.vIPI > 0 && <div><span>IPI</span><strong>{brl(totais.vIPI)}</strong></div>}
            <div><span>PIS</span><strong>{brl(totais.vPIS)}</strong></div>
            <div><span>COFINS</span><strong>{brl(totais.vCOFINS)}</strong></div>
            <div><span>Total tributos (vTotTrib)</span><strong>{brl(totais.vTotTrib)}</strong></div>
            <div className="nfe-total-nf"><span>TOTAL DA NOTA</span><strong>{brl(totalNF)}</strong></div>
          </div>

          {error && <div className="system-error"><span>{error}</span></div>}

          <div className="nfe-step-footer">
            <Button variant="light" onClick={() => setActiveTab("pagamento")}>← Anterior</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando rascunho…" : "Salvar rascunho"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
