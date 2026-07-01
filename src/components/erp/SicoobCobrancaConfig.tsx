"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigCobrancaConta } from "@/domains/finance/application/boleto-use-cases";

/**
 * Configuração da COBRANÇA SICOOB por conta bancária: client_id do credenciamento, nº do
 * cliente/beneficiário e conta corrente — ou modo sandbox (token do portal dev) para testes.
 * Com a cobrança configurada, o financeiro mostra "Gerar boleto" nos recebíveis.
 */
export function SicoobCobrancaConfig({ contas }: { contas: ConfigCobrancaConta[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ clientId: "", numeroCliente: "", contaCorrente: "", sandbox: false, sandboxToken: "" });

  function abrir(c: ConfigCobrancaConta) {
    setEditando(c.id);
    setErro("");
    setOk("");
    setForm({
      clientId: c.sicoobClientId ?? "",
      numeroCliente: c.sicoobNumeroCliente ? String(c.sicoobNumeroCliente) : "",
      contaCorrente: c.sicoobContaCorrente ?? "",
      sandbox: c.sicoobSandbox,
      sandboxToken: ""
    });
  }

  async function salvar(id: string) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-bancarias/${id}/sicoob`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sicoobClientId: form.clientId || null,
          sicoobNumeroCliente: form.numeroCliente ? Number(form.numeroCliente) : null,
          sicoobContaCorrente: form.contaCorrente || null,
          sicoobSandbox: form.sandbox,
          // Só envia o token se o usuário digitou um novo (não sobrescreve com vazio).
          ...(form.sandboxToken ? { sicoobSandboxToken: form.sandboxToken } : {})
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setOk("Configuração salva.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="erp-card" style={{ marginTop: 24 }}>
      <div className="erp-card-head">
        <h3>Cobrança Sicoob (emissão de boletos)</h3>
      </div>
      <div style={{ padding: "0 16px 8px", fontSize: 13, color: "var(--erp-slate)" }}>
        <p style={{ marginTop: 8 }}>
          Para emitir boletos é preciso o <strong>credenciamento no Sicoob</strong> (solicite ao gerente ou no
          Sicoob Desenvolvedores): você recebe o <strong>client_id</strong> e usa o <strong>nº do cliente/beneficiário</strong>{" "}
          da cooperativa. O certificado A1 da empresa (o mesmo do fiscal) autentica a conexão. Para testar sem
          credenciamento, ative o modo sandbox com o token do portal.
        </p>
      </div>
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Conta</th><th>Nº cliente</th><th>client_id</th><th>Ambiente</th><th>Situação</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nome}</strong></td>
                <td>{c.sicoobNumeroCliente ?? "—"}</td>
                <td className="mono">{c.sicoobClientId ? `${c.sicoobClientId.slice(0, 10)}…` : "—"}</td>
                <td>{c.sicoobSandbox ? `Sandbox${c.temSandboxToken ? "" : " (sem token)"}` : "Produção"}</td>
                <td>
                  <span className={`pill ${c.configurada ? "success" : "mute"}`}>
                    <span className="dot" />
                    {c.configurada ? "Cobrança ativa" : "Não configurada"}
                  </span>
                </td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => abrir(c)}>Configurar</button>
                </td>
              </tr>
            ))}
            {!contas.length && (
              <tr><td colSpan={6}><div className="empty-st"><span>Cadastre uma conta bancária acima primeiro.</span></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {erro && <div className="alert danger" style={{ margin: 12 }}><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success" style={{ margin: 12 }}><span className="lead">OK:</span><span>{ok}</span></div>}

      {editando && (
        <div className="card" style={{ margin: 12, padding: 16, border: "1px solid var(--erp-line)" }}>
          <h4 style={{ marginTop: 0 }}>Configurar cobrança — {contas.find((c) => c.id === editando)?.nome}</h4>
          <div className="erp-form" style={{ padding: 0 }}>
            <label>
              Nº do cliente / beneficiário <span className="required">*</span>
              <input inputMode="numeric" value={form.numeroCliente} onChange={(e) => setForm((f) => ({ ...f, numeroCliente: e.target.value.replace(/\D/g, "") }))} placeholder="Código do cooperado" />
            </label>
            <label>
              Conta corrente de cobrança
              <input value={form.contaCorrente} onChange={(e) => setForm((f) => ({ ...f, contaCorrente: e.target.value }))} placeholder="Opcional" />
            </label>
            <label className="full">
              client_id (credenciamento Sicoob Desenvolvedores)
              <input value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} placeholder="Obrigatório em produção" />
            </label>
            <label>
              Ambiente
              <select value={form.sandbox ? "sandbox" : "producao"} onChange={(e) => setForm((f) => ({ ...f, sandbox: e.target.value === "sandbox" }))}>
                <option value="producao">Produção (mTLS com o A1 da empresa)</option>
                <option value="sandbox">Sandbox (testes, token do portal)</option>
              </select>
            </label>
            {form.sandbox && (
              <label>
                Token do sandbox
                <input type="password" value={form.sandboxToken} onChange={(e) => setForm((f) => ({ ...f, sandboxToken: e.target.value }))} placeholder="Cole o token do portal (fica criptografado)" />
              </label>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn-erp ghost sm" onClick={() => setEditando(null)} disabled={busy}>Cancelar</button>
            <button type="button" className="btn-erp primary sm" onClick={() => salvar(editando)} disabled={busy}>
              {busy ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
