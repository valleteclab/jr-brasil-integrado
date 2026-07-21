import Link from "next/link";

/**
 * HOME do plano EMISSOR DE NOTAS (server component, dados vêm da page /erp): foco total em
 * emitir — atalhos grandes, notas do mês, saúde do certificado A1 e o resumo do Simples/MEI.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type EmissorHomeData = {
  empresaNome: string;
  notasMes: { quantidade: number; valor: number };
  ultimasNotas: Array<{ id: string; numero: string; modelo: string; status: string; total: number; emitidaEm: string | null }>;
  certificado: { configurado: boolean; validade: string | null; diasParaVencer: number | null };
  /** Checklist do que falta configurar para emitir (endereço, A1, IE/IM). */
  setup: { completo: boolean; pendencias: Array<{ titulo: string; descricao: string; link: string; obrigatorio: boolean }> };
  /** Mês anterior pronto pro link do pacote do contador. */
  mesAnterior: { mes: number; ano: number; label: string };
  simples: {
    regime: string;
    receitaMes: number;
    das: number | null;
    mei: { limite: number; acumuladoAno: number; percentualConsumido: number; projecaoAnual: number; excedeu: boolean } | null;
    alertas: string[];
  } | null;
};

const STATUS_TONE: Record<string, string> = { AUTORIZADA: "success", CANCELADA: "danger", REJEITADA: "danger", SUBSTITUIDA: "mute", RASCUNHO: "mute" };

