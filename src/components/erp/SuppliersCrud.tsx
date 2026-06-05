"use client";

import { useMemo, useState } from "react";
import type { SupplierSummary } from "@/lib/services/purchasing";
import { useCadastroLookup } from "./useCadastroLookup";
import { formatDocumento, normalizeDocumento } from "@/lib/fiscal/documento";

type Props = {
  initialSuppliers: SupplierSummary[];
};

type FormState = {
  id?: string;
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  email: string;
  telefone: string;
  cidade: string;
  uf: string;
  condicaoPagamento: string;
};

const emptyForm: FormState = {
  razaoSocial: "",
  nomeFantasia: "",
  documento: "",
  email: "",
  telefone: "",
  cidade: "",
  uf: "",
  condicaoPagamento: ""
};

function toForm(s: SupplierSummary): FormState {
  return {
    id: s.id,
    razaoSocial: s.razaoSocial,
    nomeFantasia: s.nomeFantasia,
    documento: s.documento,
    email: s.email,
    telefone: s.telefone,
    cidade: s.cidade,
    uf: s.uf,
    condicaoPagamento: s.condicaoPagamento
  };
}

export function SuppliersCrud({ initialSuppliers }: Props) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const editing = Boolean(form.id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.razaoSocial, s.nomeFantasia, s.documento, s.cidade, s.uf]
        .some((f) => f.toLowerCase().includes(q))
    );
  }, [query, suppliers]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((c) => ({ ...c, [key]: value }));
  }

  const { buscarCnpj, buscandoCnpj, erro: lookupErro } = useCadastroLookup();

  // Autopreenche o fornecedor a partir do CNPJ (Receita via BrasilAPI).
  async function preencherPorCnpj() {
    const d = await buscarCnpj(form.documento);
    if (!d) return;
    setForm((c) => ({
      ...c,
      razaoSocial: d.razaoSocial ?? c.razaoSocial,
      nomeFantasia: d.nomeFantasia ?? c.nomeFantasia,
      email: d.email ?? c.email,
      telefone: d.telefone ?? c.telefone,
      cidade: d.endereco.cidade ?? c.cidade,
      uf: d.endereco.uf ?? c.uf
    }));
  }

  function openNew() {
    setForm(emptyForm);
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(s: SupplierSummary) {
    setForm(toForm(s));
    setError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setForm(emptyForm);
    setError("");
    setDrawerOpen(false);
  }

  async function save() {
    if (!form.razaoSocial.trim()) {
      setError("Razão social é obrigatória.");
      return;
    }
    if (!form.documento.trim()) {
      setError("CNPJ/CPF é obrigatório.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (editing) {
        const res = await fetch(`/api/erp/fornecedores/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error || "Não foi possível atualizar.");
        setSuppliers((cur) =>
          cur.map((s) =>
            s.id === form.id
              ? {
                  ...s,
                  razaoSocial: form.razaoSocial,
                  nomeFantasia: form.nomeFantasia,
                  documento: normalizeDocumento(form.documento),
                  email: form.email,
                  telefone: form.telefone,
                  cidade: form.cidade,
                  uf: form.uf,
                  condicaoPagamento: form.condicaoPagamento,
                  label: form.nomeFantasia
                    ? `${form.nomeFantasia} (${form.razaoSocial})`
                    : form.razaoSocial
                }
              : s
          )
        );
      } else {
        const res = await fetch("/api/erp/fornecedores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        });
        const data = await res.json() as { id?: string; error?: string };
        if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar.");
        setSuppliers((cur) => [
          {
            id: data.id ?? `tmp-${Date.now()}`,
            razaoSocial: form.razaoSocial,
            nomeFantasia: form.nomeFantasia,
            documento: form.documento.replace(/\D/g, ""),
            email: form.email,
            telefone: form.telefone,
            cidade: form.cidade,
            uf: form.uf,
            condicaoPagamento: form.condicaoPagamento,
            ativo: true,
            label: form.nomeFantasia
              ? `${form.nomeFantasia} (${form.razaoSocial})`
              : form.razaoSocial
          },
          ...cur
        ]);
      }
      closeDrawer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(s: SupplierSummary) {
    if (!window.confirm(`Arquivar o fornecedor "${s.razaoSocial}"? Ele não aparecerá em novos pedidos.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/fornecedores/${s.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível arquivar.");
      setSuppliers((cur) => cur.map((sup) => sup.id === s.id ? { ...sup, ativo: false } : sup));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao arquivar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="erp-page-actions">
        <button className="btn-erp primary sm" type="button" onClick={openNew}>+ Novo fornecedor</button>
      </div>

      {error && !drawerOpen && (
        <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>
      )}

      <section>
        <div className="erp-toolbar">
          <div className="toolbar-search">
            <span className="ic-sr" aria-hidden="true">⌕</span>
            <input
              className="search"
              placeholder="Buscar por nome, CNPJ, cidade..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Razão social / Fantasia</th>
                <th>CNPJ/CPF</th>
                <th>Contato</th>
                <th>Cidade / UF</th>
                <th>Cond. pagamento</th>
                <th>Status</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={s.ativo ? "" : "row-muted"}>
                  <td>
                    <strong>{s.razaoSocial}</strong>
                    {s.nomeFantasia && <small className="block-muted">{s.nomeFantasia}</small>}
                  </td>
                  <td className="mono">{formatDocumento(s.documento)}</td>
                  <td>
                    {s.email && <span className="block-muted">{s.email}</span>}
                    {s.telefone && <small className="block-muted">{s.telefone}</small>}
                  </td>
                  <td>{s.cidade}{s.cidade && s.uf ? " / " : ""}{s.uf}</td>
                  <td>{s.condicaoPagamento || <span style={{ color: "var(--erp-mute)" }}>—</span>}</td>
                  <td>
                    <span className={`pill ${s.ativo ? "success" : "mute"}`}>
                      <span className="dot" />
                      {s.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn-erp ghost xs" type="button" onClick={() => openEdit(s)}>Editar</button>
                    {s.ativo && (
                      <button className="btn-erp danger xs" type="button" disabled={busy} onClick={() => archive(s)}>
                        Arquivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-st">
                      <h4>Nenhum fornecedor encontrado</h4>
                      <p>Clique em &quot;+ Novo fornecedor&quot; para começar.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>{filtered.length} de {suppliers.length} fornecedor(es)</span>
          </div>
        </div>
      </section>

      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer" aria-label="Cadastro de fornecedor">
            <header className="drawer-head">
              <div>
                <h2>{editing ? "Editar fornecedor" : "Novo fornecedor"}</h2>
                <p>{form.razaoSocial || "Preencha os dados do fornecedor"}</p>
              </div>
              <button className="btn-erp ghost sm" type="button" onClick={closeDrawer}>Fechar</button>
            </header>
            <div className="drawer-body">
              <div className="erp-form">
                <label className="full">
                  Razão social
                  <input
                    value={form.razaoSocial}
                    onChange={(e) => update("razaoSocial", e.target.value)}
                    placeholder="Nome jurídico completo"
                  />
                </label>
                <label className="full">
                  Nome fantasia
                  <input
                    value={form.nomeFantasia}
                    onChange={(e) => update("nomeFantasia", e.target.value)}
                    placeholder="Como é conhecido no mercado"
                  />
                </label>
                <label>
                  CNPJ / CPF
                  <span style={{ display: "flex", gap: 6 }}>
                    <input
                      value={form.documento}
                      onChange={(e) => update("documento", e.target.value.toUpperCase())}
                      placeholder="CNPJ (aceita letras) ou CPF"
                      maxLength={18}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
                    </button>
                  </span>
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    value={form.telefone}
                    onChange={(e) => update("telefone", e.target.value)}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={form.cidade}
                    onChange={(e) => update("cidade", e.target.value)}
                  />
                </label>
                <label>
                  UF
                  <input
                    value={form.uf}
                    maxLength={2}
                    onChange={(e) => update("uf", e.target.value.toUpperCase())}
                  />
                </label>
                <label className="full">
                  Condição de pagamento
                  <input
                    value={form.condicaoPagamento}
                    onChange={(e) => update("condicaoPagamento", e.target.value)}
                    placeholder="Ex: 30/60 dias, à vista..."
                  />
                </label>
              </div>
              {error && <p className="form-error drawer-error">{error}</p>}
              {lookupErro && <p className="form-error drawer-error">{lookupErro}</p>}
            </div>
            <footer className="drawer-foot">
              <button className="btn-erp ghost sm" type="button" onClick={closeDrawer}>Cancelar</button>
              <button className="btn-erp primary sm" type="button" disabled={busy} onClick={save}>
                {busy ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar fornecedor"}
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
