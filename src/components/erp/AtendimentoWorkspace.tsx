"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { correspondeBusca } from "@/lib/search/normalize";
import type { SaleFormData } from "@/lib/services/sales";
import { useCadastroLookup } from "./useCadastroLookup";
import { useRealtime } from "@/lib/realtime/useRealtime";

type Tipo = "VENDA_BALCAO" | "PEDIDO_FATURADO" | "ORCAMENTO" | "OS";
type Produto = SaleFormData["produtos"][number];
type Cliente = SaleFormData["clientes"][number];
type ItemLinha = { produto: Produto; quantidade: number; preco: number; desconto: number };
type Servico = { descricao: string; horas: number; valorHora: number };

type SuccessState = {
  tipo: string;
  total: number;
  route: string;
  // Checkout de balcão (venda + nota em um clique):
  pedidoId?: string;
  pedidoNumero?: string;
  modeloLabel?: string;
  nota?: { id: string; status: string; numero: string | null; chave: string | null; motivo: string | null } | null;
  emitErro?: string | null;
};

const TIPOS: Array<{ id: Tipo; icon: string; label: string; desc: string }> = [
  { id: "VENDA_BALCAO", icon: "🛒", label: "Venda balcão", desc: "Saída imediata · NF + pagamento à vista" },
  { id: "PEDIDO_FATURADO", icon: "📦", label: "Pedido faturado", desc: "Faturamento com prazo · entrega ou retirada" },
  { id: "OS", icon: "🔧", label: "Ordem de Serviço", desc: "Oficina · serviços + peças aplicadas" },
  { id: "ORCAMENTO", icon: "📄", label: "Orçamento", desc: "Cotação com validade · sem baixa de estoque" }
];

