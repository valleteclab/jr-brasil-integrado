"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PdvData, PdvProduto, PdvServico, PdvCliente, PdvContaRecebedora, PdvMaquinaCartao } from "@/lib/services/pdv";
import { correspondeBusca } from "@/lib/search/normalize";
import { AdminPasswordModal } from "./AdminPasswordModal";

type CartItem = {
  key: string;
  kind: "produto" | "servico";
  refId: string;
  nome: string;
  preco: number;
  qtd: number;
  /** Unidade de medida do produto (UN/KG/M/L…) — só p/ exibir na linha. */
  unidade?: string;
  /** Desconto em % da LINHA. Total da linha = preço × qtd × (1 − descontoPct/100). */
  descontoPct: number;
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

type Pagamento = {
  forma: string;
  valor: number;
  contaBancariaId?: string;
  maquinaCartaoId?: string;
  nsu?: string;
  bandeira?: string;
  parcelas?: number;
  /** BOLETO: 1º vencimento escolhido (ISO date). */
  vencimento?: string;
};

type CaixaAberto = { id: string; operador: string; abertoEm: string };

const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OUTRA"];
const isPixOuTransfer = (f: string) => f === "PIX" || f === "TRANSFERENCIA";
const isCartao = (f: string) => f === "CARTAO_DEBITO" || f === "CARTAO_CREDITO";

const FORMAS_FALLBACK: Array<{ value: string; label: string }> = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "CARTAO_DEBITO", label: "Cartão débito" },
  { value: "CARTAO_CREDITO", label: "Cartão crédito" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFERENCIA", label: "Transferência" }
];
const CREDIARIO_OPCAO = { value: "CREDIARIO", label: "Crediário (a prazo)" };

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
  // Texto sendo digitado em cada input de quantidade — permite "0,5" sem o campo zerar
  // no meio da digitação. Quando o input perde foco, é convertido para number e commit
  // via definirQtd. Limpo automaticamente quando o item sai do carrinho.
  const [qtdInputs, setQtdInputs] = useState<Record<string, string>>({});
  const [clientes, setClientes] = useState(data.clientes);
  const [clienteId, setClienteId] = useState("");
  const [clienteModalAberto, setClienteModalAberto] = useState(false);
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  // Default = vendedor do usuário logado (pode trocar manualmente no select).
  const [vendedorId, setVendedorId] = useState(data.vendedorLogadoId ?? "");
  // RECIBO = venda não fiscal (só recibo HTML). Só disponível se a empresa permitir.
  const [modeloProduto, setModeloProduto] = useState<"NFCE" | "NFE" | "RECIBO">("NFCE");
  /** Senha de admin validada (vai junto no checkout — o servidor revalida). */
  const [senhaAdmin, setSenhaAdmin] = useState<string>("");
  /** Desconto global em % da venda (igual ao atendimento). */
  const [descGlobalPct, setDescGlobalPct] = useState(0);
  /** Modal "Aplicar desconto no item" (X) ou modal de senha admin (objeto). */
  const [descontoItem, setDescontoItem] = useState<CartItem | null>(null);
  const [adminModal, setAdminModal] = useState<{ motivo: string; onOk: (senha: string) => void } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [resultado, setResultado] = useState<{
    notas: NotaResultado[];
    troco: number;
    crediario: { valor: number; parcelas: number; primeiroVencimento: string } | null;
    boleto: { valor: number; parcelas: number; boletosGerados: number; primeiroVencimento: string; aviso: string | null; titulos?: Array<{ contaReceberId: string; vencimento: string; linhaDigitavel: string | null; temPdf: boolean }> } | null;
    retirada: { id: string; codigo: string } | null;
    // Aviso quando a venda foi emitida mas o recebimento NÃO entrou no caixa (lançar manualmente).
    avisoRecebimento: string | null;
  } | null>(null);
  const [retiradaExpedicao, setRetiradaExpedicao] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [movimentoAberto, setMovimentoAberto] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);

  // Atalho: cadastro completo de produto (NF-e) em nova aba, preservando a venda do PDV.
  function abrirCadastroProduto() {
    const nome = busca.trim();
    window.open(`/erp/produtos?novo=1${nome ? `&nome=${encodeURIComponent(nome)}` : ""}`, "_blank", "noopener");
  }

  // Subtotal líquido por linha (após desconto %); total final aplica também o desconto global %.
  const subtotalLiquido = useMemo(
    () => round2(cart.reduce((sum, i) => sum + i.preco * i.qtd * (1 - (i.descontoPct ?? 0) / 100), 0)),
    [cart]
  );
  const descontoGlobalVal = round2(subtotalLiquido * (descGlobalPct / 100));
  const total = round2(Math.max(0, subtotalLiquido - descontoGlobalVal));
  const temServicoNoCart = cart.some((i) => i.kind === "servico");
  // Recibo (não fiscal) e NFC-e aceitam consumidor anônimo. NF-e e serviços (NFS-e) exigem cliente.
  const precisaCliente = temServicoNoCart || modeloProduto === "NFE";
  const isRecibo = modeloProduto === "RECIBO";
  const clienteSelecionado = clientes.find((c) => c.id === clienteId) ?? null;

  const produtosFiltrados = useMemo(() => {
    if (!busca.trim()) return data.produtos.slice(0, 60);
    return data.produtos.filter((p) => correspondeBusca(busca, p.nome, p.sku, p.descricao, p.descricaoComercial, p.gtin, p.codigoOriginal, p.codigoFabricante)).slice(0, 60);
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
      return [...cur, { key: `p-${p.id}`, kind: "produto", refId: p.id, nome: p.nome, preco: p.preco, qtd: 1, descontoPct: 0, disponivel: p.disponivel, unidade: p.unidade }];
    });
    setBusca("");
    buscaRef.current?.focus();
  }

  function addServico(s: PdvServico) {
    setCart((cur) => {
      const ex = cur.find((i) => i.kind === "servico" && i.refId === s.id);
      if (ex) return cur.map((i) => (i === ex ? { ...i, qtd: i.qtd + 1 } : i));
      return [...cur, { key: `s-${s.id}`, kind: "servico", refId: s.id, nome: s.nome, preco: s.preco, qtd: 1, descontoPct: 0, codigoServicoLc116: s.codigoServicoLc116, codigoNbs: s.codigoNbs }];
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
    // Desconto é em %, independe da quantidade — só atualiza a qtd.
    setCart((cur) => cur.map((i) => (i.key === key ? { ...i, qtd: q } : i)));
  }

  // Define a quantidade absoluta (permite fração, ex.: 0,5 metro). Mesma checagem de saldo do +/-.
  function definirQtd(key: string, valor: number) {
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    const q = Math.max(0, valor);
    if (item.kind === "produto" && item.disponivel != null && q > item.disponivel) {
      const msg = `Estoque insuficiente de "${item.nome}": disponível ${item.disponivel}.`;
      if (!data.permiteVendaSemEstoque) { setError(msg); return; }
      setAviso(`${msg} Venda liberada (empresa aceita venda sem estoque).`);
    } else { setAviso(""); }
    setError("");
    setCart((cur) => cur.map((i) => (i.key === key ? { ...i, qtd: q } : i)));
  }

  function removerItem(key: string) {
    setCart((cur) => cur.filter((i) => i.key !== key));
    setQtdInputs((s) => { const n = { ...s }; delete n[key]; return n; });
  }

  function limpar() {
    setCart([]);
    setQtdInputs({});
    setClienteId("");
    setVendedorId(data.vendedorLogadoId ?? "");
    setSenhaAdmin("");
    setDescGlobalPct(0);
    setResultado(null);
    setError("");
    setPagamentoAberto(false);
  }

  // Desconto efetivo % = (subtotal bruto − total) / subtotal bruto × 100. Compara com o limite
  // da empresa (data.descontoSemAutorizacaoPct). Acima disso, abre modal de senha antes do pagto.
  function calcularDescontoPctEfetivo(): number {
    const bruto = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
    if (bruto <= 0) return 0;
    return ((bruto - total) / bruto) * 100;
  }

  function abrirPagamento() {
    if (cart.length === 0) { setError("Carrinho vazio."); return; }
    if (precisaCliente && !clienteId) {
      setError(temServicoNoCart ? "Serviços (NFS-e) exigem cliente." : "NF-e exige cliente.");
      setClienteModalAberto(true);
      return;
    }
    setError("");
    setResultado(null);
    const pctEfetivo = calcularDescontoPctEfetivo();
    const limite = Number(data.descontoSemAutorizacaoPct ?? 0);
    if (pctEfetivo > limite + 0.01 && !senhaAdmin) {
      setAdminModal({
        motivo: `Desconto de ${pctEfetivo.toFixed(2)}% acima do limite (${limite.toFixed(2)}%). Informe a senha de um administrador para liberar.`,
        onOk: (s) => { setSenhaAdmin(s); setAdminModal(null); setPagamentoAberto(true); }
      });
      return;
    }
    setPagamentoAberto(true);
  }

  async function finalizar(pagamentos: Pagamento[], condicaoCrediario: string) {
    setLoading(true);
    setError("");
    setResultado(null);
    try {
      // Converte % de linha para R$ no payload (o servidor persiste em R$ por compatibilidade).
      const payload = {
        clienteId: clienteId || null,
        vendedorId: vendedorId || null,
        // No modelo RECIBO mandamos NFCE como placeholder e o flag emitirFiscal=false separa o fluxo.
        modeloProduto: isRecibo ? "NFCE" : modeloProduto,
        emitirFiscal: !isRecibo,
        produtos: cart.filter((i) => i.kind === "produto").map((i) => ({
          produtoId: i.refId,
          quantidade: i.qtd,
          precoUnitario: i.preco,
          desconto: round2(i.preco * i.qtd * ((i.descontoPct ?? 0) / 100))
        })),
        servicos: cart.filter((i) => i.kind === "servico").map((i) => ({ descricao: i.nome, valor: i.preco * i.qtd, codigoServicoLc116: i.codigoServicoLc116, codigoNbs: i.codigoNbs })),
        pagamentos,
        condicaoCrediario: condicaoCrediario || null,
        boletoOpcoes: (() => {
          const lb = pagamentos.find((p) => p.forma === "BOLETO" && (Number(p.valor) || 0) > 0);
          return lb
            ? {
                contaBancariaId: lb.contaBancariaId ?? null,
                parcelas: lb.parcelas ?? 1,
                primeiroVencimento: lb.vencimento ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
              }
            : undefined;
        })(),
        descontoGlobal: descontoGlobalVal,
        // Senha de admin (qualquer admin do tenant) — o servidor revalida e exige se desconto > limite.
        senhaAdmin: senhaAdmin || undefined,
        retiradaExpedicao: retiradaExpedicao && cart.some((i) => i.kind === "produto")
      };
      const res = await fetch("/api/erp/pdv/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const dataRes = await res.json() as {
        notas?: NotaResultado[];
        troco?: number;
        pedidoVendaId?: string | null;
        crediario?: { valor: number; parcelas: number; primeiroVencimento: string } | null;
        boleto?: { valor: number; parcelas: number; boletosGerados: number; primeiroVencimento: string; aviso: string | null; titulos?: Array<{ contaReceberId: string; vencimento: string; linhaDigitavel: string | null; temPdf: boolean }> } | null;
        retirada?: { id: string; codigo: string } | null;
        // Recebimento não lançado no caixa — operador precisa lançar manualmente.
        avisoRecebimento?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(dataRes.error || "Falha ao finalizar.");
      const notas = dataRes.notas ?? [];
      setResultado({ notas, troco: dataRes.troco ?? 0, crediario: dataRes.crediario ?? null, boleto: dataRes.boleto ?? null, retirada: dataRes.retirada ?? null, avisoRecebimento: dataRes.avisoRecebimento ?? null });
      setCart([]);
      setClienteId("");
      setRetiradaExpedicao(false);
      setPagamentoAberto(false);
      // Impressão automática: abre o cupom/DANFE de cada nota autorizada. Para venda RECIBO
      // (modelo "RECIBO"), abre o recibo HTML do pedido (não há nota fiscal).
      for (const n of notas) {
        if (n.ok && n.modelo === "RECIBO" && dataRes.pedidoVendaId) {
          window.open(`/api/erp/vendas/${dataRes.pedidoVendaId}/recibo`, "_blank", "noopener,noreferrer");
        } else if (n.ok && n.id) {
          window.open(`/api/erp/fiscal/${n.id}/pdf`, "_blank", "noopener,noreferrer");
        }
      }
      // Recibo de retirada: abre para imprimir junto com o cupom.
      if (dataRes.retirada?.id) {
        window.open(`/api/erp/expedicao/${dataRes.retirada.id}/recibo`, "_blank", "noopener,noreferrer");
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
      else if (e.key === "F6") { e.preventDefault(); setClienteModalAberto(true); }
      else if (e.key === "F8") { e.preventDefault(); setMovimentoAberto(true); }
      else if (e.key === "Escape") {
        if (novoClienteAberto) setNovoClienteAberto(false);
        else if (clienteModalAberto) setClienteModalAberto(false);
        else if (pagamentoAberto) setPagamentoAberto(false);
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
    <div className="pdv" aria-busy={loading}>
      {loading && (
        <div className="fiscal-busy" role="alertdialog" aria-live="assertive" aria-label="Emitindo">
          <div className="fiscal-busy-card">
            <div className="fiscal-spinner" aria-hidden="true" />
            <div>
              <strong>{isRecibo ? "Fechando venda…" : `Emitindo ${modeloProduto === "NFE" ? "NF-e" : "NFC-e"}…`}</strong>
              <small>{isRecibo ? "Baixando estoque e registrando o caixa." : "Enviando à SEFAZ pela ACBr. Pode levar alguns segundos — não feche a tela."}</small>
            </div>
          </div>
        </div>
      )}
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
        <button className="pdv-mini" onClick={abrirCadastroProduto} title="Cadastrar produto (nova aba)">➕</button>
        <button className="pdv-mini" onClick={() => router.refresh()} title="Atualizar lista de produtos">🔄</button>
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
                {(() => {
                  // Descrição técnica (ex.: parafuso por bitola/material), truncada em 1 linha.
                  const desc = (p.descricao || p.descricaoComercial || "").trim();
                  if (!desc || desc.toLowerCase() === p.nome.trim().toLowerCase()) return null;
                  return <small style={{ color: "var(--erp-mute)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={desc}>{desc}</small>;
                })()}
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
            {aba === "produtos" && produtosFiltrados.length === 0 && (
              <p className="pdv-vazio">
                Nenhum produto.{" "}
                <button type="button" className="btn-erp light sm" onClick={abrirCadastroProduto} style={{ marginLeft: 6 }}>➕ Cadastrar produto</button>
              </p>
            )}
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
                <div className="pdv-item-top">
                  <span className="pdv-item-nome">{i.nome}</span>
                  <span className="pdv-item-total">{brl(i.preco * i.qtd * (1 - (i.descontoPct ?? 0) / 100))}</span>
                </div>
                <div className="pdv-item-bot">
                  <div className="pdv-item-qtd">
                    <button onClick={() => { setQtdInputs((s) => { const n = { ...s }; delete n[i.key]; return n; }); mudarQtd(i.key, -1); }}>−</button>
                    <input
                      inputMode="decimal"
                      value={qtdInputs[i.key] ?? String(i.qtd).replace(".", ",")}
                      onChange={(e) => setQtdInputs((s) => ({ ...s, [i.key]: e.target.value }))}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0;
                        setQtdInputs((s) => { const n = { ...s }; delete n[i.key]; return n; });
                        definirQtd(i.key, v);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      style={{ width: 60, textAlign: "center", border: "1px solid var(--erp-line)", borderRadius: 4, height: 28 }}
                    />
                    <button onClick={() => { setQtdInputs((s) => { const n = { ...s }; delete n[i.key]; return n; }); mudarQtd(i.key, 1); }}>+</button>
                    {i.unidade && <span style={{ fontSize: 11, color: "var(--erp-mute)", marginLeft: 4 }}>{i.unidade}</span>}
                  </div>
                  <span className="pdv-item-unit">× {brl(i.preco)}{(i.descontoPct ?? 0) > 0 ? ` − ${i.descontoPct.toFixed(2)}% desc.` : ""}</span>
                  {i.kind === "produto" && (
                    <button className="pdv-item-pct" title="Desconto no item (%)" onClick={() => setDescontoItem(i)}>%</button>
                  )}
                  <button className="pdv-item-x" onClick={() => removerItem(i.key)}>×</button>
                </div>
              </div>
            ))}
          </div>

          <div className="pdv-fechamento">
            <div className="pdv-cliente">
              <span>Cliente {precisaCliente ? <span className="req">(obrigatório)</span> : "(opcional)"}</span>
              <button type="button" className="pdv-cliente-btn" onClick={() => setClienteModalAberto(true)}>
                <span className="pdv-cliente-nome">{clienteSelecionado ? clienteSelecionado.label : "Consumidor / não identificado"}</span>
                <span className="pdv-cliente-acao">{clienteSelecionado ? "trocar" : "🔍 F6"}</span>
              </button>
            </div>
            {data.vendedores.length > 0 && (
              <label className="pdv-cliente">
                Vendedor (comissão)
                <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                  <option value="">Sem vendedor</option>
                  {data.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </label>
            )}
            {data.expedicaoHabilitada && (
              <label className="pdv-cliente" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={retiradaExpedicao}
                  onChange={(e) => setRetiradaExpedicao(e.target.checked)}
                  style={{ width: "auto" }}
                />
                📤 Retirada na expedição (imprime recibo)
              </label>
            )}
            <div className="pdv-modelo">
              <button className={modeloProduto === "NFCE" ? "active" : ""} onClick={() => setModeloProduto("NFCE")}>NFC-e (cupom)</button>
              <button className={modeloProduto === "NFE" ? "active" : ""} onClick={() => setModeloProduto("NFE")}>NF-e</button>
              {data.permiteVendaNaoFiscal && (
                <button className={modeloProduto === "RECIBO" ? "active" : ""} onClick={() => setModeloProduto("RECIBO")} title="Fechar a venda só com recibo (sem NF). Estoque e financeiro rodam normalmente.">Recibo (não fiscal)</button>
              )}
            </div>
            <label className="pdv-cliente" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>Desconto global (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={descGlobalPct}
                onChange={(e) => { setDescGlobalPct(Math.max(0, Math.min(100, Number(e.target.value) || 0))); setSenhaAdmin(""); }}
                style={{ width: 90, height: 32, padding: "0 8px", border: "1px solid var(--erp-line)", borderRadius: 4, textAlign: "right" }}
              />
            </label>
            <div className="pdv-total"><span>Total</span><strong>{brl(total)}</strong></div>

            {aviso && <div className="alert warn">{aviso}</div>}
            {error && <div className="alert danger">{error}</div>}
            {resultado && (
              <div className="pdv-resultado">
                {/* Recebimento não entrou no caixa: dinheiro a lançar manualmente — destaque para o operador. */}
                {resultado.avisoRecebimento && (
                  <div className="alert danger"><strong>Atenção</strong><span>{resultado.avisoRecebimento}</span></div>
                )}
                {resultado.troco > 0 && <div className="alert info pdv-troco">Troco: <strong>{brl(resultado.troco)}</strong></div>}
                {resultado.crediario && (
                  <div className="alert info">
                    Crediário: <strong>{brl(resultado.crediario.valor)}</strong> em {resultado.crediario.parcelas} parcela(s),
                    1º vencimento {new Date(resultado.crediario.primeiroVencimento).toLocaleDateString("pt-BR")}.
                  </div>
                )}
                {resultado.boleto && (
                  <div className={`alert ${resultado.boleto.aviso ? "warn" : "info"}`}>
                    Boleto: <strong>{brl(resultado.boleto.valor)}</strong> em {resultado.boleto.parcelas} parcela(s),
                    1º vencimento {new Date(resultado.boleto.primeiroVencimento).toLocaleDateString("pt-BR")} —{" "}
                    <strong>{resultado.boleto.boletosGerados}</strong> boleto(s) registrado(s) no banco.
                    {resultado.boleto.aviso && <><br /><strong>Atenção:</strong> {resultado.boleto.aviso}</>}
                    {(resultado.boleto.titulos ?? []).some((t) => t.temPdf) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {(resultado.boleto.titulos ?? []).map((t, i) => t.temPdf ? (
                          <a
                            key={t.contaReceberId}
                            className="btn-erp light xs"
                            href={`/api/erp/financeiro/contas-receber/${t.contaReceberId}/boleto/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            title={t.linhaDigitavel ? `Linha digitável: ${t.linhaDigitavel}` : undefined}
                          >
                            🖨 Boleto {i + 1} · {new Date(t.vencimento).toLocaleDateString("pt-BR")}
                          </a>
                        ) : null)}
                      </div>
                    )}
                  </div>
                )}
                {resultado.retirada && (
                  <div className="alert info">
                    Retirada na expedição — recibo <strong style={{ letterSpacing: 2 }}>{resultado.retirada.codigo}</strong>.{" "}
                    <a href={`/api/erp/expedicao/${resultado.retirada.id}/recibo`} target="_blank" rel="noopener noreferrer">Reimprimir recibo</a>
                  </div>
                )}
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
        <PagamentoModal total={total} loading={loading} clienteSelecionado={Boolean(clienteId)} contas={data.contas} maquinas={data.maquinas} formas={data.formas} contasCobranca={data.contasCobranca} onCancel={() => setPagamentoAberto(false)} onConfirm={finalizar} />
      )}
      {movimentoAberto && (
        <MovimentoModal onClose={() => setMovimentoAberto(false)} />
      )}
      {descontoItem && (
        <DescontoPctModal
          item={descontoItem}
          onClose={() => setDescontoItem(null)}
          onAplicar={(key, descontoPct) => {
            setCart((cur) => cur.map((i) => (i.key === key ? { ...i, descontoPct } : i)));
            // Mudou desconto → senha anterior pode não bastar mais; invalida pra revalidar no checkout.
            setSenhaAdmin("");
            setDescontoItem(null);
          }}
        />
      )}
      {adminModal && (
        <AdminPasswordModal
          motivo={adminModal.motivo}
          onAutorizado={(senha) => adminModal.onOk(senha)}
          onClose={() => setAdminModal(null)}
        />
      )}
      {clienteModalAberto && (
        <ClienteModal
          clientes={clientes}
          selecionadoId={clienteId}
          onSelecionar={(id) => { setClienteId(id); setClienteModalAberto(false); }}
          onNovo={() => { setClienteModalAberto(false); setNovoClienteAberto(true); }}
          onClose={() => setClienteModalAberto(false)}
        />
      )}
      {novoClienteAberto && (
        <NovoClientePdvModal
          onCriado={(c) => {
            setClientes((cur) => [c, ...cur.filter((x) => x.id !== c.id)]);
            setClienteId(c.id);
            setNovoClienteAberto(false);
          }}
          onClose={() => setNovoClienteAberto(false)}
        />
      )}
    </div>
  );
}

// ─── Modal de seleção de cliente (busca + atalho para cadastrar) ─────────────────

function ClienteModal({
  clientes,
  selecionadoId,
  onSelecionar,
  onNovo,
  onClose
}: {
  clientes: PdvCliente[];
  selecionadoId: string;
  onSelecionar: (id: string) => void;
  onNovo: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    const base = termo
      ? clientes.filter((c) => c.label.toLowerCase().includes(termo) || (c.documento ?? "").includes(termo.replace(/\D/g, "")))
      : clientes;
    return base.slice(0, 50);
  }, [q, clientes]);

  return (
    <div className="pdv-modal-bg" onClick={onClose}>
      <div className="pdv-modal pdv-modal-cliente" onClick={(e) => e.stopPropagation()}>
        <h2>Cliente</h2>
        <input
          autoFocus
          className="pdv-cliente-busca"
          placeholder="Buscar por nome ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="pdv-cliente-lista">
          <button type="button" className={`pdv-cliente-opt ${!selecionadoId ? "active" : ""}`} onClick={() => onSelecionar("")}>
            <span>Consumidor / não identificado</span>
            <small>venda sem cliente (NFC-e)</small>
          </button>
          {filtrados.map((c) => (
            <button key={c.id} type="button" className={`pdv-cliente-opt ${c.id === selecionadoId ? "active" : ""}`} onClick={() => onSelecionar(c.id)}>
              <span>{c.label}</span>
              {c.documento && <small>{c.documento}</small>}
            </button>
          ))}
          {filtrados.length === 0 && <p className="pdv-vazio">Nenhum cliente encontrado.</p>}
        </div>
        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onClose}>Fechar</button>
          <button className="pdv-finalizar" onClick={onNovo}>+ Cadastrar novo</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de cadastro rápido de cliente (no PDV) ────────────────────────────────

function NovoClientePdvModal({ onCriado, onClose }: { onCriado: (c: PdvCliente) => void; onClose: () => void }) {
  const [pj, setPj] = useState(false);
  const [documento, setDocumento] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function salvar() {
    if (!nome.trim()) { setError(pj ? "Informe a razão social." : "Informe o nome."); return; }
    setLoading(true);
    setError("");
    try {
      const payload = {
        razaoSocial: nome.trim(),
        documento: documento.replace(/\D/g, ""),
        status: "ATIVO",
        contatos: telefone.trim() ? [{ nome: nome.trim(), telefone: telefone.trim(), principal: true }] : [],
        enderecos: []
      };
      const res = await fetch("/api/erp/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível cadastrar o cliente.");
      onCriado({ id: d.id ?? `tmp-${Date.now()}`, label: nome.trim(), documento: documento.replace(/\D/g, "") || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar o cliente.");
      setLoading(false);
    }
  }

  return (
    <div className="pdv-modal-bg" onClick={onClose}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cadastro rápido de cliente</h2>
        {error && <div className="alert danger">{error}</div>}
        <div className="pdv-modelo">
          <button className={!pj ? "active" : ""} onClick={() => setPj(false)}>Pessoa física</button>
          <button className={pj ? "active" : ""} onClick={() => setPj(true)}>Pessoa jurídica</button>
        </div>
        <label className="pdv-cliente">{pj ? "Razão social" : "Nome completo"}
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder={pj ? "Empresa LTDA" : "Nome do cliente"} />
        </label>
        <label className="pdv-cliente">{pj ? "CNPJ" : "CPF"} (opcional)
          <input inputMode="numeric" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Somente números" />
        </label>
        <label className="pdv-cliente">Telefone (opcional)
          <input inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
        </label>
        <p className="block-muted" style={{ fontSize: 11, margin: "2px 0 0" }}>
          Para NF-e (modelo 55), complete o endereço depois em Clientes — a NFC-e não exige.
        </p>
        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="pdv-finalizar" onClick={salvar} disabled={loading}>{loading ? "Salvando…" : "Cadastrar e usar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de desconto por item (%). Senha de admin é cobrada só no fim, se necessário. ────

function DescontoPctModal({
  item,
  onClose,
  onAplicar
}: {
  item: CartItem;
  onClose: () => void;
  onAplicar: (key: string, descontoPct: number) => void;
}) {
  const [valor, setValor] = useState(item.descontoPct > 0 ? String(item.descontoPct) : "");
  const linha = round2(item.preco * item.qtd);
  const pct = round2(Number(valor.replace(",", ".")) || 0);
  const invalido = pct < 0 || pct > 100;
  const liquido = round2(linha * (1 - pct / 100));

  return (
    <div className="pdv-modal-bg" onClick={onClose}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Desconto — {item.nome}</h2>
        <p className="block-muted">Linha: {item.qtd} × {brl(item.preco)} = {brl(linha)}.</p>
        {invalido && <div className="alert danger">Desconto deve ficar entre 0 e 100%.</div>}
        <label className="pdv-cliente">Desconto na linha (%)
          <input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
        {pct > 0 && !invalido && <div className="alert info">Item ficará em <strong>{brl(liquido)}</strong>.</div>}
        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onClose}>Cancelar</button>
          <button className="pdv-finalizar" onClick={() => { if (!invalido) onAplicar(item.key, pct); }} disabled={invalido}>
            {pct === 0 ? "Remover desconto" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de pagamento (múltiplas formas + troco) ──────────────────────────────

function PagamentoModal({ total, loading, clienteSelecionado, contas, maquinas, formas, contasCobranca, onCancel, onConfirm }: { total: number; loading: boolean; clienteSelecionado: boolean; contas: PdvContaRecebedora[]; maquinas: PdvMaquinaCartao[]; formas: Array<{ id: string; nome: string; tipo: string }>; contasCobranca: Array<{ id: string; nome: string }>; onCancel: () => void; onConfirm: (p: Pagamento[], condicaoCrediario: string) => void }) {
  // 1º vencimento padrão do boleto: hoje + 30 dias.
  const vencPadraoBoleto = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  // Formas cadastradas (deduplicadas por tipo, pois o PDV opera por tipo) + Crediário (a prazo).
  const FORMAS = [
    ...(formas.length ? Array.from(new Map(formas.map((f) => [f.tipo, { value: f.tipo, label: f.nome }])).values()) : FORMAS_FALLBACK),
    CREDIARIO_OPCAO
  ];
  const [linhas, setLinhas] = useState<Pagamento[]>([{ forma: "DINHEIRO", valor: total }]);
  const [condicaoCrediario, setCondicaoCrediario] = useState("30");
  const pago = round2(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const troco = round2(Math.max(pago - total, 0));
  const falta = round2(Math.max(total - pago, 0));
  const temCrediario = linhas.some((l) => l.forma === "CREDIARIO" && (Number(l.valor) || 0) > 0);
  const temBoleto = linhas.some((l) => l.forma === "BOLETO" && (Number(l.valor) || 0) > 0);
  const crediarioSemCliente = (temCrediario || temBoleto) && !clienteSelecionado;
  const somaDinheiro = round2(linhas.filter((l) => l.forma === "DINHEIRO").reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const trocoInvalido = (temCrediario || temBoleto) && troco > somaDinheiro;

  function set(idx: number, patch: Partial<Pagamento>) {
    setLinhas((cur) => cur.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  return (
    <div className="pdv-modal-bg" onClick={onCancel}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Pagamento — {brl(total)}</h2>
        {linhas.map((l, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="pdv-pag-linha">
              <select value={l.forma} onChange={(e) => set(idx, { forma: e.target.value, contaBancariaId: undefined, maquinaCartaoId: undefined })}>
                {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input
                inputMode="decimal"
                value={String(l.valor)}
                onChange={(e) => set(idx, { valor: Number(e.target.value.replace(",", ".")) || 0 })}
              />
              {linhas.length > 1 && <button className="pdv-item-x" onClick={() => setLinhas((cur) => cur.filter((_, i) => i !== idx))}>×</button>}
            </div>
            {isPixOuTransfer(l.forma) && (
              <select value={l.contaBancariaId ?? ""} onChange={(e) => set(idx, { contaBancariaId: e.target.value || undefined })} style={{ height: 34 }}>
                <option value="">Conta recebedora…{contas.length ? "" : " (cadastre em Contas financeiras)"}</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.chavePix ? ` · PIX ${c.chavePix}` : ""}</option>)}
              </select>
            )}
            {l.forma === "BOLETO" && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <select value={l.contaBancariaId ?? ""} onChange={(e) => set(idx, { contaBancariaId: e.target.value || undefined })} style={{ flex: "1 1 100%", height: 34 }} title="Banco/conta que emite o boleto">
                  <option value="">{contasCobranca.length ? "Banco do boleto…" : "Nenhuma conta com cobrança configurada (Configurações → Contas financeiras)"}</option>
                  {contasCobranca.map((c) => <option key={c.id} value={c.id}>Boleto — {c.nome}</option>)}
                </select>
                <input type="number" min={1} max={24} value={l.parcelas ?? 1} onChange={(e) => set(idx, { parcelas: Math.max(1, Number(e.target.value) || 1) })} style={{ flex: "0 0 70px", height: 34, textAlign: "center" }} title="Parcelas do boleto (mensais)" />
                <input type="date" value={l.vencimento ?? vencPadraoBoleto} onChange={(e) => set(idx, { vencimento: e.target.value })} style={{ flex: "1 1 130px", height: 34 }} title="1º vencimento" />
              </div>
            )}
            {isCartao(l.forma) && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <select value={l.maquinaCartaoId ?? ""} onChange={(e) => set(idx, { maquinaCartaoId: e.target.value || undefined })} style={{ flex: "1 1 100%", height: 34 }}>
                  <option value="">Maquininha…{maquinas.length ? "" : " (cadastre em Máquinas de cartão)"}</option>
                  {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.adquirente ? ` · ${m.adquirente}` : ""}</option>)}
                </select>
                <input placeholder="NSU" value={l.nsu ?? ""} onChange={(e) => set(idx, { nsu: e.target.value })} style={{ flex: "1 1 90px", height: 34 }} />
                <select value={l.bandeira ?? ""} onChange={(e) => set(idx, { bandeira: e.target.value || undefined })} style={{ flex: "1 1 90px", height: 34 }}>
                  <option value="">Bandeira…</option>
                  {BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                {l.forma === "CARTAO_CREDITO" && (
                  <input type="number" min={1} max={18} value={l.parcelas ?? 1} onChange={(e) => set(idx, { parcelas: Math.max(1, Number(e.target.value) || 1) })} style={{ flex: "0 0 70px", height: 34, textAlign: "center" }} title="Parcelas" />
                )}
              </div>
            )}
          </div>
        ))}
        <button className="pdv-add-forma" onClick={() => setLinhas((cur) => [...cur, { forma: "PIX", valor: falta }])}>+ outra forma</button>

        {temCrediario && (
          <label className="pdv-cliente">
            Condição do crediário (dias, separados por barra)
            <input
              inputMode="numeric"
              value={condicaoCrediario}
              onChange={(e) => setCondicaoCrediario(e.target.value)}
              placeholder="Ex.: 30 ou 30/60/90"
            />
          </label>
        )}
        {crediarioSemCliente && <div className="alert danger">{temBoleto ? "Venda no boleto exige cliente identificado" : "Crediário exige cliente identificado"} — selecione o cliente antes de finalizar.</div>}
        {trocoInvalido && <div className="alert danger">O troco só pode sair do dinheiro — reduza o valor do crediário/boleto para fechar a conta.</div>}

        <div className="pdv-pag-resumo">
          <div><span>Pago</span><strong>{brl(pago)}</strong></div>
          {falta > 0 ? <div className="falta"><span>Falta</span><strong>{brl(falta)}</strong></div> : <div className="troco"><span>Troco</span><strong>{brl(troco)}</strong></div>}
        </div>

        <div className="pdv-acoes">
          <button className="pdv-limpar" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className="pdv-finalizar" onClick={() => onConfirm(linhas, temCrediario ? condicaoCrediario : "")} disabled={loading || falta > 0 || crediarioSemCliente || trocoInvalido}>
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
