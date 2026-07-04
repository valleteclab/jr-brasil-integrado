"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BANCOS, type BancoId } from "@/domains/finance/providers/bank-provider";
import type { ConfigBancoConta } from "@/domains/finance/application/bank-config-use-cases";

/**
 * Integração bancária por conta: escolhe o provedor (Sicoob/Sicredi/Itaú) e, para Sicredi/Itaú,
 * preenche as credenciais de cobrança/Pix. O Sicoob mantém a tela dedicada logo abaixo (webhook etc.).
 */
export function IntegracaoBancariaConfig({ contas }: { contas: ConfigBancoConta[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [banco, setBanco] = useState<BancoId>("SICOOB");
  const [sandbox, setSandbox] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({});

  function abrir(c: ConfigBancoConta) {
    setEditando(c.id);
    setErro("");
    setOk("");
    setBanco(c.bancoIntegrado);
    setSandbox(c.bancoSandbox);
    setCampos({
      bancoClientId: c.bancoClientId ?? "",
      bancoBeneficiario: c.bancoBeneficiario ?? "",
      bancoCooperativa: c.bancoCooperativa ?? "",
      bancoPosto: c.bancoPosto ?? "",
      bancoConta: c.bancoConta ?? "",
      bancoConvenio: c.bancoConvenio ?? "",
      // segredos começam vazios (não são reexibidos)
      bancoClientSecret: "",
      bancoApiKey: "",
      bancoAcesso: ""
    });
  }

  async function salvar(id: string) {
    setBusy(true);
    setErro("");
    try {
      const meta = BANCOS[banco];
      // Envia só o discriminador+sandbox e os campos do banco escolhido (segredos só se digitados).
      const body: Record<string, unknown> = { bancoIntegrado: banco, bancoSandbox: sandbox };
      for (const campo of meta.campos) {
        const v = campos[campo.key] ?? "";
        if (campo.secreto) {
          if (v.trim()) body[campo.key] = v.trim();
        } else {
          body[campo.key] = v.trim() || null;
        }
      }
      const res = await fetch(`/api/erp/financeiro/contas-bancarias/${id}/banco`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setOk("Integração bancária salva.");
      setEditando(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const contaEditando = contas.find((c) => c.id === editando);
  const meta = BANCOS[banco];

  return (
    <section className="erp-card" style={{ marginTop: 24 }}>
      <div className="erp-card-head">
        <h3>Integração bancária (boleto, Pix e conciliação)</h3>
      </div>
      <div style={{ padding: "0 16px 8px", fontSize: 13, color: "var(--erp-slate)" }}>
        <p style={{ marginTop: 8 }}>
          Escolha o <strong>banco integrado</strong> de cada conta para emitir boleto e cobrar por Pix pela API oficial.
          O <strong>Sicoob</strong> tem a tela dedicada logo abaixo (com webhook de baixa em tempo real).
          O <strong>Sicredi</strong> e o <strong>Itaú</strong> se configuram aqui. O certificado A1 da empresa
          (o mesmo do fiscal) autentica o mTLS do Pix.
        </p>
      </div>
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Conta</th><th>Banco</th><th>Ambiente</th><th>Boleto</th><th>Pix</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nome}</strong></td>
                <td>{BANCOS[c.bancoIntegrado].label}</td>
                <td>{c.bancoIntegrado === "SICOOB" ? "—" : (c.bancoSandbox ? "Sandbox" : "Produção")}</td>
                <td><span className={`pill ${c.temBoleto ? "success" : "mute"}`}><span className="dot" />{c.temBoleto ? "OK" : "—"}</span></td>
                <td><span className={`pill ${c.temPix ? "success" : "mute"}`}><span className="dot" />{c.temPix ? "OK" : "—"}</span></td>
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

      {editando && contaEditando && (
        <div className="card" style={{ margin: 12, padding: 16, border: "1px solid var(--erp-line)" }}>
          <h4 style={{ marginTop: 0 }}>Integração bancária — {contaEditando.nome}</h4>
          <div className="erp-form" style={{ padding: 0 }}>
            <label>
              Banco integrado
              <select value={banco} onChange={(e) => setBanco(e.target.value as BancoId)}>
                <option value="SICOOB">Sicoob</option>
                <option value="SICREDI">Sicredi</option>
                <option value="ITAU">Itaú</option>
              </select>
            </label>
            {banco !== "SICOOB" && (
              <label>
                Ambiente
                <select value={sandbox ? "sandbox" : "producao"} onChange={(e) => setSandbox(e.target.value === "sandbox")}>
                  <option value="producao">Produção (mTLS com o A1 da empresa)</option>
                  <option value="sandbox">Sandbox / homologação</option>
                </select>
              </label>
            )}
          </div>

          <p style={{ fontSize: 12.5, color: "var(--erp-slate)", margin: "10px 0" }}>{meta.ajuda}</p>

          {banco === "SICOOB" ? (
            <div className="alert info" style={{ margin: 0 }}>
              <span>Configure as credenciais do Sicoob na seção <strong>“Cobrança Sicoob”</strong> logo abaixo (nº do cliente, client_id, sandbox e webhook).</span>
            </div>
          ) : (
            <div className="erp-form" style={{ padding: 0 }}>
              {meta.campos.map((campo) => (
                <label key={campo.key} className={campo.help && campo.help.length > 40 ? "full" : undefined}>
                  {campo.label}{campo.obrigatorio ? <span className="required"> *</span> : null}
                  <input
                    type={campo.secreto ? "password" : "text"}
                    value={campos[campo.key] ?? ""}
                    onChange={(e) => setCampos((f) => ({ ...f, [campo.key]: e.target.value }))}
                    placeholder={campo.secreto
                      ? (fieldPreenchido(contaEditando, campo.key) ? "•••••• (mantém o atual se vazio)" : "Cole aqui (fica criptografado)")
                      : (campo.help ?? "")}
                  />
                  {campo.help && <small style={{ color: "var(--erp-slate)" }}>{campo.help}</small>}
                </label>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn-erp ghost sm" onClick={() => setEditando(null)} disabled={busy}>Cancelar</button>
            <button type="button" className="btn-erp primary sm" onClick={() => salvar(editando)} disabled={busy}>
              {busy ? "Salvando…" : "Salvar integração"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** O segredo já está preenchido no banco de dados? (para o placeholder do campo). */
function fieldPreenchido(c: ConfigBancoConta, key: string): boolean {
  if (key === "bancoClientSecret") return c.temClientSecret;
  if (key === "bancoApiKey") return c.temApiKey;
  if (key === "bancoAcesso") return c.temAcesso;
  return false;
}
