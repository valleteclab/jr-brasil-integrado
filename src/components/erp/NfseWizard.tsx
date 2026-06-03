"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";
import { sugerirPorLc116 } from "@/domains/fiscal/nbs";

/**
 * Wizard de emissão de NFS-e inspirado no Emissor Nacional (gov.br): passo a passo
 * Pessoas → Serviço → Valores → Emitir, com a terminologia oficial. Reaproveita o backend
 * de emissão avulsa (`POST /api/erp/fiscal/emitir/servico`).
 */

type Cliente = EmissaoFormData["clientes"][number];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const STEPS = ["Pessoas", "Serviço", "Valores", "Emitir NFS-e"];

const TIPOS_OPERACAO: Array<{ id: string; label: string }> = [
  { id: "taxationInMunicipality", label: "Operação tributável (no município)" },
  { id: "taxationOutsideMunicipality", label: "Operação tributável (fora do município)" },
  { id: "exemption", label: "Isenção" },
  { id: "immune", label: "Imunidade" },
  { id: "exportation", label: "Exportação de serviço" },
  { id: "nonIncidence", label: "Não incidência do ISSQN" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type TomadorModo = "cadastrado" | "brasil" | "naoInformado";

type Resultado = {
  id: string;
  status: string;
  numero?: string | null;
  chaveAcesso?: string | null;
  motivo?: string | null;
};

function statusTone(status: string): string {
  const map: Record<string, string> = {
    AUTORIZADA: "success",
    REJEITADA: "danger",
    ERRO: "danger",
    PROCESSANDO: "warn",
    RASCUNHO: "warn"
  };
  return map[status.toUpperCase()] ?? "default";
}

export function NfseWizard({ data }: { data: EmissaoFormData }) {
  const router = useRouter();
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Passo 1 — Pessoas
  const [dataCompetencia, setDataCompetencia] = useState(hoje);
  const [tomadorModo, setTomadorModo] = useState<TomadorModo>("cadastrado");
  const [clienteId, setClienteId] = useState("");
  const [tNome, setTNome] = useState("");
  const [tDocumento, setTDocumento] = useState("");
  const [tIe, setTIe] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tLogradouro, setTLogradouro] = useState("");
  const [tNumero, setTNumero] = useState("");
  const [tComplemento, setTComplemento] = useState("");
  const [tBairro, setTBairro] = useState("");
  const [tCep, setTCep] = useState("");
  const [tCidade, setTCidade] = useState("");
  const [tUf, setTUf] = useState(data.emitterUf ?? "");

  // Passo 2 — Serviço
  const [codigoLc116, setCodigoLc116] = useState("");
  const [descricao, setDescricao] = useState("");
  const [itemNbs, setItemNbs] = useState("");
  const [cClassTrib, setCClassTrib] = useState("");
  const [codigoInterno, setCodigoInterno] = useState("");

  // Sugestões de NBS e cClassTrib a partir do LC 116 escolhido (tabela oficial de correlação).
  const sugestao = useMemo(() => sugerirPorLc116(codigoLc116), [codigoLc116]);

  // Ao trocar o LC 116, pré-seleciona o NBS e o cClassTrib padrão da correlação (sem sobrescrever
  // uma escolha que ainda esteja entre as opções sugeridas).
  function aoTrocarLc116(novo: string) {
    setCodigoLc116(novo);
    const s = sugerirPorLc116(novo);
    if (s) {
      if (s.nbsPadrao && !s.nbs.some((n) => n.code === itemNbs.replace(/\D/g, ""))) setItemNbs(s.nbsPadrao);
      if (s.classTribPadrao && !s.classTrib.some((c) => c.code === cClassTrib)) setCClassTrib(s.classTribPadrao);
    }
  }

  // Passo 3 — Valores
  const [valorServico, setValorServico] = useState(0);
  const [descontoIncondicionado, setDescontoIncondicionado] = useState(0);
  const [descontoCondicionado, setDescontoCondicionado] = useState(0);
  const [deducaoBc, setDeducaoBc] = useState(0);
  const [tipoOperacao, setTipoOperacao] = useState("taxationInMunicipality");
  const [aliquotaIss, setAliquotaIss] = useState(0);
  const [suspensao, setSuspensao] = useState(false);
  const [suspensaoTipo, setSuspensaoTipo] = useState("suspendedByCourt");
  const [suspensaoProcesso, setSuspensaoProcesso] = useState("");
  const [issRetido, setIssRetido] = useState(false);
  const [issRetidoPor, setIssRetidoPor] = useState("tomador");
  // Tributação federal (retenções)
  const [retIr, setRetIr] = useState(0);
  const [retCsll, setRetCsll] = useState(0);
  const [retInss, setRetInss] = useState(0);
  const [retPis, setRetPis] = useState(0);
  const [retCofins, setRetCofins] = useState(0);
  const [baseRetencao, setBaseRetencao] = useState(0);
  // Outros
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const cliente: Cliente | null = useMemo(
    () => data.clientes.find((c) => c.id === clienteId) ?? null,
    [data.clientes, clienteId]
  );

  // Exigibilidade suspensa não permite retenção de ISSQN (regra do Emissor Nacional).
  const exigibilidadeSuspensa = suspensao;
  const tributavel = tipoOperacao === "taxationInMunicipality" || tipoOperacao === "taxationOutsideMunicipality";

  const baseIss = useMemo(
    () => Math.max(valorServico - descontoIncondicionado - deducaoBc, 0),
    [valorServico, descontoIncondicionado, deducaoBc]
  );
  const valorIss = useMemo(
    () => (tributavel && !exigibilidadeSuspensa ? Math.round(baseIss * (aliquotaIss / 100) * 100) / 100 : 0),
    [tributavel, exigibilidadeSuspensa, baseIss, aliquotaIss]
  );
  const baseRetencaoEfetiva = baseRetencao > 0 ? baseRetencao : valorServico;
  const totalFederalRetido = useMemo(
    () => Math.round(baseRetencaoEfetiva * ((retIr + retCsll + retInss + retPis + retCofins) / 100) * 100) / 100,
    [baseRetencaoEfetiva, retIr, retCsll, retInss, retPis, retCofins]
  );
  const issRetidoValor = issRetido && !exigibilidadeSuspensa ? valorIss : 0;
  const valorLiquido = Math.max(valorServico - descontoIncondicionado - descontoCondicionado - totalFederalRetido, 0);

  function stepError(s: number): string {
    if (s === 0) {
      if (!dataCompetencia) return "Informe a Data de Competência.";
      if (tomadorModo === "cadastrado" && !clienteId) return "Selecione o tomador (cliente cadastrado) ou troque o tipo de tomador.";
      if (tomadorModo === "brasil" && !tNome.trim()) return "Informe o nome/razão social do tomador.";
    }
    if (s === 1) {
      if (!codigoLc116) return "Selecione o Código de Tributação Nacional (LC 116).";
      if (!descricao.trim()) return "Informe a Descrição do Serviço.";
    }
    if (s === 2) {
      if (valorServico <= 0) return "Informe o Valor do Serviço.";
      // Município no Ambiente Nacional: a alíquota é definida pelo sistema — não exigir.
      if (data.nfseAmbienteNacional !== true && tributavel && !exigibilidadeSuspensa && aliquotaIss <= 0) return "Informe a Alíquota do ISSQN.";
    }
    return "";
  }

  function avancar() {
    const e = stepError(step);
    if (e) { setError(e); return; }
    setError("");
    setStep((v) => Math.min(v + 1, STEPS.length - 1));
  }
  function voltar() { setError(""); setStep((v) => Math.max(v - 1, 0)); }
  function irPara(s: number) { setError(""); setStep(s); }

  function buildReceiver() {
    if (tomadorModo === "cadastrado") return { clienteId };
    if (tomadorModo === "naoInformado") return { nome: "Tomador não informado" };
    return {
      nome: tNome.trim(),
      documento: tDocumento.trim() || undefined,
      inscricaoEstadual: tIe.trim() || undefined,
      email: tEmail.trim() || undefined,
      endereco: {
        logradouro: tLogradouro.trim() || undefined,
        numero: tNumero.trim() || undefined,
        complemento: tComplemento.trim() || undefined,
        bairro: tBairro.trim() || undefined,
        cep: tCep.trim() || undefined,
        cidade: tCidade.trim() || undefined,
        uf: tUf.trim() || undefined
      }
    };
  }

  async function emitir() {
    for (let s = 0; s <= 2; s += 1) {
      const e = stepError(s);
      if (e) { setError(e); setStep(s); return; }
    }
    setSaving(true);
    setError("");
    try {
      const obsPartes: string[] = [];
      if (observacoes.trim()) obsPartes.push(observacoes.trim());
      if (descontoCondicionado > 0) obsPartes.push(`Desconto condicionado: ${brl(descontoCondicionado)}.`);
      if (exigibilidadeSuspensa) {
        const tipoLabel = suspensaoTipo === "suspendedByCourt" ? "judicial" : "administrativa";
        obsPartes.push(`Exigibilidade do ISSQN suspensa (${tipoLabel})${suspensaoProcesso ? ` — processo ${suspensaoProcesso}` : ""}.`);
      }
      if (issRetido && !exigibilidadeSuspensa) {
        obsPartes.push(`ISSQN retido pelo ${issRetidoPor === "tomador" ? "tomador" : "intermediário"}.`);
      }
      if (codigoInterno.trim()) obsPartes.push(`Código interno: ${codigoInterno.trim()}.`);

      const taxationType = exigibilidadeSuspensa ? suspensaoTipo : tipoOperacao;

      const body = {
        receiver: buildReceiver(),
        codigoServicoLc116: codigoLc116,
        codigoNbs: itemNbs.replace(/\D/g, "") || undefined,
        aliquotaIss: aliquotaIss > 0 ? aliquotaIss : undefined,
        deducoes: descontoIncondicionado + deducaoBc > 0 ? descontoIncondicionado + deducaoBc : undefined,
        taxationType,
        condicaoPagamento: condicaoPagamento.trim() || undefined,
        observacoes: obsPartes.join(" ") || undefined,
        dataCompetencia,
        servicos: [{ descricao: descricao.trim(), valor: valorServico, codigoServicoLc116: codigoLc116, codigoNbs: itemNbs.replace(/\D/g, "") || undefined, cClassTrib: cClassTrib.trim() || undefined }],
        retencoes: {
          issRetido: issRetido && !exigibilidadeSuspensa,
          baseRetencao: baseRetencao > 0 ? baseRetencao : undefined,
          ir: retIr > 0 ? { aliquota: retIr } : undefined,
          csll: retCsll > 0 ? { aliquota: retCsll } : undefined,
          inss: retInss > 0 ? { aliquota: retInss } : undefined,
          pis: retPis > 0 ? { aliquota: retPis } : undefined,
          cofins: retCofins > 0 ? { aliquota: retCofins } : undefined
        }
      };

      const res = await fetch("/api/erp/fiscal/emitir/servico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await res.json()) as Resultado & { error?: string };
      if (!res.ok) throw new Error(payload.error || "Não foi possível emitir a NFS-e.");
      setResultado({ id: payload.id, status: payload.status, numero: payload.numero, chaveAcesso: payload.chaveAcesso, motivo: payload.motivo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível emitir a NFS-e.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Tela final: NFS-e gerada ----
  if (resultado) {
    const autorizada = resultado.status.toUpperCase() === "AUTORIZADA";
    return (
      <div className="erp-card" style={{ maxWidth: 720 }}>
        <div className="erp-card-head"><h3>{autorizada ? "NFS-e gerada com sucesso" : "Resultado da emissão"}</h3></div>
        <div className="erp-card-body">
          <div className={`alert ${autorizada ? "success" : statusTone(resultado.status) === "danger" ? "danger" : "warn"}`} style={{ marginBottom: 16 }}>
            <span className="lead">
              <span className={`pill ${statusTone(resultado.status)}`}><span className="dot" />{resultado.status}</span>
            </span>
            <span>
              {autorizada
                ? `NFS-e nº ${resultado.numero ?? "—"} autorizada.`
                : resultado.motivo || "A NFS-e não foi autorizada. Verifique os dados e tente novamente."}
            </span>
          </div>
          {resultado.chaveAcesso && (
            <p style={{ fontSize: 13 }}><b>Chave de acesso:</b> <span className="mono">{resultado.chaveAcesso}</span></p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="btn-erp primary sm" onClick={() => router.push("/erp/fiscal")}>NFS-e emitidas</button>
            <button type="button" className="btn-erp ghost sm" onClick={() => router.refresh()}>Nova NFS-e</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ol className="wizard-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="alert danger" style={{ marginBottom: 16 }}>
          <span className="lead">Atenção:</span><span>{error}</span>
        </div>
      )}

      {/* PASSO 1 — PESSOAS */}
      {step === 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="erp-card">
            <div className="erp-card-head"><h3>Dados gerais</h3></div>
            <div className="erp-form">
              <label>Data de Competência<input type="date" value={dataCompetencia} onChange={(e) => setDataCompetencia(e.target.value)} /></label>
              <label>
                Emitente da NFS-e
                <input value="Prestador" disabled />
              </label>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Tomador do Serviço</h3></div>
            <div className="erp-card-body">
              <div className="stat-pills" role="tablist" style={{ marginBottom: 12 }}>
                {([["cadastrado", "Cliente cadastrado"], ["brasil", "Brasil (novo)"], ["naoInformado", "Tomador não informado"]] as Array<[TomadorModo, string]>).map(([id, label]) => (
                  <button key={id} type="button" className={`stat-pill${tomadorModo === id ? " active" : ""}`} onClick={() => setTomadorModo(id)}>{label}</button>
                ))}
              </div>

              {tomadorModo === "cadastrado" && (
                <div className="erp-form">
                  <label className="full">
                    Tomador
                    <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                      <option value="">Selecione o cliente…</option>
                      {data.clientes.map((c) => <option key={c.id} value={c.id}>{c.label}{c.documento ? ` · ${c.documento}` : ""}</option>)}
                    </select>
                  </label>
                  {cliente && (
                    <p className="full" style={{ fontSize: 12, color: "var(--erp-mute)", margin: 0 }}>
                      {cliente.documento ?? "Sem documento"} · {cliente.cidade ?? "—"}/{cliente.uf ?? "—"} · {cliente.email ?? "sem e-mail"}
                    </p>
                  )}
                </div>
              )}

              {tomadorModo === "brasil" && (
                <div className="erp-form">
                  <label className="full">Nome / Razão Social<input value={tNome} onChange={(e) => setTNome(e.target.value)} /></label>
                  <label>CPF / CNPJ<input value={tDocumento} onChange={(e) => setTDocumento(e.target.value)} placeholder="Somente números" /></label>
                  <label>Inscrição Municipal<input value={tIe} onChange={(e) => setTIe(e.target.value)} /></label>
                  <label>E-mail<input value={tEmail} onChange={(e) => setTEmail(e.target.value)} /></label>
                  <label>CEP<input value={tCep} onChange={(e) => setTCep(e.target.value)} /></label>
                  <label className="full">Logradouro<input value={tLogradouro} onChange={(e) => setTLogradouro(e.target.value)} /></label>
                  <label>Número<input value={tNumero} onChange={(e) => setTNumero(e.target.value)} /></label>
                  <label>Complemento<input value={tComplemento} onChange={(e) => setTComplemento(e.target.value)} /></label>
                  <label>Bairro<input value={tBairro} onChange={(e) => setTBairro(e.target.value)} /></label>
                  <label>Município<input value={tCidade} onChange={(e) => setTCidade(e.target.value)} /></label>
                  <label>UF
                    <select value={tUf} onChange={(e) => setTUf(e.target.value)}>
                      <option value="">—</option>
                      {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </label>
                </div>
              )}

              {tomadorModo === "naoInformado" && (
                <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: 0 }}>
                  A NFS-e será emitida sem identificação do tomador. Alguns Códigos de Tributação Nacional exigem o tomador para definir o local de incidência do ISSQN.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PASSO 2 — SERVIÇO */}
      {step === 1 && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Serviço</h3></div>
          <div className="erp-form">
            <label className="full">
              Código de Tributação Nacional (LC 116)
              <select value={codigoLc116} onChange={(e) => aoTrocarLc116(e.target.value)}>
                <option value="">Selecione…</option>
                {data.lc116.map((l) => <option key={l.code} value={l.code}>{l.code} — {l.description}</option>)}
              </select>
            </label>
            <label className="full">
              Descrição do Serviço
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="Descreva detalhadamente o serviço prestado (discriminação)…"
                style={{ width: "100%", minHeight: 120, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              />
              <span style={{ fontSize: 11, color: "var(--erp-mute)", textAlign: "right" }}>{descricao.length}/2000</span>
            </label>
            <label className="full">
              Código NBS (Nomenclatura Brasileira de Serviços)
              {sugestao && sugestao.nbs.length > 0 ? (
                <select value={itemNbs.replace(/\D/g, "")} onChange={(e) => setItemNbs(e.target.value)}>
                  <option value="">Selecione…</option>
                  {sugestao.nbs.map((n) => <option key={n.code} value={n.code}>{n.code} — {n.description}</option>)}
                </select>
              ) : (
                <input value={itemNbs} onChange={(e) => setItemNbs(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="9 dígitos (selecione um LC 116 para sugerir)" inputMode="numeric" />
              )}
              {sugestao && <span style={{ fontSize: 11, color: "var(--erp-mute)" }}>Sugerido pela tabela oficial a partir do LC 116.</span>}
            </label>
            <label className="full">
              Classificação tributária IBS/CBS (cClassTrib)
              {sugestao && sugestao.classTrib.length > 0 ? (
                <select value={cClassTrib} onChange={(e) => setCClassTrib(e.target.value)}>
                  <option value="">Selecione…</option>
                  {sugestao.classTrib.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.nome}</option>)}
                </select>
              ) : (
                <input value={cClassTrib} onChange={(e) => setCClassTrib(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 dígitos (selecione um LC 116 para sugerir)" inputMode="numeric" />
              )}
              <span style={{ fontSize: 11, color: "var(--erp-mute)" }}>Reforma Tributária. Em 2026 a validação é opcional; informe quando souber.</span>
            </label>
            <label>Código interno do contribuinte (opcional)<input value={codigoInterno} onChange={(e) => setCodigoInterno(e.target.value)} /></label>
          </div>
        </div>
      )}

      {/* PASSO 3 — VALORES */}
      {step === 2 && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="erp-card">
            <div className="erp-card-head"><h3>Valores do serviço</h3></div>
            <div className="erp-form">
              <label>Valor do Serviço<input type="number" min={0} step="any" value={valorServico} onChange={(e) => setValorServico(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>Desconto incondicionado<input type="number" min={0} step="any" value={descontoIncondicionado} onChange={(e) => setDescontoIncondicionado(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>Desconto condicionado<input type="number" min={0} step="any" value={descontoCondicionado} onChange={(e) => setDescontoCondicionado(Math.max(0, Number(e.target.value) || 0))} /></label>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Tributação municipal</h3></div>
            <div className="erp-form">
              <label className="full">
                Tipo de operação
                <select value={tipoOperacao} onChange={(e) => setTipoOperacao(e.target.value)}>
                  {TIPOS_OPERACAO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="check-row full">
                <input type="checkbox" checked={suspensao} onChange={(e) => setSuspensao(e.target.checked)} /> Exigibilidade do ISSQN suspensa
              </label>
              {suspensao && (
                <>
                  <label>
                    Tipo de suspensão
                    <select value={suspensaoTipo} onChange={(e) => setSuspensaoTipo(e.target.value)}>
                      <option value="suspendedByCourt">Decisão judicial</option>
                      <option value="suspendedByAdministrativeProcedure">Processo administrativo</option>
                    </select>
                  </label>
                  <label>Número do processo<input value={suspensaoProcesso} onChange={(e) => setSuspensaoProcesso(e.target.value)} /></label>
                </>
              )}
              <label>Dedução / redução da BC (R$)<input type="number" min={0} step="any" value={deducaoBc} onChange={(e) => setDeducaoBc(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>Alíquota do ISSQN %<input type="number" min={0} step="any" value={aliquotaIss} onChange={(e) => setAliquotaIss(Math.max(0, Number(e.target.value) || 0))} disabled={!tributavel || exigibilidadeSuspensa || data.nfseAmbienteNacional === true} placeholder={data.nfseAmbienteNacional === true ? "Definida pelo sistema nacional" : undefined} /></label>
              {!exigibilidadeSuspensa && tributavel && (
                <>
                  <label className="check-row">
                    <input type="checkbox" checked={issRetido} onChange={(e) => setIssRetido(e.target.checked)} /> Haverá retenção do ISSQN?
                  </label>
                  {issRetido && (
                    <label>
                      Retido por
                      <select value={issRetidoPor} onChange={(e) => setIssRetidoPor(e.target.value)}>
                        <option value="tomador">Retido pelo Tomador</option>
                        <option value="intermediario">Retido pelo Intermediário</option>
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="full" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 4 }}>
                <div><span style={{ fontSize: 11, color: "var(--erp-mute)", display: "block" }}>BC ISSQN</span><b>{brl(baseIss)}</b></div>
                <div><span style={{ fontSize: 11, color: "var(--erp-mute)", display: "block" }}>Valor ISSQN</span><b>{brl(valorIss)}</b></div>
              </div>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Tributação federal (retenções)</h3></div>
            <div className="erp-form">
              <label className="full">Base de cálculo das retenções (R$)<input type="number" min={0} step="any" value={baseRetencao} onChange={(e) => setBaseRetencao(Math.max(0, Number(e.target.value) || 0))} placeholder={`Padrão: valor do serviço (${brl(valorServico)})`} /></label>
              <label>IRRF %<input type="number" min={0} step="any" value={retIr} onChange={(e) => setRetIr(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>CSLL %<input type="number" min={0} step="any" value={retCsll} onChange={(e) => setRetCsll(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>CP / INSS %<input type="number" min={0} step="any" value={retInss} onChange={(e) => setRetInss(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>PIS %<input type="number" min={0} step="any" value={retPis} onChange={(e) => setRetPis(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label>COFINS %<input type="number" min={0} step="any" value={retCofins} onChange={(e) => setRetCofins(Math.max(0, Number(e.target.value) || 0))} /></label>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Outras informações</h3></div>
            <div className="erp-form">
              <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: à vista, 30 dias" /></label>
              <label className="full">Informações complementares<textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 5, fontSize: 12.5, resize: "vertical", fontFamily: "inherit" }} /></label>
            </div>
          </div>
        </div>
      )}

      {/* PASSO 4 — EMITIR (RESUMO) */}
      {step === 3 && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Pessoas</h3>
              <button type="button" className="btn-erp ghost xs" onClick={() => irPara(0)}>Editar Pessoas</button>
            </div>
            <div className="erp-card-body" style={{ fontSize: 13 }}>
              <p style={{ margin: "0 0 4px" }}><b>Competência:</b> {new Date(`${dataCompetencia}T12:00:00`).toLocaleDateString("pt-BR")}</p>
              <p style={{ margin: 0 }}><b>Tomador:</b> {tomadorModo === "cadastrado" ? (cliente?.label ?? "—") : tomadorModo === "brasil" ? (tNome || "—") : "Tomador não informado"}</p>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Serviço</h3>
              <button type="button" className="btn-erp ghost xs" onClick={() => irPara(1)}>Editar Serviço</button>
            </div>
            <div className="erp-card-body" style={{ fontSize: 13 }}>
              <p style={{ margin: "0 0 4px" }}><b>Código LC 116:</b> {codigoLc116 || "—"}</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}><b>Descrição:</b> {descricao || "—"}</p>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Tributação e valores</h3>
              <button type="button" className="btn-erp ghost xs" onClick={() => irPara(2)}>Editar Tributação</button>
            </div>
            <div className="erp-card-body">
              <div className="kpi-row" style={{ marginBottom: 0 }}>
                <div className="kpi"><div className="l">Valor do serviço</div><div className="v">{brl(valorServico)}</div></div>
                <div className="kpi"><div className="l">BC ISSQN</div><div className="v">{brl(baseIss)}</div></div>
                <div className="kpi"><div className="l">Valor ISSQN</div><div className="v">{brl(valorIss)}</div></div>
                <div className="kpi"><div className="l">Valor líquido</div><div className="v">{brl(valorLiquido)}</div></div>
              </div>
              {(issRetidoValor > 0 || totalFederalRetido > 0) && (
                <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "10px 0 0" }}>
                  Retenções: ISSQN {brl(issRetidoValor)} · Federais {brl(totalFederalRetido)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AÇÕES */}
      <div className="erp-toolbar" style={{ marginTop: 16, borderBottom: "none", paddingBottom: 0 }}>
        <button type="button" className="btn-erp ghost sm" onClick={voltar} disabled={step === 0 || saving}>Voltar</button>
        <div className="grow" />
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-erp primary sm" onClick={avancar} disabled={saving}>Avançar</button>
        ) : (
          <button type="button" className="btn-erp primary lg" onClick={emitir} disabled={saving}>{saving ? "Emitindo…" : "Emitir NFS-e"}</button>
        )}
      </div>
    </>
  );
}
