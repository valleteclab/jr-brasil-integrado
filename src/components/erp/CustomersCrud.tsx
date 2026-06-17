"use client";

import { useEffect, useMemo, useState } from "react";
import type { CustomerDetail, CustomerDetailedSummary, TabelaPrecoOption } from "@/lib/services/customers-admin";
import { useCadastroLookup } from "./useCadastroLookup";
import { formatDocumento } from "@/lib/fiscal/documento";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeTone = "success" | "warn" | "danger" | "mute";

type Municipio = { codigo: string; nome: string; uf: string };

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
  codigoMunicipioIbge: string;
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
  codigoMunicipioIbge: "",
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
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  // Municípios carregados por UF (cache), usados nos datalists dos endereços.
  const [municipiosPorUf, setMunicipiosPorUf] = useState<Record<string, Municipio[]>>({});

  const editing = Boolean(form.id);

  // UFs distintas (2 letras) presentes nos endereços do formulário aberto.
  const ufsEnderecos = useMemo(() => {
    const ufs = form.enderecos
      .map((e) => e.uf.trim().toUpperCase())
      .filter((uf) => uf.length === 2);
    return Array.from(new Set(ufs));
  }, [form.enderecos]);

  // Para cada UF informada (e ainda não carregada), busca a lista de municípios.
  // Erros são tratados silenciosamente para não atrapalhar o cadastro.
  useEffect(() => {
    const pendentes = ufsEnderecos.filter((uf) => !municipiosPorUf[uf]);
    if (!pendentes.length) return;
    let cancelado = false;
    Promise.all(
      pendentes.map((uf) =>
        fetch(`/api/erp/fiscal/municipios?uf=${encodeURIComponent(uf)}`)
          .then((response) => response.json())
          .then((data: { municipios?: Municipio[] }) => ({ uf, municipios: data?.municipios ?? [] }))
          .catch(() => ({ uf, municipios: [] as Municipio[] }))
      )
    ).then((resultados) => {
      if (cancelado) return;
      setMunicipiosPorUf((prev) => {
        const next = { ...prev };
        for (const { uf, municipios } of resultados) next[uf] = municipios;
        return next;
      });
    });
    return () => {
      cancelado = true;
    };
  }, [ufsEnderecos, municipiosPorUf]);

  // Atualiza a cidade de um endereço e, havendo match exato pelo nome (case-insensitive),
  // preenche automaticamente o código IBGE do município.
  function updateCidade(index: number, value: string) {
    setForm((prev) => {
      const enderecos = prev.enderecos.map((e, i) => {
        if (i !== index) return e;
        const uf = e.uf.trim().toUpperCase();
        const lista = municipiosPorUf[uf] ?? [];
        const match = lista.find((m) => m.nome.toLowerCase() === value.trim().toLowerCase());
        return {
          ...e,
          cidade: value,
          codigoMunicipioIbge: match ? match.codigo : e.codigoMunicipioIbge
        };
      });
      return { ...prev, enderecos };
    });
  }

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

  async function openEdit(c: CustomerDetailedSummary) {
    setLoadingDetail(c.id);
    setError("");
    try {
      const response = await fetch(`/api/erp/clientes/${c.id}`);
      const detail = await response.json() as CustomerDetail & { error?: string };

      if (!response.ok) {
        throw new Error(detail.error ?? "Não foi possível carregar os dados do cliente.");
      }

      setForm({
        id: detail.id,
        razaoSocial: detail.razaoSocial,
        nomeFantasia: detail.nomeFantasia ?? "",
        documento: detail.documento,
        inscricaoEstadual: detail.inscricaoEstadual ?? "",
        segmento: detail.segmento ?? "",
        limiteCredito: String(parseCurrency(detail.limiteCredito)),
        condicaoPagamento: detail.condicaoPagamento ?? "",
        tabelaPrecoId: detail.tabelaPrecoId ?? "",
        status: detail.status,
        contatos: detail.contatos.length
          ? detail.contatos.map((ct) => ({
              nome: ct.nome,
              email: ct.email ?? "",
              telefone: ct.telefone ?? "",
              whatsapp: ct.whatsapp ?? "",
              cargo: ct.cargo ?? "",
              principal: ct.principal
            }))
          : [emptyContato()],
        enderecos: detail.enderecos.length
          ? detail.enderecos.map((endereco) => ({
              apelido: endereco.apelido,
              cep: endereco.cep,
              logradouro: endereco.logradouro,
              numero: endereco.numero ?? "",
              complemento: endereco.complemento ?? "",
              bairro: endereco.bairro ?? "",
              cidade: endereco.cidade,
              uf: endereco.uf,
              codigoMunicipioIbge: endereco.codigoMunicipioIbge ?? "",
              padrao: endereco.padrao
            }))
          : [emptyEndereco()]
      });
      setActiveTab("dados");
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os dados do cliente.");
    } finally {
      setLoadingDetail(null);
    }
  }

  function updateField<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const { buscarCnpj, buscarCep, buscandoCnpj, buscandoCep, erro: lookupErro } = useCadastroLookup();

  // Autopreenche dados + 1º endereço a partir do CNPJ (Receita via BrasilAPI).
  async function preencherPorCnpj() {
    const d = await buscarCnpj(form.documento);
    if (!d) return;
    setForm((prev) => {
      const enderecos = prev.enderecos.length ? [...prev.enderecos] : [emptyEndereco()];
      enderecos[0] = {
        ...enderecos[0],
        cep: d.endereco.cep ?? enderecos[0].cep,
        logradouro: d.endereco.logradouro ?? enderecos[0].logradouro,
        numero: d.endereco.numero ?? enderecos[0].numero,
        complemento: d.endereco.complemento ?? enderecos[0].complemento,
        bairro: d.endereco.bairro ?? enderecos[0].bairro,
        cidade: d.endereco.cidade ?? enderecos[0].cidade,
        uf: d.endereco.uf ?? enderecos[0].uf,
        codigoMunicipioIbge: d.endereco.codigoMunicipioIbge ?? enderecos[0].codigoMunicipioIbge
      };
      return {
        ...prev,
        razaoSocial: d.razaoSocial ?? prev.razaoSocial,
        nomeFantasia: d.nomeFantasia ?? prev.nomeFantasia,
        enderecos
      };
    });
  }

  // Autopreenche um endereço específico a partir do CEP (não sobrescreve número/complemento).
  async function preencherEnderecoPorCep(index: number) {
    const endereco = form.enderecos[index];
    if (!endereco) return;
    const d = await buscarCep(endereco.cep);
    if (!d) return;
    setForm((prev) => {
      const enderecos = prev.enderecos.map((e, i) =>
        i === index
          ? {
              ...e,
              logradouro: d.logradouro ?? e.logradouro,
              bairro: d.bairro ?? e.bairro,
              cidade: d.cidade ?? e.cidade,
              uf: d.uf ?? e.uf,
              codigoMunicipioIbge: d.codigoMunicipioIbge ?? e.codigoMunicipioIbge
            }
          : e
      );
      return { ...prev, enderecos };
    });
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
    const isPf = form.documento.replace(/\D/g, "").length === 11;
    if (!form.razaoSocial.trim()) {
      setError(isPf ? "Nome completo é obrigatório." : "Razão social é obrigatória.");
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
      enderecos: form.enderecos.filter((e) =>
        e.cep.trim() || e.logradouro.trim() || e.bairro.trim() || e.cidade.trim() || e.uf.trim()
      ).map((e) => ({
        apelido: e.apelido.trim() || "Principal",
        cep: e.cep.trim(),
        logradouro: e.logradouro.trim(),
        numero: e.numero.trim() || null,
        complemento: e.complemento.trim() || null,
        bairro: e.bairro.trim() || null,
        cidade: e.cidade.trim(),
        uf: e.uf.trim().toUpperCase(),
        codigoMunicipioIbge: e.codigoMunicipioIbge.trim() || null,
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
      // Auto-detecta tipo de pessoa pelo documento (11 dígitos = CPF/PF, 14 = CNPJ/PJ).
      // Letras no documento (CNPJ alfanumérico) caem em PJ por padrão.
      const docDigitos = form.documento.replace(/\D/g, "");
      const isPf = docDigitos.length === 11;
      return (
        <div className="erp-form">
          <div className="full" style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <button type="button" className={`btn-erp ${!isPf ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => updateField("documento", form.documento.replace(/\D/g, "").slice(0, 14))}>
              Pessoa Jurídica
            </button>
            <button type="button" className={`btn-erp ${isPf ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => updateField("documento", form.documento.replace(/\D/g, "").slice(0, 11))}>
              Pessoa Física
            </button>
          </div>
          <label className="full">
            {isPf ? "CPF" : "CNPJ"}
            <span style={{ display: "flex", gap: 6 }}>
              <input
                value={form.documento}
                onChange={(e) => updateField("documento", e.target.value.toUpperCase())}
                placeholder={isPf ? "Somente números" : "CNPJ (aceita letras) ou CPF"}
                maxLength={isPf ? 14 : 18}
                style={{ flex: 1 }}
              />
              {!isPf && (
                <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                  {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
                </button>
              )}
            </span>
          </label>
          <label className="full">
            {isPf ? "Nome completo" : "Razão social"}
            <input value={form.razaoSocial} onChange={(e) => updateField("razaoSocial", e.target.value)} />
          </label>
          {!isPf && (
            <label className="full">
              Nome fantasia
              <input value={form.nomeFantasia} onChange={(e) => updateField("nomeFantasia", e.target.value)} />
            </label>
          )}
          {!isPf && (
            <label>
              Inscrição estadual
              <input value={form.inscricaoEstadual} onChange={(e) => updateField("inscricaoEstadual", e.target.value)} />
            </label>
          )}
          <label>
            Segmento
            <input value={form.segmento} placeholder={isPf ? "Ex.: Consumidor final, Autônomo…" : "Ex.: Oficinas, Revenda…"} onChange={(e) => updateField("segmento", e.target.value)} />
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
                <button type="button" className="btn-erp danger xs" onClick={() => removeContato(i)}>Remover contato</button>
              )}
            </fieldset>
          ))}
          <div className="full">
            <button type="button" className="btn-erp ghost sm" onClick={addContato}>+ Adicionar contato</button>
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
                  <span style={{ display: "flex", gap: 6 }}>
                    <input value={e.cep} onChange={(ev) => updateEndereco(i, "cep", ev.target.value)} onBlur={() => preencherEnderecoPorCep(i)} style={{ flex: 1 }} />
                    <button type="button" className="btn-erp light sm" onClick={() => preencherEnderecoPorCep(i)} disabled={buscandoCep} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {buscandoCep ? "…" : "Buscar"}
                    </button>
                  </span>
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
                  <input
                    list={`municipio-opcoes-${i}`}
                    value={e.cidade}
                    onChange={(ev) => updateCidade(i, ev.target.value)}
                  />
                  <datalist id={`municipio-opcoes-${i}`}>
                    {(municipiosPorUf[e.uf.trim().toUpperCase()] ?? []).map((m) => (
                      <option key={m.codigo} value={m.nome}>{m.nome}</option>
                    ))}
                  </datalist>
                </label>
                <label>
                  UF
                  <input value={e.uf} maxLength={2} onChange={(ev) => updateEndereco(i, "uf", ev.target.value.toUpperCase())} />
                </label>
                <label>
                  Código IBGE do município
                  <input value={e.codigoMunicipioIbge} maxLength={7} onChange={(ev) => updateEndereco(i, "codigoMunicipioIbge", ev.target.value.replace(/\D/g, ""))} placeholder="Preenchido pela busca de CEP/CNPJ" />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={e.padrao} onChange={(ev) => updateEndereco(i, "padrao", ev.target.checked)} />
                  Endereço padrão para faturamento
                </label>
              </div>
              {form.enderecos.length > 1 && (
                <button type="button" className="btn-erp danger xs" onClick={() => removeEndereco(i)}>Remover endereço</button>
              )}
            </fieldset>
          ))}
          <div className="full">
            <button type="button" className="btn-erp ghost sm" onClick={addEndereco}>+ Adicionar endereço</button>
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
        <div className="kpi">
          <div className="l">Clientes ativos</div>
          <div className="v">{String(kpis.ativos)}</div>
        </div>
        <div className="kpi">
          <div className="l">Pendentes de aprovação</div>
          <div className="v">{String(kpis.pendentes)}</div>
        </div>
        <div className="kpi">
          <div className="l">Limite total concedido</div>
          <div className="v">{formatBrl(kpis.totalLimite)}</div>
        </div>
        <div className="kpi">
          <div className="l">Crédito utilizado</div>
          <div className="v">{formatBrl(kpis.totalUsado)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
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
        <div className="grow" />
        <button type="button" className="btn-erp primary sm" onClick={openNew}>+ Novo cliente</button>
      </div>

      {/* Table */}
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
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nomeFantasia ?? c.razaoSocial}</div>
                    {c.nomeFantasia && <span className="sublabel">{c.razaoSocial}</span>}
                  </td>
                  <td className="mono">{formatDocumento(c.documento)}</td>
                  <td>{c.segmento ?? <span className="sublabel">—</span>}</td>
                  <td>{c.contatosPrincipal ?? <span className="sublabel">—</span>}</td>
                  <td className="num">{c.limiteCredito}</td>
                  <td className="num">{c.creditoUsado}</td>
                  <td>{c.condicaoPagamento ?? <span className="sublabel">A definir</span>}</td>
                  <td>
                    <span className={`pill ${c.statusTone}`}>
                      <span className="dot" />
                      {c.statusLabel}
                    </span>
                  </td>
                  <td className="actions">
                    <button type="button" className="btn-erp ghost xs" disabled={loadingDetail === c.id} onClick={() => openEdit(c)}>
                      {loadingDetail === c.id ? "Abrindo..." : "Editar"}
                    </button>
                    {c.status === "PENDENTE_APROVACAO" && (
                      <button
                        type="button"
                        className="btn-erp ghost xs"
                        disabled={actioning === c.id}
                        onClick={() => doAction(c.id, "aprovar")}
                      >
                        Aprovar
                      </button>
                    )}
                    {c.status === "ATIVO" && (
                      <button
                        type="button"
                        className="btn-erp danger xs"
                        disabled={actioning === c.id}
                        onClick={() => doAction(c.id, "bloquear")}
                      >
                        Bloquear
                      </button>
                    )}
                    {(c.status === "ATIVO" || c.status === "BLOQUEADO") && (
                      <button
                        type="button"
                        className="btn-erp danger xs"
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
                    <div className="empty-st">
                      <h4>Nenhum cliente encontrado</h4>
                      <p>Ajuste os filtros ou cadastre um novo cliente.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>{filtered.length} clientes exibidos</span>
          </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer" aria-label="Cadastro de cliente">
            <div className="drawer-head">
              <div>
                <h2>{editing ? "Editar cliente" : "Novo cliente"}</h2>
                <p className="erp-page-sub">{form.razaoSocial || "Informe os dados do cliente"}</p>
              </div>
              <button type="button" className="btn-erp ghost sm" onClick={closeDrawer}>Fechar</button>
            </div>
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
              {error && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{error}</span></div>}
              {lookupErro && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{lookupErro}</span></div>}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={closeDrawer}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" disabled={saving} onClick={saveCustomer}>
                {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar cliente"}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
