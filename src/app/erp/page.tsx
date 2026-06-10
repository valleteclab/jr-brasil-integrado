import { getDashboardData } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long"
});

function statusPedidoLabel(status: string): string {
  const map: Record<string, string> = {
    RASCUNHO: "Rascunho",
    AGUARDANDO_PAGAMENTO: "Ag. Pagamento",
    AGUARDANDO_NOTA: "Ag. Nota",
    SEPARACAO: "Separação",
    ENVIADO: "Enviado",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado"
  };
  return map[status] ?? status;
}

type PillTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";

function statusPedidoTone(status: string): PillTone {
  const map: Record<string, PillTone> = {
    RASCUNHO: "mute",
    AGUARDANDO_PAGAMENTO: "warn",
    AGUARDANDO_NOTA: "info",
    SEPARACAO: "violet",
    ENVIADO: "success",
    ENTREGUE: "success",
    CANCELADO: "danger"
  };
  return map[status] ?? "mute";
}

function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

function Donut({
  segments,
  size = 140,
  thickness = 22,
  center
}: {
  segments: Array<{ valor: number; cor: string }>;
  size?: number;
  thickness?: number;
  center: React.ReactNode;
}) {
  const r = size / 2 - thickness / 2;
  const total = segments.reduce((s, x) => s + Math.abs(x.valor), 0) || 1;
  const circ = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (Math.abs(s.valor) / total) * circ;
          const dash = `${len} ${circ - len}`;
          const off = -acc;
          acc += len;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.cor}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={off}
            />
          );
        })}
      </svg>
      <div className="center">{center}</div>
    </div>
  );
}

