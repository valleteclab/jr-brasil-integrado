"use client";

import { useState } from "react";
import { useCadastroLookup } from "./useCadastroLookup";
import { normalizeDocumento } from "@/lib/fiscal/documento";

export type ClienteCriado = {
  id: string;
  label: string;
  documento: string | null;
  uf: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  cidade: string | null;
};

/**
 * Drawer de cadastro rápido de cliente, reaproveitado pelo Atendimento e pela Emissão fiscal.
 * Usa o mesmo serviço (POST /api/erp/clientes) e a busca por CNPJ/CEP (useCadastroLookup).
 * Ao salvar, devolve o cliente já no formato que as listas usam (id, label, documento, uf).
 */
export function ClienteCadastroDrawer({
  onClose,
  onCreated,
  documentoInicial = ""
}: {
  onClose: () => void;
  onCreated: (c: ClienteCriado) => void;
  /** Pré-preenche o documento (ex.: CPF que o consumidor já informou na NFC-e). */
  documentoInicial?: string;
}) {
  const { buscarCnpj, buscarCep, buscandoCnpj, buscandoCep, erro: lookupErro } = useCadastroLookup();
  const [tipoPessoa, setTipoPessoa] = useState<"PJ" | "PF">(normalizeDocumento(documentoInicial).length === 11 ? "PF" : "PJ");
  const [documento, setDocumento] = useState(documentoInicial);
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [complemento, setComplemento] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [ibge, setIbge] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function preencherPorCnpj() {
    const d = await buscarCnpj(documento);
    if (!d) return;
    if (d.razaoSocial) setRazaoSocial(d.razaoSocial);
    if (d.nomeFantasia) setNomeFantasia(d.nomeFantasia);
    if (d.email) setEmail(d.email);
    if (d.telefone) setTelefone(d.telefone);
    if (d.inscricaoEstadual) setInscricaoEstadual(d.inscricaoEstadual);
    if (d.endereco.cep) setCep(d.endereco.cep);
    if (d.endereco.logradouro) setLogradouro(d.endereco.logradouro);
    if (d.endereco.numero) setNumero(d.endereco.numero);
    if (d.endereco.complemento) setComplemento(d.endereco.complemento);
    if (d.endereco.bairro) setBairro(d.endereco.bairro);
    if (d.endereco.cidade) setCidade(d.endereco.cidade);
    if (d.endereco.uf) setUf(d.endereco.uf);
    if (d.endereco.codigoMunicipioIbge) setIbge(d.endereco.codigoMunicipioIbge);
  }

  async function preencherPorCep() {
    const d = await buscarCep(cep);
    if (!d) return;
    if (d.logradouro) setLogradouro(d.logradouro);
    if (d.bairro) setBairro(d.bairro);
    if (d.cidade) setCidade(d.cidade);
    if (d.uf) setUf(d.uf);
    if (d.codigoMunicipioIbge) setIbge(d.codigoMunicipioIbge);
  }

  async function salvar() {
    setError("");
    if (!razaoSocial.trim()) { setError(tipoPessoa === "PJ" ? "Informe a razão social." : "Informe o nome."); return; }
    if (!documento.trim()) { setError(tipoPessoa === "PJ" ? "Informe o CNPJ." : "Informe o CPF."); return; }
    setSaving(true);
    try {
      const enderecoValido = cidade.trim() && uf.trim();
      const payload = {
        razaoSocial: razaoSocial.trim(),
        nomeFantasia: nomeFantasia.trim() || null,
        documento: documento.trim(),
        inscricaoEstadual: inscricaoEstadual.trim() || null,
        status: "ATIVO",
        contatos: (email.trim() || telefone.trim())
          ? [{ nome: nomeFantasia.trim() || razaoSocial.trim(), email: email.trim() || null, telefone: telefone.trim() || null, principal: true }]
          : [],
        enderecos: enderecoValido
          ? [{
              apelido: "Principal", cep: cep.trim(), logradouro: logradouro.trim(), numero: numero.trim() || null,
              complemento: complemento.trim() || null,
              bairro: bairro.trim() || null, cidade: cidade.trim(), uf: uf.trim().toUpperCase(),
              codigoMunicipioIbge: ibge.trim() || null, padrao: true
            }]
          : []
      };
      const res = await fetch("/api/erp/clientes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar o cliente.");
      const label = nomeFantasia.trim() ? `${nomeFantasia.trim()} (${razaoSocial.trim()})` : razaoSocial.trim();
      onCreated({
        id: data.id ?? `tmp-${Date.now()}`,
        label,
        documento: normalizeDocumento(documento) || null,
        uf: uf.trim().toUpperCase() || null,
        inscricaoEstadual: inscricaoEstadual.trim() || null,
        email: email.trim() || null,
        cidade: cidade.trim() || null
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  const isPj = tipoPessoa === "PJ";
  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer" style={{ width: 560 }}>
        <header className="drawer-head"><h2>Novo cliente</h2><button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button></header>
        <div className="drawer-body">
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <button type="button" className={`btn-erp ${isPj ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setTipoPessoa("PJ")}>Pessoa Jurídica</button>
            <button type="button" className={`btn-erp ${!isPj ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setTipoPessoa("PF")}>Pessoa Física</button>
          </div>
          <div className="erp-form">
            <label className="full">
              {isPj ? "CNPJ" : "CPF"}
              <span style={{ display: "flex", gap: 6 }}>
                <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Somente números" style={{ flex: 1 }} />
                {isPj && (
                  <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                    {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
                  </button>
                )}
              </span>
            </label>
            <label className="full">{isPj ? "Razão social" : "Nome completo"}<input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} /></label>
            {isPj && <label className="full">Nome fantasia<input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} /></label>}
            {isPj && (
              <label className="full">
                Inscrição estadual <span style={{ color: "var(--erp-mute)", fontWeight: 400 }}>(para NF-e: nº ou ISENTO)</span>
                <input value={inscricaoEstadual} onChange={(e) => setInscricaoEstadual(e.target.value)} placeholder="ISENTO ou número" />
              </label>
            )}
            <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Telefone<input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></label>
            <label>
              CEP
              <span style={{ display: "flex", gap: 6 }}>
                <input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={preencherPorCep} style={{ flex: 1 }} />
                <button type="button" className="btn-erp light sm" onClick={preencherPorCep} disabled={buscandoCep} style={{ flexShrink: 0 }}>{buscandoCep ? "…" : "Buscar"}</button>
              </span>
            </label>
            <label>Número<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
            <label className="full">Logradouro<input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} /></label>
            <label>Complemento<input value={complemento} onChange={(e) => setComplemento(e.target.value)} /></label>
            <label>Bairro<input value={bairro} onChange={(e) => setBairro(e.target.value)} /></label>
            <label>Cidade<input value={cidade} onChange={(e) => setCidade(e.target.value)} /></label>
            <label>UF<input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></label>
          </div>
          {error && <div className="alert danger" style={{ marginTop: 12 }}><span>{error}</span></div>}
          {lookupErro && <div className="alert danger" style={{ marginTop: 12 }}><span>{lookupErro}</span></div>}
        </div>
        <footer className="drawer-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid var(--erp-line)" }}>
          <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-erp primary sm" disabled={saving} onClick={salvar}>{saving ? "Salvando…" : "Cadastrar e selecionar"}</button>
        </footer>
      </aside>
    </>
  );
}
