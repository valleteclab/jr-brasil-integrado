"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/shared/Button";
import { useCadastroLookup } from "@/components/erp/useCadastroLookup";

type Form = {
  nomeCliente: string;
  slug: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  adminNome: string;
  adminEmail: string;
  senhaInicial: string;
};

type CriarResult = {
  tenantId: string;
  empresaId: string;
  usuarioId: string;
  adminEmail: string;
  senhaInicial: string;
};

const vazio: Form = {
  nomeCliente: "",
  slug: "",
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  adminNome: "",
  adminEmail: "",
  senhaInicial: ""
};

export function NovoClienteForm() {
  const [form, setForm] = useState<Form>(vazio);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<CriarResult | null>(null);

  const { buscarCnpj, buscandoCnpj, erro: lookupErro } = useCadastroLookup();

  function set<K extends keyof Form>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Autopreenche razão social / nome fantasia / nome do cliente a partir do CNPJ (mesmo serviço
  // do ERP: BrasilAPI/Receita).
  async function preencherPorCnpj() {
    const d = await buscarCnpj(form.cnpj);
    if (!d) return;
    setForm((f) => ({
      ...f,
      razaoSocial: d.razaoSocial ?? f.razaoSocial,
      nomeFantasia: d.nomeFantasia ?? f.nomeFantasia,
      nomeCliente: f.nomeCliente || d.nomeFantasia || d.razaoSocial || ""
    }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCliente: form.nomeCliente,
          slug: form.slug || undefined,
          razaoSocial: form.razaoSocial,
          nomeFantasia: form.nomeFantasia || undefined,
          cnpj: form.cnpj,
          adminNome: form.adminNome,
          adminEmail: form.adminEmail,
          senhaInicial: form.senhaInicial || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as Partial<CriarResult> & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o cliente.");
      setResultado(data as CriarResult);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o cliente.");
    } finally {
      setBusy(false);
    }
  }

  if (resultado) {
    return (
      <Card>
        <div className="alert success">
          <strong>Cliente criado com sucesso</strong>
          <span>
            Anote as credenciais de primeiro acesso abaixo. A senha inicial <b>não será exibida novamente</b>.
          </span>
        </div>
        <div className="form-grid two" style={{ marginTop: 12 }}>
          <label>
            E-mail do administrador
            <input readOnly value={resultado.adminEmail} />
          </label>
          <label>
            Senha inicial
            <input readOnly value={resultado.senhaInicial} />
          </label>
        </div>
        <p style={{ marginTop: 8 }}>
          <code className="mark">{resultado.senhaInicial}</code>
        </p>
        <div className="erp-page-actions" style={{ marginTop: 16, gap: 8 }}>
          <Button href={`/admin/clientes/${resultado.tenantId}`}>Ver cliente</Button>
          <Button
            variant="light"
            onClick={() => {
              setResultado(null);
              setForm(vazio);
            }}
          >
            Criar outro
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={enviar}>
        {erro && (
          <div className="alert danger" style={{ marginBottom: 12 }}>
            <strong>Atenção</strong>
            <span>{erro}</span>
          </div>
        )}

        <div className="form-grid two">
          <label>
            Nome do cliente *
            <input value={form.nomeCliente} onChange={(e) => set("nomeCliente", e.target.value)} required />
          </label>
          <label>
            Identificador (slug)
            <input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="gerado automaticamente" />
          </label>
          <label>
            Razão social *
            <input value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} required />
          </label>
          <label>
            Nome fantasia
            <input value={form.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} />
          </label>
          <label>
            CNPJ *
            <span style={{ display: "flex", gap: 6 }}>
              <input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value.toUpperCase())} maxLength={18} required style={{ flex: 1 }} />
              <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
              </button>
            </span>
            {lookupErro && <small className="form-error">{lookupErro}</small>}
          </label>
          <label>
            Nome do administrador *
            <input value={form.adminNome} onChange={(e) => set("adminNome", e.target.value)} required />
          </label>
          <label>
            E-mail do administrador *
            <input type="email" value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} required />
          </label>
          <label>
            Senha inicial
            <input value={form.senhaInicial} onChange={(e) => set("senhaInicial", e.target.value)} placeholder="deixe vazio para gerar automaticamente" />
          </label>
        </div>

        <div className="erp-page-actions" style={{ marginTop: 16 }}>
          <Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar cliente"}</Button>
        </div>
      </form>
    </Card>
  );
}
