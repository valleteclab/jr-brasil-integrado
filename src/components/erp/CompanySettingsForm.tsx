"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { useCadastroLookup } from "@/components/erp/useCadastroLookup";
import type { CompanySettings } from "@/lib/services/company-settings";

const REGIMES = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "SIMPLES_EXCESSO_SUBLIMITE", label: "Simples Nacional - excesso de sublimite" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "MEI", label: "MEI" }
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const TIPOS_NEGOCIO = [
  { value: "VENDA", label: "Vende mercadorias (peças, produtos)" },
  { value: "SERVICO", label: "Presta serviços (oficina, assistência)" },
  { value: "AMBOS", label: "Vende e presta serviços" }
];

const SEGMENTOS = [
  { value: "GERAL", label: "Geral / Outro" },
  { value: "AUTOPECAS", label: "Autopeças" },
  { value: "MATERIAL_CONSTRUCAO", label: "Material de construção" },
  { value: "MERCADO", label: "Mercado / Mercearia" }
];

const PDV_RECOMENDADO: Record<string, string> = {
  VENDA: "PDV de vendas: busca de produtos, carrinho e emissão de NFC-e/NF-e na mesma tela.",
  SERVICO: "PDV de serviços: lançamento de serviços com emissão de NFS-e (sem controle de estoque no caixa).",
  AMBOS: "PDV completo: peças e serviços na mesma venda, emitindo NFC-e/NF-e dos produtos e NFS-e dos serviços."
};

type Props = {
  initialSettings: CompanySettings;
};

