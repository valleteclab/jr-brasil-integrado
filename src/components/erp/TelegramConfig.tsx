"use client";

import { useEffect, useState } from "react";

/**
 * Bot do Telegram da empresa: cole o token do @BotFather e ative — o webhook é registrado
 * automaticamente. Quem fala com o bot compartilha o contato (verificado pelo Telegram) e é
 * casado com os telefones autorizados do agente (GESTOR/VENDEDOR) ou com clientes.
 */
type Cfg = { ativo: boolean; temToken: boolean; botUsername: string; atenderClientes: boolean; vinculos: number };

export function TelegramConfig() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [token, setToken] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [atenderClientes, setAtenderClientes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/erp/configuracoes/telegram");
        const data = (await res.json()) as Cfg & { error?: string };
        if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
        setCfg(data);
        setAtivo(data.ativo);
        setAtenderClientes(data.atenderClientes);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      }
    })();
  }, []);

  async function salvar() {
    setBusy(true); setErro(""); setOk("");
    try {
      const res = await fetch("/api/erp/configuracoes/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo, atenderClientes, botToken: token || undefined })
      });
      const data = (await res.json().catch(() => ({}))) as { botUsername?: string; ativo?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setOk(data.ativo ? `Bot ativo${data.botUsername ? ` (${data.botUsername})` : ""} — webhook registrado.` : "Bot desativado.");
      setToken("");
      setCfg((cur) => cur ? { ...cur, ativo: Boolean(data.ativo), botUsername: data.botUsername ?? cur.botUsername, temToken: cur.temToken || Boolean(token), atenderClientes } : cur);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="erp-card" style={{ marginTop: 16 }}>
      <div className="erp-card-head">
        <div>
          <h3>🤖 Bot do Telegram</h3>
          <span>
            O mesmo agente do WhatsApp, pelo Telegram: pedidos, status de OS, boleto, Pix, NF-e e NFS-e.
            {cfg?.botUsername ? <> Bot: <strong>{cfg.botUsername}</strong>.</> : null}
            {cfg ? <> Vínculos ativos: <strong>{cfg.vinculos}</strong>.</> : null}
          </span>
        </div>
        {cfg && (
          <span className={`status-badge ${cfg.ativo ? "success" : "mute"}`}>{cfg.ativo ? "Ativo" : "Inativo"}</span>
        )}
      </div>
      <div className="erp-form">
        <label className="full">
          Token do bot (crie com o @BotFather e cole aqui{cfg?.temToken ? " — vazio mantém o atual" : ""})
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={cfg?.temToken ? "•••••• (token salvo)" : "123456789:AA..."}
            autoComplete="off"
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativar o bot (registra o webhook automaticamente)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={atenderClientes} onChange={(e) => setAtenderClientes(e.target.checked)} />
          Atender clientes finais (telefone casando com o cadastro do cliente)
        </label>
      </div>
      <p className="field-hint" style={{ margin: "0 16px 8px" }}>
        Como funciona: quem chamar o bot toca em “📱 Compartilhar meu número” — o Telegram confirma que o
        contato é da própria pessoa e o número é casado com os <strong>telefones autorizados do agente</strong>{" "}
        (gestor/vendedor) ou com um <strong>cliente</strong>. Sem cadastro, o bot recusa.
      </p>
      {ok && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{ok}</span></div>}
      {erro && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{erro}</span></div>}
      <footer className="inline-foot">
        <button type="button" className="btn-erp primary sm" onClick={salvar} disabled={busy || !cfg}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </footer>
    </section>
  );
}
