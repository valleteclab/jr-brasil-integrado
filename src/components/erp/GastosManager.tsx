"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { GastoRow, GastosResumo } from "@/lib/services/gastos";
import { KpiCard } from "@/components/shared/KpiCard";

const linkBtn: React.CSSProperties = { background: "none", border: 0, padding: 0, color: "#4f46e5", cursor: "pointer", textAlign: "left" };

type Props = {
  initialGastos: GastoRow[];
  resumo: GastosResumo;
  categorias: string[];
  isAdmin?: boolean;
};

type ItemForm = { descricao: string; quantidade: string; valor: string };
type Editor = {
  id: string | null; // null = novo manual
  estabelecimento: string;
  documento: string;
  categoria: string;
  data: string; // YYYY-MM-DD
  valorTotal: string;
  formaPagamento: string;
  observacoes: string;
  itens: ItemForm[];
  imagemCupom: string | null;
  origem?: string;
  status?: string;
  lancadoFinanceiro?: boolean;
};

function moeda(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/** Comprime a foto no navegador (max 1280px, JPEG ~0.7) e retorna data URL base64. */
function comprimirImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function rowParaEditor(g: GastoRow): Editor {
  return {
    id: g.id,
    estabelecimento: g.estabelecimento,
    documento: g.documento ?? "",
    categoria: g.categoria,
    data: g.dataRaw.slice(0, 10),
    valorTotal: String(g.valorTotal),
    formaPagamento: g.formaPagamento ?? "",
    observacoes: g.observacoes ?? "",
    itens: g.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade != null ? String(i.quantidade) : "", valor: String(i.valor) })),
    imagemCupom: g.imagemCupom,
    origem: g.origem,
    status: g.status,
    lancadoFinanceiro: g.lancadoFinanceiro
  };
}

function editorVazio(categoria: string): Editor {
  return { id: null, estabelecimento: "", documento: "", categoria, data: new Date().toISOString().slice(0, 10), valorTotal: "", formaPagamento: "", observacoes: "", itens: [], imagemCupom: null };
}

