"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EspelhoFiscalModal, type FiscalPreview } from "./EspelhoFiscal";

type ItemDevolucao = {
  produtoId: string;
  produtoNome: string;
  produtoSku: string;
  quantidade: number;
  devolvido: number;
};

type Props = {
  id: string;
  numero: string;
  canConfirm: boolean;
  canInvoice: boolean;
  canCancel: boolean;
  canReturn?: boolean;
  temNotaAutorizada: boolean;
  /** Itens do pedido (para a devolução parcial). */
  itens?: ItemDevolucao[];
  /** Mostra a ação de EXCLUIR (apenas perfil admin). */
  isAdmin?: boolean;
  status?: string;
};

export function SaleDetailActions({ id, numero, canConfirm, canInvoice, canCancel, canReturn = false, temNotaAutorizada, itens = [], isAdmin = false, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<FiscalPreview | null>(null);
  const [devolucaoAberta, setDevolucaoAberta] = useState(false);

  async function espelho(modelo: "NFE" | "NFCE") {
    setBusy("espelho");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/erp/vendas/${id}/preview-nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo })
      });
      const data = (await res.json().catch(() => ({}))) as FiscalPreview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível calcular o espelho fiscal.");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível calcular o espelho fiscal.");
    } finally {
      setBusy("");
    }
  }

  async function executar(label: string, url: string, body?: unknown) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      setMessage("Ação concluída.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy("");
    }
  }

  function confirmar() {
    if (!window.confirm(`Confirmar o pedido ${numero}? Isso efetiva a saída de estoque e gera as parcelas no contas a receber conforme a condição de pagamento.`)) return;
    executar("confirmar", `/api/erp/vendas/${id}/confirmar`);
  }
  function faturar(modelo: "NFE" | "NFCE") {
    if (!window.confirm(`Emitir ${modelo === "NFE" ? "NF-e" : "NFC-e"} para o pedido ${numero}?`)) return;
    executar("faturar", `/api/erp/vendas/${id}/faturar`, { modelo });
  }
  function cancelar() {
    if (temNotaAutorizada) {
      window.alert("Não é possível cancelar: há nota fiscal autorizada vinculada. Cancele a nota antes.");
      return;
    }
    if (!window.confirm(`Cancelar o pedido ${numero}? Esta ação não pode ser desfeita.`)) return;
    executar("cancelar", `/api/erp/vendas/${id}/cancelar`);
  }

  async function excluir() {
    if (!window.confirm(`Excluir definitivamente o pedido ${numero}? Esta ação não pode ser desfeita.`)) return;
    setBusy("excluir");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/erp/vendas/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o pedido.");
      router.push("/erp/vendas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o pedido.");
      setBusy("");
    }
  }

  const podeExcluir = isAdmin && (status === "RASCUNHO" || status === "CANCELADO");
  const semAcoes = !canConfirm && !canInvoice && !canCancel && !podeExcluir;

  return (
    <section className="erp-card">
      <div className="erp-card-head"><div><h3>Ações</h3></div></div>
      <div className="detalhe-acoes">
        {canConfirm && <button type="button" className="btn-erp primary sm" onClick={confirmar} disabled={!!busy}>{busy === "confirmar" ? "Confirmando…" : "Confirmar pedido"}</button>}
        {canInvoice && <button type="button" className="btn-erp primary sm" onClick={() => faturar("NFE")} disabled={!!busy}>{busy === "faturar" ? "Emitindo…" : "Emitir NF-e"}</button>}
        {canInvoice && <button type="button" className="btn-erp ghost sm" onClick={() => faturar("NFCE")} disabled={!!busy}>Emitir NFC-e</button>}
        <button type="button" className="btn-erp light sm" onClick={() => espelho("NFE")} disabled={!!busy}>{busy === "espelho" ? "Calculando…" : "🔍 Espelho fiscal"}</button>
        {canReturn && <button type="button" className="btn-erp ghost sm" onClick={() => setDevolucaoAberta(true)} disabled={!!busy}>↩ Devolver itens</button>}
        {canCancel && <button type="button" className="btn-erp danger sm" onClick={cancelar} disabled={!!busy}>{busy === "cancelar" ? "Cancelando…" : "Cancelar pedido"}</button>}
        {podeExcluir && <button type="button" className="btn-erp danger sm" onClick={excluir} disabled={!!busy} title="Excluir pedido (admin)">{busy === "excluir" ? "Excluindo…" : "🗑️ Excluir pedido"}</button>}
        {semAcoes && <span className="block-muted">Use o espelho fiscal para conferir os impostos. Nenhuma outra ação disponível para a situação atual.</span>}
      </div>
      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><span>{error}</span></div>}
      {preview && <EspelhoFiscalModal preview={preview} onClose={() => setPreview(null)} title={`Espelho fiscal — pedido ${numero}`} />}
      {devolucaoAberta && (
        <DevolucaoModal
          pedidoId={id}
          numero={numero}
          itens={itens}
          onClose={() => setDevolucaoAberta(false)}
          onDone={(msg) => {
            setDevolucaoAberta(false);
            setMessage(msg);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

// ─── Modal de devolução (NF-e de devolução + reentrada de estoque) ───────────────

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function DevolucaoModal({
  pedidoId,
  numero,
  itens,
  onClose,
  onDone
}: {
  pedidoId: string;
  numero: string;
  itens: ItemDevolucao[];
  onClose: () => void;
  onDone: (mensagem: string) => void;
}) {
  const devolviveis = itens.filter((i) => i.quantidade - i.devolvido > 0);
  const [quantidades, setQuantidades] = useState<Record<string, number>>(
    () => Object.fromEntries(devolviveis.map((i) => [i.produtoId, i.quantidade - i.devolvido]))
  );
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function setQtd(produtoId: string, max: number, raw: string) {
    const q = Math.max(0, Math.min(max, parseInt(raw, 10) || 0));
    setQuantidades((cur) => ({ ...cur, [produtoId]: q }));
  }

  async function devolver() {
    const selecionados = devolviveis
      .map((i) => ({ produtoId: i.produtoId, quantidade: quantidades[i.produtoId] ?? 0 }))
      .filter((i) => i.quantidade > 0);
    if (selecionados.length === 0) {
      setError("Informe a quantidade de ao menos um item.");
      return;
    }
    if (!window.confirm(`Emitir NF-e de devolução do pedido ${numero}? O estoque dos itens será reposto e o valor abatido do contas a receber.`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${pedidoId}/devolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: selecionados, motivo: motivo.trim() || undefined })
      });
      const data = (await res.json().catch(() => ({}))) as {
        notaNumero?: string | null;
        valorDevolvido?: number;
        abatidoContasReceber?: number;
        reembolsoPendente?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Não foi possível registrar a devolução.");
      const partes = [
        `Devolução registrada — NF-e ${data.notaNumero ?? "s/nº"} autorizada, ${brl(data.valorDevolvido ?? 0)} devolvidos e estoque reposto.`
      ];
      if ((data.abatidoContasReceber ?? 0) > 0) partes.push(`Abatido do contas a receber: ${brl(data.abatidoContasReceber ?? 0)}.`);
      if ((data.reembolsoPendente ?? 0) > 0) {
        partes.push(`Reembolsar ao cliente: ${brl(data.reembolsoPendente ?? 0)} (valor já pago — devolva em dinheiro/PIX e registre sangria se sair do caixa).`);
      }
      onDone(partes.join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a devolução.");
      setLoading(false);
    }
  }

  return (
    <div className="pdv-modal-bg" onClick={onClose}>
      <div className="pdv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Devolução — pedido {numero}</h2>
        {error && <div className="alert danger">{error}</div>}
        {devolviveis.length === 0 ? (
          <p className="block-muted">Todos os itens deste pedido já foram devolvidos.</p>
        ) : (
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Produto</th><th className="num">Vendido</th><th className="num">Já devolvido</th><th className="num">Devolver</th></tr></thead>
              <tbody>
                {devolviveis.map((i) => {
                  const max = i.quantidade - i.devolvido;
                  return (
                    <tr key={i.produtoId}>
                      <td>[{i.produtoSku}] {i.produtoNome}</td>
                      <td className="num">{i.quantidade}</td>
                      <td className="num">{i.devolvido || "—"}</td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          value={quantidades[i.produtoId] ?? 0}
                          onChange={(e) => setQtd(i.produtoId, max, e.target.value)}
                          style={{ width: 70 }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <label className="pdv-cliente">Motivo (opcional)
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: produto com defeito, troca" />
        </label>
        <div className="pdv-acoes">
          <button type="button" className="pdv-limpar" onClick={onClose} disabled={loading}>Fechar</button>
          <button type="button" className="pdv-finalizar" onClick={devolver} disabled={loading || devolviveis.length === 0}>
            {loading ? "Emitindo devolução…" : "Emitir NF-e de devolução"}
          </button>
        </div>
      </div>
    </div>
  );
}