export function EmissorHome({ data, modulos = [] }: { data: EmissorHomeData; modulos?: string[] }) {
  // Atalhos por módulo do PERFIL (igual ao menu): NF-e é nota de PRODUTO → exige "produtos";
  // NFS-e → "fiscal"; Clientes → "clientes". Lista vazia (retrocompat) mostra tudo.
  const tem = (m: string) => modulos.length === 0 || modulos.includes(m);
  const cert = data.certificado;
  const certTone = !cert.configurado ? "danger" : cert.diasParaVencer != null && cert.diasParaVencer < 0 ? "danger" : cert.diasParaVencer != null && cert.diasParaVencer <= 30 ? "warn" : "success";
  const certLabel = !cert.configurado
    ? "Certificado A1 não configurado"
    : cert.diasParaVencer != null && cert.diasParaVencer < 0
      ? "Certificado A1 VENCIDO"
      : cert.diasParaVencer != null && cert.diasParaVencer <= 30
        ? `Certificado vence em ${cert.diasParaVencer} dia(s)`
        : `Certificado válido${cert.validade ? ` até ${new Date(cert.validade).toLocaleDateString("pt-BR")}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">Emissor de Notas</div>
          <h1 className="erp-page-title">Olá! O que vamos emitir hoje?</h1>
          <p className="erp-page-sub">{data.empresaNome} · NF-e e NFS-e direto na SEFAZ/SEFIN, com PDF na hora.</p>
        </div>
      </div>

      {/* Checklist de configuração: aparece até a empresa estar pronta para emitir */}
      {!data.setup.completo && (
        <div className="erp-card" style={{ padding: 18, border: "2px solid #f59e0b", background: "#fffbeb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26 }} aria-hidden="true">🚀</span>
            <div>
              <strong style={{ fontSize: 16 }}>Complete a configuração para emitir suas notas</strong>
              <div className="block-muted" style={{ fontSize: 12.5 }}>
                A SEFAZ exige o cadastro completo da empresa. Falta pouco — resolva os itens abaixo:
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {data.setup.pendencias.map((p) => (
              <div key={p.titulo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ flex: 1, minWidth: 220 }}>
                  <strong style={{ fontSize: 13.5 }}>{p.obrigatorio ? "⬜" : "▫️"} {p.titulo}</strong>
                  {!p.obrigatorio && <span style={{ marginLeft: 6, fontSize: 11, background: "#f1f5f9", borderRadius: 999, padding: "1px 8px", color: "#475569" }}>recomendado</span>}
                  <br /><span className="block-muted" style={{ fontSize: 12 }}>{p.descricao}</span>
                </span>
                <Link href={p.link} className="btn-erp primary sm">Resolver →</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atalhos grandes de emissão (por módulo do perfil) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {tem("fiscal") && (
          <Link href="/erp/fiscal/emitir/nfse" className="erp-card" style={{ padding: 22, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 34 }} aria-hidden="true">📑</span>
            <span>
              <strong style={{ fontSize: 16 }}>Emitir NFS-e</strong>
              <br /><span className="block-muted" style={{ fontSize: 12 }}>Nota de serviço (padrão nacional)</span>
            </span>
          </Link>
        )}
        {tem("produtos") && (
          <Link href="/erp/fiscal/emitir" className="erp-card" style={{ padding: 22, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 34 }} aria-hidden="true">🧾</span>
            <span>
              <strong style={{ fontSize: 16 }}>Emitir NF-e</strong>
              <br /><span className="block-muted" style={{ fontSize: 12 }}>Nota de produto (modelo 55)</span>
            </span>
          </Link>
        )}
        {tem("clientes") && (
          <Link href="/erp/clientes" className="erp-card" style={{ padding: 22, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 34 }} aria-hidden="true">👥</span>
            <span>
              <strong style={{ fontSize: 16 }}>Clientes</strong>
              <br /><span className="block-muted" style={{ fontSize: 12 }}>Cadastrar tomadores/destinatários</span>
            </span>
          </Link>
        )}
      </div>

      {/* Certificado A1 (o checklist acima já cobre quando a configuração está incompleta) */}
      {data.setup.completo && (
        <div className={`alert ${certTone === "success" ? "success" : certTone === "warn" ? "warn" : "danger"}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>🔐 {certLabel}</span>
          <Link href="/erp/configuracoes/fiscal" className="btn-erp light xs">Gerenciar certificado</Link>
        </div>
      )}

      {/* KPIs do mês */}
      <div className="kpi-row">
        <div className="kpi"><span className="kpi-label">Notas autorizadas no mês</span><strong>{data.notasMes.quantidade}</strong></div>
        <div className="kpi"><span className="kpi-label">Valor emitido no mês</span><strong>{brl(data.notasMes.valor)}</strong></div>
        {data.simples?.mei && (
          <div className="kpi">
            <span className="kpi-label">Limite MEI consumido</span>
            <strong style={{ color: data.simples.mei.excedeu ? "#c62828" : data.simples.mei.percentualConsumido >= 80 ? "#b45309" : "inherit" }}>
              {data.simples.mei.percentualConsumido.toFixed(0)}%
            </strong>
          </div>
        )}
        {data.simples && !data.simples.mei && data.simples.das != null && (
          <div className="kpi"><span className="kpi-label">DAS estimado do mês</span><strong>{brl(data.simples.das)}</strong></div>
        )}
      </div>

      {/* Painel MEI (barra de limite) */}
      {data.simples?.mei && (
        <div className="erp-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>Limite anual do MEI</strong>
            <Link href="/erp/fiscal/simples" className="btn-erp ghost xs">Ver painel completo →</Link>
          </div>
          <div style={{ marginTop: 10, background: "var(--erp-line, #e2e8f0)", borderRadius: 8, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, data.simples.mei.percentualConsumido)}%`, height: "100%", background: data.simples.mei.excedeu ? "#dc2626" : data.simples.mei.percentualConsumido >= 80 ? "#f59e0b" : "#16a34a" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }} className="block-muted">
            <span>{brl(data.simples.mei.acumuladoAno)} faturados</span>
            <span>projeção {brl(data.simples.mei.projecaoAnual)} · limite {brl(data.simples.mei.limite)}</span>
          </div>
          {data.simples.alertas.slice(0, 2).map((a, i) => <div key={i} className="alert warn" style={{ marginTop: 8 }}>{a}</div>)}
        </div>
      )}

      {/* Pacote do contador */}
      <div className="erp-card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span>
          <strong>📦 Pacote do contador</strong>
          <br /><span className="block-muted" style={{ fontSize: 12 }}>Baixe o ZIP com todos os XMLs do mês para enviar à contabilidade.</span>
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <a className="btn-erp light sm" href={`/api/erp/fiscal/pacote-contador?mes=${data.mesAnterior.mes}&ano=${data.mesAnterior.ano}`}>⬇ {data.mesAnterior.label}</a>
          <a className="btn-erp primary sm" href="/api/erp/fiscal/pacote-contador">⬇ Mês atual</a>
        </span>
      </div>

      {/* Últimas notas */}
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead><tr><th>Nota</th><th>Modelo</th><th className="num">Valor</th><th>Situação</th><th>Emitida em</th></tr></thead>
          <tbody>
            {data.ultimasNotas.map((n) => (
              <tr key={n.id}>
                <td><Link href={`/erp/fiscal/${n.id}`} style={{ fontWeight: 600 }}>{n.numero || "—"}</Link></td>
                <td>{n.modelo}</td>
                <td className="num">{brl(n.total)}</td>
                <td><span className={`pill ${STATUS_TONE[n.status] ?? "mute"}`}><span className="dot" />{n.status}</span></td>
                <td>{n.emitidaEm ? new Date(n.emitidaEm).toLocaleString("pt-BR") : "—"}</td>
              </tr>
            ))}
            {!data.ultimasNotas.length && (
              <tr><td colSpan={5}><div className="empty-st"><h4>Nenhuma nota ainda</h4><p>Use os botões acima para emitir a primeira.</p></div></td></tr>
            )}
          </tbody>
        </table>
        <div className="erp-table-foot"><Link href="/erp/fiscal">Ver todas as notas →</Link></div>
      </div>
    </div>
  );
}
