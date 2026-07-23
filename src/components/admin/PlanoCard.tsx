"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Plano comercial do cliente + trial. Trocar o plano aplica o PRESET de módulos (Emissor liga só
 * o fiscal; Completo religa os de série) — os toggles individuais continuam valendo depois, para
 * ajustes finos. Trial vencido bloqueia o ERP do cliente com aviso (o dono estende/limpa aqui).
 */
export function PlanoCard({ clienteId, plano, trialFimEm, mensalidadeValor }: { clienteId: string; plano: string; trialFimEm: string | null; mensalidadeValor: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  // Data escolhida no calendário (padrão: a data atual do trial, se houver).
  const [dataTrial, setDataTrial] = useState(trialFimEm ? trialFimEm.slice(0, 10) : "");
  const [faturaUrl, setFaturaUrl] = useState<string | null>(null);
  const [assinouMsg, setAssinouMsg] = useState("");
  // Valor personalizado da mensalidade (desconto/acordo). Vazio = usa o preço do plano.
  const [valorCustom, setValorCustom] = useState(mensalidadeValor != null ? String(mensalidadeValor) : "");
  const [valorMsg, setValorMsg] = useState("");
  // 1º vencimento da assinatura (define o DIA de todos os meses). Vazio = vence hoje.
  const [vencimento, setVencimento] = useState("");

  async function salvarValorCustom(limpar = false) {
    setBusy(true); setErro(""); setValorMsg("");
    try {
      const valor = limpar ? null : Number(valorCustom.replace(",", ".")) || null;
      const res = await fetch(`/api/admin/clientes/${clienteId}/plano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "definir-valor-mensalidade", valor })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; valor?: number | null; assinaturaAtualizada?: boolean };
      if (!res.ok) throw new Error(d.error || "Falha ao salvar o valor.");
      if (limpar) setValorCustom("");
      setValorMsg(
        (d.valor != null ? `Valor personalizado: R$ ${d.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês.` : "Voltou ao preço do plano.") +
        (d.assinaturaAtualizada ? " Assinatura no Asaas já atualizada." : "")
      );
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o valor.");
    } finally {
      setBusy(false);
    }
  }

  async function post(body: { plano?: "COMPLETO" | "EMISSOR" | "CHAT"; trialDias?: number | null; trialAte?: string | null; acao?: string; dias?: number | null }) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/plano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao atualizar o plano.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar o plano.");
    } finally {
      setBusy(false);
    }
  }

  async function criarAssinatura() {
    if (!window.confirm("Gerar a cobrança (assinatura mensal) deste cliente no Asaas? Um link de fatura será criado para enviar ao cliente.")) return;
    setBusy(true);
    setErro("");
    setAssinouMsg("");
    setFaturaUrl(null);
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/plano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar-assinatura", vencimento: vencimento || null })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; invoiceUrl?: string | null; valor?: number; atualizada?: boolean };
      if (!res.ok) throw new Error(d.error || "Falha ao gerar a assinatura.");
      setFaturaUrl(d.invoiceUrl ?? null);
      const preco = d.valor ? ` — R$ ${d.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês` : "";
      setAssinouMsg(d.atualizada
        ? `Assinatura atualizada${preco}. O novo valor já vale para as próximas cobranças (e as faturas em aberto).`
        : `Assinatura criada${preco}. Quando o cliente pagar, o acesso libera sozinho.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar a assinatura.");
    } finally {
      setBusy(false);
    }
  }

  function trocarPlano(novo: "COMPLETO" | "EMISSOR" | "CHAT") {
    if (novo === plano) return;
    const msg = novo === "EMISSOR"
      ? "Colocar este cliente no plano EMISSOR DE NOTAS? Os módulos além da emissão fiscal serão desligados (o upgrade religa tudo)."
      : novo === "CHAT"
        ? "Colocar este cliente no plano CHAT (Emissor + assistente de IA + gastos por foto)? Os demais módulos serão desligados."
        : "Fazer UPGRADE deste cliente para o plano COMPLETO? Os módulos de série serão religados.";
    if (!window.confirm(msg)) return;
    void post({ plano: novo });
  }

  const trialAtivo = Boolean(trialFimEm);
  const trialVencido = trialAtivo && new Date(trialFimEm!) < new Date();
  const diasRestantes = trialAtivo ? Math.ceil((new Date(trialFimEm!).getTime() - Date.now()) / 86400000) : null;

  return (
    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {erro && <div className="alert danger">{erro}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={`btn-erp ${plano === "COMPLETO" ? "primary" : "light"} sm`} disabled={busy} onClick={() => trocarPlano("COMPLETO")}>
          Completo (ERP inteiro)
        </button>
        <button type="button" className={`btn-erp ${plano === "EMISSOR" ? "primary" : "light"} sm`} disabled={busy} onClick={() => trocarPlano("EMISSOR")}>
          🧾 Emissor de Notas
        </button>
        <button type="button" className={`btn-erp ${plano === "CHAT" ? "primary" : "light"} sm`} disabled={busy} onClick={() => trocarPlano("CHAT")}>
          💬 Chat (IA)
        </button>
        <span className="block-muted" style={{ fontSize: 12 }}>
          Emissor = só NF-e/NFS-e + clientes/produtos (MEI e Simples). Mesmo sistema — upgrade religa IA, WhatsApp, PDV etc.
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>Período de teste:</strong>
        {trialAtivo ? (
          <span className={`pill ${trialVencido ? "danger" : "warn"}`}>
            <span className="dot" />
            {trialVencido ? `Vencido em ${new Date(trialFimEm!).toLocaleDateString("pt-BR")}` : `${diasRestantes} dia(s) restante(s) — até ${new Date(trialFimEm!).toLocaleDateString("pt-BR")}`}
          </span>
        ) : (
          <span className="pill success"><span className="dot" />Sem trial (liberado)</span>
        )}
        <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => post({ trialDias: 7 })}>+7 dias</button>
        <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => post({ trialDias: 15 })}>+15 dias</button>
        <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => post({ trialDias: 30 })}>+30 dias</button>
        {trialAtivo && (
          <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => post({ trialDias: null })} title="Remove o prazo — cliente vira assinante liberado (SEM cobrança)">
            Remover trial (liberar grátis)
          </button>
        )}
      </div>

      {/* Data específica de fim do teste (calendário) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="block-muted" style={{ fontSize: 12 }}>Ou escolha a data de fim:</span>
        <input
          type="date"
          value={dataTrial}
          disabled={busy}
          onChange={(e) => setDataTrial(e.target.value)}
          style={{ height: 30, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 8px", fontSize: 13 }}
        />
        <button type="button" className="btn-erp primary xs" disabled={busy || !dataTrial} onClick={() => post({ trialAte: dataTrial })}>
          Aplicar data
        </button>
        <span className="block-muted" style={{ fontSize: 11 }}>
          (defina uma data passada para bloquear o cliente agora e forçar a assinatura)
        </span>
      </div>

      <p className="block-muted" style={{ margin: 0, fontSize: 12 }}>
        Trial vencido bloqueia o ERP do cliente com o aviso e o botão &ldquo;Assinar agora&rdquo; — os dados ficam intactos.
      </p>

      {/* Cobrança: gera a assinatura mensal no Asaas para o dono enviar ao cliente */}
      <div style={{ borderTop: "1px solid var(--erp-line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Valor personalizado da mensalidade (desconto/acordo específico deste cliente) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>Valor da mensalidade:</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            R$ <input
              type="number" min={0} step="0.01" value={valorCustom}
              onChange={(e) => setValorCustom(e.target.value)} placeholder="preço do plano"
              style={{ width: 110, height: 30, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 8px", textAlign: "right", fontSize: 13 }}
            />
          </span>
          <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => salvarValorCustom(false)}>Salvar valor</button>
          {mensalidadeValor != null && (
            <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => salvarValorCustom(true)} title="Volta a usar o preço do plano">Usar preço do plano</button>
          )}
          <span className="block-muted" style={{ fontSize: 11, flexBasis: "100%" }}>
            Vazio = usa o preço do plano. Preenchido = desconto/acordo só deste cliente (atualiza a assinatura na hora, se houver).
          </span>
        </div>
        {valorMsg && <div className="alert success" style={{ margin: 0 }}><span>{valorMsg}</span></div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>Cobrança:</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            1º vencimento
            <input
              type="date"
              value={vencimento}
              disabled={busy}
              onChange={(e) => setVencimento(e.target.value)}
              style={{ height: 30, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 8px", fontSize: 13 }}
            />
          </span>
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={criarAssinatura}>
            💳 Gerar cobrança (assinatura mensal)
          </button>
          <span className="block-muted" style={{ fontSize: 11, flexBasis: "100%" }}>
            A 1ª fatura vence na data escolhida e as mensalidades seguintes vencem TODO MÊS nesse mesmo dia
            (vazio = vence hoje). Em assinatura já existente, a data muda o próximo vencimento e o dia do ciclo.
          </span>
        </div>
        {assinouMsg && (
          <div className="alert success" style={{ margin: 0 }}>
            <span>{assinouMsg}</span>
            {faturaUrl && (
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <a href={faturaUrl} target="_blank" rel="noreferrer" className="btn-erp light xs">Abrir fatura</a>
                <button type="button" className="btn-erp ghost xs" onClick={() => { void navigator.clipboard?.writeText(faturaUrl); }}>Copiar link</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QA: simular inadimplência para testar aviso (3d) / bloqueio (7d) — reversível */}
      <div style={{ borderTop: "1px dashed var(--erp-line)", paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="block-muted" style={{ fontSize: 11 }}>🧪 Teste de inadimplência:</span>
        <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => post({ acao: "simular-atraso", dias: 3 })} title="Marca a mensalidade vencida há 3 dias — mostra o AVISO">
          Simular atraso 3d (aviso)
        </button>
        <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => post({ acao: "simular-atraso", dias: 8 })} title="Marca a mensalidade vencida há 8 dias — BLOQUEIA o acesso">
          Simular atraso 8d (bloqueio)
        </button>
        <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => post({ acao: "simular-atraso", dias: null })} title="Limpa a inadimplência — volta ao normal">
          Limpar atraso
        </button>
      </div>
    </div>
  );
}
