"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportacaoResumo, LinhaExtratoPendente, ResumoImportacao } from "@/domains/finance/application/ofx-use-cases";

/**
 * Importação do extrato/fatura em OFX e conciliação com os títulos do ERP.
 *
 * O sistema NÃO lança nada sozinho: cada linha do banco fica pendente até alguém vincular a um
 * título (aí a baixa sai com a data e o valor do banco) ou marcar como ignorada. É o que evita
 * duplicar despesa que já entrou por outro caminho.
 */

type ContaOption = { id: string; nome: string; tipo: string };
type ParteOption = { id: string; nome: string };
type ClassificacaoOption = { id: string; nome: string; tipo: string };

type Resumo = {
  pendentes: number;
  valorPendente: number;
  conciliadas: number;
  ignoradas: number;
  ultimaImportacao: {
    arquivo: string;
    conta: string;
    em: string;
    periodo: { inicio: string | null; fim: string | null };
    saldoBanco: number | null;
    novas: number;
    duplicadas: number;
  } | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export function ExtratoOfxWorkspace({
  contas,
  fornecedores = [],
  clientes = [],
  classificacoes = []
}: {
  contas: ContaOption[];
  fornecedores?: ParteOption[];
  clientes?: ParteOption[];
  classificacoes?: ClassificacaoOption[];
}) {
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<LinhaExtratoPendente[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  // Mostra também as resolvidas por padrão: foi o que faltou — depois de vincular, a linha sumia
  // da lista e o usuário ficava sem o caminho de volta.
  const [verTodas, setVerTodas] = useState(true);
  const [criando, setCriando] = useState<LinhaExtratoPendente | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [importacao, setImportacao] = useState<ResumoImportacao | null>(null);
  const [importacoes, setImportacoes] = useState<ImportacaoResumo[]>([]);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(
    async (conta = contaId, todas = verTodas) => {
      setBusy(true);
      setErro("");
      try {
        const r = await fetch(`/api/erp/financeiro/ofx/linhas?conta=${encodeURIComponent(conta)}${todas ? "&todas=1" : ""}`);
        const json = (await r.json()) as { linhas?: LinhaExtratoPendente[]; resumo?: Resumo; importacoes?: ImportacaoResumo[]; error?: string };
        if (!r.ok) throw new Error(json.error || "Falha ao carregar o extrato.");
        setLinhas(json.linhas ?? []);
        setResumo(json.resumo ?? null);
        setImportacoes(json.importacoes ?? []);
        // Pré-seleciona a melhor sugestão (menor diferença de dias) — o usuário confirma.
        const pre: Record<string, string> = {};
        for (const l of json.linhas ?? []) {
          if (l.status === "PENDENTE" && l.sugestoes.length > 0) pre[l.id] = `${l.sugestoes[0].tipo}:${l.sugestoes[0].id}`;
        }
        setEscolhas(pre);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar o extrato.");
      } finally {
        setBusy(false);
      }
    },
    [contaId, verTodas]
  );

  useEffect(() => {
    if (contaId) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId]);

  async function importar(file: File) {
    setBusy(true);
    setErro("");
    setOk("");
    setImportacao(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contaBancariaId", contaId);
      const r = await fetch("/api/erp/financeiro/ofx/importar", { method: "POST", body: fd });
      const json = (await r.json()) as ResumoImportacao & { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao importar o arquivo.");
      setImportacao(json);
      setOk(`${json.novas} lançamento(s) importado(s)${json.duplicadas ? `, ${json.duplicadas} já existiam` : ""}.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar o arquivo.");
    } finally {
      setBusy(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  function vinculoDe(linhaId: string) {
    const escolha = escolhas[linhaId];
    if (!escolha) return null;
    const [tipo, id] = escolha.split(":");
    return tipo === "PAGAR" ? { linhaId, contaPagarId: id } : { linhaId, contaReceberId: id };
  }

  async function conciliar(linhaId: string) {
    const vinculo = vinculoDe(linhaId);
    if (!vinculo) {
      setErro("Escolha o título antes de vincular.");
      return;
    }
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/financeiro/ofx/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vinculo)
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao conciliar.");
      setOk("Linha conciliada: a baixa saiu com a data e o valor do banco.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao conciliar.");
    } finally {
      setBusy(false);
    }
  }

  async function conciliarSugeridas() {
    const vinculos = linhas
      .filter((l) => l.status === "PENDENTE" && escolhas[l.id])
      .map((l) => vinculoDe(l.id))
      .filter(Boolean);
    if (vinculos.length === 0) {
      setErro("Nenhuma linha com título escolhido.");
      return;
    }
    if (!window.confirm(`Vincular e baixar ${vinculos.length} linha(s)? A baixa usa a data e o valor do banco.`)) return;
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/financeiro/ofx/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vinculos })
      });
      const json = (await r.json()) as { conciliadas?: number; falhas?: Array<{ erro: string }>; error?: string };
      if (!r.ok) throw new Error(json.error || "Falha na conciliação em lote.");
      setOk(`${json.conciliadas ?? 0} linha(s) conciliada(s)${json.falhas?.length ? `, ${json.falhas.length} com erro` : ""}.`);
      if (json.falhas?.length) setErro(json.falhas.map((f) => f.erro).join(" | "));
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na conciliação em lote.");
    } finally {
      setBusy(false);
    }
  }

  async function ignorar(linhaId: string) {
    const motivo = window.prompt("Por que esta linha não vira lançamento? (transferência própria, estorno, aplicação…)");
    if (motivo === null) return;
    setBusy(true);
    setErro("");
    try {
      const r = await fetch("/api/erp/financeiro/ofx/ignorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhaId, motivo })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao ignorar.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ignorar.");
    } finally {
      setBusy(false);
    }
  }

  async function reabrir(linhaId: string) {
    const linha = linhas.find((l) => l.id === linhaId);
    if (linha?.status === "CONCILIADA" && !window.confirm("Desfazer este vínculo? A baixa do título será estornada e a linha volta para pendente.")) return;
    setBusy(true);
    setErro("");
    try {
      const r = await fetch("/api/erp/financeiro/ofx/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhaId, reabrir: true })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao reabrir.");
      setOk("Desfeito: a baixa foi estornada e a linha voltou para pendente.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reabrir.");
    } finally {
      setBusy(false);
    }
  }

  async function excluirImportacao(imp: ImportacaoResumo) {
    if (!window.confirm(`Excluir a importação de "${imp.arquivo}" na conta ${imp.conta.nome}? Os ${imp.pendentes + imp.ignoradas} lançamento(s) importados saem do sistema — nenhuma baixa é desfeita, porque nenhum deles foi vinculado.`)) return;
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch(`/api/erp/financeiro/ofx/importar?id=${encodeURIComponent(imp.id)}`, { method: "DELETE" });
      const json = (await r.json()) as { removidas?: number; error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao excluir a importação.");
      setOk(`Importação desfeita: ${json.removidas ?? 0} lançamento(s) removido(s). Pode importar de novo na conta certa.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir a importação.");
    } finally {
      setBusy(false);
    }
  }

  const comSugestao = linhas.filter((l) => l.status === "PENDENTE" && escolhas[l.id]).length;

  return (
    <div>
      <div className="erp-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={contaId} disabled={busy} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome} ({c.tipo.toLowerCase()})</option>
          ))}
        </select>
        <input
          ref={inputArquivo}
          type="file"
          accept=".ofx,.OFX,text/plain,application/x-ofx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importar(f);
          }}
        />
        <button type="button" className="btn-erp primary sm" disabled={busy || !contaId} onClick={() => inputArquivo.current?.click()}>
          ⤒ Importar arquivo OFX
        </button>
        <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void carregar()}>
          Atualizar
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={verTodas} onChange={(e) => { setVerTodas(e.target.checked); void carregar(contaId, e.target.checked); }} />
          Mostrar também as já resolvidas
        </label>
        <div className="grow" />
        {comSugestao > 0 && (
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => void conciliarSugeridas()}>
            Vincular {comSugestao} sugestão(ões)
          </button>
        )}
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success"><span className="lead">OK:</span><span>{ok}</span></div>}

      {importacao && importacao.avisos.length > 0 && importacao.avisos.map((a, i) => (
        <div key={i} className="alert warn" style={{ marginBottom: 8 }}><span className="lead">⚠</span><span>{a}</span></div>
      ))}

      {resumo && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head">
            <h3>Situação da conciliação</h3>
            {resumo.ultimaImportacao && (
              <span className="field-hint">
                Último arquivo: {resumo.ultimaImportacao.arquivo} ({dia(resumo.ultimaImportacao.periodo.inicio)} a{" "}
                {dia(resumo.ultimaImportacao.periodo.fim)}) · importado em {dia(resumo.ultimaImportacao.em)}
              </span>
            )}
          </div>
          <div className="kpi-row">
            <div className="kpi"><span className="kpi-label">Pendentes</span><strong>{resumo.pendentes}</strong></div>
            <div className="kpi"><span className="kpi-label">Valor pendente (líquido)</span><strong>{brl(resumo.valorPendente)}</strong></div>
            <div className="kpi"><span className="kpi-label">Conciliadas</span><strong>{resumo.conciliadas}</strong></div>
            <div className="kpi"><span className="kpi-label">Ignoradas</span><strong>{resumo.ignoradas}</strong></div>
            {resumo.ultimaImportacao?.saldoBanco != null && (
              <div className="kpi"><span className="kpi-label">Saldo no banco</span><strong>{brl(resumo.ultimaImportacao.saldoBanco)}</strong></div>
            )}
          </div>
        </div>
      )}

      {importacoes.length > 0 && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Arquivos importados</h3></div>
          <table className="erp-table">
            <thead>
              <tr><th>Arquivo</th><th>Conta</th><th>Período</th><th className="num">Lançamentos</th><th>Situação</th><th className="actions">Ações</th></tr>
            </thead>
            <tbody>
              {importacoes.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.arquivo}</strong><small className="block-muted">importado em {dia(i.importadoEm)}</small></td>
                  <td>{i.conta.nome}<small className="block-muted">{i.conta.tipo.toLowerCase()}</small></td>
                  <td>{dia(i.periodo.inicio)} a {dia(i.periodo.fim)}</td>
                  <td className="num">{i.novas}{i.duplicadas > 0 && <small className="block-muted">{i.duplicadas} já existiam</small>}</td>
                  <td>
                    {i.pendentes} pendente(s)
                    {i.conciliadas > 0 && <small className="block-muted">{i.conciliadas} conciliada(s)</small>}
                    {i.ignoradas > 0 && <small className="block-muted">{i.ignoradas} ignorada(s)</small>}
                  </td>
                  <td className="actions">
                    {i.podeExcluir ? (
                      <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void excluirImportacao(i)}>
                        Excluir importação
                      </button>
                    ) : (
                      <small className="block-muted">Tem linha conciliada: reabra antes de excluir.</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {criando && (
        <CriarLancamentoForm
          linha={criando}
          fornecedores={fornecedores}
          clientes={clientes}
          classificacoes={classificacoes}
          onClose={() => setCriando(null)}
          onSuccess={async (msg) => {
            setCriando(null);
            setOk(msg);
            await carregar();
          }}
        />
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Lançamentos do banco ({linhas.length})</h3></div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição no banco</th>
              <th className="num">Valor</th>
              <th>Título no sistema</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>{dia(l.data)}</td>
                <td>
                  <strong>{l.descricao}</strong>
                  {l.documento && <small className="block-muted">Doc. {l.documento}</small>}
                  {l.status !== "PENDENTE" && <small className="block-muted">{l.status === "CONCILIADA" ? "✔ conciliada" : "— ignorada"}</small>}
                </td>
                <td className="num" style={{ color: l.valor < 0 ? "#b3261e" : "#0b6b36" }}>{brl(l.valor)}</td>
                <td>
                  {l.status !== "PENDENTE" ? (
                    <small className="block-muted">—</small>
                  ) : l.sugestoes.length === 0 ? (
                    <small className="block-muted">Nada com o mesmo valor no sistema — use &quot;Criar lançamento&quot; para lançar e vincular de uma vez.</small>
                  ) : (
                    <select
                      value={escolhas[l.id] ?? ""}
                      onChange={(e) => setEscolhas((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    >
                      <option value="">— escolher —</option>
                      {l.sugestoes.map((s) => (
                        <option key={`${s.tipo}:${s.id}`} value={`${s.tipo}:${s.id}`}>
                          {s.descricao} · {s.parte ?? "sem parte"} · venc. {dia(s.vencimento)} · {brl(s.saldo)}
                          {s.diferencaDias > 0 ? ` (${s.diferencaDias}d)` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="actions">
                  {l.status === "PENDENTE" ? (
                    <>
                      {l.sugestoes.length > 0 && (
                        <button type="button" className="btn-erp primary sm" disabled={busy || !escolhas[l.id]} onClick={() => void conciliar(l.id)}>
                          Vincular
                        </button>
                      )}
                      <button type="button" className="btn-erp sm" disabled={busy} onClick={() => setCriando(l)}>
                        Criar lançamento
                      </button>
                      <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void ignorar(l.id)}>
                        Ignorar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-erp ghost sm"
                      disabled={busy}
                      title={l.status === "CONCILIADA" ? "Estorna a baixa e devolve a linha para pendente" : "Volta a linha para pendente"}
                      onClick={() => void reabrir(l.id)}
                    >
                      ↩ Desfazer
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 24 }}>
                  <h4>Nenhum lançamento pendente</h4>
                  <p className="field-hint">
                    Exporte o extrato em OFX no internet banking (ou a fatura do cartão) e importe aqui.
                    Reimportar o mesmo período não duplica nada.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Criar o lançamento a partir da linha do extrato ───────────────────────────────────────
   Para o que o banco mostra e o sistema não tem: tarifa, pagamento avulso, recebimento sem
   título. Nasce com a data e o valor do banco e já sai quitado e vinculado à linha. */
function CriarLancamentoForm({
  linha,
  fornecedores,
  clientes,
  classificacoes,
  onClose,
  onSuccess
}: {
  linha: LinhaExtratoPendente;
  fornecedores: ParteOption[];
  clientes: ParteOption[];
  classificacoes: ClassificacaoOption[];
  onClose: () => void;
  onSuccess: (mensagem: string) => void | Promise<void>;
}) {
  const ehSaida = linha.valor < 0;
  const [descricao, setDescricao] = useState(linha.descricao);
  const [parteId, setParteId] = useState("");
  const [classificacaoId, setClassificacaoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const opcoesClassificacao = classificacoes.filter((c) => (ehSaida ? c.tipo === "DESPESA" : c.tipo === "RECEITA"));

  async function salvar() {
    if (!ehSaida && !parteId) {
      setErro("Para um crédito, escolha o cliente do recebimento.");
      return;
    }
    setBusy(true);
    setErro("");
    try {
      const r = await fetch("/api/erp/financeiro/ofx/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhaId: linha.id,
          descricao,
          ...(ehSaida ? { fornecedorId: parteId || null } : { clienteId: parteId }),
          classificacaoId: classificacaoId || null
        })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao criar o lançamento.");
      await onSuccess(`Lançamento criado e vinculado: ${descricao}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar o lançamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>{ehSaida ? "Nova despesa pelo extrato" : "Novo recebimento pelo extrato"}</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>
        <div className="drawer-body">
          <div style={{ padding: "12px 20px", background: "var(--erp-bg)", borderBottom: "1px solid var(--erp-line)", fontSize: 12, color: "var(--erp-slate)" }}>
            {dia(linha.data)} · <strong>{brl(linha.valor)}</strong> · {linha.descricao}
          </div>
          {erro && <div className="alert danger" style={{ margin: "12px 20px 0" }}><span className="lead">Erro:</span><span>{erro}</span></div>}
          <div className="erp-form">
            <label className="full">
              <span>Descrição</span>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>
            <label className="full">
              <span>{ehSaida ? "Fornecedor (opcional)" : "Cliente"}</span>
              <select value={parteId} onChange={(e) => setParteId(e.target.value)}>
                <option value="">{ehSaida ? "Sem fornecedor" : "Selecione o cliente"}</option>
                {(ehSaida ? fornecedores : clientes).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            {opcoesClassificacao.length > 0 && (
              <label className="full">
                <span>Classificação (opcional)</span>
                <select value={classificacaoId} onChange={(e) => setClassificacaoId(e.target.value)}>
                  <option value="">Sem classificação</option>
                  {opcoesClassificacao.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            )}
            <small className="field-hint full">
              O lançamento entra com a data e o valor do banco e já sai quitado nesta conta. Se errar, use &quot;Desfazer&quot; na linha.
            </small>
          </div>
          <footer className="drawer-foot">
            <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="button" className="btn-erp primary sm" onClick={() => void salvar()} disabled={busy}>
              {busy ? "Criando…" : "Criar e vincular"}
            </button>
          </footer>
        </div>
      </aside>
    </>
  );
}
