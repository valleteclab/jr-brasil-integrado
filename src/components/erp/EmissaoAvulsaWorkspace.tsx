"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { correspondeBusca } from "@/lib/search/normalize";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoPrefill } from "@/lib/services/fiscal";
import { useCadastroLookup } from "./useCadastroLookup";
import { EspelhoFiscalModal, CalculoImpostoPanel, type FiscalPreview } from "./EspelhoFiscal";

type DocTipo = "NFE" | "NFCE" | "NFSE";
type Finalidade = "NORMAL" | "COMPLEMENTAR" | "AJUSTE" | "DEVOLUCAO";
type Cliente = EmissaoFormData["clientes"][number];
type Produto = EmissaoFormData["produtos"][number];

type ItemLinha = {
  uid: string;
  produtoId: string | null;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  origem: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number; // valor absoluto (R$)
  /** Devolução: quantidade máxima devolvível (= quantidade da nota original). */
  maxQuantidade?: number;
};

type ServicoLinha = {
  uid: string;
  descricao: string;
  valor: number;
  codigoServicoLc116: string;
};

type ResultadoEmissao = {
  id: string;
  status: string;
  numero?: string | null;
  chaveAcesso?: string | null;
  motivo?: string | null;
};

const TIPOS: Array<{ id: DocTipo; icon: string; label: string; desc: string }> = [
  { id: "NFE", icon: "📄", label: "NF-e", desc: "Nota fiscal eletrônica · venda de mercadoria (modelo 55)" },
  { id: "NFCE", icon: "🧾", label: "NFC-e", desc: "Cupom ao consumidor final · destinatário opcional (modelo 65)" },
  { id: "NFSE", icon: "🛠️", label: "NFS-e", desc: "Nota de serviço · ISS conforme LC 116 e configuração" }
];

const FINALIDADES: Array<{ id: Finalidade; label: string }> = [
  { id: "NORMAL", label: "Normal" },
  { id: "COMPLEMENTAR", label: "Complementar" },
  { id: "AJUSTE", label: "Ajuste" },
  { id: "DEVOLUCAO", label: "Devolução" }
];

const FORMAS_PAGAMENTO = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência", "Sem pagamento"];

