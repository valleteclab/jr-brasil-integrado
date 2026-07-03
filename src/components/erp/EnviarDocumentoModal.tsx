"use client";

import { useState } from "react";

type Resultado = {
  email?: { ok: boolean; error?: string; destinatario?: string };
  whatsapp?: { ok: boolean; error?: string; destinatario?: string };
  error?: string;
};

/**
 * Modal compartilhado de envio de documento ao cliente (orçamento, boleto, nota fiscal) por
 * e-mail e/ou WhatsApp. Deixe os campos em branco para usar o contato PRINCIPAL do cliente —
 * o servidor resolve; preencher sobrepõe só neste envio.
 */
export function EnviarDocumentoModal({
  titulo,
  descricao,
  endpoint,
  onClose
}: {
  titulo: string;
  descricao?: string;
  /** Rota POST que recebe { canais, email, telefone }. */
  endpoint: string;
  onClose: () => void;
}) {
  const [canalEmail, setCanalEmail] = useState(true);
  const [canalWhatsapp, setCanalWhatsapp] = useState(true);
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function enviar() {
    setErro("");
    setResultado(null);
    const canais = [...(canalEmail ? ["EMAIL"] : []), ...(canalWhatsapp ? ["WHATSAPP"] : [])];
    if (!canais.length) { setErro("Escolha ao menos um canal (e-mail ou WhatsApp)."); return; }
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canais, email: email.trim() || null, telefone: telefone.trim() || null })
      });
      const data = (await res.json()) as Resultado;
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar.");
      setResultado(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  const tudoOk = resultado && (!resultado.email || resultado.email.ok) && (!resultado.whatsapp || resultado.whatsapp.ok);

  return (
    <div className="erp-modal-backdrop" style={backdrop} onClick={onClose}>
      <div className="erp-card" style={card} onClick={(e) => e.stopPropagation()}>
        <div className="erp-card-head"><h3>📤 {titulo}</h3></div>
        <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {descricao && <p style={{ margin: 0, fontSize: 12.5, color: "var(--erp-mute)" }}>{descricao}</p>}

          <label className="check-row">
            <input type="checkbox" checked={canalWhatsapp} onChange={(e) => setCanalWhatsapp(e.target.checked)} />
            Enviar por WhatsApp
          </label>
          {canalWhatsapp && (
            <label style={{ fontSize: 12 }}>
              WhatsApp do destinatário
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Em branco = contato principal do cliente" />
            </label>
          )}

          <label className="check-row">
            <input type="checkbox" checked={canalEmail} onChange={(e) => setCanalEmail(e.target.checked)} />
            Enviar por e-mail
          </label>
          {canalEmail && (
            <label style={{ fontSize: 12 }}>
              E-mail do destinatário
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Em branco = contato principal do cliente" />
            </label>
          )}

          {erro && <div className="alert danger"><span>{erro}</span></div>}
          {resultado && (
            <div className={`alert ${tudoOk ? "success" : "warn"}`} style={{ display: "block" }}>
              {resultado.whatsapp && (
                <div>
                  {resultado.whatsapp.ok
                    ? `✅ WhatsApp enviado para ${resultado.whatsapp.destinatario}.`
                    : `❌ WhatsApp: ${resultado.whatsapp.error}`}
                </div>
              )}
              {resultado.email && (
                <div>
                  {resultado.email.ok
                    ? `✅ E-mail enviado para ${resultado.email.destinatario}.`
                    : `❌ E-mail: ${resultado.email.error}`}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-erp ghost sm" onClick={onClose}>{resultado ? "Fechar" : "Cancelar"}</button>
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={enviar}>
              {busy ? "Enviando…" : resultado ? "Enviar novamente" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 90,
  display: "grid", placeItems: "center", padding: 16
};
const card: React.CSSProperties = { width: "min(440px, 96vw)", maxHeight: "90vh", overflow: "auto" };
