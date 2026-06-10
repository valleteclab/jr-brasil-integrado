import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SpedDetalheAcoes } from "@/components/erp/sped/SpedDetalheAcoes";
import { SpedAnaliseIaCard } from "@/components/erp/sped/SpedAnaliseIaCard";
import { requireModulo } from "@/lib/auth/session";
import { getSpedArquivoDetalhe, isSpedHabilitado } from "@/domains/fiscal/application/sped-use-cases";
import type { SpedLinhaCfop } from "@/domains/fiscal/sped/types";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

function TabelaCfop({ titulo, linhas }: { titulo: string; linhas: SpedLinhaCfop[] }) {
  if (linhas.length === 0) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{titulo}</h3>
        <p style={{ color: "var(--jr-mute)", margin: 0 }}>Sem operações no período.</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{titulo}</h3>
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>CFOP</th>
              <th>CST</th>
              <th style={{ textAlign: "right" }}>Alíquota</th>
              <th style={{ textAlign: "right" }}>Valor operação</th>
              <th style={{ textAlign: "right" }}>Base ICMS</th>
              <th style={{ textAlign: "right" }}>ICMS</th>
              <th style={{ textAlign: "right" }}>Base ST</th>
              <th style={{ textAlign: "right" }}>ICMS-ST</th>
              <th style={{ textAlign: "right" }}>IPI</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.cfop}-${l.cstIcms}-${i}`}>
                <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.cfop}</td>
                <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.cstIcms}</td>
                <td style={{ textAlign: "right" }}>{l.aliquota.toFixed(2).replace(".", ",")}%</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.valorOperacao)}</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.baseIcms)}</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.valorIcms)}</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.baseIcmsSt)}</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.valorIcmsSt)}</td>
                <td style={{ textAlign: "right" }}>{formatBrl(l.valorIpi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function SpedDetalhePage({ params }: { params: { id: string } }) {
  const session = await requireModulo("sped-fiscal");
  if (!session.scope) throw new Error("Sessão sem empresa selecionada.");
  if (!(await isSpedHabilitado(session.scope.tenantId))) notFound();

  const arquivo = await getSpedArquivoDetalhe(session.scope, params.id);
  if (!arquivo) notFound();

  const r = arquivo.resumo;
  const icms = r?.apuracaoIcms;
  const enviado = arquivo.status === "ENVIADO_CONTADOR";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal · SPED Fiscal"
        title={`Apuração da competência ${arquivo.competencia}`}
        action={<Button href="/erp/sped-fiscal" variant="light">← Voltar</Button>}
      >
        <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge tone={enviado ? "success" : "info"}>
            {enviado ? "Enviado ao contador" : "Gerado"}
          </StatusBadge>
          <span>
            Leiaute {arquivo.versaoLeiaute} · perfil {arquivo.perfilArquivo} ·{" "}
            {arquivo.finalidade === "RETIFICADORA" ? "retificadora" : "original"} · {arquivo.totalLinhas} linhas
          </span>
        </p>
      </PageHeader>

      <div style={{ marginBottom: 16 }}>
        <SpedDetalheAcoes arquivoId={arquivo.id} enviado={enviado} />
      </div>

      {arquivo.avisos.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "4px solid var(--jr-warn)" }}>
          <h3 style={{ marginTop: 0 }}>Avisos da geração ({arquivo.avisos.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, color: "var(--jr-slate)", fontSize: 13 }}>
            {arquivo.avisos.map((aviso, i) => (
              <li key={i}>{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      <SpedAnaliseIaCard arquivoId={arquivo.id} analise={arquivo.analiseIa} />

      {icms && (
        <div className="kpi-row">
          <KpiCard label="Débitos de ICMS (saídas)" value={formatBrl(icms.debitos)} tone="warn" />
          <KpiCard label="Créditos de ICMS (entradas)" value={formatBrl(icms.creditos)} tone="success" />
          <KpiCard
            label="ICMS a recolher"
            value={formatBrl(icms.icmsARecolher)}
            tone={icms.icmsARecolher > 0 ? "danger" : "default"}
          />
          <KpiCard
            label="Saldo credor a transportar"
            value={formatBrl(icms.saldoCredorTransportar)}
            tone={icms.saldoCredorTransportar > 0 ? "info" : "default"}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        {icms && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Apuração do ICMS (registro E110)</h3>
            <table className="erp-table">
              <tbody>
                <tr><td>Débitos pelas saídas</td><td style={{ textAlign: "right" }}>{formatBrl(icms.debitos)}</td></tr>
                <tr><td>Créditos pelas entradas</td><td style={{ textAlign: "right" }}>{formatBrl(icms.creditos)}</td></tr>
                <tr><td>Saldo credor do período anterior</td><td style={{ textAlign: "right" }}>{formatBrl(icms.saldoCredorAnterior)}</td></tr>
                <tr><td><strong>Saldo apurado (devedor)</strong></td><td style={{ textAlign: "right" }}><strong>{formatBrl(icms.saldoApurado)}</strong></td></tr>
                <tr><td><strong>ICMS a recolher</strong></td><td style={{ textAlign: "right" }}><strong>{formatBrl(icms.icmsARecolher)}</strong></td></tr>
                <tr><td>Saldo credor a transportar</td><td style={{ textAlign: "right" }}>{formatBrl(icms.saldoCredorTransportar)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {r && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Documentos do período</h3>
            <table className="erp-table">
              <tbody>
                <tr><td>NF-e de saída</td><td style={{ textAlign: "right" }}>{r.documentos.saidasNfe}</td></tr>
                <tr><td>NFC-e de saída</td><td style={{ textAlign: "right" }}>{r.documentos.saidasNfce}</td></tr>
                <tr><td>Canceladas</td><td style={{ textAlign: "right" }}>{r.documentos.saidasCanceladas}</td></tr>
                <tr><td>Notas de entrada</td><td style={{ textAlign: "right" }}>{r.documentos.entradas}</td></tr>
                <tr><td>Valor das saídas</td><td style={{ textAlign: "right" }}>{formatBrl(r.documentos.valorSaidas)}</td></tr>
                <tr><td>Valor das entradas</td><td style={{ textAlign: "right" }}>{formatBrl(r.documentos.valorEntradas)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {r && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Outros tributos</h3>
            <table className="erp-table">
              <tbody>
                <tr>
                  <td>ICMS-ST destacado (substituto)</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(r.apuracaoIcmsSt.total)}</td>
                </tr>
                {r.apuracaoIpi ? (
                  <>
                    <tr><td>IPI — débitos</td><td style={{ textAlign: "right" }}>{formatBrl(r.apuracaoIpi.debitos)}</td></tr>
                    <tr><td>IPI — créditos</td><td style={{ textAlign: "right" }}>{formatBrl(r.apuracaoIpi.creditos)}</td></tr>
                    <tr><td>IPI — saldo devedor</td><td style={{ textAlign: "right" }}>{formatBrl(r.apuracaoIpi.saldoDevedor)}</td></tr>
                  </>
                ) : (
                  <tr><td>IPI</td><td style={{ textAlign: "right" }}>Sem movimento</td></tr>
                )}
                <tr><td>PIS — débitos / créditos (informativo)</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(r.pisCofins.debitosPis)} / {formatBrl(r.pisCofins.creditosPis)}</td></tr>
                <tr><td>COFINS — débitos / créditos (informativo)</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(r.pisCofins.debitosCofins)} / {formatBrl(r.pisCofins.creditosCofins)}</td></tr>
              </tbody>
            </table>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--jr-mute)" }}>
              PIS/COFINS são apurados na EFD Contribuições (arquivo separado) — aqui são apenas conferência.
            </p>
          </div>
        )}
      </div>

      {r && r.antecipacaoParcial && r.antecipacaoParcial.total > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            ICMS Antecipação Parcial — {formatBrl(r.antecipacaoParcial.total)}{" "}
            <StatusBadge tone={r.antecipacaoParcial.escriturada ? "success" : "warn"}>
              {r.antecipacaoParcial.escriturada ? "Escriturada (E111 + E116)" : "Apenas calculada"}
            </StatusBadge>
          </h3>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--jr-mute)" }}>
            Compras interestaduais para revenda: (alíquota interna − interestadual) sobre a aquisição.
            A guia é recolhida à parte (débito especial / E116) e o valor pago é creditado na apuração.
          </p>
          <table className="erp-table">
            <thead>
              <tr><th>Nota</th><th>Fornecedor</th><th style={{ textAlign: "right" }}>Base</th><th style={{ textAlign: "right" }}>Antecipação</th></tr>
            </thead>
            <tbody>
              {r.antecipacaoParcial.linhas.map((l, i) => (
                <tr key={`${l.numero}-${i}`}>
                  <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.numero}</td>
                  <td>{l.fornecedor}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(l.base)}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(l.valor)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}><strong>Total</strong></td>
                <td />
                <td style={{ textAlign: "right" }}><strong>{formatBrl(r.antecipacaoParcial.total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {r && r.apuracaoIcmsSt.porUf.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>ICMS-ST por UF (registros E200/E210)</h3>
          <table className="erp-table">
            <thead><tr><th>UF</th><th style={{ textAlign: "right" }}>Retenção no período</th></tr></thead>
            <tbody>
              {r.apuracaoIcmsSt.porUf.map((l) => (
                <tr key={l.uf}><td>{l.uf || "—"}</td><td style={{ textAlign: "right" }}>{formatBrl(l.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <TabelaCfop titulo="Saídas por CFOP × CST (registros C190)" linhas={r?.saidasPorCfop ?? []} />
        <TabelaCfop titulo="Entradas por CFOP × CST (registros C190)" linhas={r?.entradasPorCfop ?? []} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        {r && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Registros do arquivo</h3>
            <div className="erp-table-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
              <table className="erp-table">
                <thead><tr><th>Registro</th><th style={{ textAlign: "right" }}>Linhas</th></tr></thead>
                <tbody>
                  {r.registros.map((reg) => (
                    <tr key={reg.registro}>
                      <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{reg.registro}</td>
                      <td style={{ textAlign: "right" }}>{reg.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Reforma tributária (IBS/CBS/IS)</h3>
          <p style={{ color: "var(--jr-slate)", fontSize: 13 }}>
            {r?.reforma.observacao ??
              "CBS, IBS e IS não são escriturados na EFD ICMS/IPI no leiaute vigente."}
          </p>
          <p style={{ color: "var(--jr-mute)", fontSize: 12, margin: 0 }}>
            O gerador é versionado por leiaute (COD_VER) — quando a SEFAZ publicar os registros
            da reforma para a EFD, a competência passará a usar o novo leiaute automaticamente.
          </p>
        </div>
      </div>
    </>
  );
}