export default async function ErpDashboardPage() {
  let data;
  let loadError = "";

  try {
    data = await getDashboardData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o dashboard.";
  }

  if (loadError || !data) {
    return (
      <>
        <div className="erp-page-head">
          <div>
            <div className="erp-crumbs">XERP <span className="sep">/</span> Dashboard</div>
            <h1 className="erp-page-title">Visão geral</h1>
            <p className="erp-page-sub">Status operacional, financeiro e comercial em tempo real.</p>
          </div>
        </div>
        <div className="alert danger">
          <span className="lead">Banco de dados indisponível:</span> {loadError || "Erro desconhecido ao carregar dados."}
        </div>
      </>
    );
  }

  const {
    vendasMes,
    aReceberAberto,
    aPagarAberto,
    notasAutorizadasMes,
    itensCriticos,
    pedidosRecentes,
    osAbertas,
    erros
  } = data;

  const totalReceber = aReceberAberto?.totalNum ?? 0;
  const totalPagar = aPagarAberto?.totalNum ?? 0;
  const saldoPrevisto = totalReceber - totalPagar;
  const saldoFmt = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(saldoPrevisto);

  const dataLonga = DATA_LONGA.format(new Date());
  const tituloData = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1);

  const criticosTop = itensCriticos?.top5 ?? [];
  const zerados = criticosTop.filter((i) => i.saldoAtual <= 0).length;

  return (
    <>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">XERP <span className="sep">/</span> Dashboard</div>
          <h1 className="erp-page-title">Visão geral · {tituloData}</h1>
          <p className="erp-page-sub">Status operacional, financeiro e comercial em tempo real.</p>
        </div>
        <div className="erp-page-actions">
          <a className="btn-erp ghost sm" href="/erp/financeiro">Ver financeiro</a>
          <a className="btn-erp primary sm" href="/erp/atendimento">+ Novo atendimento</a>
        </div>
      </div>

      {erros.length > 0 && (
        <div className="alert warn">
          <span className="lead">Atenção:</span>
          <span>
            Alguns módulos retornaram erro — dados parciais podem estar sendo exibidos ({erros.join(" · ")}).
          </span>
        </div>
      )}

      {/* KPI row — financeiro / comercial */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="l">Vendas no mês</div>
          <div className="v">{vendasMes ? vendasMes.total : "—"}</div>
          <div className="d flat">{vendasMes ? `${vendasMes.contagem} pedido(s) no período` : "Sem dados"}</div>
        </div>
        <div className="kpi">
          <div className="l">NF-e autorizadas (mês)</div>
          <div className="v">{notasAutorizadasMes ? String(notasAutorizadasMes.contagem) : "—"}</div>
          <div className="d flat">{notasAutorizadasMes ? notasAutorizadasMes.valor : "Sem dados"}</div>
        </div>
        <div className="kpi">
          <div className="l">A receber (aberto)</div>
          <div className="v">{aReceberAberto ? aReceberAberto.total : "—"}</div>
          <div className="d flat">Contas em aberto e parciais</div>
        </div>
        <div className="kpi accent">
          <div className="l">A pagar (aberto)</div>
          <div className="v">{aPagarAberto ? aPagarAberto.total : "—"}</div>
          <div className="d flat" style={{ color: "rgba(0,0,0,.65)" }}>Contas em aberto e parciais</div>
        </div>
      </div>

      {/* Fluxo de caixa */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="erp-card">
          <div className="erp-card-head">
            <h3>Fluxo de caixa (contas em aberto)</h3>
            <a className="btn-erp link" href="/erp/financeiro">Ver financeiro</a>
          </div>
          <div className="erp-card-body" style={{ display: "grid", placeItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Donut
                segments={[
                  { valor: totalReceber, cor: "#16A34A" },
                  { valor: totalPagar, cor: "#DC2626" }
                ]}
                center={
                  <>
                    <b>{saldoFmt}</b>
                    <span>Saldo previsto</span>
                  </>
                }
              />
              <div className="donut-legend">
                <div>
                  <span className="sw" style={{ background: "#16A34A" }} /> A receber
                  <br />
                  <b style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                    {aReceberAberto ? aReceberAberto.total : "—"}
                  </b>
                </div>
                <div>
                  <span className="sw" style={{ background: "#DC2626" }} /> A pagar
                  <br />
                  <b style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                    {aPagarAberto ? aPagarAberto.total : "—"}
                  </b>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI operacional em coluna */}
        <div className="erp-card">
          <div className="erp-card-head">
            <h3>Operação</h3>
          </div>
          <div className="erp-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="kpi">
              <div className="l">OS em aberto</div>
              <div className="v">{osAbertas ? String(osAbertas.contagem) : "—"}</div>
              <div className="d flat">Não faturadas / não canceladas</div>
            </div>
            <div className="kpi">
              <div className="l">Estoque crítico</div>
              <div className="v">{itensCriticos ? String(itensCriticos.contagem) : "—"}</div>
              <div className="d flat">{`${zerados} zerado(s) no top 5`}</div>
            </div>
            <div className="kpi">
              <div className="l">Pedidos recentes</div>
              <div className="v">{pedidosRecentes ? String(pedidosRecentes.length) : "—"}</div>
              <div className="d flat">Últimos lançamentos</div>
            </div>
            <div className="kpi dark">
              <div className="l">Saldo previsto</div>
              <div className="v">{saldoFmt}</div>
              <div className="d flat" style={{ color: "var(--erp-mute)" }}>A receber − a pagar</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabelas: pedidos recentes + estoque crítico */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <div className="erp-card">
          <div className="erp-card-head">
            <h3>Pedidos recentes</h3>
            <a className="btn-erp link" href="/erp/vendas">Ver todos</a>
          </div>
          {!pedidosRecentes || pedidosRecentes.length === 0 ? (
            <div className="empty-st">
              <h4>Sem pedidos</h4>
              <p>Nenhum pedido registrado ainda.</p>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecentes.map((pedido) => (
                  <tr key={pedido.id}>
                    <td className="mono bold" style={{ color: "var(--erp-info)" }}>{pedido.numero}</td>
                    <td>{pedido.cliente}</td>
                    <td>
                      <StatusPill tone={statusPedidoTone(pedido.status)}>{statusPedidoLabel(pedido.status)}</StatusPill>
                    </td>
                    <td className="num bold">{pedido.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="erp-card">
          <div className="erp-card-head">
            <h3>Estoque crítico</h3>
            <a className="btn-erp link" href="/erp/estoque">Ver tudo</a>
          </div>
          {criticosTop.length === 0 ? (
            <div className="empty-st">
              <h4>Tudo em ordem</h4>
              <p>Nenhum item com estoque crítico no momento.</p>
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th className="num">Saldo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {criticosTop.map((item) => (
                  <tr key={item.id}>
                    <td className="mono bold">{item.sku}</td>
                    <td>
                      {item.nome}
                      <span className="sublabel">Mínimo {item.minimo}</span>
                    </td>
                    <td
                      className="num bold"
                      style={{ color: item.saldoAtual <= 0 ? "var(--erp-danger)" : "var(--erp-warn)" }}
                    >
                      {item.saldoAtual}
                    </td>
                    <td>
                      <StatusPill tone={item.saldoAtual <= 0 ? "danger" : "warn"}>
                        {item.saldoAtual <= 0 ? "Zerado" : "Crítico"}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {itensCriticos && itensCriticos.contagem > criticosTop.length && (
            <div style={{ padding: "10px 16px", fontSize: 11.5, color: "var(--erp-slate)" }}>
              {itensCriticos.contagem - criticosTop.length} outro(s) item(ns) crítico(s) não exibido(s).{" "}
              <a className="ext-link" href="/erp/estoque">Ver estoque completo</a>
            </div>
          )}
        </div>
      </div>

      {/* OS em aberto */}
      {osAbertas && osAbertas.contagem > 0 && (
        <div className="erp-card" style={{ marginTop: 14 }}>
          <div className="erp-card-head">
            <h3>Ordens de serviço em aberto</h3>
            <a className="btn-erp link" href="/erp/os">Gerenciar OS</a>
          </div>
          <div className="erp-card-body">
            Há <strong>{osAbertas.contagem}</strong> ordem{osAbertas.contagem !== 1 ? "s" : ""} de serviço não
            faturada{osAbertas.contagem !== 1 ? "s" : ""}.
          </div>
        </div>
      )}
    </>
  );
}
