"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { ajustarLogoFiscal } from "@/lib/images/logo-fiscal";

type Branding = { logoSistema: string | null; corDestaque: string | null };

const COR_PADRAO = "#ffc107";

function fileParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function AparenciaForm({ initial }: { initial: Branding }) {
  const router = useRouter();
  const [logo, setLogo] = useState<string | null>(initial.logoSistema);
  const [cor, setCor] = useState(initial.corDestaque || COR_PADRAO);
  const [ajustando, setAjustando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function selecionarLogo(file: File | null) {
    setError("");
    setMessage("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Formato inválido. Envie PNG, JPEG ou WebP.");
      return;
    }
    setAjustando(true);
    try {
      // Logo do sistema: fundo transparente (fica sobre a barra lateral escura), lado ≤ 320px.
      const r = await ajustarLogoFiscal(file, { fundoBranco: false, maxLado: 320 });
      const dataUrl = await fileParaDataUrl(r.file);
      setLogo(dataUrl);
      setMessage(`Logo ajustada: ${r.largura}×${r.altura}px · ${(r.bytes / 1024).toFixed(0)} KB.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ajustar a imagem.");
    } finally {
      setAjustando(false);
    }
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/erp/configuracoes/aparencia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoSistema: logo, corDestaque: cor })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMessage("Aparência salva. Aplicando ao sistema…");
      // Atualiza o layout (server component) para a logo/cor aparecerem na barra lateral na hora.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>Identidade visual</h3>
          <span>Logo e cor de destaque exibidas no sistema desta empresa.</span>
        </div>
      </div>

      <div className="erp-form">
        <label className="full">
          Logo do sistema (PNG com fundo transparente fica melhor na barra lateral)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => selecionarLogo(e.target.files?.[0] ?? null)} disabled={ajustando} />
          <small className="block-muted">A imagem é redimensionada e otimizada automaticamente. Preserva a transparência.</small>
        </label>

        <label>
          Cor de destaque
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} style={{ width: 48, height: 36, padding: 2, border: "1px solid var(--erp-line)", borderRadius: 6, background: "#fff" }} />
            <input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="#ffc107" style={{ width: 120 }} />
            <button type="button" className="btn-erp ghost xs" onClick={() => setCor(COR_PADRAO)}>Padrão</button>
          </div>
        </label>
      </div>

      {/* Pré-visualização: mini barra lateral com a logo e um item ativo na cor escolhida */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--erp-mute)", marginBottom: 6 }}>Pré-visualização</div>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ width: 200, background: "var(--jr-ink, #0e1117)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {logo ? (
                <span style={{ background: "#fff", borderRadius: 8, padding: "6px 10px", display: "inline-flex", alignItems: "center", width: "100%", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="Logo" style={{ maxWidth: "100%", maxHeight: 36, objectFit: "contain", display: "block" }} />
                </span>
              ) : (
                <div style={{ width: 34, height: 34, borderRadius: 8, background: cor, color: "#111", display: "grid", placeItems: "center", fontWeight: 800 }}>JR</div>
              )}
            </div>
            <div style={{ background: `${cor}22`, color: "#fff", borderLeft: `3px solid ${cor}`, padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>Item ativo</div>
            <div style={{ color: "#cbd5e1", padding: "8px 10px", fontSize: 13 }}>Outro item</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            <button type="button" style={{ alignSelf: "start", background: cor, color: "#111", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "default" }}>Botão de destaque</button>
            <span style={{ color: cor, fontWeight: 600 }}>Link de destaque</span>
          </div>
        </div>
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{error}</span></div>}

      <footer className="inline-foot">
        {logo && <Button type="button" variant="light" onClick={() => { setLogo(null); setMessage("Logo removida (salve para confirmar)."); }}>Remover logo</Button>}
        <Button type="button" onClick={salvar} disabled={saving || ajustando}>{saving ? "Salvando..." : "Salvar aparência"}</Button>
      </footer>
    </section>
  );
}
