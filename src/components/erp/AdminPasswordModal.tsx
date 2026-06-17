"use client";

import { useState } from "react";

/**
 * Modal reusável de autorização de admin: pede SÓ a senha (qualquer admin do tenant).
 * O componente PRÉ-valida em /api/admin/validar-senha (UX) e, em caso de sucesso,
 * chama onAutorizado(senha) — a senha vai junto no payload final do save, pra o
 * servidor revalidar no momento do checkout (defesa em profundidade).
 *
 * Uso típico:
 *   {showAdmin && <AdminPasswordModal motivo="Desconto de 15% no item" onAutorizado={onOk} onClose={...} />}
 */
export function AdminPasswordModal({
  motivo,
  onAutorizado,
  onClose
}: {
  motivo: string;
  onAutorizado: (senha: string, autorizadoPor: string) => void;
  onClose: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [validando, setValidando] = useState(false);

  async function validar() {
    setErro("");
    if (!senha.trim()) { setErro("Informe a senha."); return; }
    setValidando(true);
    try {
      const res = await fetch("/api/admin/validar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha })
      });
      const data = (await res.json().catch(() => ({}))) as { autorizadoPor?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Senha inválida.");
      onAutorizado(senha, data.autorizadoPor ?? "Admin");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Senha inválida.");
    } finally {
      setValidando(false);
    }
  }

  return (
    <div className="drawer-bd" style={{ display: "grid", placeItems: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 420, width: "92%" }}>
        <h2 style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Autorização de administrador</h2>
        <p style={{ color: "var(--erp-slate)", margin: "0 0 14px", fontSize: 13 }}>{motivo}</p>
        <label style={{ display: "block", fontSize: 12, color: "var(--erp-mute)", marginBottom: 4 }}>Senha do administrador</label>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") validar(); }}
          style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 14 }}
        />
        {erro && <div className="alert danger" style={{ marginTop: 10 }}><span>{erro}</span></div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={validando}>Cancelar</button>
          <button type="button" className="btn-erp primary sm" onClick={validar} disabled={validando}>
            {validando ? "Validando…" : "Autorizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
