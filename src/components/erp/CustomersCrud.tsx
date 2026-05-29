"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { CustomerDetailedSummary, TabelaPrecoOption } from "@/lib/services/customers-admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeTone = "success" | "warn" | "danger" | "mute";

type ContatoForm = {
  nome: string;
  email: string;
  telefone: string;
  whatsapp: string;
  cargo: string;
  principal: boolean;
};

type EnderecoForm = {
  apelido: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  padrao: boolean;
};

type CustomerFormState = {
  id?: string;
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  inscricaoEstadual: string;
  segmento: string;
  limiteCredito: string;
  condicaoPagamento: string;
  tabelaPrecoId: string;
  status: string;
  contatos: ContatoForm[];
  enderecos: EnderecoForm[];
};

type CustomerTab = "dados" | "contatos" | "enderecos" | "comercial";

type CustomersCrudProps = {
  initialCustomers: CustomerDetailedSummary[];
  tabelasPreco: TabelaPrecoOption[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyContato = (): ContatoForm => ({
  nome: "",
  email: "",
  telefone: "",
  whatsapp: "",
  cargo: "",
  principal: false
});

const emptyEndereco = (): EnderecoForm => ({
  apelido: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  padrao: false
});

const emptyForm = (): CustomerFormState => ({
  razaoSocial: "",
  nomeFantasia: "",
  documento: "",
  inscricaoEstadual: "",
  segmento: "",
  limiteCredito: "0",
  condicaoPagamento: "",
  tabelaPrecoId: "",
  status: "PENDENTE_APROVACAO",
  contatos: [emptyContato()],
  enderecos: [emptyEndereco()]
});

function statusTone(status: string): BadgeTone {
  if (status === "ATIVO") return "success";
  if (status === "PENDENTE_APROVACAO") return "warn";
  if (status === "BLOQUEADO") return "danger";
  return "mute";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ATIVO: "Ativo",
    PENDENTE_APROVACAO: "Pendente de aprovação",
    BLOQUEADO: "Bloqueado",
    INATIVO: "Inativo"
  };
  return labels[status] ?? status;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function parseCurrency(value: string): number {
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomersCrud({ initialCustomers, tabelasPreco }: CustomersCrudProps) {
  const [customers, setCustomers] = useState<CustomerDetailedSummary[]>(initialCustomers);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CustomerTab>("dados");
  const [form, setForm] = useState<CustomerFormState>(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const editing = Boolean(form.id);

  // KPIs
  const kpis = useMemo(() => {
    const ativos = customers.filter((c) => c.status === "ATIVO").length;
    const pendentes = customers.filter((c) => c.status === "PENDENTE_APROVACAO").length;
    const totalLimite = customers.reduce((sum, c) => sum + parseCurrency(c.limiteCredito), 0);
    const totalUsado = customers.reduce((sum, c) => sum + parseCurrency(c.creditoUsado), 0);
    return { ativos, pendentes, totalLimite, totalUsado };
  }, [customers]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (!q) return true;
        return [c.razaoSocial, c.nomeFantasia ?? "", c.documento, c.segmento ?? ""]
          .some((f) => f.toLowerCase().includes(q));
      })
      .filter((c) => statusFilter === "todos" || c.status === statusFilter)
      .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial));
  }, [customers, query, statusFilter]);

  // ---------------------------------------------------------------------------
  // Drawer helpers
  // ---------------------------------------------------------------------------

  function closeDrawer() {
    setForm(emptyForm());
    setError("");
    setActiveTab("dados");
    setDrawerOpen(false);
  }

  function openNew() {
    setForm(emptyForm());
    setError("");
    setActiveTab("dados");
    setDrawerOpen(true);
  }

  function openEdit(c: CustomerDetailedSummary) {
    setForm({
      id: c.id,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia ?? "",
      documento: c.documento,
      inscricaoEstadual: c.inscricaoEstadual ?? "",
      segmento: c.segmento ?? "",
      limiteCredito: String(parseCurrency(c.limiteCredito)),
      condicaoPagamento: c.condicaoPagamento ?? "",
      tabelaPrecoId: c.tabelaPrecoId ?? "",
      status: c.status,
      contatos: [emptyContato()],
      enderecos: [emptyEndereco()]
    });
    setError("");
    setActiveTab("dados");
    setDrawerOpen(true);
  }

  function updateField<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------

  function updateContato(index: number, key: keyof ContatoForm, value: string | boolean) {
    setForm((prev) => {
      const updated = prev.contatos.map((c, i) => i === index ? { ...c, [key]: value } : c);
      return { ...prev, contatos: updated };
    });
  }

  function addContato() {
    setForm((prev) => ({ ...prev, contatos: [...prev.contatos, emptyContato()] }));
  }

  function removeContato(index: number) {
    setForm((prev) => ({ ...prev, contatos: prev.contatos.filter((_, i) => i !== index) }));
  }

  // ---------------------------------------------------------------------------
  // Addresses
  // ---------------------------------------------------------------------------

  function updateEndereco(index: number, key: keyof EnderecoForm, value: string | boolean) {
    setForm((prev) => {
      const updated = prev.enderecos.map((e, i) => i === index ? { ...e, [key]: value } : e);
      return { ...prev, enderecos: updated };
    });
  }

  function addEndereco() {
    setForm((prev) => ({ ...prev, enderecos: [...prev.enderecos, emptyEndereco()] }));
  }

  function removeEndereco(index: number) {
    setForm((prev) => ({ ...prev, enderecos: prev.enderecos.filter((_, i) => i !== index) }));
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function saveCustomer() {
    if (!form.razaoSocial.trim()) {
      setError("Razão social é obrigatória.");
      setActiveTab("dados");
      return;
    }
    if (!form.documento.trim()) {
      setError("Documento (CPF/CNPJ) é obrigatório.");
      setActiveTab("dados");
      return;
    }

    const payload = {
      razaoSocial: form.razaoSocial.trim(),
      nomeFantasia: form.nomeFantasia.trim() || null,
      documento: form.documento.trim(),
      inscricaoEstadual: form.inscricaoEstadual.trim() || null,
      segmento: form.segmento.trim() || null,
      limiteCredito: Number(form.limiteCredito) || 0,
      condicaoPagamento: form.condicaoPagamento.trim() || null,
      tabelaPrecoId: form.tabelaPrecoId || null,
      status: form.status,
      contatos: form.contatos.filter((c) => c.nome.trim()).map((c) => ({
        nome: c.nome.trim(),
        email: c.email.trim() || null,
        telefone: c.telefone.trim() || null,
        whatsapp: c.whatsapp.trim() || null,
        cargo: c.cargo.trim() || null,
        principal: c.principal
      })),
      enderecos: form.enderecos.filter((e) => e.logradouro.trim() && e.cidade.trim() && e.uf.trim()).map((e) => ({
        apelido: e.apelido.trim() || "Principal",
        cep: e.cep.trim(),
        logradouro: e.logradouro.trim(),
        numero: e.numero.trim() || null,
        complemento: e.complemento.trim() || null,
        bairro: e.bairro.trim() || null,
        cidade: e.cidade.trim(),
        uf: e.uf.trim().toUpperCase(),
        padrao: e.padrao
      }))
    };

    setSaving(true);
    setError("");

    try {
      const url = editing ? `/api/erp/clientes/${form.id}` : "/api/erp/clientes";
      const method = editing ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as { id?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível salvar o cliente.");
      }

      const savedId = data.id ?? form.id ?? "";
      const limiteCredito = formatBrl(payload.limiteCredito);
      const creditoUsado = formatBrl(0);
      const creditoDisponivel = formatBrl(payload.limiteCredito);

      const summary: CustomerDetailedSummary = {
        id: savedId,
        razaoSocial: payload.razaoSocial,
        nomeFantasia: payload.nomeFantasia ?? null,
        documento: payload.documento,
        inscricaoEstadual: payload.inscricaoEstadual ?? null,
        status: payload.status,
        statusLabel: statusLabel(payload.status),
        statusTone: statusTone(payload.status) as CustomerDetailedSummary["statusTone"],
        segmento: payload.segmento ?? null,
        limiteCredito,
        creditoUsado,
        creditoDisponivel,
        condicaoPagamento: payload.condicaoPagamento ?? null,
        tabelaPrecoId: payload.tabelaPrecoId ?? null,
        tabelaPrecoNome: tabelasPreco.find((t) => t.id === payload.tabelaPrecoId)?.nome ?? null,
        contatosPrincipal: payload.contatos.find((c) => c.principal)?.nome ?? payload.contatos[0]?.nome ?? null,
        totalContatos: payload.contatos.length,
        totalEnderecos: payload.enderecos.length,
        criadoEm: new Date().toISOString()
      };

      setCustomers((prev) => {
        if (editing) {
          return prev.map((c) => c.id === savedId ? { ...c, ...summary } : c);
        }
        return [summary, ...prev];
      });

      closeDrawer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Status actions
  // ---------------------------------------------------------------------------

  async function doAction(customerId: string, action: "aprovar" | "bloquear" | "arquivar") {
    setActioning(customerId);
    try {
      const response = await fetch(`/api/erp/clientes/${customerId}/${action}`, { method: "POST" });
      const data = await response.json() as { status?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível executar a ação.");
      }

      const newStatus = data.status ?? "";
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId
            ? {
                ...c,
                status: newStatus,
                statusLabel: statusLabel(newStatus),
                statusTone: statusTone(newStatus) as CustomerDetailedSummary["statusTone"]
              }
            : c
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao executar ação.");
    } finally {
      setActioning(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render tabs
  // ---------------------------------------------------------------------------

  function renderTab() {
    if (activeTab === "dados") {
      return (
        <div className="erp-form">
          <label className="full">
            Razão social
            <input value={form.razaoSocial} onChange={(e) => updateField("razaoSocial", e.target.value)} />
          </label>
          <label className="full">
            Nome fantasia
            <input value={form.nomeFantasia} onChange={(e) => updateField("nomeFantasia", e.target.value)} />
          </label>
          <label>
            CNPJ / CPF
            <input value={form.documento} onChange={(e) => updateField("documento", e.target.value)} />
          </label>
          <label>
            Inscrição estadual
            <input value={form.inscricaoEstadual} onChange={(e) => updateField("inscricaoEstadual", e.target.value)} />
          </label>
          <label>
            Segmento
            <input value={form.segmento} placeholder="Ex.: Oficinas, Revenda..." onChange={(e) => updateField("segmento", e.target.value)} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
              <option value="PENDENTE_APROVACAO">Pendente de aprovação</option>
              <option value="ATIVO">Ativo</option>
              <option value="BLOQUEADO">Bloqueado</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </label>
        </div>
      );
    }

    if (activeTab === "contatos") {
      return (
        <div className="erp-form">
          {form.contatos.map((c, i) => (
            <fieldset key={i} className="sub-fieldset full">
              <legend>Contato {i + 1}</legend>
              <div className="erp-form">
                <label>
                  Nome
                  <input value={c.nome} onChange={(e) => updateContato(i, "nome", e.target.value)} />
                </label>
                <label>
                  Cargo
                  <input value={c.cargo} onChange={(e) => updateContato(i, "cargo", e.target.value)} />
                </label>
                <label>
                  E-mail
                  <input type="email" value={c.email} onChange={(e) => updateContato(i, "email", e.target.value)} />
                </label>
                <label>
                  Telefone
                  <input value={c.telefone} onChange={(e) => updateContato(i, "telefone", e.target.value)} />
                </label>
                <label>
                  WhatsApp
                  <input value={c.whatsapp} onChange={(e) => updateContato(i, "whatsapp", e.target.value)} />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={c.principal} onChange={(e) => updateContato(i, "principal", e.target.checked)} />
                  Contato principal
                </label>
              </div>
              {form.contatos.length > 1 && (
                <button type="button" className="danger-link" onClick={() => removeContato(i)}>Remover contato</button>
              )}
            </fieldset>
          ))}
          <div className="full">
            <Button type="button" variant="light" onClick={addContato}>+ Adicionar contato</Button>
          </div>
        </div>
      );
    }

    if (activeTab === "enderecos") {
      return (
        <div className="erp-form">
          {form.enderecos.map((e, i) => (
            <fieldset key={i} className="sub-fieldset full">
              <legend>Endereço {i + 1}</legend>
              <div className="erp-form">
                <label>
                  Apelido
                  <input value={e.apelido} placeholder="Ex.: Matriz, Filial..." onChange={(ev) => updateEndereco(i, "apelido", ev.target.value)} />
                </label>
                <label>
                  CEP
                  <input value={e.cep} onChange={(ev) => updateEndereco(i, "cep", ev.target.value)} />
                </label>
                <label className="full">
                  Logradouro
                  <input value={e.logradouro} onChange={(ev) => updateEndereco(i, "logradouro", ev.target.value)} />
                </label>
                <label>
                  Número
                  <input value={e.numero} onChange={(ev) => updateEndereco(i, "numero", ev.target.value)} />
                </label>
                <label>
                  Complemento
                  <input value={e.complemento} onChange={(ev) => updateEndereco(i, "complemento", ev.target.value)} />
                </label>
                <label>
                  Bairro
                  <input value={e.bairro} onChange={(ev) => updateEndereco(i, "bairro", ev.target.value)} />
                </label>
                <label>
                  Cidade
                  <input value={e.cidade} onChange={(ev) => updateEndereco(i, "cidade", ev.target.value)} />
                </label>
                <label>
                  UF
                  <input value={e.uf} maxLength={2} onChange={(ev) => updateEndereco(i, "uf", ev.target.value)} />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={e.padrao} onChange={(ev) => updateEndereco(i, "padrao", ev.target.checked)} />
                  Endereço padrão para faturamento
                </label>
              </div>
              {form.enderecos.length > 1 && (
                <button type="button" className="danger-link" onClick={() => removeEndereco(i)}>Remover endereço</button>
              )}
            </fieldset>
          ))}
          <div className="full">
            <Button type="button" variant="light" onClick={addEndereco}>+ Adicionar endereço</Button>
          </div>
        </div>
      );
    }

    // comercial
    return (
      <div className="erp-form">
        <label>
          Condição de pagamento
          <input value={form.condicaoPagamento} placeholder="Ex.: 30/60 DDL, à vista..." onChange={(e) => updateField("condicaoPagamento", e.target.value)} />
        </label>
        <label>
          Limite de crédito (R$)
          <input type="number" min="0" step="0.01" value={form.limiteCredito} onChange={(e) => updateField("limiteCredito", e.target.value)} />
        </label>
        <label className="full">
          Tabela de preço
          <select value={form.tabelaPrecoId} onChange={(e) => updateField("tabelaPrecoId", e.target.value)}>
            <option value="">Tabela padrão</option>
            {tabelasPreco.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* KPIs */}
      <div className="kpi-row">
        <KpiCard label="Clientes ativos" value={String(kpis.ativos)} tone="success" />
        <KpiCard label="Pendentes de aprovação" value={String(kpis.pendentes)} tone="warn" />
        <KpiCard label="Limite total concedido" value={formatBrl(kpis.totalLimite)} />
        <KpiCard label="Crédito utilizado" value={formatBrl(kpis.totalUsado)} tone={kpis.totalUsado > 0 ? "info" : "default"} />
      </div>

      {/* Toolbar */}
      <div className="erp-page-actions">
        <div className="toolbar-search">
          <span aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Razão social, CNPJ, segmento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="todos">Todos os status</option>
          <option value="ATIVO">Ativos</option>
          <option value="PENDENTE_APROVACAO">Pendentes</option>
          <option value="BLOQUEADO">Bloqueados</option>
          <option value="INATIVO">Inativos</option>
        </select>
        <div className="toolbar-grow" />
        <Button type="button" onClick={openNew}>+ Novo cliente</Button>
      </div>

      {/* Table */}
      <section className="panel">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Segmento</th>
                <th>Contato</th>
                <th className="num">Limite</th>
                <th className="num">Crédito usado</th>
                <th>Condição</th>
                <th>Status</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="product-cell">
                      <span>
                        <strong>{c.nomeFantasia ?? c.razaoSocial}</strong>
                        {c.nomeFantasia && <small>{c.razaoSocial}</small>}
                      </span>
                    </div>
                  </td>
                  <td className="mono">{c.documento}</td>
                  <td>{c.segmento ?? <span className="muted">—</span>}</td>
                  <td>{c.contatosPrincipal ?? <span className="muted">—</span>}</td>
                  <td className="num">{c.limiteCredito}</td>
                  <td className="num">{c.creditoUsado}</td>
                  <td>{c.condicaoPagamento ?? <span className="muted">A definir</span>}</td>
                  <td>
                    <StatusBadge tone={c.statusTone}>{c.statusLabel}</StatusBadge>
                  </td>
                  <td className="actions">
                    <button type="button" onClick={() => openEdit(c)}>Editar</button>
                    {c.status === "PENDENTE_APROVACAO" && (
                      <button
                        type="button"
                        disabled={actioning === c.id}
                        onClick={() => doAction(c.id, "aprovar")}
                      >
                        Aprovar
                      </button>
                    )}
                    {c.status === "ATIVO" && (
                      <button
                        type="button"
                        className="danger-link"
                        disabled={actioning === c.id}
                        onClick={() => doAction(c.id, "bloquear")}
                      >
                        Bloquear
                      </button>
                    )}
                    {(c.status === "ATIVO" || c.status === "BLOQUEADO") && (
                      <button
                        type="button"
                        className="danger-link"
                        disabled={actioning === c.id}
                        onClick={() => doAction(c.id, "arquivar")}
                      >
                        Arquivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-st">Nenhum cliente encontrado para os filtros selecionados.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>{filtered.length} clientes exibidos</span>
          </div>
        </div>
      </section>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer product-drawer" aria-label="Cadastro de cliente">
            <header className="drawer-head">
              <div>
                <h2>{editing ? "Editar cliente" : "Novo cliente"}</h2>
                <p>{form.razaoSocial || "Informe os dados do cliente"}</p>
              </div>
              <button type="button" onClick={closeDrawer}>Fechar</button>
            </header>
            <nav className="tabs">
              {(["dados", "contatos", "enderecos", "comercial"] as CustomerTab[]).map((tab) => {
                const labels: Record<CustomerTab, string> = {
                  dados: "Dados",
                  contatos: "Contatos",
                  enderecos: "Endereços",
                  comercial: "Comercial"
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => setActiveTab(tab)}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </nav>
            <div className="drawer-body">
              {renderTab()}
              {error && <p className="form-error drawer-error">{error}</p>}
            </div>
            <footer className="drawer-foot">
              <Button type="button" variant="light" onClick={closeDrawer}>Cancelar</Button>
              <Button type="button" disabled={saving} onClick={saveCustomer}>
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar cliente"}
              </Button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