export function GastosManager({ initialGastos, resumo: resumoInicial, categorias, isAdmin = false }: Props) {
  const [rows, setRows] = useState(initialGastos);
  const [resumo, setResumo] = useState(resumoInicial);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [busy, setBusy] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => (filtroCategoria ? rows.filter((r) => r.categoria === filtroCategoria) : rows),
    [rows, filtroCategoria]
  );

  async function recarregar(): Promise<GastoRow[]> {
    const g = await fetch("/api/erp/gastos").then((x) => x.json());
    if (Array.isArray(g)) {
      setRows(g as GastoRow[]);
      recalcResumo(g as GastoRow[]); // resumo recalculado no cliente a partir da lista
      return g as GastoRow[];
    }
    return [];
  }

  function recalcResumo(lista: GastoRow[]) {
    const total = lista.reduce((s, x) => s + x.valorTotal, 0);
    const mapa = new Map<string, number>();
    for (const x of lista) mapa.set(x.categoria, (mapa.get(x.categoria) ?? 0) + x.valorTotal);
    setResumo({
      total,
      totalFmt: moeda(total),
      quantidade: lista.length,
      pendentes: lista.filter((x) => x.status === "PENDENTE").length,
      porCategoria: [...mapa.entries()]
        .map(([categoria, t]) => ({ categoria, total: t, totalFmt: moeda(t), pct: total > 0 ? Math.round((t / total) * 100) : 0 }))
        .sort((a, b) => b.total - a.total)
    });
  }

  async function onCapturar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setLendo(true);
      setErro("");
      try {
        const base64 = await comprimirImagem(file);
        const res = await fetch("/api/erp/gastos/foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagem: base64 })
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error || "Não foi possível ler o cupom.");
        const lista = await recarregar();
        const criado = lista.find((g) => g.id === data.id);
        if (criado) setEditor(rowParaEditor(criado));
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Falha ao ler o cupom.");
      } finally {
        setLendo(false);
      }
    }
    if (fotoRef.current) fotoRef.current.value = "";
  }

  function totalItens(ed: Editor): number {
    return ed.itens.reduce((s, i) => s + (Number(i.valor.replace(",", ".")) || 0), 0);
  }

  async function salvarEditor(confirmar: boolean) {
    if (!editor) return;
    setBusy("salvar");
    setErro("");
    const payload = {
      estabelecimento: editor.estabelecimento,
      documento: editor.documento || null,
      categoria: editor.categoria,
      data: editor.data,
      valorTotal: Number(editor.valorTotal.replace(",", ".")) || 0,
      formaPagamento: editor.formaPagamento || null,
      observacoes: editor.observacoes || null,
      itens: editor.itens
        .filter((i) => i.descricao.trim())
        .map((i) => ({ descricao: i.descricao, quantidade: i.quantidade ? Number(i.quantidade.replace(",", ".")) : null, valor: Number(i.valor.replace(",", ".")) || 0 }))
    };
    try {
      if (editor.id) {
        const res = await fetch(`/api/erp/gastos/${editor.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Falha ao salvar.");
        if (confirmar) await fetch(`/api/erp/gastos/${editor.id}/confirmar`, { method: "POST" });
      } else {
        const res = await fetch("/api/erp/gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Falha ao criar.");
      }
      setEditor(null);
      await recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy("");
    }
  }

  async function lancar(id: string) {
    if (!window.confirm("Lançar este gasto no financeiro (cria conta a pagar quitada)?")) return;
    setBusy(id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/gastos/${id}/lancar`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Falha ao lançar.");
      await recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao lançar no financeiro.");
    } finally {
      setBusy("");
    }
  }

  async function excluir(id: string, estab: string) {
    if (!window.confirm(`Excluir o gasto de "${estab}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/gastos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Falha ao excluir.");
      setRows((prev) => { const novo = prev.filter((r) => r.id !== id); recalcResumo(novo); return novo; });
      if (editor?.id === id) setEditor(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      {/* KPIs + gráfico por categoria */}
      <div className="kpi-row">
        <KpiCard label="Total (90 dias)" value={resumo.totalFmt} tone="info" />
        <KpiCard label="Gastos" value={String(resumo.quantidade)} tone="default" />
        <KpiCard label="A revisar" value={String(resumo.pendentes)} tone={resumo.pendentes > 0 ? "warn" : "default"} />
      </div>

      {resumo.porCategoria.length > 0 && (
        <div className="erp-card" style={{ padding: 16, marginBottom: 12 }}>
          <h4 style={{ margin: "0 0 10px" }}>Por categoria</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {resumo.porCategoria.map((c) => (
              <div key={c.categoria} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", alignItems: "center", gap: 8 }}>
                <button type="button" style={{ ...linkBtn, fontWeight: filtroCategoria === c.categoria ? 700 : 400 }} onClick={() => setFiltroCategoria(filtroCategoria === c.categoria ? "" : c.categoria)}>{c.categoria}</button>
                <div style={{ background: "#eef2f7", borderRadius: 6, height: 14, overflow: "hidden" }}>
                  <div style={{ width: `${c.pct}%`, height: "100%", background: "#6366f1" }} />
                </div>
                <span style={{ textAlign: "right", fontSize: 13 }}>{c.totalFmt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de ações */}
      <div className="erp-toolbar" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
        <label className="btn-erp primary sm" style={{ cursor: "pointer", margin: 0 }}>
          {lendo ? "Lendo cupom…" : "📷 Novo gasto (foto)"}
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onCapturar} disabled={lendo} />
        </label>
        <button type="button" className="btn-erp ghost sm" onClick={() => setEditor(editorVazio(categorias[0] ?? "Outros"))}>+ Gasto manual</button>
        {filtroCategoria && <button type="button" className="btn-erp ghost sm" onClick={() => setFiltroCategoria("")}>Limpar filtro: {filtroCategoria} ✕</button>}
      </div>

      {erro && <div className="alert danger" style={{ margin: "0 0 12px" }}><span>{erro}</span></div>}

      {/* Lista */}
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Data</th><th>Estabelecimento</th><th>Categoria</th><th className="num">Valor</th><th>Origem</th><th>Situação</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id}>
                <td>{g.data}</td>
                <td>
                  <button type="button" className="bold" style={linkBtn} onClick={() => setEditor(rowParaEditor(g))}>{g.estabelecimento}</button>
                  {g.iaConfianca != null && g.status === "PENDENTE" && <span className="sublabel">IA {g.iaConfianca}% · revisar</span>}
                </td>
                <td>{g.categoria}</td>
                <td className="num">{g.valorFmt}</td>
                <td>{g.origem === "WHATSAPP" ? "WhatsApp" : g.origem === "PWA" ? "Foto" : "Manual"}</td>
                <td>
                  {g.lancadoFinanceiro ? <span className="status-badge success">No financeiro</span> : g.status === "PENDENTE" ? <span className="status-badge warn">A revisar</span> : <span className="status-badge info">Confirmado</span>}
                </td>
                <td className="actions">
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" className="btn-erp ghost xs" onClick={() => setEditor(rowParaEditor(g))}>Abrir</button>
                    {!g.lancadoFinanceiro && <button type="button" className="btn-erp ghost xs" disabled={busy === g.id} onClick={() => lancar(g.id)}>Lançar</button>}
                    {isAdmin && <button type="button" className="btn-erp danger xs" disabled={busy === g.id} onClick={() => excluir(g.id, g.estabelecimento)}>Excluir</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}><div className="empty-st">Nenhum gasto ainda. Use “📷 Novo gasto (foto)”.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Drawer de revisão/edição */}
      {editor && (
        <>
          <div className="drawer-bd" onClick={() => setEditor(null)} />
          <aside className="drawer">
            <header className="drawer-head">
              <h2>{editor.id ? "Revisar gasto" : "Novo gasto manual"}</h2>
              <button type="button" className="btn-erp ghost icon-only" onClick={() => setEditor(null)}>✕</button>
            </header>
            <div className="drawer-body">
              {editor.imagemCupom && (
                <div style={{ marginBottom: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editor.imagemCupom} alt="Cupom" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--erp-line)" }} />
                </div>
              )}
              <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="full">Estabelecimento<input value={editor.estabelecimento} onChange={(e) => setEditor({ ...editor, estabelecimento: e.target.value })} /></label>
                <label>CNPJ<input value={editor.documento} onChange={(e) => setEditor({ ...editor, documento: e.target.value })} placeholder="opcional" /></label>
                <label>Data<input type="date" value={editor.data} onChange={(e) => setEditor({ ...editor, data: e.target.value })} /></label>
                <label>Categoria
                  <input list="cat-gastos" value={editor.categoria} onChange={(e) => setEditor({ ...editor, categoria: e.target.value })} />
                  <datalist id="cat-gastos">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                <label>Valor total (R$)<input value={editor.valorTotal} onChange={(e) => setEditor({ ...editor, valorTotal: e.target.value })} placeholder="0,00" /></label>
                <label>Forma de pagamento<input value={editor.formaPagamento} onChange={(e) => setEditor({ ...editor, formaPagamento: e.target.value })} placeholder="opcional" /></label>
                <label className="full">Observações<input value={editor.observacoes} onChange={(e) => setEditor({ ...editor, observacoes: e.target.value })} placeholder="opcional" /></label>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0 }}>Itens</h4>
                  <button type="button" className="btn-erp ghost xs" onClick={() => setEditor({ ...editor, itens: [...editor.itens, { descricao: "", quantidade: "", valor: "" }] })}>+ Item</button>
                </div>
                {editor.itens.map((it, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 28px", gap: 6, marginTop: 6 }}>
                    <input placeholder="Descrição" value={it.descricao} onChange={(e) => { const itens = [...editor.itens]; itens[idx] = { ...it, descricao: e.target.value }; setEditor({ ...editor, itens }); }} />
                    <input placeholder="Qtd" value={it.quantidade} onChange={(e) => { const itens = [...editor.itens]; itens[idx] = { ...it, quantidade: e.target.value }; setEditor({ ...editor, itens }); }} />
                    <input placeholder="Valor" value={it.valor} onChange={(e) => { const itens = [...editor.itens]; itens[idx] = { ...it, valor: e.target.value }; setEditor({ ...editor, itens }); }} />
                    <button type="button" className="btn-erp ghost xs" onClick={() => setEditor({ ...editor, itens: editor.itens.filter((_, i) => i !== idx) })}>✕</button>
                  </div>
                ))}
                {editor.itens.length > 0 && <p className="field-hint" style={{ marginTop: 6 }}>Soma dos itens: {moeda(totalItens(editor))}</p>}
              </div>
            </div>
            <footer className="drawer-foot" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-erp ghost sm" onClick={() => setEditor(null)} disabled={!!busy}>Fechar</button>
              <button type="button" className="btn-erp light sm" onClick={() => salvarEditor(false)} disabled={!!busy}>{busy === "salvar" ? "Salvando…" : "Salvar"}</button>
              {editor.id && <button type="button" className="btn-erp primary sm" onClick={() => salvarEditor(true)} disabled={!!busy}>Salvar e confirmar</button>}
              {editor.id && !editor.lancadoFinanceiro && <button type="button" className="btn-erp light sm" onClick={() => lancar(editor.id as string)} disabled={!!busy}>Lançar no financeiro</button>}
              {editor.id && isAdmin && <button type="button" className="btn-erp danger sm" onClick={() => excluir(editor.id as string, editor.estabelecimento)} disabled={!!busy}>Excluir</button>}
            </footer>
          </aside>
        </>
      )}
    </section>
  );
}
