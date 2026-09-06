"use client";

import { useCallback, useEffect, useState } from "react";

type Cfg = {
  ativo: boolean;
  provedor: "ZAPI" | "ZERNIO" | "EVOLUTION";
  instanceId: string;
  temToken: boolean;
  temClientToken: boolean;
  atenderClientes: boolean;
  zernioAccountId: string;
  zernioTemplateNome: string;
  zernioTemplateIdioma: string;
  evolutionDisponivel: boolean;
  evolutionProvisionada: boolean;
};
type EvoConexao = { status: string; qrCode: string | null };
const EVO_STATUS: Record<string, string> = {
  connected: "Conectado ✅",
  connecting: "Aguardando leitura do QR Code…",
  disconnected: "Desconectado",
  nao_provisionado: "Número ainda não vinculado",
  indisponivel: "Indisponível neste servidor",
  loading: "Consultando…",
  unknown: "Não foi possível verificar"
};
type ZernioConta = { id: string; platform: string; nome: string };
type ZernioTemplate = { nome: string; idioma: string; status: string; categoria: string };
type Telefone = { id: string; telefone: string; nome: string | null; role: "GESTOR" | "VENDEDOR" | "CLIENTE"; ativo: boolean; criadoEm: string };

export function WhatsappSettings() {
  const [cfg, setCfg] = useState<Cfg>({ ativo: false, provedor: "ZAPI", instanceId: "", temToken: false, temClientToken: false, atenderClientes: true, zernioAccountId: "", zernioTemplateNome: "", zernioTemplateIdioma: "pt_BR", evolutionDisponivel: false, evolutionProvisionada: false });
  const [evo, setEvo] = useState<EvoConexao>({ status: "loading", qrCode: null });
  const [evoBusy, setEvoBusy] = useState(false);
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [zernioApiKey, setZernioApiKey] = useState("");
  const [zernioContas, setZernioContas] = useState<ZernioConta[]>([]);
  const [zernioTemplates, setZernioTemplates] = useState<ZernioTemplate[]>([]);
  const [zernioBuscando, setZernioBuscando] = useState(false);
  const [telefones, setTelefones] = useState<Telefone[]>([]);
  const [novoTel, setNovoTel] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoRole, setNovoRole] = useState<"GESTOR" | "VENDEDOR">("VENDEDOR");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function carregar() {
    try {
      const [c, t] = await Promise.all([
        fetch("/api/erp/configuracoes/whatsapp").then((r) => r.json()),
        fetch("/api/erp/configuracoes/whatsapp/telefones").then((r) => r.json())
      ]);
      if (c && !c.error) setCfg(c);
      if (t?.telefones) setTelefones(t.telefones);
    } catch { /* silencioso */ }
  }
  useEffect(() => { void carregar(); }, []);

  // XERP WhatsApp (Evolution): estado da instância da empresa e pareamento por QR Code.
  const evoAcao = useCallback(async (acao?: "conectar" | "desconectar" | "remover") => {
    if (acao) { setEvoBusy(true); setError(""); setMsg(""); }
    try {
      const res = await fetch("/api/erp/configuracoes/whatsapp/evolution", acao
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) }
        : { cache: "no-store" });
      const data = (await res.json()) as EvoConexao & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar a conexão.");
      // Consulta periódica não apaga o QR em exibição; conectar troca pelo novo, conectado limpa.
      setEvo((v) => ({ status: data.status, qrCode: acao === "conectar" ? data.qrCode : data.status === "connected" ? null : v.qrCode }));
      if (acao === "conectar" || acao === "remover") {
        setCfg((c) => ({ ...c, provedor: "EVOLUTION", evolutionProvisionada: data.status !== "nao_provisionado" }));
      }
    } catch (e) {
      setEvo((v) => ({ ...v, status: v.status === "loading" ? "unknown" : v.status }));
      setError(e instanceof Error ? e.message : "Não foi possível consultar a conexão.");
    } finally { if (acao) setEvoBusy(false); }
  }, []);
  useEffect(() => { if (cfg.provedor === "EVOLUTION") void evoAcao(); }, [cfg.provedor, evoAcao]);
  useEffect(() => {
    if (evo.status !== "connecting") return;
    const timer = setInterval(() => { void evoAcao(); }, 5000);
    return () => clearInterval(timer);
  }, [evo.status, evoAcao]);
  useEffect(() => {
    if (!evo.qrCode) return;
    const timer = setTimeout(() => setEvo((v) => ({ ...v, qrCode: null })), 40_000);
    return () => clearTimeout(timer);
  }, [evo.qrCode]);

  async function salvar() {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/erp/configuracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: cfg.ativo,
          provedor: cfg.provedor,
          instanceId: cfg.instanceId,
          token: token || undefined,
          clientToken: clientToken || undefined,
          atenderClientes: cfg.atenderClientes,
          zernioApiKey: zernioApiKey || undefined,
          zernioAccountId: cfg.zernioAccountId,
          zernioTemplateNome: cfg.zernioTemplateNome,
          zernioTemplateIdioma: cfg.zernioTemplateIdioma
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMsg("Configuração do WhatsApp salva.");
      setToken(""); setClientToken(""); setZernioApiKey("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  // Descoberta Zernio: lista contas WhatsApp conectadas e templates aprovados da WABA
  // (usa a API key JÁ SALVA — salve a key antes de buscar).
  async function buscarZernio(accountId?: string) {
    setZernioBuscando(true); setError(""); setMsg("");
    try {
      const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      const res = await fetch(`/api/erp/configuracoes/whatsapp/zernio${qs}`);
      const data = (await res.json()) as { error?: string; contas?: ZernioConta[]; templates?: ZernioTemplate[] };
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar a Zernio.");
      setZernioContas(data.contas ?? []);
      setZernioTemplates(data.templates ?? []);
      if (!data.contas?.length) setMsg("Nenhuma conta WhatsApp conectada na Zernio — conecte a WABA no painel da Zernio primeiro.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar a Zernio.");
    } finally { setZernioBuscando(false); }
  }

  async function addTelefone() {
    setError(""); setMsg("");
    if (novoTel.replace(/\D/g, "").length < 10) { setError("Informe um telefone com DDD."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/erp/configuracoes/whatsapp/telefones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: novoTel, nome: novoNome, role: novoRole })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar.");
      setNovoTel(""); setNovoNome("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally { setBusy(false); }
  }

  async function removerTelefone(id: string) {
    if (!window.confirm("Remover este telefone autorizado?")) return;
    setBusy(true);
    try {
      await fetch(`/api/erp/configuracoes/whatsapp/telefones/${id}`, { method: "DELETE" });
      await carregar();
    } finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp";

  return (
    <>
      <div className="erp-card">
        <div className="erp-card-head"><h3>WhatsApp do agente</h3></div>
        <div className="erp-card-body">
          {cfg.provedor === "ZAPI" && (
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
              Conecte sua instância Z-API para o agente atender pelo WhatsApp. As credenciais são
              guardadas criptografadas. Configure na Z-API o webhook <b>&quot;Ao receber&quot;</b> apontando para:
              <br /><span className="mono" style={{ wordBreak: "break-all" }}>{webhookUrl}</span>
            </p>
          )}
          {cfg.provedor === "EVOLUTION" && (
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
              O número da empresa conecta na nossa própria infraestrutura, sem custo de terceiros: leia o QR Code
              com o WhatsApp do número que vai atender e pronto — texto, áudio, PDF e foto de cupom, igual ao Telegram.
            </p>
          )}
          {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
          {msg && <div className="alert success" style={{ marginBottom: 10 }}><span>{msg}</span></div>}
          <div className="erp-form">
            <label className="check-row">
              <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />
              Ativar atendimento por WhatsApp
            </label>
            <label className="check-row">
              <input type="checkbox" checked={cfg.atenderClientes} onChange={(e) => setCfg({ ...cfg, atenderClientes: e.target.checked })} />
              Atender clientes finais (autoatendimento dos próprios pedidos)
            </label>
            <label>Provedor
              <select value={cfg.provedor} onChange={(e) => setCfg({ ...cfg, provedor: e.target.value === "ZERNIO" ? "ZERNIO" : e.target.value === "EVOLUTION" ? "EVOLUTION" : "ZAPI" })}>
                <option value="EVOLUTION" disabled={!cfg.evolutionDisponivel}>
                  XERP WhatsApp (conexão própria, sem custo de terceiros){cfg.evolutionDisponivel ? "" : " — indisponível neste servidor"}
                </option>
                <option value="ZAPI">Z-API (não oficial — conexão WhatsApp Web)</option>
                <option value="ZERNIO">Zernio (API OFICIAL da Meta / WABA)</option>
              </select>
              <small className="field-hint">
                XERP WhatsApp e Z-API atendem pelo agente (texto, áudio, documentos e foto de cupom). Zernio usa a API oficial: iniciar conversa exige template aprovado na Meta e o PDF só entra na janela de 24h — serve para envio de documentos, não para o agente.
              </small>
            </label>
            {cfg.provedor === "ZAPI" && (
              <>
                <label>Instance ID
                  <input value={cfg.instanceId} onChange={(e) => setCfg({ ...cfg, instanceId: e.target.value })} placeholder="ID da instância Z-API" />
                </label>
                <label>Token{cfg.temToken ? " (já salvo)" : ""}
                  <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? "Manter token atual" : "Token da instância"} />
                </label>
                <label>Client-Token{cfg.temClientToken ? " (já salvo)" : ""}
                  <input value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder={cfg.temClientToken ? "Manter atual" : "Client-Token da conta (segurança)"} />
                </label>
              </>
            )}
            {cfg.provedor === "ZERNIO" && (
              <>
                <label>API key da Zernio{cfg.temToken ? " (já salva)" : ""}
                  <input type="password" value={zernioApiKey} onChange={(e) => setZernioApiKey(e.target.value)} placeholder={cfg.temToken ? "Manter atual" : "sk_..."} />
                  <small className="field-hint">Crie em zernio.com → Settings → API Keys. Salve primeiro a key para poder buscar contas/templates.</small>
                </label>
                <label>Conta WhatsApp conectada (WABA)
                  <div style={{ display: "flex", gap: 6 }}>
                    {zernioContas.length ? (
                      <select style={{ flex: 1 }} value={cfg.zernioAccountId} onChange={(e) => { setCfg({ ...cfg, zernioAccountId: e.target.value }); void buscarZernio(e.target.value); }}>
                        <option value="">Selecione a conta…</option>
                        {zernioContas.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.id})</option>)}
                      </select>
                    ) : (
                      <input style={{ flex: 1 }} value={cfg.zernioAccountId} onChange={(e) => setCfg({ ...cfg, zernioAccountId: e.target.value })} placeholder="acc_... (ou use Buscar)" />
                    )}
                    <button type="button" className="btn-erp ghost sm" disabled={zernioBuscando} onClick={() => buscarZernio(cfg.zernioAccountId || undefined)}>
                      {zernioBuscando ? "..." : "🔎 Buscar"}
                    </button>
                  </div>
                </label>
                <label>Template aprovado (inicia a conversa)
                  {zernioTemplates.length ? (
                    <select value={cfg.zernioTemplateNome} onChange={(e) => {
                      const t = zernioTemplates.find((x) => x.nome === e.target.value);
                      setCfg({ ...cfg, zernioTemplateNome: e.target.value, zernioTemplateIdioma: t?.idioma || cfg.zernioTemplateIdioma });
                    }}>
                      <option value="">Selecione o template…</option>
                      {zernioTemplates.map((t) => (
                        <option key={`${t.nome}-${t.idioma}`} value={t.nome} disabled={t.status !== "APPROVED"}>
                          {t.nome} · {t.idioma} · {t.status}{t.categoria ? ` · ${t.categoria}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={cfg.zernioTemplateNome} onChange={(e) => setCfg({ ...cfg, zernioTemplateNome: e.target.value })} placeholder="Ex.: documentos_erp" />
                  )}
                  <small className="field-hint">
                    Crie na Meta (categoria UTILITY) um template com o corpo <span className="mono">{"{{1}}"}</span> — a mensagem do ERP (orçamento, linha digitável do boleto, chave da NF) entra nessa variável.
                  </small>
                </label>
                <label>Idioma do template
                  <input value={cfg.zernioTemplateIdioma} onChange={(e) => setCfg({ ...cfg, zernioTemplateIdioma: e.target.value })} placeholder="pt_BR" />
                </label>
              </>
            )}
            {cfg.provedor === "EVOLUTION" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <p role="status" style={{ margin: "4px 0 8px", fontWeight: 600 }}>Conexão: {EVO_STATUS[evo.status] ?? evo.status}</p>
                {evo.qrCode && (
                  <div style={{ marginBottom: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={evo.qrCode} alt="QR Code para conectar o WhatsApp da empresa" width={280} height={280} style={{ maxWidth: "100%", height: "auto" }} />
                    <p style={{ fontSize: 12.5, margin: "6px 0 0" }}>
                      No WhatsApp do número da empresa: <b>Aparelhos conectados → Conectar um aparelho</b>. O código expira em 40 segundos.
                    </p>
                  </div>
                )}
                {evo.status === "connecting" && !evo.qrCode && !evoBusy && <p style={{ fontSize: 12.5 }}>Se o QR Code expirou, gere outro.</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {evo.status !== "connected" && evo.status !== "indisponivel" && (
                    <button type="button" className="btn-erp primary sm" disabled={evoBusy || !cfg.evolutionDisponivel} onClick={() => void evoAcao("conectar")}>
                      {evoBusy ? "Conectando…" : cfg.evolutionProvisionada ? "Gerar QR Code" : "Vincular número (gerar QR Code)"}
                    </button>
                  )}
                  <button type="button" className="btn-erp light sm" disabled={evoBusy} onClick={() => void evoAcao()}>Atualizar conexão</button>
                  {evo.status === "connected" && (
                    <button type="button" className="btn-erp ghost sm" disabled={evoBusy} onClick={() => void evoAcao("desconectar")}>Desconectar</button>
                  )}
                  {cfg.evolutionProvisionada && (
                    <button type="button" className="btn-erp danger sm" disabled={evoBusy} onClick={() => { if (window.confirm("Remover o número desta empresa? O WhatsApp será desconectado e o atendimento desativado.")) void evoAcao("remover"); }}>
                      Remover número
                    </button>
                  )}
                </div>
                <small className="field-hint">Depois de conectar, marque &quot;Ativar atendimento&quot; e salve. Conexão hospedada por nós (Evolution API, WhatsApp Web).</small>
              </div>
            )}
          </div>
          <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8 }}>
            <div className="grow" />
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 16 }}>
        <div className="erp-card-head"><h3>Telefones autorizados (vendedor/gestor)</h3></div>
        <div className="erp-card-body">
          <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
            Telefones que podem operar o agente (consultar e criar rascunhos). Clientes finais não
            precisam estar aqui — são reconhecidos pelo WhatsApp do cadastro.
          </p>
          <div className="erp-form" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr auto", alignItems: "end" }}>
            <label>Telefone (com DDD)
              <input value={novoTel} onChange={(e) => setNovoTel(e.target.value)} placeholder="Ex.: 77999999999" />
            </label>
            <label>Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do operador" />
            </label>
            <label>Papel
              <select value={novoRole} onChange={(e) => setNovoRole(e.target.value as "GESTOR" | "VENDEDOR")}>
                <option value="VENDEDOR">Vendedor</option>
                <option value="GESTOR">Gestor</option>
              </select>
            </label>
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={addTelefone}>Adicionar</button>
          </div>
          {telefones.length > 0 && (
            <div className="erp-table-wrap solo" style={{ marginTop: 12, border: 0, borderRadius: 0 }}>
              <table className="erp-table">
                <thead><tr><th>Telefone</th><th>Nome</th><th>Papel</th><th className="actions" /></tr></thead>
                <tbody>
                  {telefones.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.telefone}</td>
                      <td>{t.nome ?? "—"}</td>
                      <td>{t.role}</td>
                      <td className="actions"><button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => removerTelefone(t.id)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