const PAGAMENTOS = [
  { id: "Pix à vista", s: "Confirmação imediata" },
  { id: "Dinheiro", s: "Pagamento em espécie" },
  { id: "Cartão débito", s: "Maquininha · à vista" },
  { id: "Cartão crédito", s: "Parcelado" },
  { id: "Boleto 30 dias", s: "Faturado · sujeito a aprovação" },
  { id: "Faturado 30/60/90", s: "Cliente com limite aprovado" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function AtendimentoWorkspace({ data, defaultTipo = "VENDA_BALCAO", allowedTipos }: { data: SaleFormData; defaultTipo?: Tipo; allowedTipos?: Tipo[] }) {
  // Só os tipos liberados pelo dono do SaaS aparecem no seletor (default: todos).
  const tiposVisiveis = allowedTipos ? TIPOS.filter((t) => allowedTipos.includes(t.id)) : TIPOS;
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [clientes, setClientes] = useState<Cliente[]>(data.clientes);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [items, setItems] = useState<ItemLinha[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [veiculo, setVeiculo] = useState({ desc: "", placa: "", km: "" });
  const [diagnostico, setDiagnostico] = useState("");
  const [pagamento, setPagamento] = useState(PAGAMENTOS[0].id);
  const [descGlobal, setDescGlobal] = useState(0);
  const [frete, setFrete] = useState(0);
  const [obs, setObs] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [condicao, setCondicao] = useState("");
  const [validadeDias, setValidadeDias] = useState(7);
  const [showCli, setShowCli] = useState(false);
  const [showNovoCli, setShowNovoCli] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // Tempo real: atualiza o estoque disponível dos produtos enquanto o vendedor monta a venda
  // (outra venda/caixa baixou ou reservou saldo). router.refresh() só re-busca os dados do
  // servidor — o carrinho, o cliente e os modais (estado local) são preservados pelo React.
  // Não atualiza no meio de um envio (saving) para não competir com a operação em curso.
  useRealtime(["vendas"], () => {
    if (!saving) router.refresh();
  });

  const isOs = tipo === "OS";
  const isOrcamento = tipo === "ORCAMENTO";
  const isVendaPedido = tipo === "VENDA_BALCAO" || tipo === "PEDIDO_FATURADO";

  const subtotalItens = useMemo(
    () => items.reduce((s, it) => s + it.quantidade * it.preco * (1 - it.desconto / 100), 0),
    [items]
  );
  const subtotalServ = isOs ? servicos.reduce((s, sv) => s + sv.horas * sv.valorHora, 0) : 0;
  const subtotal = subtotalItens + subtotalServ;
  const descontoVal = subtotal * (descGlobal / 100);
  const total = Math.max(subtotal - descontoVal + (isVendaPedido ? Number(frete) || 0 : 0), 0);

  // Adiciona/incrementa um produto SEM fechar o seletor — permite adicionar vários itens seguidos.
  function addItem(p: Produto) {
    setItems((cur) => {
      const ex = cur.find((it) => it.produto.id === p.id);
      if (ex) return cur.map((it) => (it.produto.id === p.id ? { ...it, quantidade: it.quantidade + 1 } : it));
      return [...cur, { produto: p, quantidade: 1, preco: p.preco, desconto: 0 }];
    });
  }
  const updItem = (id: string, patch: Partial<ItemLinha>) =>
    setItems((cur) => cur.map((it) => (it.produto.id === id ? { ...it, ...patch } : it)));
  const rmItem = (id: string) => setItems((cur) => cur.filter((it) => it.produto.id !== id));

  // Cliente recém-cadastrado pelo drawer: entra na lista local e já fica selecionado.
  function onClienteCriado(novo: Cliente) {
    setClientes((cur) => [novo, ...cur.filter((c) => c.id !== novo.id)]);
    setCliente(novo);
    setShowNovoCli(false);
    setShowCli(false);
  }

  const addServico = () => setServicos((cur) => [...cur, { descricao: "", horas: 1, valorHora: 180 }]);
  const updServ = (i: number, patch: Partial<Servico>) =>
    setServicos((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const rmServ = (i: number) => setServicos((cur) => cur.filter((_, idx) => idx !== i));

  function reset() {
    setItems([]); setServicos([]); setDescGlobal(0); setFrete(0); setObs("");
    setCliente(null); setVeiculo({ desc: "", placa: "", km: "" }); setDiagnostico(""); setError("");
  }

  const canFinalize = isOs ? (servicos.length > 0 || items.length > 0) : items.length > 0 || isOrcamento;

  // Venda balcão em um clique: cria + confirma + emite a nota (NFC-e/NF-e) numa só ação.
  // Pré-venda: envia a venda do balcão para o caixa cobrar e emitir (AGUARDANDO_PAGAMENTO).
  // Cria o pedido de balcão (pré-venda para o caixa ou rascunho) e devolve id/numero.
  async function criarPedido(statusInicial: "AGUARDANDO_PAGAMENTO" | "RASCUNHO"): Promise<{ id: string; numero: string }> {
    const itensPayload = items.map((it) => ({
      produtoId: it.produto.id,
      quantidade: it.quantidade,
      precoUnitario: it.preco,
      desconto: Math.round(it.quantidade * it.preco * (it.desconto / 100) * 100) / 100
    }));
    const res = await fetch("/api/erp/vendas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId: cliente?.id ?? null, canal: "BALCAO", statusInicial,
        itens: itensPayload, desconto: descontoVal, frete: Number(frete) || 0,
        formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs
      })
    });
    const p = await res.json();
    if (!res.ok) throw new Error(p.error || "Falha ao salvar a venda.");
    return { id: p.id, numero: p.numero };
  }

  async function enviarParaCaixa() {
    setError("");
    if (!items.length) { setError("Adicione ao menos um item."); return; }
    setSaving(true);
    try {
      const p = await criarPedido("AGUARDANDO_PAGAMENTO");
      setSuccess({ tipo: "Pré-venda", total, route: "/erp/caixa", pedidoId: p.id, pedidoNumero: p.numero });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar para o caixa.");
    } finally {
      setSaving(false);
    }
  }

  // Imprimir recibo: cria a pré-venda (vai para o caixa, com a forma escolhida) e abre o recibo A4
  // para o cliente levar ao caixa. O painel de sucesso oferece também a versão 80mm (térmica).
  async function imprimirRecibo() {
    setError("");
    if (!items.length) { setError("Adicione ao menos um item."); return; }
    setSaving(true);
    try {
      const p = await criarPedido("AGUARDANDO_PAGAMENTO");
      window.open(`/api/erp/vendas/${p.id}/recibo?formato=a4`, "_blank", "noopener,noreferrer");
      setSuccess({ tipo: "Pré-venda", total, route: "/erp/caixa", pedidoId: p.id, pedidoNumero: p.numero });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível imprimir o recibo.");
    } finally {
      setSaving(false);
    }
  }

  async function salvarRascunho() {
    setError("");
    if (!items.length) { setError("Adicione ao menos um item."); return; }
    setSaving(true);
    try {
      const p = await criarPedido("RASCUNHO");
      setSuccess({ tipo: "Rascunho", total, route: "/erp/vendas", pedidoNumero: p.numero });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizeBalcao(modelo: "NFCE" | "NFE") {
    setError("");
    if (!cliente && modelo === "NFE") { setError("NF-e exige cliente. Selecione o cliente ou use NFC-e."); return; }
    if (!items.length) { setError("Adicione ao menos um item."); return; }

    setSaving(true);
    try {
      const itensPayload = items.map((it) => ({
        produtoId: it.produto.id,
        quantidade: it.quantidade,
        precoUnitario: it.preco,
        desconto: Math.round(it.quantidade * it.preco * (it.desconto / 100) * 100) / 100
      }));
      const res = await fetch("/api/erp/vendas/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: cliente?.id ?? null, canal: "BALCAO", itens: itensPayload,
          desconto: descontoVal, frete: Number(frete) || 0,
          formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs, modelo
        })
      });
      const p = await res.json();
      if (!res.ok) throw new Error(p.error || "Falha ao finalizar a venda.");
      setSuccess({
        tipo: "Venda",
        total,
        route: "/erp/vendas",
        pedidoNumero: p.pedidoNumero,
        modeloLabel: modelo === "NFCE" ? "NFC-e" : "NF-e",
        nota: p.nota
          ? { id: p.nota.id, status: p.nota.status, numero: p.nota.numero, chave: p.nota.chaveAcesso, motivo: p.nota.motivo }
          : null,
        emitErro: p.emitErro ?? null
      });
      // Nota autorizada: abre o cupom/DANFE para impressão imediata (o painel de sucesso
      // mantém o link "Baixar PDF" caso o navegador bloqueie o pop-up).
      if (p.nota?.status === "AUTORIZADA" && p.nota?.id) {
        window.open(`/api/erp/fiscal/${p.nota.id}/pdf`, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível finalizar a venda.");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setError("");
    if (!cliente) { setError("Selecione um cliente."); return; }
    if (isOs && !veiculo.desc.trim()) { setError("Informe o veículo/equipamento."); return; }
    if (!canFinalize) { setError("Adicione ao menos um item."); return; }

    setSaving(true);
    try {
      const itensPayload = items.map((it) => ({
        produtoId: it.produto.id,
        quantidade: it.quantidade,
        precoUnitario: it.preco,
        desconto: Math.round(it.quantidade * it.preco * (it.desconto / 100) * 100) / 100
      }));

      if (isOrcamento) {
        const res = await fetch("/api/erp/orcamentos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, itens: itensPayload, validadeDias, desconto: descontoVal, vendedor, condicaoPagamento: condicao, observacaoVendedor: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao criar orçamento.");
        setSuccess({ tipo: "Orçamento", total, route: "/erp/orcamentos" });
      } else if (isOs) {
        const res = await fetch("/api/erp/os", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, equipamento: veiculo.desc, placaOuSerial: veiculo.placa, problemaRelatado: diagnostico, observacoes: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao abrir OS.");
        for (const s of servicos.filter((x) => x.descricao.trim())) {
          await fetch(`/api/erp/os/${p.id}/servico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao: s.descricao, horas: s.horas, valorHora: s.valorHora }) });
        }
        for (const it of items) {
          await fetch(`/api/erp/os/${p.id}/peca`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produtoId: it.produto.id, quantidade: it.quantidade, precoUnitario: it.preco }) });
        }
        setSuccess({ tipo: "Ordem de serviço", total, route: p.id ? `/erp/os/${p.id}` : "/erp/os" });
      } else {
        const res = await fetch("/api/erp/vendas", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, canal: tipo === "VENDA_BALCAO" ? "BALCAO" : "FATURADO", itens: itensPayload, desconto: descontoVal, frete: Number(frete) || 0, formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao concluir a venda.");
        setSuccess({ tipo: tipo === "VENDA_BALCAO" ? "Venda" : "Pedido", total, route: "/erp/vendas" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o atendimento.");
    } finally {
      setSaving(false);
    }
  }

  const acaoLabel = !cliente ? "Selecione um cliente" : !canFinalize ? "Adicione ao menos um item"
    : tipo === "VENDA_BALCAO" ? `Finalizar venda · ${brl(total)}`
    : tipo === "PEDIDO_FATURADO" ? `Confirmar pedido · ${brl(total)}`
    : isOs ? `Abrir OS · ${brl(total)}` : `Enviar orçamento · ${brl(total)}`;

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">Operação <span className="sep">/</span> Novo atendimento</div>
          <h1 className="erp-page-title">Novo atendimento</h1>
          <p className="erp-page-sub">Crie venda balcão, pedido faturado, ordem de serviço ou orçamento.</p>
        </div>
        <button type="button" className="btn-erp ghost sm" onClick={reset}>Limpar tudo</button>
      </div>

      <div className="atend-types">
        {tiposVisiveis.map((t) => (
          <button key={t.id} type="button" className={`atend-type${tipo === t.id ? " active" : ""}`} onClick={() => setTipo(t.id)}>
            <span className="ic" aria-hidden="true">{t.icon}</span>
            <span><strong>{t.label}</strong><small>{t.desc}</small></span>
          </button>
        ))}
      </div>

      {error && <div className="alert danger"><span className="lead">Atenção:</span> {error}</div>}

      <div className="atend-grid">
        <div className="atend-main">
          {/* Cliente */}
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Cliente {!isOrcamento ? null : <span style={{ color: "var(--erp-danger)", fontSize: 11, marginLeft: 4 }}>*obrigatório</span>}</h3>
              <button type="button" className="btn-erp ghost xs" onClick={() => setShowCli(true)}>{cliente ? "Trocar" : "+ Selecionar"}</button>
            </div>
            <div className="atend-client">
              <span className="avatar" aria-hidden="true">{cliente ? "👤" : "👥"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{cliente ? cliente.label : "Consumidor final"}</strong>
                <small>{cliente?.documento || "Selecione o cliente do atendimento"}</small>
              </div>
            </div>
          </div>

          {/* OS: veículo */}
          {isOs && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Veículo / Equipamento</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <label className="full">Descrição (modelo, ano, série)<input value={veiculo.desc} onChange={(e) => setVeiculo({ ...veiculo, desc: e.target.value })} placeholder="Ex.: Trator John Deere 7200J · 2019" /></label>
                <label>Placa / Série<input value={veiculo.placa} onChange={(e) => setVeiculo({ ...veiculo, placa: e.target.value })} /></label>
                <label>KM / Horímetro<input value={veiculo.km} onChange={(e) => setVeiculo({ ...veiculo, km: e.target.value })} /></label>
                <label className="full">Diagnóstico inicial / problema<textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} /></label>
              </div>
            </div>
          )}

          {/* OS: serviços */}
          {isOs && (
            <div className="erp-card">
              <div className="erp-card-head">
                <h3>Serviços executados</h3>
                <button type="button" className="btn-erp ghost xs" onClick={addServico}>+ Adicionar serviço</button>
              </div>
              {servicos.length === 0 ? (
                <div className="empty-st"><h4>Sem serviços</h4><p>Adicione os serviços que serão executados.</p></div>
              ) : (
                <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                  <table className="erp-table">
                    <thead><tr><th style={{ width: "52%" }}>Descrição</th><th className="num">Horas</th><th className="num">Vlr/hora</th><th className="num">Subtotal</th><th className="actions" /></tr></thead>
                    <tbody>
                      {servicos.map((s, i) => (
                        <tr key={i}>
                          <td><input value={s.descricao} onChange={(e) => updServ(i, { descricao: e.target.value })} placeholder="Ex.: Balanceamento + alinhamento" style={cellInput} /></td>
                          <td className="num"><input type="number" min={0.5} step={0.5} value={s.horas} onChange={(e) => updServ(i, { horas: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num"><input type="number" value={s.valorHora} onChange={(e) => updServ(i, { valorHora: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num bold">{brl(s.horas * s.valorHora)}</td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmServ(i)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Itens / Peças */}
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>{isOs ? "Peças aplicadas" : "Itens"}</h3>
              <div className="actions">
                <button type="button" className="btn-erp ghost xs">Importar lista</button>
                <button type="button" className="btn-erp primary xs" onClick={() => setShowProd(true)}>+ Adicionar item</button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="empty-st">
                <div style={{ fontSize: 32, opacity: .5 }} aria-hidden="true">⬚</div>
                <h4 style={{ marginTop: 10 }}>Nenhum item adicionado</h4>
                <p>Busque por código, nome ou marca para incluir produtos.</p>
                <button type="button" className="btn-erp primary sm" style={{ marginTop: 8 }} onClick={() => setShowProd(true)}>+ Adicionar produto</button>
              </div>
            ) : (
              <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                <table className="erp-table">
                  <thead><tr><th>SKU</th><th>Produto</th><th className="num">Qtd</th><th className="num">Preço un.</th><th className="num">% Desc.</th><th className="num">Subtotal</th><th className="actions" /></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const sub = it.quantidade * it.preco * (1 - it.desconto / 100);
                      return (
                        <tr key={it.produto.id}>
                          <td className="mono bold">{it.produto.sku}</td>
                          <td><div style={{ fontWeight: 600 }}>{it.produto.nome}</div><span className="sublabel">{it.produto.disponivel} em estoque</span></td>
                          <td className="num"><input type="number" min={1} value={it.quantidade} onChange={(e) => updItem(it.produto.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })} style={cellNum} /></td>
                          <td className="num"><input type="number" value={it.preco} onChange={(e) => updItem(it.produto.id, { preco: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num"><input type="number" min={0} max={100} value={it.desconto} onChange={(e) => updItem(it.produto.id, { desconto: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={cellNum} /></td>
                          <td className="num bold">{brl(sub)}</td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmItem(it.produto.id)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Observações (não-OS) */}
          {!isOs && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Observações</h3></div>
              <div className="erp-card-body"><textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas internas, instruções de entrega, observações ao cliente…" style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 5, fontSize: 12.5, resize: "vertical", fontFamily: "inherit" }} /></div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL */}
        <aside className="atend-rail">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Totais</h3></div>
            <div className="erp-card-body">
              {isOs && servicos.length > 0 && <div className="atend-total-row"><span>Serviços ({servicos.reduce((s, x) => s + x.horas, 0)}h)</span><b>{brl(subtotalServ)}</b></div>}
              <div className="atend-total-row"><span>{isOs ? "Peças" : "Itens"} ({items.reduce((s, it) => s + it.quantidade, 0)})</span><b>{brl(subtotalItens)}</b></div>
              <div className="atend-total-row"><span>Subtotal</span><b>{brl(subtotal)}</b></div>
              <div className="atend-total-row">
                <span>Desconto global</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input className="pct-input" type="number" min={0} max={100} value={descGlobal} onChange={(e) => setDescGlobal(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /> %
                  <span style={{ minWidth: 70, textAlign: "right", color: "var(--erp-danger)", fontWeight: 600 }}>{descontoVal > 0 ? `-${brl(descontoVal)}` : "—"}</span>
                </span>
              </div>
              {isVendaPedido && (
                <div className="atend-total-row">
                  <span>Frete</span>
                  <span>R$ <input className="pct-input" style={{ width: 90 }} type="number" min={0} value={frete} onChange={(e) => setFrete(Number(e.target.value) || 0)} /></span>
                </div>
              )}
              <div className="atend-total-row grand"><span>Total</span><strong>{brl(total)}</strong></div>
            </div>
          </div>

          {isVendaPedido && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Pagamento</h3></div>
              <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PAGAMENTOS.map((pg) => (
                  <label key={pg.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${pagamento === pg.id ? "var(--erp-yellow)" : "var(--erp-line)"}`, background: pagamento === pg.id ? "rgba(255,193,7,.06)" : "#fff", borderRadius: 5, cursor: "pointer" }}>
                    <input type="radio" checked={pagamento === pg.id} onChange={() => setPagamento(pg.id)} style={{ accentColor: "var(--erp-yellow-dk)" }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{pg.id}</div><div style={{ fontSize: 10.5, color: "var(--erp-slate)" }}>{pg.s}</div></div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isOrcamento && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Validade & condições</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>Validade (dias)<input type="number" min={1} value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))} /></label>
                <label>Vendedor<input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor" /></label>
                <label>Condição de pagamento<input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: 30/60/90" /></label>
              </div>
            </div>
          )}

          {(isVendaPedido || isOs) && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>{isOs ? "Atribuição" : "Condições"}</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>{isOs ? "Vendedor / técnico" : "Vendedor"}<input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome" /></label>
                <label>Condição de pagamento<input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: 30/60/90 ou à vista" /></label>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tipo === "VENDA_BALCAO" ? (
              <>
                <button type="button" className="btn-erp primary lg" disabled={!canFinalize || saving} onClick={enviarParaCaixa}>
                  {saving ? "Processando…" : `Enviar para o caixa · ${brl(total)}`}
                </button>
                {/* Finalizar direto (sem caixa) só quando a empresa habilita nas configurações. */}
                {data.permiteVendaDiretaBalcao && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={() => finalizeBalcao("NFCE")}>
                      Finalizar direto + NFC-e
                    </button>
                    <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!cliente || !canFinalize || saving} onClick={() => finalizeBalcao("NFE")}>
                      + NF-e
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button type="button" className="btn-erp primary lg" disabled={!cliente || !canFinalize || saving} onClick={finalize}>{saving ? "Processando…" : acaoLabel}</button>
            )}
            {isVendaPedido && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={imprimirRecibo} title="Cria a pré-venda e imprime o recibo para o cliente levar ao caixa">🖨 Imprimir recibo</button>
                <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={salvarRascunho}>Salvar rascunho</button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* CLIENTE PICKER */}
      {showCli && (
        <PickerDrawer title="Selecionar cliente" placeholder="Buscar por nome ou documento…" onClose={() => setShowCli(false)}
          rows={clientes} filter={(c, q) => c.label.toLowerCase().includes(q) || (c.documento ?? "").toLowerCase().includes(q)}
          headerActions={
            <button type="button" className="btn-erp primary sm" onClick={() => { setShowCli(false); setShowNovoCli(true); }}>+ Novo cliente</button>
          }
          render={(c) => (
            <tr key={c.id} onClick={() => { setCliente(c); setShowCli(false); }}>
              <td><div style={{ fontWeight: 600 }}>{c.label}</div></td>
              <td className="mono">{c.documento || "—"}</td>
            </tr>
          )}
          headers={["Cliente", "Documento"]} />
      )}

      {/* NOVO CLIENTE (PJ/PF com busca por CNPJ/CEP) */}
      {showNovoCli && (
        <NovoClienteDrawer onClose={() => setShowNovoCli(false)} onCreated={onClienteCriado} />
      )}

      {/* PRODUTO PICKER — adiciona vários sem fechar */}
      {showProd && (
        <ProdutoPickerMulti
          produtos={data.produtos}
          items={items}
          permiteVendaSemEstoque={data.permiteVendaSemEstoque}
          onAdd={addItem}
          onRemove={rmItem}
          onClose={() => setShowProd(false)}
        />
      )}

      {/* SUCCESS */}
      {success && (() => {
        const fechar = () => { setSuccess(null); reset(); };
        const n = success.nota;
        const autorizada = n?.status === "AUTORIZADA";
        const processando = n?.status === "PROCESSANDO";
        // "Falhou" = checkout de balcão em que a nota não foi autorizada (a venda continua válida).
        const falhou = Boolean(success.emitErro) || (n != null && !autorizada && !processando);
        const isCheckout = Boolean(success.nota || success.emitErro || success.modeloLabel);
        const tone = autorizada || !isCheckout ? "success" : falhou ? "danger" : "warn";
        const visual =
          tone === "success" ? { bg: "rgba(22,163,74,.15)", c: "var(--erp-success)", ic: "✓" }
          : tone === "danger" ? { bg: "rgba(220,38,38,.15)", c: "var(--erp-danger)", ic: "!" }
          : { bg: "rgba(217,119,6,.15)", c: "var(--erp-warn)", ic: "⏳" };
        const titulo = !isCheckout
          ? `${success.tipo} criada!`
          : autorizada ? `Venda concluída · ${success.modeloLabel} autorizada`
          : falhou ? "Venda registrada · nota pendente"
          : "Venda concluída · nota em processamento";
        const motivo = success.emitErro || (n && !autorizada ? n.motivo : null);
        return (
        <div className="drawer-bd" style={{ display: "grid", placeItems: "center" }} onClick={fechar}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 36, maxWidth: 480, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: "50%", background: visual.bg, color: visual.c, display: "grid", placeItems: "center", fontSize: 30 }} aria-hidden="true">{visual.ic}</div>
            <h2 style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 26, margin: "0 0 6px" }}>{titulo}</h2>
            <p style={{ color: "var(--erp-slate)", margin: "0 0 12px", fontSize: 13.5 }}>
              {success.pedidoNumero ? `Pedido ${success.pedidoNumero} · ` : ""}Total {brl(success.total)}
              {autorizada && n?.numero ? ` · ${success.modeloLabel} nº ${n.numero}` : ""}
            </p>
            {motivo && (
              <div className="alert danger" style={{ textAlign: "left", marginBottom: 12 }}><span className="lead">Motivo:</span> {motivo}</div>
            )}
            {falhou && (
              <p style={{ color: "var(--erp-slate)", margin: "0 0 16px", fontSize: 12.5 }}>
                A venda foi registrada e o estoque baixado. Corrija o problema e reemita a nota em Vendas — sem refazer a venda.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn-erp ghost sm" onClick={fechar}>Novo atendimento</button>
              {success.pedidoId && !isCheckout && (
                <>
                  <a className="btn-erp ghost sm" href={`/api/erp/vendas/${success.pedidoId}/recibo?formato=a4`} target="_blank" rel="noopener noreferrer">🖨 Recibo A4</a>
                  <a className="btn-erp ghost sm" href={`/api/erp/vendas/${success.pedidoId}/recibo`} target="_blank" rel="noopener noreferrer">🖨 80mm</a>
                </>
              )}
              {autorizada && n && (
                <>
                  <a className="btn-erp ghost sm" href={`/api/erp/fiscal/${n.id}/pdf`} target="_blank" rel="noopener noreferrer">Baixar PDF</a>
                  <button type="button" className="btn-erp primary sm" onClick={() => router.push(`/erp/fiscal/${n.id}`)}>Ver nota →</button>
                </>
              )}
              {falhou && (
                <button type="button" className="btn-erp primary sm" onClick={() => router.push("/erp/vendas")}>Reemitir em Vendas →</button>
              )}
              {!autorizada && !falhou && (
                <button type="button" className="btn-erp primary sm" onClick={() => router.push(success.route)}>Ver na lista →</button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

const cellInput: React.CSSProperties = { width: "100%", height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 8px", fontSize: 12.5 };
const cellNum: React.CSSProperties = { width: 70, height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 6px", fontSize: 12.5, textAlign: "right" };

function PickerDrawer<T>({ title, placeholder, headers, rows, filter, render, onClose, headerActions }: {
  title: string; placeholder: string; headers: string[]; rows: T[];
  filter: (row: T, q: string) => boolean; render: (row: T) => React.ReactNode; onClose: () => void;
  headerActions?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const list = rows.filter((r) => !q || filter(r, q.toLowerCase())).slice(0, 30);
  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer" style={{ width: 640 }}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {headerActions}
            <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
          </div>
        </header>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--erp-line)" }}>
          <input autoFocus placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13 }} />
        </div>
        <div className="drawer-body">
          <table className="erp-table">
            <thead><tr>{headers.map((h, i) => <th key={h} className={i >= headers.length - 2 && headers.length > 2 ? "num" : ""}>{h}</th>)}</tr></thead>
            <tbody>{list.map(render)}</tbody>
          </table>
          {!list.length && <div className="empty-st"><h4>Nenhum resultado</h4><p>Tente outro termo.</p></div>}
        </div>
      </aside>
    </>
  );
}

// Seletor de produtos com adição múltipla: a cada clique adiciona/incrementa o item e mostra
// a quantidade já no carrinho, sem fechar o drawer. Botão "Concluir" volta para a venda.
function ProdutoPickerMulti({ produtos, items, permiteVendaSemEstoque, onAdd, onRemove, onClose }: {
  produtos: Produto[]; items: ItemLinha[]; permiteVendaSemEstoque: boolean; onAdd: (p: Produto) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState("");
  const qtyById = new Map(items.map((it) => [it.produto.id, it.quantidade]));
  const list = produtos
    .filter((p) => correspondeBusca(q, p.sku, p.nome, p.descricao, p.descricaoComercial, p.gtin, p.codigoOriginal, p.codigoFabricante))
    .slice(0, 50);
  const totalItens = items.reduce((s, it) => s + it.quantidade, 0);

  // Bloqueia adicionar produto sem saldo quando a empresa não aceita venda sem estoque.
  function tentarAdd(p: Produto) {
    const noCarrinho = qtyById.get(p.id) ?? 0;
    if (!permiteVendaSemEstoque && noCarrinho + 1 > p.disponivel) {
      setAviso(
        p.disponivel <= 0
          ? `"${p.nome}" está sem estoque (disponível 0). A empresa não aceita venda sem estoque.`
          : `Estoque insuficiente de "${p.nome}": disponível ${p.disponivel}, no carrinho ${noCarrinho}.`
      );
      return;
    }
    setAviso("");
    onAdd(p);
  }
  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer" style={{ width: 680 }}>
        <header className="drawer-head">
          <h2>Adicionar produtos</h2>
          <button type="button" className="btn-erp primary sm" onClick={onClose}>Concluir ({totalItens})</button>
        </header>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--erp-line)" }}>
          <input autoFocus placeholder="Busque por SKU, código de barras, código interno/fabricante, nome ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13 }} />
          {aviso && <div className="alert danger" style={{ marginTop: 10 }}><span className="lead">Sem estoque:</span> {aviso}</div>}
        </div>
        <div className="drawer-body">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th className="num">Estoque</th><th className="num">Preço</th><th className="num">No carrinho</th><th className="actions" /></tr></thead>
            <tbody>
              {list.map((p) => {
                const qty = qtyById.get(p.id) ?? 0;
                return (
                  <tr key={p.id} style={{ cursor: "pointer", background: qty > 0 ? "rgba(255,193,7,.06)" : undefined }} onClick={() => tentarAdd(p)}>
                    <td className="mono bold">{p.sku}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nome}</div>
                      {(() => {
                        // Descrição técnica (ou comercial) — ajuda a identificar o item certo
                        // (ex.: parafuso por bitola/rosca/material). Só mostra se acrescentar algo ao nome.
                        const desc = (p.descricao || p.descricaoComercial || "").trim();
                        if (!desc || desc.toLowerCase() === p.nome.trim().toLowerCase()) return null;
                        return <div style={{ fontSize: 11, color: "var(--erp-mute)", marginTop: 2, lineHeight: 1.35 }}>{desc}</div>;
                      })()}
                    </td>
                    <td className="num bold" style={{ color: p.disponivel <= 0 ? "var(--erp-danger)" : p.disponivel <= 5 ? "var(--erp-warn)" : "var(--erp-success)" }}>{p.disponivel}</td>
                    <td className="num bold">{brl(p.preco)}</td>
                    <td className="num bold">{qty > 0 ? `${qty}×` : "—"}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {qty > 0 && <button type="button" className="btn-erp ghost xs icon-only" aria-label="Remover" onClick={() => onRemove(p.id)}>✕</button>}
                      <button type="button" className="btn-erp primary xs" onClick={() => tentarAdd(p)}>+ Add</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <div className="empty-st"><h4>Nenhum resultado</h4><p>Tente outro termo.</p></div>}
        </div>
      </aside>
    </>
  );
}

type NovoClienteTipo = "PJ" | "PF";

// Drawer de cadastro rápido de cliente (PJ/PF) com autopreenchimento por CNPJ (Receita) e CEP.
function NovoClienteDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Cliente) => void }) {
  const { buscarCnpj, buscarCep, buscandoCnpj, buscandoCep, erro: lookupErro } = useCadastroLookup();
  const [tipoPessoa, setTipoPessoa] = useState<NovoClienteTipo>("PJ");
  const [documento, setDocumento] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [ibge, setIbge] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function preencherPorCnpj() {
    const d = await buscarCnpj(documento);
    if (!d) return;
    if (d.razaoSocial) setRazaoSocial(d.razaoSocial);
    if (d.nomeFantasia) setNomeFantasia(d.nomeFantasia);
    if (d.email) setEmail(d.email);
    if (d.telefone) setTelefone(d.telefone);
    if (d.endereco.cep) setCep(d.endereco.cep);
    if (d.endereco.logradouro) setLogradouro(d.endereco.logradouro);
    if (d.endereco.numero) setNumero(d.endereco.numero);
    if (d.endereco.bairro) setBairro(d.endereco.bairro);
    if (d.endereco.cidade) setCidade(d.endereco.cidade);
    if (d.endereco.uf) setUf(d.endereco.uf);
    if (d.endereco.codigoMunicipioIbge) setIbge(d.endereco.codigoMunicipioIbge);
  }

  async function preencherPorCep() {
    const d = await buscarCep(cep);
    if (!d) return;
    if (d.logradouro) setLogradouro(d.logradouro);
    if (d.bairro) setBairro(d.bairro);
    if (d.cidade) setCidade(d.cidade);
    if (d.uf) setUf(d.uf);
    if (d.codigoMunicipioIbge) setIbge(d.codigoMunicipioIbge);
  }

  async function salvar() {
    setError("");
    if (!razaoSocial.trim()) { setError(tipoPessoa === "PJ" ? "Informe a razão social." : "Informe o nome."); return; }
    if (!documento.trim()) { setError(tipoPessoa === "PJ" ? "Informe o CNPJ." : "Informe o CPF."); return; }
    setSaving(true);
    try {
      const enderecoValido = cidade.trim() && uf.trim();
      const payload = {
        razaoSocial: razaoSocial.trim(),
        nomeFantasia: nomeFantasia.trim() || null,
        documento: documento.trim(),
        status: "ATIVO",
        contatos: (email.trim() || telefone.trim())
          ? [{ nome: nomeFantasia.trim() || razaoSocial.trim(), email: email.trim() || null, telefone: telefone.trim() || null, principal: true }]
          : [],
        enderecos: enderecoValido
          ? [{
              apelido: "Principal", cep: cep.trim(), logradouro: logradouro.trim(), numero: numero.trim() || null,
              bairro: bairro.trim() || null, cidade: cidade.trim(), uf: uf.trim().toUpperCase(),
              codigoMunicipioIbge: ibge.trim() || null, padrao: true
            }]
          : []
      };
      const res = await fetch("/api/erp/clientes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar o cliente.");
      const label = nomeFantasia.trim() ? `${nomeFantasia.trim()} (${razaoSocial.trim()})` : razaoSocial.trim();
      onCreated({ id: data.id ?? `tmp-${Date.now()}`, label, documento: documento.replace(/\D/g, "") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  const isPj = tipoPessoa === "PJ";
  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer" style={{ width: 560 }}>
        <header className="drawer-head"><h2>Novo cliente</h2><button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button></header>
        <div className="drawer-body">
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <button type="button" className={`btn-erp ${isPj ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setTipoPessoa("PJ")}>Pessoa Jurídica</button>
            <button type="button" className={`btn-erp ${!isPj ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setTipoPessoa("PF")}>Pessoa Física</button>
          </div>
          <div className="erp-form">
            <label className="full">
              {isPj ? "CNPJ" : "CPF"}
              <span style={{ display: "flex", gap: 6 }}>
                <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder={isPj ? "Somente números" : "Somente números"} style={{ flex: 1 }} />
                {isPj && (
                  <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                    {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
                  </button>
                )}
              </span>
            </label>
            <label className="full">{isPj ? "Razão social" : "Nome completo"}<input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} /></label>
            {isPj && <label className="full">Nome fantasia<input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} /></label>}
            <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Telefone<input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></label>
            <label>
              CEP
              <span style={{ display: "flex", gap: 6 }}>
                <input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={preencherPorCep} style={{ flex: 1 }} />
                <button type="button" className="btn-erp light sm" onClick={preencherPorCep} disabled={buscandoCep} style={{ flexShrink: 0 }}>{buscandoCep ? "…" : "Buscar"}</button>
              </span>
            </label>
            <label>Número<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
            <label className="full">Logradouro<input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} /></label>
            <label>Bairro<input value={bairro} onChange={(e) => setBairro(e.target.value)} /></label>
            <label>Cidade<input value={cidade} onChange={(e) => setCidade(e.target.value)} /></label>
            <label>UF<input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></label>
          </div>
          {error && <div className="alert danger" style={{ marginTop: 12 }}><span>{error}</span></div>}
          {lookupErro && <div className="alert danger" style={{ marginTop: 12 }}><span>{lookupErro}</span></div>}
        </div>
        <footer className="drawer-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid var(--erp-line)" }}>
          <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-erp primary sm" disabled={saving} onClick={salvar}>{saving ? "Salvando…" : "Cadastrar e selecionar"}</button>
        </footer>
      </aside>
    </>
  );
}
