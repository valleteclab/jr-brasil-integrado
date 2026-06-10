import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { Button } from "@/components/shared/Button";
import { SpedGerarForm } from "@/components/erp/sped/SpedGerarForm";
import { SpedArquivosList } from "@/components/erp/sped/SpedArquivosList";
import { SpedXmlImport } from "@/components/erp/sped/SpedXmlImport";
import { requireModulo } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";
import {
  getSpedConfiguracao,
  isSpedHabilitado,
  listSpedArquivos,
  listSpedXmlDocumentos,
  type SpedArquivoSummary,
  type SpedXmlSummary
} from "@/domains/fiscal/application/sped-use-cases";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

export default async function SpedFiscalPage() {
  const session = await requireModulo("sped-fiscal");
  if (!session.scope) throw new Error("Sessão sem empresa selecionada.");

  const habilitado = await isSpedHabilitado(session.scope.tenantId);
  if (!habilitado) {
    return (
      <>
        <PageHeader eyebrow="Financeiro & Fiscal" title="SPED Fiscal" />
        <div className="card" style={{ padding: 24, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Módulo não liberado</h3>
          <p style={{ color: "var(--jr-slate)" }}>
            O SPED Fiscal (EFD ICMS/IPI) é um módulo adicional liberado pela plataforma.
            Fale com o suporte para habilitar a geração do arquivo mensal para o contador.
          </p>
        </div>
      </>
    );
  }

  let arquivos: SpedArquivoSummary[] = [];
  let xmlDocs: SpedXmlSummary[] = [];
  let contadorOk = true;
  let loadError = "";
  try {
    const [lista, config, xmls] = await Promise.all([
      listSpedArquivos(session.scope),
      getSpedConfiguracao(session.scope),
      listSpedXmlDocumentos(session.scope)
    ]);
    arquivos = lista;
    xmlDocs = xmls;
    contadorOk = Boolean(config.contadorNome && config.contadorCpf && config.contadorCrc);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os arquivos SPED.";
  }

  const isAdmin = isAdminPerfil(session.perfilNome);
  const ultimo = arquivos[0] ?? null;
  const enviados = arquivos.filter((a) => a.status === "ENVIADO_CONTADOR").length;

  // Competência sugerida: mês anterior (o SPED é gerado no fechamento do mês).
  const hoje = new Date();
  const sugestao = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal"
        title="SPED Fiscal (EFD ICMS/IPI)"
        action={<Button href="/erp/sped-fiscal/configuracao" variant="light">Configurações do SPED</Button>}
      >
        <p>
          Gere o arquivo mensal da Escrituração Fiscal Digital, confira a apuração de ICMS/IPI
          e envie o .txt ao contador para validação no PVA e transmissão.
        </p>
      </PageHeader>

      <div className="kpi-row">
        <KpiCard label="Arquivos gerados" value={String(arquivos.length)} tone="info" />
        <KpiCard label="Enviados ao contador" value={String(enviados)} tone="success" />
        <KpiCard
          label={ultimo ? `ICMS a recolher (${ultimo.competencia})` : "ICMS a recolher"}
          value={ultimo ? formatBrl(ultimo.icmsARecolher) : "—"}
          tone={ultimo && ultimo.icmsARecolher > 0 ? "warn" : "default"}
        />
        <KpiCard
          label={ultimo ? `Avisos (${ultimo.competencia})` : "Avisos"}
          value={ultimo ? String(ultimo.totalAvisos) : "—"}
          tone={ultimo && ultimo.totalAvisos > 0 ? "danger" : "default"}
        />
      </div>

      {!contadorOk && (
        <div className="system-error" style={{ marginBottom: 16 }}>
          <strong>Dados do contador pendentes</strong>
          <span>
            O registro 0100 (contador) é obrigatório no arquivo. Preencha em{" "}
            <a href="/erp/sped-fiscal/configuracao">Configurações do SPED</a> antes de entregar o arquivo.
          </span>
        </div>
      )}

      {loadError && (
        <div className="system-error" style={{ marginBottom: 16 }}>
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Gerar arquivo da competência</h3>
        <SpedGerarForm anoInicial={sugestao.getFullYear()} mesInicial={sugestao.getMonth() + 1} />
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--jr-mute)" }}>
          Regerar uma competência substitui o arquivo anterior. Use “Retificadora” apenas se o
          arquivo original já foi transmitido à SEFAZ pelo contador.
        </p>
      </div>

      <SpedXmlImport documentos={xmlDocs} />

      <SpedArquivosList arquivos={arquivos} isAdmin={isAdmin} />
    </>
  );
}
