"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Slug local (espelha o slugify do servidor) para preview enquanto o usuário digita. */
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

type Props = { clienteId: string; nome: string; slug: string };

export function ClienteEditForm({ clienteId, nome: nomeInicial, slug: slugInicial }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeInicial);
  const [slug, setSlug] = useState(slugInicial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function salvar() {
    setSaving(true);
    setMsg("");
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), slug: slug.trim() })
      });
      const data = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      if (data.slug) setSlug(data.slug);
      setMsg("Cliente atualizado.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <label>
        Nome do cliente
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Loja do João" />
      </label>
      <label>
        Identificador (slug)
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="loja-do-joao" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn-erp ghost sm" style={{ whiteSpace: "nowrap" }} onClick={() => setSlug(slugify(nome))}>Gerar do nome</button>
        </div>
        <small className="field-hint">Único entre os clientes. Use letras, números e hífen.</small>
      </label>
      <div className="full" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn-erp primary sm" onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar cliente"}</button>
        {msg && <span style={{ color: "var(--erp-success, #16a34a)", fontSize: 13 }}>{msg}</span>}
        {erro && <span style={{ color: "var(--erp-danger, #dc2626)", fontSize: 13 }}>{erro}</span>}
      </div>
    </div>
  );
}
