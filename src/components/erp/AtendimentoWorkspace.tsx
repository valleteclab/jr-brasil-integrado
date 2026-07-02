"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { correspondeBusca } from "@/lib/search/normalize";
import type { SaleFormData } from "@/lib/services/sales";
import { useRealtime } from "@/lib/realtime/useRealtime";
import { NovoClienteDrawer } from "./NovoClienteDrawer";
import { AdminPasswordModal } from "./AdminPasswordModal";

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

const PAGAMENTOS_FALLBACK = [
  { id: "Pix à vista", s: "Confirmação imediata" },
  { id: "Dinheiro", s: "Pagamento em espécie" },
  { id: "Cartão débito", s: "Maquininha · à vista" },
  { id: "Cartão crédito", s: "Parcelado" },
  { id: "Boleto 30 dias", s: "Faturado · sujeito a aprovação" },
  { id: "Faturado 30/60/90", s: "Cliente com limite aprovado" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const UNIDADES_RAPIDO = ["UN", "PC", "CX", "FD", "SC", "KG", "G", "L", "ML", "M", "M2", "DZ", "CT"];
const numBr = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

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
  // Formas de pagamento da empresa (cadastradas) — o que aparece na venda. Fallback fixo se vazio.
  const PAGAMENTOS = data.formas.length ? data.formas.map((f) => ({ id: f.nome, s: "" })) : PAGAMENTOS_FALLBACK;
  const [pagamento, setPagamento] = useState(data.formas[0]?.nome ?? PAGAMENTOS_FALLBACK[0].id);
  // Venda no BOLETO (pedido faturado): banco emissor, parcelas e vencimentos escolhidos aqui;
  // consumidos na confirmação do pedido (parcelas + registro no Sicoob).
  const pagamentoEhBoleto = /boleto/i.test(pagamento);
  const vencPadraoBoleto = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const addMesesIso = (iso: string, meses: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().slice(0, 10);
  };
  const [boletoBanco, setBoletoBanco] = useState(data.contasCobranca[0]?.id ?? "");
  const [boletoParcelas, setBoletoParcelas] = useState(1);
  const [boletoVencimentos, setBoletoVencimentos] = useState<string[]>([]);
  const datasBoleto = (): string[] => {
    const base = boletoVencimentos[0] ?? vencPadraoBoleto;
    return Array.from({ length: Math.max(1, boletoParcelas) }, (_, i) => boletoVencimentos[i] ?? addMesesIso(base, i));
  };
  const [descGlobal, setDescGlobal] = useState(0);
  const [frete, setFrete] = useState(0);
  const [obs, setObs] = useState("");
  /** Senha de admin validada (vai junto no payload — o servidor revalida). Some quando muda o desconto. */
  const [senhaAdmin, setSenhaAdmin] = useState<string>("");
  const [adminModal, setAdminModal] = useState<{ motivo: string; onOk: (senha: string) => void } | null>(null);
  // Vendedor = usuário logado (resolvido no servidor). Fica fixo na UI; sem seleção manual.
  const vendedor = data.vendedorLogadoNome ?? "";
  // Condição de pagamento foi removida do fluxo de venda — não faz sentido p/ o usuário hoje.
  const condicao = "";
  const [validadeDias, setValidadeDias] = useState(7);
  const [showCli, setShowCli] = useState(false);
  const [showNovoCli, setShowNovoCli] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  // Texto sendo digitado em cada input de quantidade — permite "0,5" ou "0.5" sem o campo
  // zerar no meio. Commit no blur via updItem. Limpo quando o item sai da venda.
  const [qtdInputs, setQtdInputs] = useState<Record<string, string>>({});

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

  // Desconto % efetivo sobre o bruto (itens × qtd × preço + serviços), sem descontar nada.
  // Se passa do limite da empresa, exige senha de admin antes de finalizar.
  const subtotalBruto = items.reduce((s, it) => s + it.quantidade * it.preco, 0) + subtotalServ;
  const descontoPctEfetivo = subtotalBruto > 0 ? ((subtotalBruto - (subtotal - descontoVal)) / subtotalBruto) * 100 : 0;
  const limiteDescSemAuth = Number(data.descontoSemAutorizacaoPct ?? 0);
  const precisaAdmin = descontoPctEfetivo > limiteDescSemAuth + 0.01;

  /** Roda a ação se desconto está dentro do limite; senão abre o modal de admin antes. */
  function comAdmin(action: () => void) {
    if (!precisaAdmin || senhaAdmin) { action(); return; }
    setAdminModal({
      motivo: `Desconto de ${descontoPctEfetivo.toFixed(2)}% acima do limite (${limiteDescSemAuth.toFixed(2)}%). Informe a senha de um administrador.`,
      onOk: (s) => { setSenhaAdmin(s); setAdminModal(null); action(); }
    });
  }

  // Adiciona/incrementa um produto SEM fechar o seletor — permite adicionar vários itens seguidos.
  // Aceita quantidade fracionada do picker (default 1).
  function addItem(p: Produto, qtd: number = 1) {
    const q = qtd > 0 ? qtd : 1;
    setItems((cur) => {
      const ex = cur.find((it) => it.produto.id === p.id);
      if (ex) return cur.map((it) => (it.produto.id === p.id ? { ...it, quantidade: it.quantidade + q } : it));
      return [...cur, { produto: p, quantidade: q, preco: p.preco, desconto: 0 }];
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
        formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs,
        senhaAdmin: senhaAdmin || undefined
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

  async function finalizeBalcao(modelo: "NFCE" | "NFE" | "RECIBO") {
    setError("");
    if (!cliente && modelo === "NFE") { setError("NF-e exige cliente. Selecione o cliente ou use NFC-e."); return; }
    if (!items.length) { setError("Adicione ao menos um item."); return; }

    const isRecibo = modelo === "RECIBO";
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
          formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs,
          modelo: isRecibo ? "NFCE" : modelo,
          emitirFiscal: !isRecibo,
          senhaAdmin: senhaAdmin || undefined
        })
      });
      const p = await res.json();
      if (!res.ok) throw new Error(p.error || "Falha ao finalizar a venda.");
      setSuccess({
        tipo: "Venda",
        total,
        route: "/erp/vendas",
        pedidoId: p.pedidoId,
        pedidoNumero: p.pedidoNumero,
        modeloLabel: isRecibo ? "Recibo" : (modelo === "NFCE" ? "NFC-e" : "NF-e"),
        nota: p.nota
          ? { id: p.nota.id, status: p.nota.status, numero: p.nota.numero, chave: p.nota.chaveAcesso, motivo: p.nota.motivo }
          : null,
        emitErro: p.emitErro ?? null
      });
      // Impressão automática: recibo HTML para venda não fiscal; cupom/DANFE para nota autorizada.
      if (isRecibo && p.pedidoId) {
        window.open(`/api/erp/vendas/${p.pedidoId}/recibo?formato=a4`, "_blank", "noopener,noreferrer");
      } else if (p.nota?.status === "AUTORIZADA" && p.nota?.id) {
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
          body: JSON.stringify({ clienteId: cliente.id, itens: itensPayload, validadeDias, desconto: descontoVal, vendedor, condicaoPagamento: condicao, observacaoVendedor: obs, senhaAdmin: senhaAdmin || undefined })
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
          body: JSON.stringify({
            clienteId: cliente.id,
            canal: tipo === "VENDA_BALCAO" ? "BALCAO" : "FATURADO",
            itens: itensPayload,
            desconto: descontoVal,
            frete: Number(frete) || 0,
            formaPagamento: pagamento,
            condicaoPagamento: condicao,
            observacoes: obs,
            senhaAdmin: senhaAdmin || undefined,
            // Boleto no pedido faturado: as escolhas viajam com o pedido e valem na confirmação.
            boletoOpcoes: tipo === "PEDIDO_FATURADO" && pagamentoEhBoleto
              ? (() => {
                  const datas = datasBoleto();
                  return { contaBancariaId: boletoBanco || null, parcelas: datas.length, primeiroVencimento: datas[0], datas };
                })()
              : undefined
          })
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
                  <thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th className="num">Qtd</th><th className="num">Preço un.</th><th className="num">% Desc.</th><th className="num">Subtotal</th><th className="actions" /></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const sub = it.quantidade * it.preco * (1 - it.desconto / 100);
                      const qtdStr = qtdInputs[it.produto.id] ?? String(it.quantidade).replace(".", ",");
                      return (
                        <tr key={it.produto.id}>
                          <td className="mono bold">{it.produto.sku}</td>
                          <td><div style={{ fontWeight: 600 }}>{it.produto.nome}</div><span className="sublabel">{it.produto.disponivel} em estoque</span></td>
                          <td className="mono" style={{ color: "var(--erp-mute)", fontSize: 12 }}>{it.produto.unidade}</td>
                          <td className="num">
                            <input
                              inputMode="decimal"
                              value={qtdStr}
                              onChange={(e) => setQtdInputs((s) => ({ ...s, [it.produto.id]: e.target.value }))}
                              onBlur={(e) => {
                                const v = Math.max(0, numBr(e.target.value));
                                setQtdInputs((s) => { const n = { ...s }; delete n[it.produto.id]; return n; });
                                updItem(it.produto.id, { quantidade: v });
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              style={cellNum}
                            />
                          </td>
                          <td className="num bold">{brl(it.preco)}</td>
                          <td className="num"><input type="number" min={0} max={100} value={it.desconto} onChange={(e) => { setSenhaAdmin(""); updItem(it.produto.id, { desconto: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }); }} style={cellNum} /></td>
                          <td className="num bold">{brl(sub)}</td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => { setQtdInputs((s) => { const n = { ...s }; delete n[it.produto.id]; return n; }); rmItem(it.produto.id); }}>✕</button></td>
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
                  <input className="pct-input" type="number" min={0} max={100} value={descGlobal} onChange={(e) => { setSenhaAdmin(""); setDescGlobal(Math.min(100, Math.max(0, Number(e.target.value) || 0))); }} /> %
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
                {pagamentoEhBoleto && tipo === "PEDIDO_FATURADO" && (
                  <div style={{ border: "1px dashed var(--erp-line)", borderRadius: 5, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--erp-slate)" }}>Boleto — banco, parcelas e vencimentos</div>
                    <select value={boletoBanco} onChange={(e) => setBoletoBanco(e.target.value)} style={{ height: 32, fontSize: 12 }} title="Banco/conta que emite o boleto">
                      <option value="">{data.contasCobranca.length ? "Banco do boleto…" : "Nenhuma conta com cobrança configurada (Configurações → Contas financeiras)"}</option>
                      {data.contasCobranca.map((c) => <option key={c.id} value={c.id}>Boleto — {c.nome}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
                        Parcelas
                        <input type="number" min={1} max={24} value={boletoParcelas} onChange={(e) => setBoletoParcelas(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} style={{ width: 56, height: 30, textAlign: "center" }} />
                      </label>
                      {datasBoleto().map((data2, i) => (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
                          {i + 1}ª venc.
                          <input type="date" value={data2} onChange={(e) => {
                            const atual = datasBoleto();
                            atual[i] = e.target.value;
                            setBoletoVencimentos(atual);
                          }} style={{ height: 30, fontSize: 12 }} title={`Vencimento da parcela ${i + 1}`} />
                        </label>
                      ))}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--erp-slate)" }}>
                      Ao confirmar o pedido, as parcelas entram no contas a receber com essas datas e os boletos são registrados no banco automaticamente.
                    </div>
                  </div>
                )}
                {pagamentoEhBoleto && tipo === "VENDA_BALCAO" && (
                  <div style={{ fontSize: 11, color: "var(--erp-slate)", padding: "2px 4px" }}>
                    💡 Boleto é venda a prazo: o banco, as parcelas e os vencimentos serão escolhidos no caixa ao receber — ou use o tipo <strong>Pedido faturado</strong> para definir tudo agora.
                  </div>
                )}
              </div>
            </div>
          )}

          {isOrcamento && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Validade</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>Validade (dias)<input type="number" min={1} value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))} /></label>
                <div className="block-muted" style={{ fontSize: 12 }}>Vendedor: <strong>{vendedor || "—"}</strong></div>
              </div>
            </div>
          )}

          {(isVendaPedido || isOs) && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>{isOs ? "Atribuição" : "Vendedor"}</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <div className="block-muted" style={{ fontSize: 12 }}>{isOs ? "Vendedor / técnico" : "Vendedor"}: <strong>{vendedor || "—"}</strong></div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tipo === "VENDA_BALCAO" ? (
              <>
                <button type="button" className="btn-erp primary lg" disabled={!canFinalize || saving} onClick={() => comAdmin(enviarParaCaixa)}>
                  {saving ? "Processando…" : `Enviar para o caixa · ${brl(total)}`}
                </button>
                {/* Finalizar direto (sem caixa) só quando a empresa habilita nas configurações. */}
                {data.permiteVendaDiretaBalcao && (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={() => comAdmin(() => finalizeBalcao("NFCE"))}>
                        Finalizar direto + NFC-e
                      </button>
                      <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!cliente || !canFinalize || saving} onClick={() => comAdmin(() => finalizeBalcao("NFE"))}>
                        + NF-e
                      </button>
                    </div>
                    {data.permiteVendaNaoFiscal && (
                      <button type="button" className="btn-erp ghost sm" style={{ width: "100%" }} disabled={!canFinalize || saving} onClick={() => comAdmin(() => finalizeBalcao("RECIBO"))} title="Finalizar a venda só com recibo (sem NF). Estoque e financeiro rodam normalmente.">
                        Finalizar (só recibo, não fiscal)
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <button type="button" className="btn-erp primary lg" disabled={!cliente || !canFinalize || saving} onClick={() => comAdmin(finalize)}>{saving ? "Processando…" : acaoLabel}</button>
            )}
            {isVendaPedido && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={() => comAdmin(imprimirRecibo)} title="Cria a pré-venda e imprime o recibo para o cliente levar ao caixa">🖨 Imprimir recibo</button>
                <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }} disabled={!canFinalize || saving} onClick={() => comAdmin(salvarRascunho)}>Salvar rascunho</button>
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

      {/* AUTORIZAÇÃO DE ADMIN — quando o desconto efetivo passa do limite da empresa. */}
      {adminModal && (
        <AdminPasswordModal motivo={adminModal.motivo} onAutorizado={(s) => adminModal.onOk(s)} onClose={() => setAdminModal(null)} />
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
  produtos: Produto[]; items: ItemLinha[]; permiteVendaSemEstoque: boolean; onAdd: (p: Produto, qtd?: number) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState("");
  // Quantidade digitada por linha (default vazio → 1 ao adicionar). Permite "0,5" / "2,75".
  const [qtdPorLinha, setQtdPorLinha] = useState<Record<string, string>>({});
  const qtyById = new Map(items.map((it) => [it.produto.id, it.quantidade]));
  const list = produtos
    .filter((p) => correspondeBusca(q, p.sku, p.nome, p.descricao, p.descricaoComercial, p.gtin, p.codigoOriginal, p.codigoFabricante))
    .slice(0, 50);
  const totalItens = items.reduce((s, it) => s + it.quantidade, 0);

  // Abre o cadastro COMPLETO de produto (NF-e: NCM/CFOP/CST/origem/etc.) em nova aba — preserva o
  // atendimento em andamento. Pré-preenche o nome com o termo buscado.
  function abrirCadastroProduto() {
    const nome = q.trim();
    window.open(`/erp/produtos?novo=1${nome ? `&nome=${encodeURIComponent(nome)}` : ""}`, "_blank", "noopener");
  }

  // Cadastro RÁPIDO: cria o produto com o mínimo (nome, preço, NCM, CFOP, unidade) e já adiciona ao
  // carrinho, sem sair da tela. O detalhamento fiscal completo pode ser feito depois no cadastro.
  const [rapidoAberto, setRapidoAberto] = useState(false);
  const [rapidoSalvando, setRapidoSalvando] = useState(false);
  const [rapidoErro, setRapidoErro] = useState("");
  const [rNome, setRNome] = useState("");
  const [rPreco, setRPreco] = useState("");
  const [rCusto, setRCusto] = useState("");
  const [rNcm, setRNcm] = useState("");
  const [rCfop, setRCfop] = useState("");
  const [rUnidade, setRUnidade] = useState("UN");
  const [rEstoque, setREstoque] = useState("0");

  function abrirRapido() {
    setRNome(q.trim());
    setRPreco(""); setRCusto(""); setRNcm(""); setRCfop(""); setRUnidade("UN"); setREstoque("0");
    setRapidoErro("");
    setRapidoAberto(true);
  }

  async function salvarRapido() {
    setRapidoErro("");
    if (!rNome.trim()) { setRapidoErro("Informe o nome do produto."); return; }
    if (numBr(rPreco) <= 0) { setRapidoErro("Informe o preço de venda."); return; }
    if (rNcm.trim() && rNcm.replace(/\D/g, "").length !== 8) { setRapidoErro("NCM deve ter 8 dígitos."); return; }
    setRapidoSalvando(true);
    try {
      const res = await fetch("/api/erp/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rNome.trim(),
          priceValue: numBr(rPreco),
          costValue: numBr(rCusto),
          ncm: rNcm.replace(/\D/g, "") || undefined,
          cfopInState: rCfop.replace(/\D/g, "") || undefined,
          unit: rUnidade,
          availableStock: numBr(rEstoque)
        })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; sku?: string; nome?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Não foi possível cadastrar o produto.");
      const novo: Produto = {
        id: data.id,
        sku: data.sku ?? "",
        nome: data.nome ?? rNome.trim(),
        descricao: null, descricaoComercial: null, gtin: null, codigoOriginal: null, codigoFabricante: null,
        preco: numBr(rPreco),
        disponivel: numBr(rEstoque),
        unidade: rUnidade
      };
      onAdd(novo);
      setRapidoAberto(false);
      router.refresh(); // sincroniza a lista para próximas buscas
    } catch (e) {
      setRapidoErro(e instanceof Error ? e.message : "Não foi possível cadastrar o produto.");
    } finally {
      setRapidoSalvando(false);
    }
  }

  // Bloqueia adicionar produto sem saldo quando a empresa não aceita venda sem estoque.
  function tentarAdd(p: Produto) {
    const raw = qtdPorLinha[p.id];
    const qtd = raw && raw.trim() ? numBr(raw) : 1;
    if (qtd <= 0) { setAviso(`Informe uma quantidade maior que zero para "${p.nome}".`); return; }
    const noCarrinho = qtyById.get(p.id) ?? 0;
    if (!permiteVendaSemEstoque && noCarrinho + qtd > p.disponivel) {
      setAviso(
        p.disponivel <= 0
          ? `"${p.nome}" está sem estoque (disponível 0). A empresa não aceita venda sem estoque.`
          : `Estoque insuficiente de "${p.nome}": disponível ${p.disponivel}, no carrinho ${noCarrinho}.`
      );
      return;
    }
    setAviso("");
    onAdd(p, qtd);
    setQtdPorLinha((s) => ({ ...s, [p.id]: "" }));
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
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn-erp primary sm" onClick={abrirRapido}>⚡ Cadastro rápido</button>
            <button type="button" className="btn-erp light sm" onClick={abrirCadastroProduto}>➕ Cadastro completo</button>
            <button type="button" className="btn-erp ghost sm" onClick={() => router.refresh()} title="Atualizar a lista após cadastrar um produto">🔄 Atualizar lista</button>
          </div>
          <p className="block-muted" style={{ fontSize: 11, marginTop: 6 }}>Rápido: cria e já adiciona ao carrinho. Completo: abre em nova aba com todos os dados fiscais p/ NF-e.</p>
          {rapidoAberto && (
            <div className="erp-card" style={{ marginTop: 10, padding: 12, background: "var(--erp-surface,#fafbfc)" }}>
              <strong style={{ fontSize: 13 }}>⚡ Cadastro rápido de produto</strong>
              <div className="erp-form" style={{ marginTop: 8 }}>
                <label className="full">Nome*<input value={rNome} onChange={(e) => setRNome(e.target.value)} autoFocus /></label>
                <label>Preço de venda* (R$)<input inputMode="decimal" value={rPreco} onChange={(e) => setRPreco(e.target.value)} /></label>
                <label>Custo (R$)<input inputMode="decimal" value={rCusto} onChange={(e) => setRCusto(e.target.value)} /></label>
                <label>Estoque inicial<input inputMode="decimal" value={rEstoque} onChange={(e) => setREstoque(e.target.value)} /></label>
                <label>Unidade
                  <select value={rUnidade} onChange={(e) => setRUnidade(e.target.value)}>
                    {UNIDADES_RAPIDO.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label>NCM<input inputMode="numeric" value={rNcm} maxLength={8} onChange={(e) => setRNcm(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 dígitos" /></label>
                <label>CFOP (venda)<input inputMode="numeric" value={rCfop} maxLength={4} onChange={(e) => setRCfop(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="ex.: 5102" /></label>
              </div>
              {rapidoErro && <div className="alert danger" style={{ marginTop: 8 }}><span>{rapidoErro}</span></div>}
              <p className="block-muted" style={{ fontSize: 11, marginTop: 6 }}>Para emitir NF-e pode ser necessário completar CST/origem/regra fiscal depois no cadastro completo.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-erp primary sm" onClick={salvarRapido} disabled={rapidoSalvando}>{rapidoSalvando ? "Salvando…" : "Salvar e adicionar"}</button>
                <button type="button" className="btn-erp ghost sm" onClick={() => setRapidoAberto(false)} disabled={rapidoSalvando}>Cancelar</button>
              </div>
            </div>
          )}
          {aviso && <div className="alert danger" style={{ marginTop: 10 }}><span className="lead">Sem estoque:</span> {aviso}</div>}
        </div>
        <div className="drawer-body">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th className="num">Estoque</th><th className="num">Preço</th><th className="num">Qtd</th><th className="num">No carrinho</th><th className="actions" /></tr></thead>
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
                    <td className="mono" style={{ color: "var(--erp-mute)", fontSize: 12 }}>{p.unidade}</td>
                    <td className="num bold" style={{ color: p.disponivel <= 0 ? "var(--erp-danger)" : p.disponivel <= 5 ? "var(--erp-warn)" : "var(--erp-success)" }}>{p.disponivel}</td>
                    <td className="num bold">{brl(p.preco)}</td>
                    {/* Qtd: clique no input NÃO adiciona — só edita. Adicionar = Enter no input, "+ Add" ou clique no resto da linha. */}
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <input
                        inputMode="decimal"
                        placeholder="1"
                        value={qtdPorLinha[p.id] ?? ""}
                        onChange={(e) => setQtdPorLinha((s) => ({ ...s, [p.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tentarAdd(p); } }}
                        style={{ width: 60, height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 6px", fontSize: 12.5, textAlign: "right" }}
                      />
                    </td>
                    <td className="num bold">{qty > 0 ? `${String(qty).replace(".", ",")}×` : "—"}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {qty > 0 && <button type="button" className="btn-erp ghost xs icon-only" aria-label="Remover" onClick={() => onRemove(p.id)}>✕</button>}
                      <button type="button" className="btn-erp primary xs" onClick={() => tentarAdd(p)}>+ Add</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && !rapidoAberto && (
            <div className="empty-st">
              <h4>Nenhum resultado</h4>
              <p>Não encontrou o produto? Cadastre agora{q.trim() ? ` "${q.trim()}"` : ""}.</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn-erp primary sm" onClick={abrirRapido}>⚡ Cadastro rápido</button>
                <button type="button" className="btn-erp light sm" onClick={abrirCadastroProduto}>➕ Cadastro completo</button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
