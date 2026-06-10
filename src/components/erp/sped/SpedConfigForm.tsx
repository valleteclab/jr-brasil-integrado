"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SpedConfiguracaoView } from "@/domains/fiscal/application/sped-use-cases";

type Props = { configuracao: SpedConfiguracaoView };

// Configuração da escrituração: perfil do arquivo (0000), contador (0100) e guia do ICMS (E116).
export function SpedConfigForm({ configuracao }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(configuracao);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

  function set<K extends keyof SpedConfiguracaoView>(campo: K, valor: SpedConfiguracaoView[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setSalvo(false);
  }

  async function salvar() {
    setBusy(true);
    setErro("");
    setSalvo(false);
    try {
      const res = await fetch("/api/erp/sped-fiscal/configuracao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a configuração.");
      setSalvo(true);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setBusy(false);
    }
  }

  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Arquivo (registro 0000)</h3>
        <div style={grid}>
          <label className="field">
            <span>Perfil do arquivo (IND_PERFIL)</span>
            <select value={form.perfilArquivo} onChange={(e) => set("perfilArquivo", e.target.value)} disabled={busy}>
              <option value="A">A — totalizações detalhadas</option>
              <option value="B">B — totalizações (mais comum)</option>
              <option value="C">C — simplificado</option>
            </select>
          </label>
          <label className="field">
            <span>Atividade (IND_ATIV)</span>
            <select value={form.indAtividade} onChange={(e) => set("indAtividade", e.target.value)} disabled={busy}>
              <option value="1">1 — Outros (comércio/serviços)</option>
              <option value="0">0 — Industrial ou equiparado</option>
            </select>
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--jr-mute)" }}>
          O perfil é definido pela SEFAZ do estado da empresa — confirme com o contador.
        </p>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Contador responsável (registro 0100 — obrigatório)</h3>
        <div style={grid}>
          <label className="field"><span>Nome*</span>
            <input value={form.contadorNome} onChange={(e) => set("contadorNome", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>CPF*</span>
            <input value={form.contadorCpf} onChange={(e) => set("contadorCpf", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>CRC*</span>
            <input value={form.contadorCrc} onChange={(e) => set("contadorCrc", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>CNPJ do escritório</span>
            <input value={form.contadorCnpj} onChange={(e) => set("contadorCnpj", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>CEP</span>
            <input value={form.contadorCep} onChange={(e) => set("contadorCep", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Endereço</span>
            <input value={form.contadorEndereco} onChange={(e) => set("contadorEndereco", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Número</span>
            <input value={form.contadorNumero} onChange={(e) => set("contadorNumero", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Complemento</span>
            <input value={form.contadorComplemento} onChange={(e) => set("contadorComplemento", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Bairro</span>
            <input value={form.contadorBairro} onChange={(e) => set("contadorBairro", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Telefone</span>
            <input value={form.contadorTelefone} onChange={(e) => set("contadorTelefone", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>E-mail</span>
            <input value={form.contadorEmail} onChange={(e) => set("contadorEmail", e.target.value)} disabled={busy} /></label>
          <label className="field"><span>Cód. município (IBGE)</span>
            <input value={form.contadorCodigoMunicipioIbge} onChange={(e) => set("contadorCodigoMunicipioIbge", e.target.value)} disabled={busy} /></label>
        </div>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>ICMS Antecipação Parcial (compras interestaduais p/ revenda)</h3>
        <label className="field" style={{ maxWidth: 360 }}>
          <span>Calcular e escriturar antecipação parcial</span>
          <select
            value={form.antecipacaoParcialAtiva ? "1" : "0"}
            onChange={(e) => set("antecipacaoParcialAtiva", e.target.value === "1")}
            disabled={busy}
          >
            <option value="0">Desativada</option>
            <option value="1">Ativada</option>
          </select>
        </label>
        {form.antecipacaoParcialAtiva && (
          <div style={grid}>
            <label className="field">
              <span>Cód. ajuste do crédito (E111)</span>
              <input
                value={form.codAjusteCreditoAntecipacao}
                onChange={(e) => set("codAjusteCreditoAntecipacao", e.target.value)}
                placeholder="BA: BA020002"
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Cód. ajuste do débito especial (E111)</span>
              <input
                value={form.codAjusteDebitoAntecipacao}
                onChange={(e) => set("codAjusteDebitoAntecipacao", e.target.value)}
                placeholder="BA: BA050004"
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Código de receita da guia (E116)</span>
              <input
                value={form.codigoReceitaAntecipacao}
                onChange={(e) => set("codigoReceitaAntecipacao", e.target.value)}
                placeholder="BA: 2175 (DAE)"
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Dia de vencimento</span>
              <input
                type="number"
                min={1}
                max={28}
                value={form.diaVencimentoAntecipacao}
                onChange={(e) => set("diaVencimentoAntecipacao", Number(e.target.value))}
                disabled={busy}
              />
            </label>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 12, color: "var(--jr-mute)" }}>
          Cálculo: (alíquota interna da sua UF − alíquota interestadual) sobre as entradas
          interestaduais para revenda sem ST. Na Bahia os códigos padrão já vêm preenchidos
          automaticamente; o valor é creditado na apuração (conta-corrente fiscal) e a guia sai
          como débito especial no E116. Confirme códigos e prazo com o contador.
        </p>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>CIAP e Bloco K</h3>
        <div style={grid}>
          <label className="field">
            <span>Cód. ajuste E111 do crédito CIAP</span>
            <input
              value={form.codAjusteCreditoCiap}
              onChange={(e) => set("codAjusteCreditoCiap", e.target.value)}
              placeholder="tabela 5.1.1 da UF (ex.: UF02xxxx)"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Bloco K (estoque)</span>
            <select value={form.gerarBlocoK ? "1" : "0"} onChange={(e) => set("gerarBlocoK", e.target.value === "1")} disabled={busy}>
              <option value="0">Sem movimento (K001=1)</option>
              <option value="1">Saldo de estoque (K010 modo 2 + K200)</option>
            </select>
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--jr-mute)" }}>
          CIAP: os bens são gerenciados em SPED Fiscal → CIAP; sem o código de ajuste, o bloco G sai
          calculado mas o crédito não entra na apuração. Bloco K: usa o saldo ATUAL do estoque como
          posição do fim do período — peça ao contador o código da tabela 5.1.1 da sua UF.
        </p>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Guia do ICMS (registro E116)</h3>
        <div style={grid}>
          <label className="field">
            <span>Código de receita estadual</span>
            <input
              value={form.codigoReceitaIcms}
              onChange={(e) => set("codigoReceitaIcms", e.target.value)}
              placeholder="ex.: 046-2 (varia por UF)"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Dia de vencimento do ICMS</span>
            <input
              type="number"
              min={1}
              max={28}
              value={form.diaVencimentoIcms}
              onChange={(e) => set("diaVencimentoIcms", Number(e.target.value))}
              disabled={busy}
            />
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--jr-mute)" }}>
          Usados quando a apuração fecha com ICMS a recolher. O código da guia e o vencimento variam por estado.
        </p>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="button primary" onClick={salvar} disabled={busy}>
          {busy ? "Salvando…" : "Salvar configuração"}
        </button>
        {salvo && <span style={{ color: "var(--jr-success)", fontSize: 13 }}>Configuração salva.</span>}
        {erro && <span style={{ color: "var(--jr-danger)", fontSize: 13 }}>{erro}</span>}
      </div>
    </div>
  );
}
