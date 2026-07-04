"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AntecipacaoResumo, TituloAntecipavel } from "@/domains/finance/application/antecipacao-use-cases";
import type { BankAccountSummary } from "@/lib/services/finance";

type Props = {
  titulos: TituloAntecipavel[];
  historico: AntecipacaoResumo[];
  contas: BankAccountSummary[];
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Antecipação de recebíveis: seleção dos títulos + taxa (R$ ou %) + conta creditada. Uma operação
 * gera baixa pelo bruto, crédito em conta e a taxa como despesa "Juros de antecipação".
 */
export function AntecipacaoWorkspace({ titulos, historico, contas }: Props) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState(contas[0]?.id ?? "");
  const [dataOperacao, setDataOperacao] = useState(new Date().toISOString().substring(0, 10));
  const [instituicao, setInstituicao] = useState("");
  const [modoTaxa, setModoTaxa] = useState<"valor" | "percentual">("valor");
  const [taxaInput, setTaxaInput] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return titulos;
    return titulos.filter((t) =>
      [t.cliente, t.descricao, t.numeroDocumento, t.vencimento].some((f) => f.toLowerCase().includes(q))
    );
  }, [titulos, query]);

  const bruto = useMemo(
    () => titulos.filter((t) => selecionados.has(t.id)).reduce((s, t) => s + t.saldoNum, 0),
    [titulos, selecionados]
  );
  const taxaValor = useMemo(() => {
    const n = parseFloat(taxaInput.replace(",", ".")) || 0;
    return modoTaxa === "percentual" ? Math.round(bruto * n) / 100 : n;
  }, [taxaInput, modoTaxa, bruto]);
  const liquido = Math.round((bruto - taxaValor) * 100) / 100;

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodosFiltrados() {
    setSelecionados((prev) => {
      const todosMarcados = filtrados.every((t) => prev.has(t.id));
      const next = new Set(prev);
      for (const t of filtrados) {
        if (todosMarcados) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  const [desfazendoId, setDesfazendoId] = useState<string | null>(null);

  async function desfazer(a: AntecipacaoResumo) {
    if (!window.confirm(
      `Desfazer a antecipação de ${a.data}?\n\n` +
      `Os ${a.titulos} título(s) voltam a ABERTO, a taxa (${a.valorTaxa}) é removida e o ` +
      `líquido (${a.valorLiquido}) sai do saldo da conta ${a.contaBancaria}.`
    )) return;
    setDesfazendoId(a.id);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch(`/api/erp/financeiro/antecipacoes/${a.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Não foi possível desfazer a antecipação.");
      setSucesso("Antecipação desfeita — títulos reabertos e saldo devolvido.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao desfazer.");
    } finally {
      setDesfazendoId(null);
    }
  }

  async function confirmar() {
    setErro("");
    setSucesso("");
    if (!selecionados.size) { setErro("Selecione pelo menos um título."); return; }
    if (!contaBancariaId) { setErro("Selecione a conta bancária que recebeu o crédito."); return; }
    if (taxaValor >= bruto) { setErro("A taxa não pode ser maior ou igual ao valor bruto."); return; }
    const confirma = window.confirm(
      `Confirmar a antecipação de ${selecionados.size} título(s)?\n\n` +
      `Bruto: ${BRL.format(bruto)}\nTaxa: ${BRL.format(taxaValor)}\nLíquido em conta: ${BRL.format(liquido)}\n\n` +
      `Os títulos serão baixados e a taxa lançada como "Juros de antecipação".`
    );
    if (!confirma) return;
    setLoading(true);
    try {
      const res = await fetch("/api/erp/financeiro/antecipacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contaBancariaId,
          contaReceberIds: [...selecionados],
          valorTaxa: taxaValor,
          dataOperacao,
          instituicao: instituicao || undefined,
          observacoes: observacoes || undefined
        })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Não foi possível registrar a antecipação.");
      setSucesso(`Antecipação registrada: ${selecionados.size} título(s), líquido ${BRL.format(liquido)} creditado.`);
      setSelecionados(new Set());
      setTaxaInput("");
      setObservacoes("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {sucesso && <div className="alert success"><span className="lead">OK:</span><span>{sucesso}</span></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        {/* Títulos em aberto */}
        <div className="erp-table-wrap">
          <div className="erp-toolbar" style={{ border: 0 }}>
            <div className="toolbar-search">
              <span className="ic-sr" aria-hidden="true">⌕</span>
              <input className="search" placeholder="Buscar por cliente, descrição, nº doc…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="grow" />
            <span style={{ fontSize: 12, color: "var(--erp-slate)" }}>{selecionados.size} de {titulos.length} selecionado(s)</span>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os títulos filtrados"
                    checked={filtrados.length > 0 && filtrados.every((t) => selecionados.has(t.id))}
                    onChange={toggleTodosFiltrados}
                  />
                </th>
                <th>Cliente</th>
                <th>Título</th>
                <th>Vencimento</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => (
                <tr key={t.id} onClick={() => toggle(t.id)} style={{ cursor: "pointer" }}>
                  <td><input type="checkbox" checked={selecionados.has(t.id)} onChange={() => toggle(t.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td>{t.cliente}</td>
                  <td>
                    <strong>{t.descricao}</strong>
                    {t.numeroDocumento !== "—" && <span className="sublabel mono">{t.numeroDocumento}</span>}
                  </td>
                  <td>
                    {t.vencimento}{" "}
                    {t.vencido && <span className="pill danger" style={{ marginLeft: 4 }}><span className="dot" />Vencido</span>}
                  </td>
                  <td className="num"><strong>{t.saldo}</strong></td>
                </tr>
              ))}
              {!filtrados.length && (
                <tr><td colSpan={5}><div className="empty-st"><h4>Nenhum título em aberto</h4><p>Não há recebíveis com saldo para antecipar.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Painel da operação */}
        <div className="card" style={{ padding: 16, position: "sticky", top: 12 }}>
          <h3 style={{ marginTop: 0 }}>Operação</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Conta bancária creditada <span style={{ color: "var(--erp-danger, #b42318)" }}>*</span>
              <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)}>
                <option value="">Selecione…</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.saldoAtual})</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Data da operação
              <input type="date" value={dataOperacao} onChange={(e) => setDataOperacao(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Banco / factoring (opcional)
              <input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="Ex.: Sicredi, Galopes…" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Taxa / deságio
              <span style={{ display: "flex", gap: 6 }}>
                <select value={modoTaxa} onChange={(e) => setModoTaxa(e.target.value as "valor" | "percentual")} style={{ width: 70 }}>
                  <option value="valor">R$</option>
                  <option value="percentual">%</option>
                </select>
                <input
                  inputMode="decimal"
                  value={taxaInput}
                  onChange={(e) => setTaxaInput(e.target.value)}
                  placeholder={modoTaxa === "valor" ? "0,00" : "0,0 % sobre o bruto"}
                  style={{ flex: 1 }}
                />
              </span>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Observações
              <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </label>

            <table className="erp-table" style={{ marginTop: 4 }}>
              <tbody>
                <tr><td>Bruto ({selecionados.size} título(s))</td><td className="num"><strong>{BRL.format(bruto)}</strong></td></tr>
                <tr><td>Taxa</td><td className="num" style={{ color: "var(--erp-danger, #b42318)" }}>− {BRL.format(taxaValor)}</td></tr>
                <tr><td><strong>Líquido em conta</strong></td><td className="num"><strong>{BRL.format(liquido)}</strong></td></tr>
              </tbody>
            </table>

            <button type="button" className="btn-erp primary" onClick={confirmar} disabled={loading || !selecionados.size}>
              {loading ? "Registrando…" : "Confirmar antecipação"}
            </button>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <section className="erp-card" style={{ marginTop: 24 }}>
        <div className="erp-card-head"><h3>Antecipações registradas</h3></div>
        {historico.length === 0 ? (
          <div className="empty-st"><span>Nenhuma antecipação registrada ainda.</span></div>
        ) : (
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Instituição</th>
                  <th>Conta</th>
                  <th className="num">Títulos</th>
                  <th className="num">Bruto</th>
                  <th className="num">Taxa</th>
                  <th className="num">Líquido</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {historico.map((a) => (
                  <tr key={a.id}>
                    <td>{a.data}</td>
                    <td>{a.instituicao}</td>
                    <td>{a.contaBancaria}</td>
                    <td className="num">{a.titulos}</td>
                    <td className="num">{a.valorBruto}</td>
                    <td className="num">{a.valorTaxa}</td>
                    <td className="num"><strong>{a.valorLiquido}</strong></td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn-erp ghost sm"
                        onClick={() => desfazer(a)}
                        disabled={desfazendoId === a.id}
                        title="Reabre os títulos, remove a taxa e devolve o saldo"
                      >
                        {desfazendoId === a.id ? "Desfazendo…" : "Desfazer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