// Modalidade do frete (tag modFrete da SEFAZ).
const FRETE_MODALIDADES: Array<{ id: number; label: string }> = [
  { id: 9, label: "Sem transporte" },
  { id: 0, label: "Por conta do emitente (CIF)" },
  { id: 1, label: "Por conta do destinatário (FOB)" },
  { id: 2, label: "Por conta de terceiros" },
  { id: 3, label: "Próprio — conta do emitente" },
  { id: 4, label: "Próprio — conta do destinatário" }
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const uid = () => Math.random().toString(36).slice(2, 10);

const STATUS_TONE: Record<string, string> = {
  AUTORIZADA: "success",
  REJEITADA: "danger",
  ERRO: "danger",
  PROCESSANDO: "warn",
  RASCUNHO: "warn"
};

function statusTone(status: string): string {
  return STATUS_TONE[status.toUpperCase()] ?? "default";
}

const cellInput: React.CSSProperties = { width: "100%", height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 8px", fontSize: 12.5 };
const cellNum: React.CSSProperties = { width: 78, height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 6px", fontSize: 12.5, textAlign: "right" };
const textareaStyle: React.CSSProperties = { width: "100%", minHeight: 60, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 5, fontSize: 12.5, resize: "vertical", fontFamily: "inherit" };

const prefillToItens = (initial?: EmissaoPrefill | null): ItemLinha[] =>
  (initial?.itens ?? []).map((it) => ({
    uid: uid(),
    produtoId: it.produtoId,
    codigo: it.codigo,
    descricao: it.descricao,
    ncm: it.ncm,
    cfop: it.cfop,
    origem: it.origem,
    unidade: it.unidade,
    quantidade: it.quantidade,
    precoUnitario: it.precoUnitario,
    desconto: it.desconto,
    // Na devolução, a quantidade da original é o teto da quantidade a devolver (devolução parcial).
    maxQuantidade: initial?.modo === "DEVOLUCAO" ? it.quantidade : undefined
  }));

const prefillToServicos = (initial?: EmissaoPrefill | null): ServicoLinha[] =>
  (initial?.servicos ?? []).map((sv) => ({
    uid: uid(),
    descricao: sv.descricao,
    valor: sv.valor,
    codigoServicoLc116: sv.codigoServicoLc116
  }));

export function EmissaoAvulsaWorkspace({ data, initial }: { data: EmissaoFormData; initial?: EmissaoPrefill | null }) {
  const router = useRouter();

  const [tipo, setTipo] = useState<DocTipo>(initial?.tipo ?? "NFE");

  // Origem (clone/devolução): referência mantida para enviar na emissão.
  const [origem] = useState(initial ?? null);

  // Destinatário
  const [modoDest, setModoDest] = useState<"cadastrado" | "avulso">(
    initial && !initial.clienteId ? "avulso" : "cadastrado"
  );
  const [clienteId, setClienteId] = useState<string>(initial?.clienteId ?? "");
  const [avNome, setAvNome] = useState(initial?.destinatario.nome ?? "");
  const [avDocumento, setAvDocumento] = useState(initial?.destinatario.documento ?? "");
  const [avIe, setAvIe] = useState(initial?.destinatario.inscricaoEstadual ?? "");
  const [avEmail, setAvEmail] = useState(initial?.destinatario.email ?? "");
  const [avLogradouro, setAvLogradouro] = useState("");
  const [avNumero, setAvNumero] = useState("");
  const [avComplemento, setAvComplemento] = useState("");
  const [avBairro, setAvBairro] = useState("");
  const [avCep, setAvCep] = useState("");
  const [avCidade, setAvCidade] = useState("");
  const [avUf, setAvUf] = useState(data.emitterUf ?? "");
  const [avIbge, setAvIbge] = useState("");
  const { buscarCep: lkCep, buscarCnpj: lkCnpj, buscandoCep, buscandoCnpj, erro: lookupErro } = useCadastroLookup();

  async function preencherDestPorCnpj() {
    const d = await lkCnpj(avDocumento);
    if (!d) return;
    if (d.razaoSocial) setAvNome(d.razaoSocial);
    if (d.email) setAvEmail(d.email);
    if (d.endereco.logradouro) setAvLogradouro(d.endereco.logradouro);
    if (d.endereco.numero) setAvNumero(d.endereco.numero);
    if (d.endereco.complemento) setAvComplemento(d.endereco.complemento);
    if (d.endereco.bairro) setAvBairro(d.endereco.bairro);
    if (d.endereco.cep) setAvCep(d.endereco.cep);
    if (d.endereco.cidade) setAvCidade(d.endereco.cidade);
    if (d.endereco.uf) setAvUf(d.endereco.uf);
    if (d.endereco.codigoMunicipioIbge) setAvIbge(d.endereco.codigoMunicipioIbge);
  }

  async function preencherDestPorCep() {
    const d = await lkCep(avCep);
    if (!d) return;
    if (d.logradouro) setAvLogradouro(d.logradouro);
    if (d.bairro) setAvBairro(d.bairro);
    if (d.cidade) setAvCidade(d.cidade);
    if (d.uf) setAvUf(d.uf);
    if (d.codigoMunicipioIbge) setAvIbge(d.codigoMunicipioIbge);
  }

  // Itens / serviços
  const [itens, setItens] = useState<ItemLinha[]>(() => prefillToItens(initial));
  const [servicos, setServicos] = useState<ServicoLinha[]>(() => prefillToServicos(initial));
  const [showProd, setShowProd] = useState(false);

  // Operação
  const [naturezaOperacao, setNaturezaOperacao] = useState(initial?.naturezaOperacao ?? "Venda de mercadoria");
  const [finalidade, setFinalidade] = useState<Finalidade>(initial?.finalidade ?? "NORMAL");
  const [formaPagamento, setFormaPagamento] = useState(initial?.formaPagamento || FORMAS_PAGAMENTO[0]);
  const [condicaoPagamento, setCondicaoPagamento] = useState(initial?.condicaoPagamento ?? "");
  const [baixarEstoque, setBaixarEstoque] = useState(false);
  const [codigoLc116Doc, setCodigoLc116Doc] = useState(initial?.codigoServicoLc116 ?? "");

  // ISS (NFS-e): natureza/exigibilidade, alíquota informada, deduções e base de cálculo
  const [taxationType, setTaxationType] = useState("taxationInMunicipality");
  const [aliquotaIss, setAliquotaIss] = useState(initial?.aliquotaIss ?? 0);
  const [deducoes, setDeducoes] = useState(0);

  // Retenções (NFS-e): ISS retido pelo tomador + retenções federais (alíquotas em %)
  const [issRetido, setIssRetido] = useState(initial?.issRetido ?? false);
  const [retIr, setRetIr] = useState(0);
  const [retPis, setRetPis] = useState(0);
  const [retCofins, setRetCofins] = useState(0);
  const [retCsll, setRetCsll] = useState(0);
  const [retInss, setRetInss] = useState(0);
  const [baseRetencao, setBaseRetencao] = useState(0);

  // Totais editáveis (apenas NF-e/NFC-e)
  const [frete, setFrete] = useState(initial?.frete ?? 0);
  const [modalidadeFrete, setModalidadeFrete] = useState(9); // 9 = sem ocorrência de transporte
  const [descontoGlobal, setDescontoGlobal] = useState(initial?.desconto ?? 0);

  const [obs, setObs] = useState(initial?.observacoes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<ResultadoEmissao | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [preview, setPreview] = useState<FiscalPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Id da última nota rejeitada/erro — reenviada (reaproveitada) na próxima tentativa.
  const [retryNotaId, setRetryNotaId] = useState<string | null>(null);

  const isProduto = tipo === "NFE" || tipo === "NFCE";
  const isServico = tipo === "NFSE";
  const isNfce = tipo === "NFCE";
  const tipoLabel = tipo === "NFE" ? "NF-e" : tipo === "NFCE" ? "NFC-e" : "NFS-e";

  const subtotalItens = useMemo(
    () => itens.reduce((s, it) => s + Math.max(it.quantidade * it.precoUnitario - it.desconto, 0), 0),
    [itens]
  );
  const subtotalServicos = useMemo(() => servicos.reduce((s, sv) => s + (Number(sv.valor) || 0), 0), [servicos]);
  const baseIss = useMemo(() => Math.max(subtotalServicos - deducoes, 0), [subtotalServicos, deducoes]);
  const valorIss = useMemo(() => Math.round(baseIss * (aliquotaIss / 100) * 100) / 100, [baseIss, aliquotaIss]);
  const baseRetencaoEfetiva = useMemo(() => (baseRetencao > 0 ? baseRetencao : subtotalServicos), [baseRetencao, subtotalServicos]);
  const retidoFederal = useMemo(
    () => Math.round(baseRetencaoEfetiva * ((retIr + retPis + retCofins + retCsll + retInss) / 100) * 100) / 100,
    [baseRetencaoEfetiva, retIr, retPis, retCofins, retCsll, retInss]
  );
  const subtotal = isServico ? subtotalServicos : subtotalItens;
  const total = Math.max(subtotal - (Number(descontoGlobal) || 0) + (isProduto ? Number(frete) || 0 : 0), 0);

  // ---- Itens ----
  // Adiciona/incrementa um produto do catálogo SEM fechar o seletor (adição múltipla).
  function addProduto(p: Produto) {
    setItens((cur) => {
      const ex = cur.find((it) => it.produtoId === p.id);
      if (ex) return cur.map((it) => (it.produtoId === p.id ? { ...it, quantidade: it.quantidade + 1 } : it));
      return [
        ...cur,
        {
          uid: uid(),
          produtoId: p.id,
          codigo: p.sku,
          descricao: p.nome,
          ncm: p.ncm ?? "",
          cfop: p.cfop ?? "",
          origem: p.origem ?? "0",
          unidade: p.unidade,
          quantidade: 1,
          precoUnitario: p.preco,
          desconto: 0
        }
      ];
    });
  }

  function addItemAvulso() {
    setItens((cur) => [
      ...cur,
      { uid: uid(), produtoId: null, codigo: "", descricao: "", ncm: "", cfop: "", origem: "0", unidade: "UN", quantidade: 1, precoUnitario: 0, desconto: 0 }
    ]);
  }

  const updItem = (id: string, patch: Partial<ItemLinha>) =>
    setItens((cur) => cur.map((it) => (it.uid === id ? { ...it, ...patch } : it)));
  const rmItem = (id: string) => setItens((cur) => cur.filter((it) => it.uid !== id));

  // ---- Serviços ----
  const addServico = () => setServicos((cur) => [...cur, { uid: uid(), descricao: "", valor: 0, codigoServicoLc116: "" }]);
  const updServ = (id: string, patch: Partial<ServicoLinha>) =>
    setServicos((cur) => cur.map((s) => (s.uid === id ? { ...s, ...patch } : s)));
  const rmServ = (id: string) => setServicos((cur) => cur.filter((s) => s.uid !== id));

  function reset() {
    setModoDest("cadastrado");
    setClienteId("");
    setAvNome(""); setAvDocumento(""); setAvIe(""); setAvEmail("");
    setAvLogradouro(""); setAvNumero(""); setAvComplemento(""); setAvBairro("");
    setAvCep(""); setAvCidade(""); setAvUf(data.emitterUf ?? ""); setAvIbge("");
    setItens([]); setServicos([]);
    setNaturezaOperacao("Venda de mercadoria"); setFinalidade("NORMAL");
    setFormaPagamento(FORMAS_PAGAMENTO[0]); setCondicaoPagamento(""); setBaixarEstoque(false);
    setCodigoLc116Doc(""); setFrete(0); setDescontoGlobal(0); setObs("");
    setTaxationType("taxationInMunicipality"); setAliquotaIss(0); setDeducoes(0); setBaseRetencao(0);
    setIssRetido(false); setRetIr(0); setRetPis(0); setRetCofins(0); setRetCsll(0); setRetInss(0);
    setRetryNotaId(null);
    setError("");
  }

  function buildReceiver(): { clienteId?: string } | Record<string, unknown> | null {
    if (modoDest === "cadastrado") {
      if (!clienteId) return null;
      return { clienteId };
    }
    const nome = avNome.trim();
    if (!nome) return null;
    const endereco =
      avLogradouro.trim() || avCidade.trim() || avUf.trim() || avIbge.trim()
        ? {
            logradouro: avLogradouro.trim() || undefined,
            numero: avNumero.trim() || undefined,
            complemento: avComplemento.trim() || undefined,
            bairro: avBairro.trim() || undefined,
            cep: avCep.trim() || undefined,
            cidade: avCidade.trim() || undefined,
            uf: avUf.trim() || undefined,
            codigoMunicipioIbge: avIbge.trim() || undefined
          }
        : undefined;
    return {
      nome,
      documento: avDocumento.trim() || undefined,
      inscricaoEstadual: avIe.trim() || undefined,
      email: avEmail.trim() || undefined,
      endereco
    };
  }

  function validate(): string | null {
    // Destinatário
    if (modoDest === "cadastrado") {
      if (!clienteId && !isNfce) return "Selecione um cliente cadastrado ou informe um destinatário.";
    } else {
      if (!avNome.trim() && !isNfce) return "Informe o nome do destinatário avulso.";
    }
    if (isProduto) {
      if (!itens.length) return "Adicione ao menos um item.";
      for (const [i, it] of itens.entries()) {
        if (!it.produtoId && !it.descricao.trim()) return `Informe a descrição do item avulso ${i + 1}.`;
        if (it.quantidade <= 0) return `Quantidade inválida no item ${i + 1}.`;
        if (it.precoUnitario < 0) return `Preço inválido no item ${i + 1}.`;
      }
    } else {
      if (!servicos.length) return "Adicione ao menos um serviço.";
      for (const [i, sv] of servicos.entries()) {
        if (!sv.descricao.trim()) return `Informe a descrição do serviço ${i + 1}.`;
        if (sv.valor <= 0) return `Valor inválido no serviço ${i + 1}.`;
      }
    }
    return null;
  }

  // Monta o payload de NF-e/NFC-e de produto (compartilhado por emitir e pré-visualizar).
  function buildProdutoBody(receiverPayload: Record<string, unknown>): Record<string, unknown> {
    return {
      modelo: tipo,
      finalidade,
      retryNotaId: retryNotaId ?? undefined,
      // Devolução: referencia a NF-e original (NFref/refNFe) e vincula a nota de origem.
      chaveReferenciada: finalidade === "DEVOLUCAO" ? origem?.chaveReferenciada ?? undefined : undefined,
      notaOrigemId: finalidade === "DEVOLUCAO" ? origem?.notaOrigemId ?? undefined : undefined,
      naturezaOperacao: naturezaOperacao.trim() || undefined,
      receiver: receiverPayload,
      formaPagamento: formaPagamento || undefined,
      condicaoPagamento: condicaoPagamento.trim() || undefined,
      observacoes: obs.trim() || undefined,
      frete: Number(frete) || 0,
      modalidadeFrete,
      desconto: Number(descontoGlobal) || 0,
      baixarEstoque,
      itens: itens.map((it) => ({
        produtoId: it.produtoId ?? undefined,
        codigo: it.produtoId ? undefined : it.codigo.trim() || undefined,
        descricao: it.descricao.trim() || undefined,
        ncm: it.ncm.trim() || undefined,
        cfop: it.cfop.trim() || undefined,
        origem: it.origem.trim() || undefined,
        unidade: it.unidade.trim() || undefined,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
        desconto: it.desconto || 0
      }))
    };
  }

  // Corpo do POST para o painel inline de cálculo (produto). Retorna null quando não há o que calcular.
  function buildPreviewBody(): Record<string, unknown> | null {
    if (!isProduto || !itens.length) return null;
    const receiver = buildReceiver();
    const receiverPayload = receiver ?? { nome: undefined };
    return buildProdutoBody(receiverPayload);
  }

  // Espelho fiscal: prévia dos tributos (somente produto) sem emitir.
  async function previsualizar() {
    setError("");
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    const receiver = buildReceiver();
    const receiverPayload = receiver ?? (isNfce ? { nome: undefined } : null);
    if (!receiverPayload) {
      setError("Informe o destinatário da nota.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/erp/fiscal/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProdutoBody(receiverPayload))
      });
      const data = (await res.json().catch(() => ({}))) as FiscalPreview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível calcular o espelho fiscal.");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível calcular o espelho fiscal.");
    } finally {
      setPreviewing(false);
    }
  }

  async function emitir() {
    setError("");
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    const receiver = buildReceiver();
    // NFC-e admite consumidor anônimo (receiver vazio).
    const receiverPayload = receiver ?? (isNfce ? { nome: undefined } : null);
    if (!receiverPayload) {
      setError("Informe o destinatário da nota.");
      return;
    }

    setSaving(true);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      if (isProduto) {
        endpoint = "/api/erp/fiscal/emitir/produto";
        body = buildProdutoBody(receiverPayload);
      } else {
        endpoint = "/api/erp/fiscal/emitir/servico";
        body = {
          retryNotaId: retryNotaId ?? undefined,
          receiver: receiverPayload,
          observacoes: obs.trim() || undefined,
          condicaoPagamento: condicaoPagamento.trim() || undefined,
          formaPagamento: formaPagamento || undefined,
          codigoServicoLc116: codigoLc116Doc.trim() || undefined,
          taxationType,
          aliquotaIss: aliquotaIss > 0 ? aliquotaIss : undefined,
          deducoes: deducoes > 0 ? deducoes : undefined,
          servicos: servicos.map((sv) => ({
            descricao: sv.descricao.trim(),
            valor: Number(sv.valor) || 0,
            codigoServicoLc116: sv.codigoServicoLc116.trim() || undefined
          })),
          retencoes: {
            issRetido,
            baseRetencao: baseRetencao > 0 ? baseRetencao : undefined,
            ir: retIr > 0 ? { aliquota: retIr } : undefined,
            pis: retPis > 0 ? { aliquota: retPis } : undefined,
            cofins: retCofins > 0 ? { aliquota: retCofins } : undefined,
            csll: retCsll > 0 ? { aliquota: retCsll } : undefined,
            inss: retInss > 0 ? { aliquota: retInss } : undefined
          }
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await res.json()) as ResultadoEmissao & { error?: string };
      if (!res.ok) throw new Error(payload.error || "Não foi possível emitir a nota fiscal.");
      // Rejeição/erro: guarda o id para reaproveitar o mesmo registro no reenvio. Sucesso: limpa.
      setRetryNotaId(statusTone(payload.status) === "danger" ? payload.id : null);
      setResultado({
        id: payload.id,
        status: payload.status,
        numero: payload.numero ?? null,
        chaveAcesso: payload.chaveAcesso ?? null,
        motivo: payload.motivo ?? null
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível emitir a nota fiscal.");
    } finally {
      setSaving(false);
    }
  }

  async function sincronizar() {
    if (!resultado) return;
    setSyncing(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/fiscal/${resultado.id}/sincronizar`, { method: "POST" });
      const payload = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) throw new Error(payload.error || "Não foi possível sincronizar o status.");
      if (payload.status) setResultado((cur) => (cur ? { ...cur, status: payload.status as string } : cur));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível sincronizar o status.");
    } finally {
      setSyncing(false);
    }
  }

  function novaEmissao() {
    setResultado(null);
    reset();
  }

  // Fecha o resultado mantendo todos os dados preenchidos — usado quando a nota é rejeitada,
  // para que o usuário corrija o problema apontado e reenvie sem refazer tudo.
  function corrigirEReenviar() {
    setResultado(null);
  }

  const clienteSel = data.clientes.find((c) => c.id === clienteId) ?? null;
  const destResumo: string =
    modoDest === "cadastrado"
      ? clienteSel
        ? `${clienteSel.documento ?? "sem documento"}${clienteSel.uf ? ` · ${clienteSel.uf}` : ""}`
        : isNfce
          ? "Consumidor não identificado (opcional)"
          : "Selecione o cliente"
      : avNome.trim() || (isNfce ? "Consumidor não identificado (opcional)" : "Informe o destinatário");

  const podeEmitir = !saving && (isProduto ? itens.length > 0 : servicos.length > 0);

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">Fiscal <span className="sep">/</span> Emitir nota</div>
          <h1 className="erp-page-title">Emitir nota fiscal</h1>
          <p className="erp-page-sub">Emissão avulsa de NF-e, NFC-e e NFS-e — sem necessidade de pedido ou ordem de serviço.</p>
        </div>
        <button type="button" className="btn-erp ghost sm" onClick={reset}>Limpar</button>
      </div>

      {origem && (
        <div className={`alert ${origem.modo === "DEVOLUCAO" ? "warn" : "info"}`} style={{ marginBottom: 14 }}>
          <strong>{origem.modo === "DEVOLUCAO" ? "Devolução de nota fiscal" : "Clonando nota fiscal"}</strong>
          <span>
            {origem.modo === "DEVOLUCAO"
              ? `NF-e de devolução referente à ${origem.origemLabel}${origem.origemChave ? ` (chave ${origem.origemChave})` : ""}. Confira os itens, quantidades a devolver e o CFOP antes de emitir.`
              : `Pré-preenchido a partir da ${origem.origemLabel}. Ajuste o que precisar e emita como uma nova nota.`}
          </span>
        </div>
      )}

      <div className="atend-types" role="tablist" aria-label="Tipo de documento fiscal">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tipo === t.id}
            className={`atend-type${tipo === t.id ? " active" : ""}`}
            onClick={() => {
              if (t.id === "NFSE") { router.push("/erp/fiscal/emitir/nfse"); return; }
              setTipo(t.id); setError("");
            }}
          >
            <span className="ic" aria-hidden="true">{t.icon}</span>
            <span><strong>{t.label}</strong><small>{t.desc}</small></span>
          </button>
        ))}
      </div>

      {error && <div className="alert danger"><span className="lead">Atenção:</span> {error}</div>}

      <div className="atend-grid">
        <div className="atend-main">
          {/* DESTINATÁRIO */}
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>
                Destinatário{" "}
                {isNfce && <span style={{ color: "var(--erp-mute)", fontSize: 11, marginLeft: 4 }}>(opcional para NFC-e)</span>}
              </h3>
              <div className="actions" role="radiogroup" aria-label="Tipo de destinatário">
                <button
                  type="button"
                  className={`btn-erp ${modoDest === "cadastrado" ? "primary" : "ghost"} xs`}
                  aria-pressed={modoDest === "cadastrado"}
                  onClick={() => setModoDest("cadastrado")}
                >
                  Cliente cadastrado
                </button>
                <button
                  type="button"
                  className={`btn-erp ${modoDest === "avulso" ? "primary" : "ghost"} xs`}
                  aria-pressed={modoDest === "avulso"}
                  onClick={() => setModoDest("avulso")}
                >
                  Destinatário avulso
                </button>
              </div>
            </div>

            <div className="atend-client">
              <span className="avatar" aria-hidden="true">{modoDest === "cadastrado" && clienteSel ? "👤" : "👥"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{modoDest === "cadastrado" ? clienteSel?.label ?? "Consumidor final" : avNome.trim() || "Destinatário avulso"}</strong>
                <small>{destResumo}</small>
              </div>
            </div>

            {modoDest === "cadastrado" ? (
              <div className="erp-card-body">
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }} htmlFor="cli-select">Cliente</label>
                <select
                  id="cli-select"
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  style={{ width: "100%", height: 36, border: "1px solid var(--erp-line)", borderRadius: 5, padding: "0 10px", fontSize: 13 }}
                >
                  <option value="">{isNfce ? "Consumidor não identificado" : "Selecione um cliente…"}</option>
                  {data.clientes.map((c: Cliente) => (
                    <option key={c.id} value={c.id}>
                      {c.label}{c.documento ? ` · ${c.documento}` : ""}{c.uf ? ` (${c.uf})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="erp-form" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                {lookupErro && <div className="alert danger full"><span>{lookupErro}</span></div>}
                <label className="full">Nome / Razão social<input value={avNome} onChange={(e) => setAvNome(e.target.value)} placeholder="Nome do destinatário" /></label>
                <label>CPF / CNPJ
                  <span style={{ display: "flex", gap: 6 }}>
                    <input value={avDocumento} onChange={(e) => setAvDocumento(e.target.value)} inputMode="numeric" placeholder="Somente números" style={{ flex: 1 }} />
                    <button type="button" className="btn-erp light xs" onClick={preencherDestPorCnpj} disabled={buscandoCnpj}>{buscandoCnpj ? "…" : "CNPJ"}</button>
                  </span>
                </label>
                <label>Inscrição estadual<input value={avIe} onChange={(e) => setAvIe(e.target.value)} placeholder="ISENTO ou nº" /></label>
                <label>E-mail<input type="email" value={avEmail} onChange={(e) => setAvEmail(e.target.value)} placeholder="email@dominio.com" /></label>
                <label className="full">Logradouro<input value={avLogradouro} onChange={(e) => setAvLogradouro(e.target.value)} /></label>
                <label>Número<input value={avNumero} onChange={(e) => setAvNumero(e.target.value)} /></label>
                <label>Complemento<input value={avComplemento} onChange={(e) => setAvComplemento(e.target.value)} /></label>
                <label>Bairro<input value={avBairro} onChange={(e) => setAvBairro(e.target.value)} /></label>
                <label>CEP
                  <span style={{ display: "flex", gap: 6 }}>
                    <input value={avCep} onChange={(e) => setAvCep(e.target.value)} onBlur={preencherDestPorCep} inputMode="numeric" style={{ flex: 1 }} />
                    <button type="button" className="btn-erp light xs" onClick={preencherDestPorCep} disabled={buscandoCep}>{buscandoCep ? "…" : "CEP"}</button>
                  </span>
                </label>
                <label>Cidade<input value={avCidade} onChange={(e) => setAvCidade(e.target.value)} /></label>
                <label>
                  UF
                  <select value={avUf} onChange={(e) => setAvUf(e.target.value)}>
                    <option value="">—</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </label>
                <label>Cód. município (IBGE)<input value={avIbge} onChange={(e) => setAvIbge(e.target.value)} inputMode="numeric" placeholder="7 dígitos" /></label>
              </div>
            )}
          </div>

          {/* ITENS (NF-e / NFC-e) */}
          {isProduto && (
            <div className="erp-card">
              <div className="erp-card-head">
                <h3>Itens</h3>
                <div className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={addItemAvulso}>+ Item avulso</button>
                  <button type="button" className="btn-erp primary xs" onClick={() => setShowProd(true)}>+ Do catálogo</button>
                </div>
              </div>
              {itens.length === 0 ? (
                <div className="empty-st">
                  <div style={{ fontSize: 32, opacity: .5 }} aria-hidden="true">⬚</div>
                  <h4 style={{ marginTop: 10 }}>Nenhum item adicionado</h4>
                  <p>Selecione produtos do catálogo (herdam NCM/CFOP/origem) ou adicione um item avulso.</p>
                  <button type="button" className="btn-erp primary sm" style={{ marginTop: 8 }} onClick={() => setShowProd(true)}>+ Adicionar do catálogo</button>
                </div>
              ) : (
                <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th style={{ minWidth: 180 }}>Descrição</th>
                        <th>NCM</th>
                        <th>CFOP</th>
                        <th>Un.</th>
                        <th className="num">Qtd</th>
                        <th className="num">Preço un.</th>
                        <th className="num">Desc. R$</th>
                        <th className="num">Subtotal</th>
                        <th className="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((it) => {
                        const sub = Math.max(it.quantidade * it.precoUnitario - it.desconto, 0);
                        const cat = Boolean(it.produtoId);
                        return (
                          <tr key={it.uid}>
                            <td>
                              {cat
                                ? <span className="mono bold">{it.codigo || "—"}</span>
                                : <input value={it.codigo} onChange={(e) => updItem(it.uid, { codigo: e.target.value })} placeholder="cód." style={{ ...cellInput, width: 80 }} />}
                            </td>
                            <td>
                              {cat
                                ? <div style={{ fontWeight: 600 }}>{it.descricao}</div>
                                : <input value={it.descricao} onChange={(e) => updItem(it.uid, { descricao: e.target.value })} placeholder="Descrição do item" style={cellInput} aria-label="Descrição do item" />}
                            </td>
                            <td><input value={it.ncm} onChange={(e) => updItem(it.uid, { ncm: e.target.value })} placeholder="NCM" style={{ ...cellInput, width: 90 }} aria-label="NCM" /></td>
                            <td><input value={it.cfop} onChange={(e) => updItem(it.uid, { cfop: e.target.value })} placeholder="CFOP" style={{ ...cellInput, width: 70 }} aria-label="CFOP" /></td>
                            <td><input value={it.unidade} onChange={(e) => updItem(it.uid, { unidade: e.target.value })} style={{ ...cellInput, width: 56 }} aria-label="Unidade" /></td>
                            <td className="num">
                              <input
                                type="number"
                                min={0}
                                max={it.maxQuantidade}
                                step="any"
                                value={it.quantidade}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  updItem(it.uid, { quantidade: it.maxQuantidade != null ? Math.min(v, it.maxQuantidade) : v });
                                }}
                                style={cellNum}
                                aria-label="Quantidade"
                              />
                              {it.maxQuantidade != null && (
                                <span style={{ display: "block", fontSize: 10, color: "var(--erp-mute)" }}>máx: {it.maxQuantidade}</span>
                              )}
                            </td>
                            <td className="num"><input type="number" min={0} step="any" value={it.precoUnitario} onChange={(e) => updItem(it.uid, { precoUnitario: Math.max(0, Number(e.target.value) || 0) })} style={cellNum} aria-label="Preço unitário" /></td>
                            <td className="num"><input type="number" min={0} step="any" value={it.desconto} onChange={(e) => updItem(it.uid, { desconto: Math.max(0, Number(e.target.value) || 0) })} style={cellNum} aria-label="Desconto" /></td>
                            <td className="num bold">{brl(sub)}</td>
                            <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmItem(it.uid)} aria-label="Remover item">✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SERVIÇOS (NFS-e) */}
          {isServico && (
            <div className="erp-card">
              <div className="erp-card-head">
                <h3>Serviços</h3>
                <button type="button" className="btn-erp primary xs" onClick={addServico}>+ Adicionar serviço</button>
              </div>
              {servicos.length === 0 ? (
                <div className="empty-st">
                  <h4>Nenhum serviço</h4>
                  <p>Adicione os serviços prestados e selecione o código LC 116 correspondente.</p>
                  <button type="button" className="btn-erp primary sm" style={{ marginTop: 8 }} onClick={addServico}>+ Adicionar serviço</button>
                </div>
              ) : (
                <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 200 }}>Descrição</th>
                        <th style={{ minWidth: 220 }}>Código LC 116</th>
                        <th className="num">Valor</th>
                        <th className="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {servicos.map((sv) => (
                        <tr key={sv.uid}>
                          <td><input value={sv.descricao} onChange={(e) => updServ(sv.uid, { descricao: e.target.value })} placeholder="Descrição do serviço prestado" style={cellInput} aria-label="Descrição do serviço" /></td>
                          <td>
                            <select
                              value={sv.codigoServicoLc116}
                              onChange={(e) => updServ(sv.uid, { codigoServicoLc116: e.target.value })}
                              style={{ ...cellInput, width: "100%" }}
                              aria-label="Código LC 116 do serviço"
                            >
                              <option value="">Usar código padrão do documento</option>
                              {data.lc116.map((l) => <option key={l.code} value={l.code}>{l.code} — {l.description}</option>)}
                            </select>
                          </td>
                          <td className="num"><input type="number" min={0} step="any" value={sv.valor} onChange={(e) => updServ(sv.uid, { valor: Math.max(0, Number(e.target.value) || 0) })} style={cellNum} aria-label="Valor do serviço" /></td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmServ(sv.uid)} aria-label="Remover serviço">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CÁLCULO DE IMPOSTO (painel inline, formato Bling) — abaixo dos itens, só produto */}
          {isProduto && (
            <CalculoImpostoPanel
              endpoint="/api/erp/fiscal/preview"
              buildBody={buildPreviewBody}
              deps={[JSON.stringify(itens), frete, descontoGlobal, tipo, finalidade, modalidadeFrete, modoDest, clienteId, avUf, avDocumento]}
            />
          )}

          {/* OBSERVAÇÕES */}
          <div className="erp-card">
            <div className="erp-card-head"><h3>Observações</h3></div>
            <div className="erp-card-body">
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Informações complementares que constarão na nota fiscal…" style={textareaStyle} aria-label="Observações" />
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <aside className="atend-rail">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Totais</h3></div>
            <div className="erp-card-body">
              <div className="atend-total-row">
                <span>{isServico ? "Serviços" : "Itens"} ({isServico ? servicos.length : itens.reduce((s, it) => s + it.quantidade, 0)})</span>
                <b>{brl(subtotal)}</b>
              </div>
              <div className="atend-total-row"><span>Subtotal</span><b>{brl(subtotal)}</b></div>
              <div className="atend-total-row">
                <span>Desconto</span>
                <span>R$ <input className="pct-input" style={{ width: 90 }} type="number" min={0} step="any" value={descontoGlobal} onChange={(e) => setDescontoGlobal(Math.max(0, Number(e.target.value) || 0))} aria-label="Desconto global" /></span>
              </div>
              {isProduto && (
                <>
                  <div className="atend-total-row">
                    <span>Frete</span>
                    <span>R$ <input className="pct-input" style={{ width: 90 }} type="number" min={0} step="any" value={frete} onChange={(e) => setFrete(Math.max(0, Number(e.target.value) || 0))} aria-label="Frete" /></span>
                  </div>
                  <div className="atend-total-row">
                    <span>Modalidade do frete</span>
                    <select value={modalidadeFrete} onChange={(e) => setModalidadeFrete(Number(e.target.value))} aria-label="Modalidade do frete" style={{ maxWidth: 200 }}>
                      {FRETE_MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="atend-total-row grand"><span>Total</span><strong>{brl(total)}</strong></div>
            </div>
          </div>

          {/* OPERAÇÃO */}
          <div className="erp-card">
            <div className="erp-card-head"><h3>Operação</h3></div>
            {isProduto ? (
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>Natureza da operação<input value={naturezaOperacao} onChange={(e) => setNaturezaOperacao(e.target.value)} placeholder="Venda de mercadoria" /></label>
                {tipo === "NFE" && (
                  <label>
                    Finalidade
                    <select value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade)}>
                      {FINALIDADES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  Forma de pagamento
                  <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                    {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: à vista, 30/60/90" /></label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={baixarEstoque} onChange={(e) => setBaixarEstoque(e.target.checked)} style={{ accentColor: "var(--erp-yellow-dk)", width: 16, height: 16 }} />
                  <span style={{ fontSize: 12.5 }}>Baixar estoque dos itens de catálogo após autorização</span>
                </label>
              </div>
            ) : (
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>
                  Natureza / exigibilidade do ISS
                  <select value={taxationType} onChange={(e) => setTaxationType(e.target.value)}>
                    <option value="taxationInMunicipality">Tributado no município</option>
                    <option value="taxationOutsideMunicipality">Tributado fora do município</option>
                    <option value="exemption">Isento</option>
                    <option value="immune">Imune</option>
                    <option value="exportation">Exportação de serviço</option>
                    <option value="nonIncidence">Não incidência</option>
                    <option value="suspendedByCourt">Exigibilidade suspensa (judicial)</option>
                    <option value="suspendedByAdministrativeProcedure">Exigibilidade suspensa (administrativa)</option>
                  </select>
                </label>
                <label>
                  Código LC 116 padrão do documento
                  <select value={codigoLc116Doc} onChange={(e) => setCodigoLc116Doc(e.target.value)}>
                    <option value="">Usar padrão da configuração fiscal</option>
                    {data.lc116.map((l) => <option key={l.code} value={l.code}>{l.code} — {l.description}</option>)}
                  </select>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>Alíquota ISS %<input type="number" min={0} step="any" value={aliquotaIss} onChange={(e) => setAliquotaIss(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex.: 5" /></label>
                  <label>Deduções (R$)<input type="number" min={0} step="any" value={deducoes} onChange={(e) => setDeducoes(Math.max(0, Number(e.target.value) || 0))} /></label>
                </div>
                <div className="atend-total-row"><span>Base de cálculo do ISS</span><b>{brl(baseIss)}</b></div>
                <div className="atend-total-row"><span>Valor do ISS</span><b>{brl(valorIss)}</b></div>
                <label>
                  Forma de pagamento
                  <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                    {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: à vista, 30 dias" /></label>
                <p style={{ fontSize: 11.5, color: "var(--erp-mute)", margin: "2px 0 0" }}>
                  Informe a alíquota de ISS aqui (sobrepõe a regra tributária). Se deixar 0, o ISS é calculado pela regra tributária/configuração fiscal da empresa.
                </p>
              </div>
            )}
          </div>

          {/* RETENÇÕES (NFS-e) */}
          {isServico && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Retenções na fonte</h3></div>
              <div className="erp-card-body">
                <label className="checkbox" style={{ marginBottom: 10 }}>
                  <input type="checkbox" checked={issRetido} onChange={(e) => setIssRetido(e.target.checked)} /> ISS retido pelo tomador
                </label>
                <p style={{ fontSize: 11.5, color: "var(--erp-mute)", margin: "0 0 10px" }}>
                  Retenções federais (informe a alíquota % quando o tomador retém):
                </p>
                <label style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Base de cálculo das retenções (R$)</span>
                  <input type="number" min={0} step="any" value={baseRetencao} onChange={(e) => setBaseRetencao(Math.max(0, Number(e.target.value) || 0))} placeholder={`Padrão: valor dos serviços (${brl(subtotalServicos)})`} />
                </label>
                <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr", padding: 0, gap: 8 }}>
                  <label>IRRF %<input type="number" min={0} step="any" value={retIr} onChange={(e) => setRetIr(Math.max(0, Number(e.target.value) || 0))} /></label>
                  <label>INSS %<input type="number" min={0} step="any" value={retInss} onChange={(e) => setRetInss(Math.max(0, Number(e.target.value) || 0))} /></label>
                  <label>PIS %<input type="number" min={0} step="any" value={retPis} onChange={(e) => setRetPis(Math.max(0, Number(e.target.value) || 0))} /></label>
                  <label>COFINS %<input type="number" min={0} step="any" value={retCofins} onChange={(e) => setRetCofins(Math.max(0, Number(e.target.value) || 0))} /></label>
                  <label>CSLL %<input type="number" min={0} step="any" value={retCsll} onChange={(e) => setRetCsll(Math.max(0, Number(e.target.value) || 0))} /></label>
                </div>
                <div className="atend-total-row" style={{ marginTop: 10 }}>
                  <span>Retido federal</span><b style={{ color: "var(--erp-danger)" }}>− {brl(retidoFederal)}</b>
                </div>
                <div className="atend-total-row grand"><span>Líquido a receber</span><strong>{brl(Math.max(subtotalServicos - retidoFederal, 0))}</strong></div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="btn-erp primary lg" disabled={!podeEmitir} onClick={emitir}>
              {saving ? "Emitindo…" : `Emitir ${tipoLabel}`}
            </button>
            {isProduto && (
              <button type="button" className="btn-erp light sm" onClick={previsualizar} disabled={saving || previewing}>
                {previewing ? "Calculando…" : "🔍 Espelho fiscal (prévia dos impostos)"}
              </button>
            )}
            <button type="button" className="btn-erp ghost sm" onClick={reset} disabled={saving}>Limpar</button>
          </div>
        </aside>
      </div>

      {preview && <EspelhoFiscalModal preview={preview} onClose={() => setPreview(null)} />}

      {/* PRODUTO PICKER — adiciona vários sem fechar */}
      {showProd && (
        <ProductPicker
          produtos={data.produtos}
          itens={itens}
          onAdd={addProduto}
          onRemoveProduto={(produtoId) => setItens((cur) => cur.filter((it) => it.produtoId !== produtoId))}
          onClose={() => setShowProd(false)}
        />
      )}

      {/* RESULTADO */}
      {resultado && (() => {
      const falhou = statusTone(resultado.status) === "danger";
      // Em rejeição/erro, fechar (no backdrop) preserva os dados para correção; em sucesso, limpa.
      const aoFechar = falhou ? corrigirEReenviar : novaEmissao;
      return (
        <div className="drawer-bd" style={{ display: "grid", placeItems: "center" }} onClick={aoFechar} role="presentation">
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 520, width: "92%" }} role="dialog" aria-modal="true" aria-label="Resultado da emissão">
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 64, height: 64, margin: "0 auto 14px", borderRadius: "50%",
                  background: statusTone(resultado.status) === "success" ? "rgba(22,163,74,.15)" : statusTone(resultado.status) === "danger" ? "rgba(220,38,38,.15)" : "rgba(217,119,6,.15)",
                  color: statusTone(resultado.status) === "success" ? "var(--erp-success)" : statusTone(resultado.status) === "danger" ? "var(--erp-danger)" : "var(--erp-warn)",
                  display: "grid", placeItems: "center", fontSize: 30
                }}
                aria-hidden="true"
              >
                {statusTone(resultado.status) === "success" ? "✓" : statusTone(resultado.status) === "danger" ? "✕" : "⏳"}
              </div>
              <h2 style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 26, margin: "0 0 4px" }}>
                {statusTone(resultado.status) === "success" ? `${tipoLabel} autorizada!` : statusTone(resultado.status) === "danger" ? `${tipoLabel} não autorizada` : `${tipoLabel} em processamento`}
              </h2>
              <p style={{ margin: "0 0 16px" }}>
                <span className={`pill ${statusTone(resultado.status)}`}><span className="dot" />{resultado.status}</span>
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 18 }}>
              {resultado.numero && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--erp-slate)" }}>Número</span><b className="mono">{resultado.numero}</b>
                </div>
              )}
              {resultado.chaveAcesso && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--erp-slate)" }}>Chave de acesso</span>
                  <b className="mono" style={{ fontSize: 11, textAlign: "right", wordBreak: "break-all" }}>{resultado.chaveAcesso}</b>
                </div>
              )}
              {resultado.motivo && statusTone(resultado.status) !== "success" && (
                <div className="alert danger" style={{ marginTop: 6 }}><span className="lead">Motivo:</span> {resultado.motivo}</div>
              )}
              {falhou && (
                <p style={{ fontSize: 12.5, color: "var(--erp-slate)", margin: "2px 0 0" }}>
                  Corrija o item apontado acima — seus dados foram mantidos. Reenviar gera uma nova tentativa.
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {falhou ? (
                <>
                  <button type="button" className="btn-erp primary sm" onClick={corrigirEReenviar}>Corrigir e reenviar</button>
                  <button type="button" className="btn-erp ghost sm" onClick={novaEmissao}>Começar do zero</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-erp ghost sm" onClick={sincronizar} disabled={syncing}>
                    {syncing ? "Sincronizando…" : "Sincronizar status"}
                  </button>
                  <button type="button" className="btn-erp ghost sm" onClick={novaEmissao}>Nova emissão</button>
                  <button type="button" className="btn-erp primary sm" onClick={() => router.push("/erp/fiscal")}>Ver notas emitidas →</button>
                </>
              )}
            </div>
          </div>
        </div>
      );
      })()}
    </div>
  );
}

// Seletor de produtos com adição múltipla: cada clique adiciona/incrementa o item e mostra a
// quantidade no carrinho, sem fechar o drawer. "Concluir (N)" volta para a emissão.
function ProductPicker({ produtos, itens, onAdd, onRemoveProduto, onClose }: {
  produtos: Produto[]; itens: ItemLinha[]; onAdd: (p: Produto) => void; onRemoveProduto: (produtoId: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const qtyById = new Map(itens.filter((it) => it.produtoId).map((it) => [it.produtoId as string, it.quantidade]));
  const totalCatalogo = itens.filter((it) => it.produtoId).reduce((s, it) => s + it.quantidade, 0);
  const list = produtos
    .filter((p) => correspondeBusca(q, p.sku, p.nome, p.gtin, p.codigoOriginal, p.codigoFabricante))
    .slice(0, 50);
  return (
    <>
      <div className="drawer-bd" onClick={onClose} role="presentation" />
      <aside className="drawer" style={{ width: 720 }} role="dialog" aria-modal="true" aria-label="Adicionar produtos">
        <header className="drawer-head">
          <h2>Adicionar produtos</h2>
          <button type="button" className="btn-erp primary sm" onClick={onClose}>Concluir ({totalCatalogo})</button>
        </header>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--erp-line)" }}>
          <input autoFocus placeholder="Busque por SKU ou nome e clique para adicionar (pode adicionar vários)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13 }} aria-label="Buscar produto" />
        </div>
        <div className="drawer-body">
          <table className="erp-table">
            <thead>
              <tr><th>SKU</th><th>Produto</th><th>NCM</th><th className="num">Estoque</th><th className="num">Preço</th><th className="num">No carrinho</th><th className="actions" /></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const qty = qtyById.get(p.id) ?? 0;
                return (
                  <tr key={p.id} onClick={() => onAdd(p)} style={{ cursor: "pointer", background: qty > 0 ? "rgba(255,193,7,.06)" : undefined }}>
                    <td className="mono bold">{p.sku}</td>
                    <td><div style={{ fontWeight: 600 }}>{p.nome}</div></td>
                    <td className="mono">{p.ncm || "—"}</td>
                    <td className="num bold" style={{ color: p.disponivel <= 0 ? "var(--erp-danger)" : p.disponivel <= 5 ? "var(--erp-warn)" : "var(--erp-success)" }}>{p.disponivel}</td>
                    <td className="num bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.preco)}</td>
                    <td className="num bold">{qty > 0 ? `${qty}×` : "—"}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {qty > 0 && <button type="button" className="btn-erp ghost xs icon-only" aria-label="Remover" onClick={() => onRemoveProduto(p.id)}>✕</button>}
                      <button type="button" className="btn-erp primary xs" onClick={() => onAdd(p)}>+ Add</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <div className="empty-st"><h4>Nenhum resultado</h4><p>Tente outro termo de busca.</p></div>}
        </div>
      </aside>
    </>
  );
}
