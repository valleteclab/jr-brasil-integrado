import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getInteligenciaVendas, type IntelVendas } from "@/lib/services/sales-intel";

export const dynamic = "force-dynamic";

/** Inteligência de VENDAS — onde tem dinheiro parado e quem precisa de um oi. */
export default async function InteligenciaPage() {
  let dados: IntelVendas | null = null;
  let erro = "";
  try {
    dados = await getInteligenciaVendas();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível carregar.";
  }

  if (!dados) {
    return (
      <>
        <PageHeader eyebrow="Vendas" title="Inteligência de vendas" />
        <div className="system-error"><strong>Indisponível</strong><span>{erro}</span></div>
      </>
    );
  }

  const { kpis, travados, esfriando, ranking, topProdutos, parametros } = dados;

  return (
    <>
      <PageHeader eyebrow="Vendas" title="Inteligência de vendas">
        <p>Dinheiro parado, clientes esfriando e o mapa de quem compra — as duas eras (sistema anterior + XERP) somadas.</p>
      </PageHeader>

      <div className="kpi-row">
        <KpiCard label={`💰 Travado em orçamentos (${kpis.travadosQtd})`} value={kpis.valorTravadoFmt} tone="warn" />
        <KpiCard label={`🧊 Clientes esfriando (${kpis.esfriandoQtd})`} value={kpis.valorEmRiscoFmt} tone="danger" />
        <KpiCard label="Clientes ativos (90 dias)" value={String(kpis.clientesAtivos90)} tone="success" />
        <KpiCard label="Clientes com histórico" value={String(kpis.clientesComHistorico)} tone="info" />
      </div>

      <section className="erp-card" style={{ marginTop: 18 }}>
        <div className="erp-card-head">
          <h3>💰 Orçamentos travados</h3>
          <span style={{ fontSize: 12.5, color: "var(--erp-mute)" }}>em análise há {parametros.diasTravado}+ dias ou expirados — cada linha é dinheiro esperando um follow-up</span>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Número</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th className="num">Dias parado</th><th className="num">Valor</th><th className="actions">Ação</th></tr></thead>
            <tbody>
              {travados.map((o) => (
                <tr key={o.id}>
                  <td><Link className="mono bold link-detalhe" href={`/erp/orcamentos/${o.id}`}>{o.numero}</Link></td>
                  <td>{o.cliente}</td>
                  <td>{o.vendedor}</td>
                  <td><StatusBadge tone={o.status === "EXPIRADO" ? "danger" : "warn"}>{o.status === "EXPIRADO" ? "Expirado" : "Em análise"}</StatusBadge></td>
                  <td className="num">{o.diasParado}</td>
                  <td className="num"><strong>{o.valorFmt}</strong></td>
                  <td className="actions"><Link className="btn-erp ghost xs" href={`/erp/orcamentos/${o.id}`}>Abrir</Link></td>
                </tr>
              ))}
              {!travados.length && <tr><td colSpan={7}><div className="empty-st"><span>Nenhum orçamento travado — funil saudável! 🎉</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="erp-card" style={{ marginTop: 18 }}>
        <div className="erp-card-head">
          <h3>🧊 Clientes esfriando</h3>
          <span style={{ fontSize: 12.5, color: "var(--erp-mute)" }}>já compraram e estão há {parametros.diasEsfriando}+ dias sem comprar — ligue, mande um oi no zap</span>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Cliente</th><th className="num">Dias sem comprar</th><th className="num">Compras</th><th className="num">Total histórico</th><th>Última compra</th><th className="actions">Contato</th></tr></thead>
            <tbody>
              {esfriando.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.nome}</strong></td>
                  <td className="num" style={{ color: c.diasSemComprar > 180 ? "var(--erp-danger, #dc2626)" : undefined }}>{c.diasSemComprar}</td>
                  <td className="num">{c.compras}</td>
                  <td className="num"><strong>{c.totalFmt}</strong></td>
                  <td>{c.ultima}</td>
                  <td className="actions">
                    {c.fone && (
                      <a className="btn-erp ghost xs" href={`https://wa.me/55${c.fone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                        💬 WhatsApp
                      </a>
                    )}
                    {!c.fone && c.email && <span style={{ fontSize: 12 }}>{c.email}</span>}
                    {!c.fone && !c.email && <span className="block-muted">sem contato</span>}
                  </td>
                </tr>
              ))}
              {!esfriando.length && <tr><td colSpan={6}><div className="empty-st"><span>Ninguém esfriando por enquanto.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
        <section className="erp-card">
          <div className="erp-card-head"><h3>🏆 Maiores clientes (duas eras)</h3></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Cliente</th><th className="num">Sist. anterior</th><th className="num">XERP</th><th className="num">Total</th><th>Última</th></tr></thead>
              <tbody>
                {ranking.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong><small className="block-muted">{c.compras} compra(s)</small></td>
                    <td className="num">{c.legadoFmt}</td>
                    <td className="num">{c.xerpFmt}</td>
                    <td className="num"><strong>{c.totalFmt}</strong></td>
                    <td>{c.ultima}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="erp-card">
          <div className="erp-card-head"><h3>📦 O que mais vende (14 meses)</h3></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Produto</th><th className="num">Vendas</th><th className="num">Qtd</th><th className="num">Faturado</th></tr></thead>
              <tbody>
                {topProdutos.map((p, i) => (
                  <tr key={i}>
                    <td>{p.descricao}</td>
                    <td className="num">{p.vendas}</td>
                    <td className="num">{p.quantidade}</td>
                    <td className="num"><strong>{p.totalFmt}</strong></td>
                  </tr>
                ))}
                {!topProdutos.length && <tr><td colSpan={4}><div className="empty-st"><span>Sem histórico de itens.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