export function CompanySettingsForm({ initialSettings }: Props) {
  const [form, setForm] = useState<CompanySettings>(initialSettings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { buscarCep, buscarCnpj, buscandoCep, buscandoCnpj, erro, setErro } = useCadastroLookup();

  function update<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function fillFromCnpj() {
    setMessage("");
    setError("");
    const data = await buscarCnpj(form.cnpj);
    if (!data) return;

    setForm((current) => ({
      ...current,
      cnpj: data.cnpj ?? current.cnpj,
      razaoSocial: data.razaoSocial ?? current.razaoSocial,
      nomeFantasia: data.nomeFantasia ?? current.nomeFantasia,
      inscricaoEstadual: data.inscricaoEstadual ?? current.inscricaoEstadual,
      email: data.email ?? current.email,
      telefone: data.telefone ?? current.telefone,
      enderecoLogradouro: data.endereco.logradouro ?? current.enderecoLogradouro,
      enderecoNumero: data.endereco.numero ?? current.enderecoNumero,
      enderecoComplemento: data.endereco.complemento ?? current.enderecoComplemento,
      enderecoBairro: data.endereco.bairro ?? current.enderecoBairro,
      enderecoCidade: data.endereco.cidade ?? current.enderecoCidade,
      enderecoUf: data.endereco.uf ?? current.enderecoUf,
      enderecoCep: data.endereco.cep ?? current.enderecoCep,
      codigoMunicipioIbge: data.endereco.codigoMunicipioIbge ?? current.codigoMunicipioIbge
    }));
    setMessage("Dados encontrados para o CNPJ. Revise antes de salvar.");
  }

  async function fillFromCep() {
    setMessage("");
    setError("");
    const data = await buscarCep(form.enderecoCep);
    if (!data) return;

    setForm((current) => ({
      ...current,
      enderecoLogradouro: data.logradouro ?? current.enderecoLogradouro,
      enderecoBairro: data.bairro ?? current.enderecoBairro,
      enderecoCidade: data.cidade ?? current.enderecoCidade,
      enderecoUf: data.uf ?? current.enderecoUf,
      enderecoCep: data.cep ?? current.enderecoCep,
      codigoMunicipioIbge: data.codigoMunicipioIbge ?? current.codigoMunicipioIbge
    }));
    setMessage("Endereço encontrado para o CEP. Revise antes de salvar.");
  }

  async function save() {
    setSaving(true);
    setError("");
    setErro("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/configuracoes/empresa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json() as CompanySettings & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar os dados da empresa.");
      setForm(data);
      setMessage("Dados da empresa salvos.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar os dados da empresa.");
    } finally {
      setSaving(false);
    }
  }

  const lookupError = erro && !error ? erro : "";

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>Cadastro da empresa</h3>
          <span>Esses dados identificam a empresa logada em documentos, fiscal e relatórios.</span>
        </div>
        <span className="status-badge success">Empresa atual</span>
      </div>

      <div className="erp-form">
        <label className="span-2">
          Razão social *
          <input value={form.razaoSocial} onChange={(event) => update("razaoSocial", event.target.value)} />
        </label>

        <label>
          Nome fantasia
          <input value={form.nomeFantasia} onChange={(event) => update("nomeFantasia", event.target.value)} />
        </label>

        <label>
          CNPJ *
          <input value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} />
        </label>

        <label>
          Inscrição estadual
          <input value={form.inscricaoEstadual} onChange={(event) => update("inscricaoEstadual", event.target.value)} />
        </label>

        <label>
          Inscrição municipal
          <input value={form.inscricaoMunicipal} onChange={(event) => update("inscricaoMunicipal", event.target.value)} />
        </label>

        <label>
          Regime tributário *
          <select value={form.regimeTributario} onChange={(event) => update("regimeTributario", event.target.value as CompanySettings["regimeTributario"])}>
            {REGIMES.map((regime) => (
              <option key={regime.value} value={regime.value}>{regime.label}</option>
            ))}
          </select>
        </label>

        <label>
          Telefone
          <input value={form.telefone} onChange={(event) => update("telefone", event.target.value)} />
        </label>

        <label>
          E-mail
          <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
        </label>

        <fieldset className="sub-fieldset">
          <legend>Perfil de operação</legend>
          <div className="erp-form">
            <label>
              Tipo de negócio *
              <select value={form.tipoNegocio} onChange={(event) => update("tipoNegocio", event.target.value as CompanySettings["tipoNegocio"])}>
                {TIPOS_NEGOCIO.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                ))}
              </select>
            </label>

            <label>
              Segmento *
              <select value={form.segmento} onChange={(event) => update("segmento", event.target.value as CompanySettings["segmento"])}>
                {SEGMENTOS.map((seg) => (
                  <option key={seg.value} value={seg.value}>{seg.label}</option>
                ))}
              </select>
            </label>

            <label className="span-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.permiteVendaSemEstoque}
                onChange={(event) => update("permiteVendaSemEstoque", event.target.checked)}
                style={{ width: "auto" }}
              />
              <span>Aceitar venda/saída de produtos sem estoque (permite saldo negativo)</span>
            </label>

            <p className="span-2 field-hint" style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
              <strong>PDV recomendado:</strong> {PDV_RECOMENDADO[form.tipoNegocio] ?? PDV_RECOMENDADO.AMBOS}
              {form.tipoNegocio === "SERVICO" && " O menu oculta compras, estoque e notas de entrada."}
              {form.tipoNegocio === "VENDA" && " O menu oculta ordens de serviço."}
              {form.segmento === "AUTOPECAS" && " Segmento autopeças habilita a aba de aplicação veicular no cadastro de produtos."}
            </p>
          </div>
        </fieldset>

        <fieldset className="sub-fieldset">
          <legend>Endereço</legend>
          <div className="erp-form">
            <label className="span-2">
              Logradouro
              <input value={form.enderecoLogradouro} onChange={(event) => update("enderecoLogradouro", event.target.value)} />
            </label>

            <label>
              Número
              <input value={form.enderecoNumero} onChange={(event) => update("enderecoNumero", event.target.value)} />
            </label>

            <label>
              Complemento
              <input value={form.enderecoComplemento} onChange={(event) => update("enderecoComplemento", event.target.value)} />
            </label>

            <label>
              Bairro
              <input value={form.enderecoBairro} onChange={(event) => update("enderecoBairro", event.target.value)} />
            </label>

            <label>
              Cidade
              <input value={form.enderecoCidade} onChange={(event) => update("enderecoCidade", event.target.value)} />
            </label>

            <label>
              UF
              <select value={form.enderecoUf} onChange={(event) => update("enderecoUf", event.target.value)}>
                <option value="">Selecione</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </label>

            <label>
              CEP
              <input value={form.enderecoCep} onChange={(event) => update("enderecoCep", event.target.value)} />
            </label>

            <label>
              Código IBGE
              <input value={form.codigoMunicipioIbge} onChange={(event) => update("codigoMunicipioIbge", event.target.value)} />
            </label>
          </div>
        </fieldset>
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {(error || lookupError) && (
        <div className="alert danger" style={{ margin: "0 16px 12px" }}>
          <strong>Atenção</strong>
          <span>{error || lookupError}</span>
        </div>
      )}

      <footer className="inline-foot">
        <Button type="button" variant="light" onClick={fillFromCnpj} disabled={saving || buscandoCnpj}>
          {buscandoCnpj ? "Buscando CNPJ..." : "Buscar CNPJ"}
        </Button>
        <Button type="button" variant="light" onClick={fillFromCep} disabled={saving || buscandoCep}>
          {buscandoCep ? "Buscando CEP..." : "Buscar CEP"}
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar dados"}
        </Button>
      </footer>
    </section>
  );
}
