"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PdvData, PdvProduto, PdvServico } from "@/lib/services/pdv";
import { correspondeBusca } from "@/lib/search/normalize";

type CartItem = {
  key: string;
  kind: "produto" | "servico";
  refId: string;
  nome: string;
  preco: number;
  qtd: number;
  /** Saldo disponível do produto no momento (para validar venda sem estoque). */
  disponivel?: number;
  codigoServicoLc116?: string | null;
  codigoNbs?: string | null;
};

type NotaResultado = {
  tipo: "PRODUTOS" | "SERVICOS";
  modelo: string;
  ok: boolean;
  id: string | null;
  numero: string | null;
  status: string | null;
  erro: string | null;
};

type Pagamento = { forma: string; valor: number };

type CaixaAberto = { id: string; operador: string; abertoEm: string };

const FORMAS: Array<{ value: string; label: string }> = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "CARTAO_DEBITO", label: "Cartão débito" },
  { value: "CARTAO_CREDITO", label: "Cartão crédito" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFERENCIA", label: "Transferência" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function PdvWorkspace({ data, caixaAberto }: { data: PdvData; caixaAberto: CaixaAberto | null }) {
  if (!caixaAberto) return <AbrirCaixa />;
  return <Pdv data={data} caixa={caixaAberto} />;
}

// ─── Abertura de caixa (turno obrigatório) ──────────────────────────────────────

