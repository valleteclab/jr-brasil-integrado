"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { QuoteSummary } from "@/lib/services/sales-quote";
import { EnviarDocumentoModal } from "./EnviarDocumentoModal";

type Props = {
  quotes: QuoteSummary[];
  /** Mostra a ação de EXCLUIR (apenas perfil admin). */
  isAdmin?: boolean;
};

export function QuotesList({ quotes, isAdmin = false }: Props) {
  const [rows, setRows] = useState(quotes);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  // Paginação client-side (50/página) — busca e filtros seguem sobre a lista completa.
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Orçamento sendo enviado ao cliente (e-mail/WhatsApp) pelo modal compartilhado.
  const [enviando, setEnviando] = useState<QuoteSummary | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => !q || [r.numero, r.cliente, r.vendedor, r.statusLabel].some((f) => f.toLowerCase().includes(q)))
      .filter((r) => statusFilter === "todos" || r.status === statusFilter);
  }, [query, rows, statusFilter]);

  const statusOpcoes = useMemo(() => {
    const vistos = new Map<string, string>();
    rows.forEach((r) => vistos.set(r.status, r.statusLabel));
    return [...vistos.entries()];
  }, [rows]);

  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe]
  );

  async function renovar(id: string) {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/erp/orcamentos/${id}/renovar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; validoAte?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao renovar.");
      const novaValidade = data.validoAte ? new Date(data.validoAte).toLocaleDateString("pt-BR") : null;
      setRows((cur) => cur.map((r) => r.id === id ? {
        ...r, status: "EM_ANALISE", statusLabel: "Em análise", statusTone: "info" as const,
        validoAte: novaValidade, canAprovar: true, canRejeitar: true
      } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renovar orçamento.");
    } finally { setBusyId(null); }
  }

  async function callAction(id: string, action: "aprovar" | "rejeitar" | "converter") {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/orcamentos/${id}/${action}`, { method: "POST" });
      const data = (await res.json()) as { error?: string; status?: string; numeroPedido?: string };
      if (!res.ok) throw new Error(data.error ?? `Falha ao ${action}.`);

      if (action === "converter") {
        window.alert(`Pedido ${data.numeroPedido} criado com sucesso!`);
        setRows((cur) =>
          cur.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "CONVERTIDO",
                  statusLabel: "Convertido em pedido",
                  statusTone: "violet" as const,
                  canAprovar: false,
                  canRejeitar: false,
                  canConverter: false,
                  pedidoGeradoId: data.numeroPedido ?? null,
                }
              : r
          )
        );
      } else if (action === "aprovar") {
        setRows((cur) =>
          cur.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "APROVADO",
                  statusLabel: "Aprovado",
                  statusTone: "success" as const,
                  canAprovar: false,
                  canConverter: true,
                }
              : r
          )
        );
      } else if (action === "rejeitar") {
        setRows((cur) =>
          cur.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "REJEITADO",
                  statusLabel: "Rejeitado",
                  statusTone: "danger" as const,
                  canAprovar: false,
                  canRejeitar: false,
                  canConverter: false,
                }
              : r
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir(id: string, numero: string) {
    if (!window.confirm(`Excluir definitivamente o orçamento ${numero}? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/orcamentos/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o orçamento.");
      setRows((cur) => cur.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir orçamento.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por número, cliente, vendedor..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="search"
          style={{ maxWidth: 190 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filtrar por situação"
        >
          <option value="todos">Todas as situações</option>
          {statusOpcoes.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select>
        <div className="toolbar-grow" />
        <Button href="/erp/orcamentos/novo" variant="primary">+ Novo orçamento</Button>
      </div>

      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Situação</th>
              <th>Válido até</th>
              <th className="num">Total</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((orc) => (
              <tr key={orc.id}>
                <td>
                  <Link className="mono bold link-detalhe" href={`/erp/orcamentos/${orc.id}`}>{orc.numero}</Link>
                  {orc.canal === "LOJA" && <span className="canal-loja" title="Solicitação recebida pela loja virtual">🛒 Loja</span>}
                  <small className="block-muted">{orc.criadoEm}</small>
                </td>
                <td>
                  <strong>{orc.cliente}</strong>
                  {orc.condicaoPagamento && (
                    <small className="block-muted">{orc.condicaoPagamento}</small>
                  )}
                </td>
                <td>{orc.vendedor || <span className="block-muted">—</span>}</td>
                <td>
                  <StatusBadge tone={orc.statusTone}>{orc.statusLabel}</StatusBadge>
                </td>
                <td>
                  {orc.status === "EXPIRADO"
                    ? <span style={{ color: "var(--erp-warn, #d97706)", fontWeight: 700 }} title="Orçamento vencido">⚠ expirou {orc.validoAte ? `em ${orc.validoAte}` : ""}</span>
                    : (orc.validoAte ?? <span className="block-muted">—</span>)}
                </td>
                <td className="num">
                  <strong>{orc.total}</strong>
                  {Number(orc.desconto.replace(/[^\d,]/g, "").replace(",", ".")) > 0 && (
                    <small className="block-muted">desc. {orc.desconto}</small>
                  )}
                </td>
                <td className="actions">
                  <a
                    className="btn-erp ghost xs"
                    href={`/api/erp/orcamentos/${orc.id}/imprimir`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Imprimir / salvar em PDF"
                  >
                    🖨 PDF
                  </a>
                  <button
                    type="button"
                    className="btn-erp ghost xs"
                    title="Enviar ao cliente por e-mail/WhatsApp"
                    onClick={() => setEnviando(orc)}
                  >
                    📤 Enviar
                  </button>
                  {orc.status === "EXPIRADO" && (
                    <button
                      type="button"
                      className="btn-erp light xs"
                      title="Reabrir com nova validade (7 dias)"
                      disabled={busyId === orc.id}
                      onClick={() => renovar(orc.id)}
                    >
                      {busyId === orc.id ? "Renovando…" : "🔄 Renovar"}
                    </button>
                  )}
                  {orc.canAprovar && (
                    <Button
                      variant="light"
                      type="button"
                      disabled={busyId === orc.id}
                      onClick={() => callAction(orc.id, "aprovar")}
                    >
                      Aprovar
                    </Button>
                  )}
                  {orc.canConverter && (
                    <Button
                      variant="light"
                      type="button"
                      disabled={busyId === orc.id}
                      onClick={() => callAction(orc.id, "converter")}
                    >
                      {busyId === orc.id ? "Convertendo..." : "Gerar pedido"}
                    </Button>
                  )}
                  {orc.pedidoGeradoId && !orc.canConverter && (
                    <Button variant="light" href="/erp/vendas">
                      Ver pedido
                    </Button>
                  )}
                  {orc.canRejeitar && (
                    <button
                      className="danger-link"
                      type="button"
                      disabled={busyId === orc.id}
                      onClick={() => callAction(orc.id, "rejeitar")}
                    >
                      Rejeitar
                    </button>
                  )}
                  {isAdmin && orc.canDelete && (
                    <button
                      className="danger-link"
                      type="button"
                      title="Excluir orçamento (admin)"
                      disabled={busyId === orc.id}
                      onClick={() => excluir(orc.id, orc.numero)}
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">Nenhum orçamento encontrado.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="erp-table-foot" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>
            {filtered.length} orçamento(s){filtered.length > PAGE_SIZE
              ? ` · exibindo ${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, filtered.length)}`
              : ""}
          </span>
          {totalPages > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <button type="button" className="btn-erp ghost xs" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹ Anterior</button>
              <span style={{ fontSize: 12.5 }}>página {pageSafe} de {totalPages}</span>
              <button type="button" className="btn-erp ghost xs" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>Próxima ›</button>
            </span>
          )}
        </div>
      </div>
      {enviando && (
        <EnviarDocumentoModal
          titulo={`Enviar orçamento ${enviando.numero}`}
          descricao={`Cliente: ${enviando.cliente}. O PDF do orçamento vai ANEXO nos dois canais — no e-mail com a tabela completa e assinatura da empresa; no WhatsApp como documento com resumo na legenda.`}
          endpoint={`/api/erp/orcamentos/${enviando.id}/enviar`}
          onClose={() => setEnviando(null)}
        />
      )}
    </section>
  );
}
