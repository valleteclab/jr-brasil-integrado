"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoPrefill } from "@/lib/services/fiscal";
import { sugerirPorLc116 } from "@/domains/fiscal/nbs";
import { exigeGrupoObra } from "@/domains/fiscal/codigo-tributacao-nacional";
import { useCadastroLookup } from "./useCadastroLookup";
import { correspondeBusca } from "@/lib/search/normalize";

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

/** Campo de MOEDA (padrão brasileiro): começa vazio, dá para apagar, digita-se da direita p/ esquerda
 *  (ex.: 1 → 0,01; 100 → 1,00; 150000 → 1.500,00). Mantém o valor numérico no estado do pai. */
function MoneyInput({ value, onChange, disabled, placeholder }: {
  value: number; onChange: (n: number) => void; disabled?: boolean; placeholder?: string;
}) {
  const [txt, setTxt] = useState(value ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
  function handle(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) { setTxt(""); onChange(0); return; }
    const n = Number(digits) / 100;
    setTxt(n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    onChange(n);
  }
  return <input inputMode="decimal" disabled={disabled} placeholder={placeholder ?? "0,00"} value={txt} onChange={(e) => handle(e.target.value)} />;
}

/** Campo de PERCENTUAL: começa vazio, aceita decimal com vírgula e pode ser apagado. */
function PercentInput({ value, onChange, disabled, placeholder }: {
  value: number; onChange: (n: number) => void; disabled?: boolean; placeholder?: string;
}) {
  const [txt, setTxt] = useState(value ? String(value).replace(".", ",") : "");
  function handle(raw: string) {
    let v = raw.replace(/[^\d,]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = `${parts[0]},${parts.slice(1).join("")}`;
    setTxt(v);
    onChange(Number(v.replace(",", ".")) || 0);
  }
  return <input inputMode="decimal" disabled={disabled} placeholder={placeholder ?? "0,00"} value={txt} onChange={(e) => handle(e.target.value)} />;
}

/** Combobox com busca para o Código de Tributação Nacional (LC 116) — evita rolar a lista inteira. */
function CodigoServicoSelect({ value, options, onChange }: {
  value: string;
  options: Array<{ code: string; description: string }>;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find((o) => o.code === value);
  const lista = (q.trim() ? options.filter((o) => correspondeBusca(q, o.code, o.description)) : options).slice(0, 60);
  return (
    <div style={{ position: "relative" }}>
      <input
        value={open ? q : (sel ? `${sel.code} — ${sel.description}` : "")}
        onChange={(e) => { setQ(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Digite o código ou a descrição para buscar…"
        style={{ width: "100%" }}
      />
      {open && (
        <div className="busca-sugestoes" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, background: "var(--erp-surface,#fff)", border: "1px solid var(--erp-line)", borderRadius: 6, maxHeight: 280, overflowY: "auto", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
          {lista.map((o) => (
            <button
              key={o.code}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o.code); setQ(""); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: o.code === value ? "rgba(255,193,7,.08)" : "none", border: "none", borderBottom: "1px solid var(--erp-line)", cursor: "pointer", fontSize: 13 }}
            >
              <strong className="mono">{o.code}</strong> — {o.description}
            </button>
          ))}
          {!lista.length && <div style={{ padding: 10, fontSize: 12, color: "var(--erp-mute)" }}>Nenhum código encontrado para “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

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

export function NfseWizard({ data, initial = null }: { data: EmissaoFormData; initial?: EmissaoPrefill | null }) {
  const router = useRouter();
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  // Prefill ao clonar uma NFS-e: tomador + serviço (descrição/LC116/valor) da nota original.
  const ini = initial && initial.tipo === "NFSE" ? initial : null;
  const iniEndereco = ini?.destinatario.endereco;
  const iniTomadorModo: TomadorModo = ini ? (ini.clienteId ? "cadastrado" : ini.destinatario.nome ? "brasil" : "cadastrado") : "cadastrado";
  const iniDescricao = ini?.servicos.length ? ini.servicos.map((s) => s.descricao).filter(Boolean).join("\n") : "";
  const iniLc116 = ini?.codigoServicoLc116 || ini?.servicos[0]?.codigoServicoLc116 || "";
  const iniValor = ini?.servicos.length ? ini.servicos.reduce((s, x) => s + Number(x.valor || 0), 0) : 0;
  const iniSugestao = iniLc116 ? sugerirPorLc116(iniLc116) : null;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Passo 1 — Pessoas
  const [dataCompetencia, setDataCompetencia] = useState(hoje);
  const [tomadorModo, setTomadorModo] = useState<TomadorModo>(iniTomadorModo);
  const [clienteId, setClienteId] = useState(ini?.clienteId ?? "");
  const [tNome, setTNome] = useState(ini?.destinatario.nome ?? "");
  const [tDocumento, setTDocumento] = useState(ini?.destinatario.documento ?? "");
  const [tIe, setTIe] = useState(ini?.destinatario.inscricaoEstadual ?? "");
  const [tEmail, setTEmail] = useState(ini?.destinatario.email ?? "");
  const [tLogradouro, setTLogradouro] = useState(iniEndereco?.logradouro ?? "");
  const [tNumero, setTNumero] = useState(iniEndereco?.numero ?? "");
  const [tComplemento, setTComplemento] = useState(iniEndereco?.complemento ?? "");
  const [tBairro, setTBairro] = useState(iniEndereco?.bairro ?? "");
  const [tCep, setTCep] = useState(iniEndereco?.cep ?? "");
  const [tCidade, setTCidade] = useState(iniEndereco?.cidade ?? "");
  const [tUf, setTUf] = useState(iniEndereco?.uf || data.emitterUf || "");

  // Passo 2 — Serviço
  const [codigoLc116, setCodigoLc116] = useState(iniLc116);
  const [descricao, setDescricao] = useState(iniDescricao);
  const [itemNbs, setItemNbs] = useState(iniSugestao?.nbsPadrao ?? "");
  const [cClassTrib, setCClassTrib] = useState(iniSugestao?.classTribPadrao ?? "");
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
  const [valorServico, setValorServico] = useState(iniValor);
  const [descontoIncondicionado, setDescontoIncondicionado] = useState(0);
  const [descontoCondicionado, setDescontoCondicionado] = useState(0);
  const [deducaoBc, setDeducaoBc] = useState(0);
  const [tipoOperacao, setTipoOperacao] = useState("taxationInMunicipality");
  const [aliquotaIss, setAliquotaIss] = useState(ini?.aliquotaIss ?? 0);
  const [suspensao, setSuspensao] = useState(false);
  const [suspensaoTipo, setSuspensaoTipo] = useState("suspendedByCourt");
  const [suspensaoProcesso, setSuspensaoProcesso] = useState("");
  const [issRetido, setIssRetido] = useState(ini?.issRetido ?? false);
  const [issRetidoPor, setIssRetidoPor] = useState("tomador");
  // Tributação federal (retenções)
  const [retIr, setRetIr] = useState(0);
  const [retCsll, setRetCsll] = useState(0);
  const [retInss, setRetInss] = useState(0);
  const [retPis, setRetPis] = useState(0);
  const [retCofins, setRetCofins] = useState(0);
  const [baseRetencao, setBaseRetencao] = useState(0);
  // Material embutido no serviço (nota de obra): deduz só a base do INSS.
  const [valorMaterial, setValorMaterial] = useState(0);
  // Obra (construção civil) — exigida pela NFS-e para certos códigos de tributação.
  const [obraCno, setObraCno] = useState("");
  const [obraInscImob, setObraInscImob] = useState("");
  const [obraLogradouro, setObraLogradouro] = useState("");
  const [obraNumero, setObraNumero] = useState("");
  const [obraComplemento, setObraComplemento] = useState("");
  const [obraBairro, setObraBairro] = useState("");
  const [obraCep, setObraCep] = useState("");
  // Outros
  const [condicaoPagamento, setCondicaoPagamento] = useState(ini?.condicaoPagamento ?? "");
  const [observacoes, setObservacoes] = useState(ini?.observacoes ?? "");

  const cliente: Cliente | null = useMemo(
    () => data.clientes.find((c) => c.id === clienteId) ?? null,
    [data.clientes, clienteId]
  );

  // Busca de CNPJ/CEP (mesmo serviço dos demais cadastros) para autopreencher o tomador manual.
  const { buscarCnpj, buscarCep, buscandoCnpj, buscandoCep, erro: lookupErro } = useCadastroLookup();
  async function preencherTomadorPorCnpj() {
    const d = await buscarCnpj(tDocumento);
    if (!d) return;
    setTNome(d.razaoSocial ?? d.nomeFantasia ?? tNome);
    if (d.email) setTEmail(d.email);
    if (d.endereco.logradouro) setTLogradouro(d.endereco.logradouro);
    if (d.endereco.numero) setTNumero(d.endereco.numero);
    if (d.endereco.complemento) setTComplemento(d.endereco.complemento);
    if (d.endereco.bairro) setTBairro(d.endereco.bairro);
    if (d.endereco.cep) setTCep(d.endereco.cep);
    if (d.endereco.cidade) setTCidade(d.endereco.cidade);
    if (d.endereco.uf) setTUf(d.endereco.uf);
  }
  async function preencherTomadorPorCep() {
    const d = await buscarCep(tCep);
    if (!d) return;
    if (d.logradouro) setTLogradouro(d.logradouro);
    if (d.bairro) setTBairro(d.bairro);
    if (d.cidade) setTCidade(d.cidade);
    if (d.uf) setTUf(d.uf);
  }

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
  // INSS de obra incide só sobre a mão de obra: base do INSS = base − material.
  const baseInssEfetiva = Math.max(baseRetencaoEfetiva - valorMaterial, 0);
  const totalFederalRetido = useMemo(
    () =>
      Math.round(
        (baseRetencaoEfetiva * ((retIr + retCsll + retPis + retCofins) / 100) + baseInssEfetiva * (retInss / 100)) * 100
      ) / 100,
    [baseRetencaoEfetiva, baseInssEfetiva, retIr, retCsll, retInss, retPis, retCofins]
  );
  // Serviço de construção civil: o DPS exige o grupo de obra.
  const precisaObra = exigeGrupoObra(codigoLc116);
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
      // cNBS é obrigatório no schema da NFS-e (Padrão Nacional) — sem ele a emissão é rejeitada.
      if (itemNbs.replace(/\D/g, "").length !== 9) return "Informe o Código NBS (9 dígitos) — obrigatório para a NFS-e.";
    }
    if (s === 2) {
      if (valorServico <= 0) return "Informe o Valor do Serviço.";
      // Município no Ambiente Nacional: a alíquota é definida pelo sistema — não exigir.
      if (data.nfseAmbienteNacional !== true && tributavel && !exigibilidadeSuspensa && aliquotaIss <= 0) return "Informe a Alíquota do ISSQN.";
      // Serviço de obra: o DPS exige a obra (endereço, CNO ou inscrição imobiliária).
      if (precisaObra && !obraLogradouro.trim() && !obraCno.trim() && !obraInscImob.trim()) {
        return "Este é um serviço de obra: informe a obra (endereço, CNO ou inscrição imobiliária).";
      }
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

  // Tomador informado manualmente: salva também como CLIENTE no sistema (best effort) e passa a
  // usar o clienteId na emissão. Se falhar (ex.: documento duplicado), segue com os dados manuais.
  async function criarClienteDoTomador(): Promise<string | null> {
    if (!tNome.trim()) return null;
    const enderecoValido = tCidade.trim() && tUf.trim();
    const payload = {
      razaoSocial: tNome.trim(),
      nomeFantasia: null,
      documento: tDocumento.trim(),
      status: "ATIVO",
      contatos: tEmail.trim() ? [{ nome: tNome.trim(), email: tEmail.trim(), telefone: null, principal: true }] : [],
      enderecos: enderecoValido
        ? [{ apelido: "Principal", cep: tCep.trim(), logradouro: tLogradouro.trim(), numero: tNumero.trim() || null, bairro: tBairro.trim() || null, cidade: tCidade.trim(), uf: tUf.trim().toUpperCase(), codigoMunicipioIbge: null, padrao: true }]
        : []
    };
    try {
      const res = await fetch("/api/erp/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return res.ok && data.id ? data.id : null;
    } catch {
      return null;
    }
  }

  async function emitir() {
    for (let s = 0; s <= 2; s += 1) {
      const e = stepError(s);
      if (e) { setError(e); setStep(s); return; }
    }
    setSaving(true);
    setError("");
    try {
      // Salva o tomador manual como cliente; usa o clienteId se criado.
      let receiver = buildReceiver();
      if (tomadorModo === "brasil") {
        const novoClienteId = await criarClienteDoTomador();
        if (novoClienteId) receiver = { clienteId: novoClienteId };
      }
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
        receiver,
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
          valorMaterial: valorMaterial > 0 ? valorMaterial : undefined,
          ir: retIr > 0 ? { aliquota: retIr } : undefined,
          csll: retCsll > 0 ? { aliquota: retCsll } : undefined,
          inss: retInss > 0 ? { aliquota: retInss } : undefined,
          pis: retPis > 0 ? { aliquota: retPis } : undefined,
          cofins: retCofins > 0 ? { aliquota: retCofins } : undefined
        },
        obra: precisaObra
          ? {
              cObra: obraCno.trim() || undefined,
              inscricaoImobiliaria: obraInscImob.trim() || undefined,
              endereco: {
                logradouro: obraLogradouro.trim() || undefined,
                numero: obraNumero.trim() || undefined,
                complemento: obraComplemento.trim() || undefined,
                bairro: obraBairro.trim() || undefined,
                cep: obraCep.replace(/\D/g, "") || undefined
              }
            }
          : undefined
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
                {([["cadastrado", "Cliente cadastrado"], ["brasil", "Informar manualmente"], ["naoInformado", "Tomador não informado"]] as Array<[TomadorModo, string]>).map(([id, label]) => (
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
                  <label>CPF / CNPJ
                    <span style={{ display: "flex", gap: 6 }}>
                      <input value={tDocumento} onChange={(e) => setTDocumento(e.target.value.toUpperCase())} placeholder="CNPJ ou CPF" maxLength={18} style={{ flex: 1 }} />
                      <button type="button" className="btn-erp light sm" onClick={preencherTomadorPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}</button>
                    </span>
                  </label>
                  <label className="full">Nome / Razão Social<input value={tNome} onChange={(e) => setTNome(e.target.value)} /></label>
                  <label>Inscrição Municipal<input value={tIe} onChange={(e) => setTIe(e.target.value)} /></label>
                  <label>E-mail<input value={tEmail} onChange={(e) => setTEmail(e.target.value)} /></label>
                  <label>CEP
                    <span style={{ display: "flex", gap: 6 }}>
                      <input value={tCep} onChange={(e) => setTCep(e.target.value)} maxLength={9} style={{ flex: 1 }} />
                      <button type="button" className="btn-erp light sm" onClick={preencherTomadorPorCep} disabled={buscandoCep} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{buscandoCep ? "Buscando…" : "Buscar CEP"}</button>
                    </span>
                  </label>
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
                  {lookupErro && <p className="form-error" style={{ gridColumn: "1 / -1", margin: 0 }}>{lookupErro}</p>}
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
              <CodigoServicoSelect value={codigoLc116} options={data.lc116} onChange={aoTrocarLc116} />
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
              <span style={{ fontSize: 11, color: descricao.length >= 2000 ? "var(--erp-danger, #c0392b)" : "var(--erp-mute)", textAlign: "right" }}>
                {descricao.length}/2000{descricao.length >= 2000 ? " — limite da SEFAZ; detalhe materiais/medição em “Informações complementares”." : ""}
              </span>
            </label>
            <label className="full">
              Código NBS (Nomenclatura Brasileira de Serviços)*
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
              <label>Valor do Serviço (R$)<MoneyInput value={valorServico} onChange={setValorServico} /></label>
              <label>Desconto incondicionado (R$)<MoneyInput value={descontoIncondicionado} onChange={setDescontoIncondicionado} /></label>
              <label>Desconto condicionado (R$)<MoneyInput value={descontoCondicionado} onChange={setDescontoCondicionado} /></label>
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
              <label>Dedução / redução da BC (R$)<MoneyInput value={deducaoBc} onChange={setDeducaoBc} /></label>
              <label>Alíquota do ISSQN %<PercentInput value={aliquotaIss} onChange={setAliquotaIss} disabled={!tributavel || exigibilidadeSuspensa || data.nfseAmbienteNacional === true} placeholder={data.nfseAmbienteNacional === true ? "Definida pelo sistema nacional" : undefined} /></label>
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
              <label className="full">Base de cálculo das retenções (R$)<MoneyInput value={baseRetencao} onChange={setBaseRetencao} placeholder={`Padrão: valor do serviço (${brl(valorServico)})`} /></label>
              <label className="full">
                Valor de material (R$) — deduz só a base do INSS
                <MoneyInput value={valorMaterial} onChange={setValorMaterial} placeholder="0,00 — em nota de obra, INSS incide sobre serviço − material" />
                {valorMaterial > 0 && retInss > 0 && (
                  <small className="block-muted">Base do INSS: {brl(baseInssEfetiva)} (ISS e demais retenções seguem sobre a base cheia).</small>
                )}
              </label>
              <label>IRRF %<PercentInput value={retIr} onChange={setRetIr} /></label>
              <label>CSLL %<PercentInput value={retCsll} onChange={setRetCsll} /></label>
              <label>CP / INSS %<PercentInput value={retInss} onChange={setRetInss} /></label>
              <label>PIS %<PercentInput value={retPis} onChange={setRetPis} /></label>
              <label>COFINS %<PercentInput value={retCofins} onChange={setRetCofins} /></label>
            </div>
          </div>

          {precisaObra && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Obra (construção civil)</h3></div>
              <p className="muted" style={{ margin: "0 0 8px" }}>
                Este código de tributação é de obra — a NFS-e exige as informações da obra. Informe o
                endereço e, se tiver, o CNO (Cadastro Nacional de Obras) e/ou a inscrição imobiliária.
              </p>
              <div className="erp-form">
                <label>Código da Obra (CNO)<input value={obraCno} onChange={(e) => setObraCno(e.target.value)} placeholder="Cadastro Nacional de Obras (opcional)" /></label>
                <label>Inscrição imobiliária<input value={obraInscImob} onChange={(e) => setObraInscImob(e.target.value)} placeholder="Inscrição do imóvel na prefeitura (opcional)" /></label>
                <label className="full">Logradouro da obra<input value={obraLogradouro} onChange={(e) => setObraLogradouro(e.target.value)} placeholder="Rua/Av. e nome" /></label>
                <label>Número<input value={obraNumero} onChange={(e) => setObraNumero(e.target.value)} placeholder="Nº" /></label>
                <label>Complemento<input value={obraComplemento} onChange={(e) => setObraComplemento(e.target.value)} /></label>
                <label>Bairro<input value={obraBairro} onChange={(e) => setObraBairro(e.target.value)} /></label>
                <label>CEP da obra<input value={obraCep} onChange={(e) => setObraCep(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Obrigatório — CEP do município da prestação" inputMode="numeric" /></label>
              </div>
            </div>
          )}

          <div className="erp-card">
            <div className="erp-card-head"><h3>Outras informações</h3></div>
            <div className="erp-form">
              <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: à vista, 30 dias" /></label>
              <label className="full">
                Informações complementares — saem no campo &ldquo;Informações Complementares&rdquo; da nota (use para materiais/medição que não couberam na descrição)
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={5} maxLength={2000} placeholder="Ex.: composição da medição, lista de materiais com quantidades…" style={{ width: "100%", minHeight: 100, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 5, fontSize: 12.5, resize: "vertical", fontFamily: "inherit" }} />
                <span style={{ fontSize: 11, color: "var(--erp-mute)", textAlign: "right", display: "block" }}>{observacoes.length}/2000</span>
              </label>
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