function AbrirCaixa() {
  const router = useRouter();
  const [operador, setOperador] = useState("");
  const [fundo, setFundo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function abrir() {
    if (!operador.trim()) { setError("Informe o operador."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/erp/caixa/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operador: operador.trim(), saldoInicial: Number(fundo.replace(",", ".")) || 0 })
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível abrir o caixa.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o caixa.");
      setLoading(false);
    }
  }

  return (
    <div className="pdv">
      <header className="pdv-top"><div className="pdv-brand">🛒 PDV</div><a className="pdv-sair" href="/erp">Sair</a></header>
      <div className="pdv-abrir">
        <div className="pdv-abrir-card">
          <h2>Abrir caixa</h2>
          <p className="block-muted">O PDV opera com turno de caixa. Informe o operador e o fundo de troco para começar.</p>
          {error && <div className="alert danger">{error}</div>}
          <label>Operador<input autoFocus value={operador} onChange={(e) => setOperador(e.target.value)} placeholder="Nome do operador" /></label>
          <label>Fundo de troco (R$)<input value={fundo} onChange={(e) => setFundo(e.target.value)} inputMode="decimal" placeholder="0,00" /></label>
          <button className="pdv-finalizar" onClick={abrir} disabled={loading}>{loading ? "Abrindo..." : "Abrir caixa"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PDV operando ───────────────────────────────────────────────────────────────

function Pdv({ data, caixa }: { data: PdvData; caixa: CaixaAberto }) {
  const router = useRouter();
  const mostraServicos = data.tipoNegocio === "SERVICO" || data.tipoNegocio === "AMBOS";
  const mostraProdutos = data.tipoNegocio === "VENDA" || data.tipoNegocio === "AMBOS";

  const [aba, setAba] = useState<"produtos" | "servicos">(mostraProdutos ? "produtos" : "servicos");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [modeloProduto, setModeloProduto] = useState<"NFCE" | "NFE">("NFCE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [resultado, setResultado] = useState<{ notas: NotaResultado[]; troco: number } | null>(null);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [movimentoAberto, setMovimentoAberto] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const clienteRef = useRef<HTMLSelectElement>(null);

  const total = useMemo(() => round2(cart.reduce((sum, i) => sum + i.preco * i.qtd, 0)), [cart]);
  const temServicoNoCart = cart.some((i) => i.kind === "servico");
  const precisaCliente = temServicoNoCart || modeloProduto === "NFE";

  const produtosFiltrados = useMemo(() => {
    if (!busca.trim()) return data.produtos.slice(0, 60);
    return data.produtos.filter((p) => correspondeBusca(busca, p.nome, p.sku, p.gtin, p.codigoOriginal, p.codigoFabricante)).slice(0, 60);
  }, [busca, data.produtos]);

  const servicosFiltrados = useMemo(() => {
    if (!busca.trim()) return data.servicos.slice(0, 60);
    return data.servicos.filter((s) => correspondeBusca(busca, s.nome)).slice(0, 60);
  }, [busca, data.servicos]);

  function addProduto(p: PdvProduto) {
    // Verifica o estoque ao adicionar (não só no pagamento). Sempre INFORMA quando falta saldo;
    // só BLOQUEIA quando a empresa não aceita venda sem estoque.
    const noCarrinho = cart.find((i) => i.kind === "produto" && i.refId === p.id)?.qtd ?? 0;
    const faltaEstoque = p.disponivel <= 0 || noCarrinho + 1 > p.disponivel;
    if (faltaEstoque) {
      const msg = p.disponivel <= 0
        ? `"${p.nome}" está sem estoque (disponível 0).`
        : `Estoque insuficiente de "${p.nome}": disponível ${p.disponivel}, no carrinho ${noCarrinho}.`;
      if (!data.permiteVendaSemEstoque) {
        setAviso("");
        setError(msg);
        return;
      }
      setAviso(`${msg} Venda liberada (empresa aceita venda sem estoque).`);
    } else {
      setAviso("");
    }
    setError("");
    setCart((cur) => {
      const ex = cur.find((i) => i.kind === "produto" && i.refId === p.id);
      if (ex) return cur.map((i) => (i === ex ? { ...i, qtd: i.qtd + 1 } : i));
      return [...cur, { key: `p-${p.id}`, kind: "produto", refId: p.id, nome: p.nome, preco: p.preco, qtd: 1, disponivel: p.disponivel }];
    });
    setBusca("");
    buscaRef.current?.focus();
  }

  function addServico(s: PdvServico) {
    setCart((cur) => {
      const ex = cur.find((i) => i.kind === "servico" && i.refId === s.id);
      if (ex) return cur.map((i) => (i === ex ? { ...i, qtd: i.qtd + 1 } : i));
      return [...cur, { key: `s-${s.id}`, kind: "servico", refId: s.id, nome: s.nome, preco: s.preco, qtd: 1, codigoServicoLc116: s.codigoServicoLc116, codigoNbs: s.codigoNbs }];
    });
    setBusca("");
    buscaRef.current?.focus();
  }

  // Leitor de código de barras: ao escanear, o leitor "digita" o código e dispara Enter.
  // Se houver match exato por GTIN ou SKU, adiciona o item direto e limpa a busca.
  function onBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = busca.trim();
    if (!code) return;
    const lc = code.toLowerCase();
    const exato = data.produtos.find((p) =>
      p.gtin === code || p.sku.toLowerCase() === lc ||
      (p.codigoOriginal ?? "").toLowerCase() === lc || (p.codigoFabricante ?? "").toLowerCase() === lc
    );
    if (exato) {
      addProduto(exato);
      return;
    }
    // sem match exato: se o filtro retornou só 1, adiciona ele
    if (aba === "produtos" && produtosFiltrados.length === 1) addProduto(produtosFiltrados[0]);
  }

  function mudarQtd(key: string, delta: number) {
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    const q = item.qtd + delta;
    if (q <= 0) {
      setCart((cur) => cur.filter((i) => i.key !== key));
      return;
    }
    // Ao aumentar a quantidade de um produto, informa quando passa do saldo; só bloqueia se a
    // empresa não aceitar venda sem estoque.
    if (delta > 0 && item.kind === "produto" && item.disponivel != null && q > item.disponivel) {
      const msg = `Estoque insuficiente de "${item.nome}": disponível ${item.disponivel}.`;
      if (!data.permiteVendaSemEstoque) {
        setError(msg);
        return;
      }
      setAviso(`${msg} Venda liberada (empresa aceita venda sem estoque).`);
    } else {
      setAviso("");
    }
    setError("");
    setCart((cur) => cur.map((i) => (i.key === key ? { ...i, qtd: q } : i)));
  }

  function removerItem(key: string) { setCart((cur) => cur.filter((i) => i.key !== key)); }

  function limpar() {
    setCart([]);
    setClienteId("");
    setResultado(null);
    setError("");
    setPagamentoAberto(false);
  }

  function abrirPagamento() {
    if (cart.length === 0) { setError("Carrinho vazio."); return; }
    if (precisaCliente && !clienteId) {
      setError(temServicoNoCart ? "Serviços (NFS-e) exigem cliente." : "NF-e exige cliente.");
      clienteRef.current?.focus();
      return;
    }
    setError("");
    setResultado(null);
    setPagamentoAberto(true);
  }

  async function finalizar(pagamentos: Pagamento[]) {
    setLoading(true);
    setError("");
    setResultado(null);
    try {
      const payload = {
        clienteId: clienteId || null,
        modeloProduto,
        produtos: cart.filter((i) => i.kind === "produto").map((i) => ({ produtoId: i.refId, quantidade: i.qtd, precoUnitario: i.preco })),
        servicos: cart.filter((i) => i.kind === "servico").map((i) => ({ descricao: i.nome, valor: i.preco * i.qtd, codigoServicoLc116: i.codigoServicoLc116, codigoNbs: i.codigoNbs })),
        pagamentos
      };
      const res = await fetch("/api/erp/pdv/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const dataRes = await res.json() as { notas?: NotaResultado[]; troco?: number; error?: string };
      if (!res.ok) throw new Error(dataRes.error || "Falha ao finalizar.");
      const notas = dataRes.notas ?? [];
      setResultado({ notas, troco: dataRes.troco ?? 0 });
      setCart([]);
      setClienteId("");
      setPagamentoAberto(false);
      // Impressão automática: abre o cupom/DANFE de cada nota autorizada.
      for (const n of notas) {
        if (n.ok && n.id) window.open(`/api/erp/fiscal/${n.id}/pdf`, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao finalizar.");
    } finally {
      setLoading(false);
    }
  }

  // Atalhos de teclado: F2 busca · F4 pagar · F6 cliente · F8 sangria/suprimento · Esc fecha/limpa.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); buscaRef.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); if (!pagamentoAberto && !movimentoAberto) abrirPagamento(); }
      else if (e.key === "F6") { e.preventDefault(); clienteRef.current?.focus(); }
      else if (e.key === "F8") { e.preventDefault(); setMovimentoAberto(true); }
      else if (e.key === "Escape") {
        if (pagamentoAberto) setPagamentoAberto(false);
        else if (movimentoAberto) setMovimentoAberto(false);
        else limpar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function fecharCaixa() {
    const informado = window.prompt("Fechamento de caixa — valor contado em dinheiro na gaveta (R$):", "");
    if (informado === null) return;
    const res = await fetch("/api/erp/caixa/fechar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saldoFinalInformado: Number(informado.replace(",", ".")) || 0 })
    });
    const d = await res.json() as { diferenca?: number; error?: string };
    if (!res.ok) { setError(d.error || "Falha ao fechar o caixa."); return; }
    window.alert(`Caixa fechado. Diferença: ${brl(d.diferenca ?? 0)}.`);
    router.refresh();
  }

  return (
    <div className="pdv">
      <header className="pdv-top">
        <div className="pdv-brand">🛒 PDV</div>
        <input
          ref={buscaRef}
          autoFocus
          className="pdv-busca"
          placeholder={aba === "produtos" ? "Buscar / escanear produto (nome, código, barras)..." : "Buscar serviço..."}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={onBuscaKeyDown}
        />
        <span className="pdv-caixa-info">Caixa: {caixa.operador}</span>
        <button className="pdv-mini" onClick={() => setMovimentoAberto(true)} title="Sangria / Suprimento (F8)">💵</button>
        <button className="pdv-mini" onClick={fecharCaixa} title="Fechar caixa">🔒</button>
        <a className="pdv-sair" href="/erp">Sair</a>
      </header>

      <div className="pdv-body">
        <section className="pdv-catalogo">
          {mostraProdutos && mostraServicos && (
            <div className="pdv-abas">
              <button className={aba === "produtos" ? "active" : ""} onClick={() => setAba("produtos")}>Produtos</button>
              <button className={aba === "servicos" ? "active" : ""} onClick={() => setAba("servicos")}>Serviços</button>
            </div>
          )}
          <div className="pdv-grid">
            {aba === "produtos" && mostraProdutos && produtosFiltrados.map((p) => (
              <button key={p.id} className="pdv-card" onClick={() => addProduto(p)}>
                <strong>{p.nome}</strong>
                <small>{p.sku}{p.gtin ? ` · ${p.gtin}` : ""} · estoque {p.disponivel}</small>
                <span className="pdv-preco">{brl(p.preco)}</span>
              </button>
            ))}
            {aba === "servicos" && mostraServicos && servicosFiltrados.map((s) => (
              <button key={s.id} className="pdv-card servico" onClick={() => addServico(s)}>
                <strong>{s.nome}</strong>
                <small>serviço{s.codigoServicoLc116 ? ` · LC ${s.codigoServicoLc116}` : ""}</small>
                <span className="pdv-preco">{brl(s.preco)}</span>
              </button>
            ))}
            {aba === "produtos" && produtosFiltrados.length === 0 && <p className="pdv-vazio">Nenhum produto.</p>}
            {aba === "servicos" && servicosFiltrados.length === 0 && <p className="pdv-vazio">Nenhum serviço cadastrado.</p>}
          </div>
          <div className="pdv-atalhos">F2 busca · F4 pagar · F6 cliente · F8 sangria · Esc limpar · Enter = código de barras</div>
        </section>

        <aside className="pdv-carrinho">
          <h2>Carrinho</h2>
          <div className="pdv-itens">
            {cart.length === 0 && <p className="pdv-vazio">Clique ou escaneie itens para adicionar.</p>}
            {cart.map((i) => (
              <div key={i.key} className="pdv-item">
                <div className="pdv-item-nome">
                  <strong>{i.nome}</strong>
                  <small>{i.kind === "servico" ? "Serviço" : "Produto"} · {brl(i.preco)}</small>
                </div>
                <div className="pdv-item-qtd">
                  <button onClick={() => mudarQtd(i.key, -1)}>−</button>
                  <span>{i.qtd}</span>
                  <button onClick={() => mudarQtd(i.key, 1)}>+</button>
                </div>
                <div className="pdv-item-total">{brl(i.preco * i.qtd)}</div>
                <button className="pdv-item-x" onClick={() => removerItem(i.key)}>×</button>
              </div>
            ))}
          </div>

          <div className="pdv-fechamento">
            <label className="pdv-cliente">
              Cliente {precisaCliente ? <span className="req">(obrigatório)</span> : "(opcional)"}
              <select ref={clienteRef} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Consumidor / não identificado</option>
                {data.clientes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <div className="pdv-modelo">
              <button className={modeloProduto === "NFCE" ? "active" : ""} onClick={() => setModeloProduto("NFCE")}>NFC-e (cupom)</button>
              <button className={modeloProduto === "NFE" ? "active" : ""} onClick={() => setModeloProduto("NFE")}>NF-e</button>
            </div>
            <div className="pdv-total"><span>Total</span><strong>{brl(total)}</strong></div>

            {aviso && <div className="alert warn">{aviso}</div>}
            {error && <div className="alert danger">{error}</div>}
            {resultado && (
              <div className="pdv-resultado">
                {resultado.troco > 0 && <div className="alert info pdv-troco">Troco: <strong>{brl(resultado.troco)}</strong></div>}
                {resultado.notas.map((n, idx) => (
                  <div key={idx} className={`alert ${n.ok ? "info" : "danger"}`}>
                    <strong>{n.tipo === "PRODUTOS" ? `Produtos (${n.modelo})` : "Serviços (NFS-e)"}:</strong>{" "}
                    {n.ok ? `nota ${n.numero ?? ""} ${n.status ?? ""}` : `falhou — ${n.erro ?? "erro"}`}
                  </div>
                ))}
              </div>
            )}

            <div className="pdv-acoes">
              <button className="pdv-limpar" onClick={limpar} disabled={loading}>Limpar</button>
              <button className="pdv-finalizar" onClick={abrirPagamento} disabled={loading || cart.length === 0}>Pagar {brl(total)}</button>
            </div>
          </div>
        </aside>
      </div>

      {pagamentoAberto && (
        <PagamentoModal total={total} loading={loading} onCancel={() => setPagamentoAberto(false)} onConfirm={finalizar} />
      )}
      {movimentoAberto && (
        <MovimentoModal onClose={() => setMovimentoAberto(false)} />
      )}
    </div>
  );
}

// ─── Modal de pagamento (múltiplas formas + troco) ──────────────────────────────

function PagamentoModal({ total, loading, onCancel, onConfirm }: { total: number; loading: boolean; onCancel: () => void; onConfirm: (p: Pagamento[]) => void }) {
  const [linhas, setLinhas] = useState<Pagamento[]>([{ forma: "DINHEIRO", valor: total }]);
  const pago = round2(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const troco = round2(Math.max(pago - total, 0));
  const falta = round2(Math.max(total - pago, 0));

  function set(idx: number, patch: Partial<Pagamento>) {
    setLinhas((cur) => cur.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  return (
    <div className="pdv-modal-bg" onClick={onCancel}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Pagamento — {brl(total)}</h2>
        {linhas.map((l, idx) => (
          <div className="pdv-pag-linha" key={idx}>
            <select value={l.forma} onChange={(e) => set(idx, { forma: e.target.value })}>
              {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input
              inputMode="decimal"
              value={String(l.valor)}
              onChange={(e) => set(idx, { valor: Number(e.target.value.replace(",", ".")) || 0 })}
            />
            {linhas.length > 1 && <button className="pdv-item-x" onClick={() => setLinhas((cur) => cur.filter((_, i) => i !== idx))}>×</button>}
          </div>
        ))}
        <button className="pdv-add-forma" onClick={() => setLinhas((cur) => [...cur, { forma: "PIX", valor: falta }])}>+ outra forma</button>

        <div className="pdv-pag-resumo">
          <div><span>Pago</span><strong>{brl(pago)}</strong></div>
          {falta > 0 ? <div className="falta"><span>Falta</span><strong>{brl(falta)}</strong></div> : <div className="troco"><span>Troco</span><strong>{brl(troco)}</strong></div>}
        </div>

        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="pdv-finalizar" onClick={() => onConfirm(linhas)} disabled={loading || falta > 0}>
            {loading ? "Emitindo..." : "Confirmar e emitir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de sangria / suprimento ──────────────────────────────────────────────

function MovimentoModal({ onClose }: { onClose: () => void }) {
  const [tipo, setTipo] = useState<"SANGRIA" | "SUPRIMENTO">("SANGRIA");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function registrar() {
    setLoading(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/erp/caixa/movimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: Number(valor.replace(",", ".")) || 0, descricao })
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao registrar movimento.");
      setOk(`${tipo === "SANGRIA" ? "Sangria" : "Suprimento"} registrado.`);
      setValor("");
      setDescricao("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar movimento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pdv-modal-bg" onClick={onClose}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Movimento de caixa</h2>
        {error && <div className="alert danger">{error}</div>}
        {ok && <div className="alert info">{ok}</div>}
        <div className="pdv-modelo">
          <button className={tipo === "SANGRIA" ? "active" : ""} onClick={() => setTipo("SANGRIA")}>Sangria (saída)</button>
          <button className={tipo === "SUPRIMENTO" ? "active" : ""} onClick={() => setTipo("SUPRIMENTO")}>Suprimento (entrada)</button>
        </div>
        <label className="pdv-cliente">Valor (R$)<input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
        <label className="pdv-cliente">Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" /></label>
        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onClose} disabled={loading}>Fechar</button>
          <button className="pdv-finalizar" onClick={registrar} disabled={loading}>{loading ? "Registrando..." : "Registrar"}</button>
        </div>
      </div>
    </div>
  );
}
