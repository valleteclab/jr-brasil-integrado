import type { ModeloFiscal, NotaFiscalItem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertLimiteNotasDoPlano } from "./plano-emissao-gate";
import { runInTransaction } from "@/lib/db/with-tx-retry";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextFiscalNumber } from "@/lib/numbering";
import {
  accumulateTotals,
  computeItemTaxes,
  emptyTotals,
  loadSalesTaxRules,
  pickRule
} from "../tax-engine";
import { isSubstituicaoTributaria, resolveCfopDevolucao, resolveCfopVenda } from "../cfop";
import { reformaBaseline } from "../national-tax-baseline";
import type { ItemTaxResult, NormalizedFiscalDocument, NormalizedFiscalItem } from "../types";
import { resolveFiscalProvider } from "../providers";
import type { ProviderContext } from "../providers/types";
import { gerarDanfePdf } from "../providers/sefaz/danfe-pdf";
import { gerarDanfcePdf } from "../providers/sefaz/danfce-pdf";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";
import { lookupCep } from "@/lib/lookup/cadastro-lookup";
import { isValidCnpj } from "@/lib/fiscal/documento";
import { publishRealtime } from "@/lib/realtime/broker";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function num(value: Prisma.Decimal | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Item persistido da nota original carregado para espelhar a devolução. */
type NotaOriginalItem = NotaFiscalItem;

/**
 * DEVOLUÇÃO — espelha os tributos PERSISTIDOS de um item da nota original, rateados pela fração
 * devolvida (quantidade devolvida / quantidade original). Em devolução total a fração é 1
 * (valores idênticos aos da original); em parcial, rateia base/valores monetários e preserva
 * alíquotas, CST/CSOSN, FCP e ST exatamente como na emissão original — em vez de recalcular pelas
 * regras atuais. Isso garante que o crédito de ICMS da devolução case com o débito da venda.
 */
function mirrorTaxesFromOriginal(
  devItem: NormalizedFiscalItem,
  original: NotaOriginalItem
): ItemTaxResult {
  const qtdOriginal = num(original.quantidade);
  const qtdDevolvida = devItem.quantidade;
  // Fração devolvida: total (1) quando devolve tudo; proporcional na parcial. Nunca > 1.
  const fracao = qtdOriginal > 0 ? Math.min(qtdDevolvida / qtdOriginal, 1) : 1;
  const rateia = (valor: number) => round2(valor * fracao);
  // Base e alíquotas-base de IBS/CBS do item devolvido (Reforma).
  const baseDevol = round2(Math.max(devItem.valorTotal - devItem.desconto, 0));
  const reformaBl = reformaBaseline();

  return {
    origem: original.origem ?? devItem.origem ?? "0",
    cstIcms: original.cstIcms,
    csosn: original.csosn,
    // Base e valores monetários rateados; alíquotas/percentuais preservados (não dependem da qtd).
    baseIcms: rateia(num(original.baseIcms)),
    aliquotaIcms: num(original.aliquotaIcms),
    valorIcms: rateia(num(original.valorIcms)),
    percentualFcp: num(original.percentualFcp),
    valorFcp: rateia(num(original.valorFcp)),
    modalidadeBcSt: original.modalidadeBcSt,
    percentualMva: num(original.percentualMva),
    baseIcmsSt: rateia(num(original.baseIcmsSt)),
    aliquotaIcmsSt: num(original.aliquotaIcmsSt),
    valorIcmsSt: rateia(num(original.valorIcmsSt)),
    cstIpi: original.cstIpi,
    aliquotaIpi: num(original.aliquotaIpi),
    valorIpi: rateia(num(original.valorIpi)),
    cstPis: original.cstPis,
    aliquotaPis: num(original.aliquotaPis),
    valorPis: rateia(num(original.valorPis)),
    cstCofins: original.cstCofins,
    aliquotaCofins: num(original.aliquotaCofins),
    valorCofins: rateia(num(original.valorCofins)),
    itemListaServico: original.itemListaServico,
    aliquotaIss: num(original.aliquotaIss),
    valorIss: rateia(num(original.valorIss)),
    // Reforma Tributária (IBS/CBS): a original (venda pré-Reforma) não persiste os valores, então
    // a devolução destaca o IBS/CBS sobre o valor devolvido com as alíquotas-base do período (igual
    // à saída espelhada), para que o estorno carregue o tributo. IS = 0 (só produtos específicos).
    baseIbsCbs: baseDevol,
    aliquotaIbs: reformaBl.ibs,
    valorIbs: round2(baseDevol * (reformaBl.ibs / 100)),
    aliquotaCbs: reformaBl.cbs,
    valorCbs: round2(baseDevol * (reformaBl.cbs / 100)),
    aliquotaIs: 0,
    valorIs: 0,
    valorTributos: rateia(num(original.valorTributos)),
    cClassTrib: original.cClassTrib,
    cstIbsCbs: "000",
    // Devolução espelha a nota original (não passa pelo matching de regras) — sem aviso de padrão.
    regraId: null,
    regraNome: null,
    regraAplicada: true
  };
}

/**
 * Casa cada item da DEVOLUÇÃO com o item correspondente da nota original (por produtoId e/ou
 * código). Retorna um Map por índice do item da devolução → item original. Itens sem
 * correspondência lançam erro claro (não se pode devolver o que não estava na nota original).
 */
function matchDevolucaoItems(
  itens: NormalizedFiscalItem[],
  originais: NotaOriginalItem[]
): Map<number, NotaOriginalItem> {
  const result = new Map<number, NotaOriginalItem>();
  const usados = new Set<string>();

  const acharOriginal = (dev: NormalizedFiscalItem): NotaOriginalItem | undefined => {
    // 1) Match forte por produtoId (quando ambos têm), priorizando um ainda não usado.
    if (dev.produtoId) {
      const porProduto = originais.filter((o) => o.produtoId && o.produtoId === dev.produtoId);
      const livre = porProduto.find((o) => !usados.has(o.id));
      if (livre) return livre;
      if (porProduto.length) return porProduto[0];
    }
    // 2) Match por código do item (fallback quando não há produtoId, ou item avulso).
    const codigoDev = (dev.codigo ?? "").trim();
    if (codigoDev) {
      const porCodigo = originais.filter((o) => (o.codigo ?? "").trim() === codigoDev);
      const livre = porCodigo.find((o) => !usados.has(o.id));
      if (livre) return livre;
      if (porCodigo.length) return porCodigo[0];
    }
    return undefined;
  };

  itens.forEach((dev, index) => {
    const original = acharOriginal(dev);
    if (!original) {
      throw new Error(
        `Não foi possível espelhar a devolução: o item ${index + 1} (${dev.descricao}) não foi encontrado na nota original referenciada. ` +
          "Confira se o produto/código corresponde a um item da nota que está sendo devolvida."
      );
    }
    usados.add(original.id);
    result.set(index, original);
  });

  return result;
}

/**
 * UF de destino EFETIVA para CFOP/tributação. A NFC-e (mod 65) é sempre operação interna
 * (consumidor final presencial): a SEFAZ exige idDest=1 e CFOP 5xxx, então o destino efetivo
 * é a UF do próprio emitente — independentemente de o cliente ter endereço em outra UF.
 */
function resolveUfDestino(modelo: ModeloFiscal, ufEmitente: string | null, ufDestinatario: string | null): string | null {
  return modelo === "NFCE" ? ufEmitente : ufDestinatario;
}

/**
 * CFOP de uma venda de SAÍDA, respeitando o CFOP do cadastro do produto SOMENTE quando o PREFIXO
 * dele bate com a operação efetiva:
 *  - operação interna (mesma UF, ou NFC-e que é sempre interna): exige 5xxx;
 *  - operação interestadual (UF emitente ≠ UF destino): exige 6xxx.
 * Quando o prefixo não bate (ex.: produto cadastrado com 6102 vendido dentro do estado, ou CFOP de
 * ENTRADA 1xxx/2xxx herdado do XML do fornecedor), deriva pelo contexto — que já respeita ST e
 * produção própria. Isso evita a rejeição da SEFAZ "CFOP não é de Operação Estadual e UF emitente
 * igual a UF destinatário" (e o caso inverso), porque um simples swap de prefixo erraria os CFOPs
 * de ST (5405 interno ↔ 6404 interestadual, não 6405).
 */
function resolveCfopSaida(modelo: ModeloFiscal, cfopItem: string | null | undefined, ctx: Parameters<typeof resolveCfopVenda>[0]): string {
  const cfop = onlyDigits(cfopItem);
  const origem = ctx.ufOrigem?.trim().toUpperCase();
  const destino = ctx.ufDestino?.trim().toUpperCase();
  const interestadual = Boolean(origem && destino && origem !== destino);
  const prefixoEsperado = interestadual ? "6" : "5";
  const valido = new RegExp(`^${prefixoEsperado}\\d{3}$`).test(cfop);
  // CFOP de SUBSTITUÍDO herdado do cadastro (5405/6404) não vale quando ESTA operação retém o
  // ST (substituto, Conv. 142/2018) — re-deriva para 5403/6403.
  if (valido && ctx.substituto && (cfop === "5405" || cfop === "6404")) return resolveCfopVenda(ctx);
  return valido ? cfop : resolveCfopVenda(ctx);
}

function isIbgeMunicipio(value: string | null | undefined): boolean {
  return /^\d{7}$/.test(onlyDigits(value));
}

/**
 * Quando o destinatário tem CEP mas o código IBGE do município está ausente/ inválido
 * (caso comum de clientes cadastrados antes do campo IBGE existir), deriva o IBGE do CEP
 * via ViaCEP. Nunca quebra a emissão: qualquer falha na consulta apenas mantém o valor atual
 * e deixa a validação seguinte reportar o que ficou faltando.
 */
async function enrichMunicipioIbge(document: NormalizedFiscalDocument): Promise<void> {
  const endereco = document.destinatario.endereco;
  if (!endereco) return;
  if (isIbgeMunicipio(endereco.codigoMunicipioIbge)) return;

  const cep = onlyDigits(endereco.cep);
  if (cep.length !== 8) return;

  try {
    const res = await lookupCep(cep);
    if (isIbgeMunicipio(res.codigoMunicipioIbge)) {
      endereco.codigoMunicipioIbge = res.codigoMunicipioIbge;
    }
  } catch {
    // mantém o valor atual; a validação reportará a ausência ao usuário
  }
}

/**
 * Reúne as pendências que impediriam (ou comprometeriam) a emissão de NF-e/NFC-e, sem lançar.
 * Usado tanto para bloquear a emissão (validateBeforeProvider) quanto para alimentar os
 * "avisos" do espelho fiscal (previewFiscalDocument), garantindo que o que o usuário vê no
 * preview é exatamente o que será validado na emissão.
 */
function collectFiscalIssues(
  config: Awaited<ReturnType<typeof getFiscalRuntimeConfig>>,
  document: NormalizedFiscalDocument
): string[] {
  if (document.modelo !== "NFE" && document.modelo !== "NFCE") return [];

  const issues: string[] = [];
  if (!isValidCnpj(config.emitter.cnpj)) {
    issues.push("CNPJ do emitente inválido. Atualize a empresa no onboarding fiscal com um CNPJ real do certificado.");
  }
  if (!isIbgeMunicipio(config.emitter.codigoMunicipioIbge)) {
    issues.push("Código IBGE do município do emitente ausente ou inválido (7 dígitos). Preencha em Configurações > Emissão fiscal ou no onboarding fiscal.");
  }

  const endereco = document.destinatario.endereco;
  if (document.modelo === "NFE") {
    if (!endereco) {
      issues.push("Endereço do destinatário é obrigatório para NF-e.");
    } else {
      if (!(endereco.logradouro ?? "").trim()) issues.push("Logradouro do destinatário é obrigatório para NF-e.");
      if (!(endereco.bairro ?? "").trim()) issues.push("Bairro do destinatário é obrigatório para NF-e.");
      if (!(endereco.uf ?? document.destinatario.uf ?? "").trim()) issues.push("UF do destinatário é obrigatória para NF-e.");
      if (onlyDigits(endereco.cep).length !== 8) issues.push("CEP do destinatário inválido (8 dígitos) para NF-e.");
      if (!isIbgeMunicipio(endereco.codigoMunicipioIbge)) {
        issues.push("Código IBGE do município do destinatário ausente ou inválido (7 dígitos). Atualize o endereço do cliente ou use a busca por CEP/CNPJ.");
      }
    }
  }

  // NCM por item (obrigatório, 8 dígitos) — vale para NF-e e NFC-e.
  document.itens.forEach((item, index) => {
    if (item.servico) return;
    if (onlyDigits(item.ncm).length !== 8) {
      issues.push(`Item ${index + 1} (${item.descricao}): NCM com 8 dígitos é obrigatório.`);
    }
  });

  return issues;
}

function validateBeforeProvider(
  config: Awaited<ReturnType<typeof getFiscalRuntimeConfig>>,
  document: NormalizedFiscalDocument
) {
  const issues = collectFiscalIssues(config, document);
  if (issues.length) {
    throw new Error(`Não foi possível emitir a nota fiscal: ${issues.join(" ")}`);
  }
}

/** Linha do espelho fiscal: tributos calculados de um item, como sairão no XML. */
export type FiscalPreviewItem = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  origem: string;
  quantidade: number;
  valorTotal: number;
  cstIcms: string | null;
  csosn: string | null;
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  baseIcmsSt: number;
  aliquotaIcmsSt: number;
  valorIcmsSt: number;
  valorFcp: number;
  cstIpi: string | null;
  aliquotaIpi: number;
  valorIpi: number;
  cstPis: string | null;
  aliquotaPis: number;
  valorPis: number;
  cstCofins: string | null;
  aliquotaCofins: number;
  valorCofins: number;
  cClassTrib: string | null;
  baseIbsCbs: number;
  aliquotaIbs: number;
  valorIbs: number;
  aliquotaCbs: number;
  valorCbs: number;
  aliquotaIs: number;
  valorIs: number;
  valorTributos: number;
  /** Nome da regra tributária aplicada (null se caiu no padrão nacional por regime/UF). */
  regraNome: string | null;
  /** false = nenhuma regra específica bateu para o NCM/UF (o espelho avisa "padrão nacional"). */
  regraAplicada: boolean;
};

/** Espelho fiscal: prévia de como a nota será emitida (tributos por item + totais). */
export type FiscalPreview = {
  modelo: ModeloFiscal;
  regime: string;
  serie: string;
  naturezaOperacao: string;
  destinatarioNome: string;
  itens: FiscalPreviewItem[];
  totais: {
    valorProdutos: number;
    valorServicos: number;
    valorDesconto: number;
    valorFrete: number;
    valorSeguro: number;
    outrasDespesas: number;
    valorIcms: number;
    valorIcmsSt: number;
    valorFcp: number;
    valorIpi: number;
    valorPis: number;
    valorCofins: number;
    valorIss: number;
    valorIbs: number;
    valorCbs: number;
    valorIs: number;
    valorTotalTributos: number;
    total: number;
  };
  /** Pendências (endereço, NCM, IBGE…) que impediriam a emissão — apenas informativo aqui. */
  avisos: string[];
};

/**
 * Calcula o espelho fiscal de um documento normalizado SEM persistir nem chamar o provedor.
 * Reaproveita exatamente o mesmo motor de tributos e resolução de CFOP da emissão real
 * (computeItemTaxes, resolveCfop e accumulateTotals), para que o preview reflita a nota emitida.
 */
export async function previewFiscalDocument(
  scope: TenantScope,
  document: NormalizedFiscalDocument
): Promise<FiscalPreview> {
  if (!document.itens.length) throw new Error("Documento fiscal sem itens.");

  const config = await getFiscalRuntimeConfig(scope);
  await enrichMunicipioIbge(document);
  const serie =
    document.serie ||
    (document.modelo === "NFE" ? config.serieNfe : document.modelo === "NFCE" ? config.serieNfce : config.serieNfse);

  const rules = await loadSalesTaxRules(prisma, scope);
  // NFC-e é sempre interna: destino efetivo = UF do emitente (espelha a emissão real).
  const ufDestino = resolveUfDestino(document.modelo, config.emitter.uf, document.destinatario.uf);
  const totals = emptyTotals();
  const itens: FiscalPreviewItem[] = document.itens.map((item, index) => {
    const taxes = computeItemTaxes(item, rules, {
      regime: config.regime,
      ufOrigem: config.emitter.uf,
      ufDestino,
      servico: item.servico
    });
    const cfopCtx = {
      ufOrigem: config.emitter.uf,
      ufDestino,
      substituicaoTributaria: isSubstituicaoTributaria(taxes),
      // vICMSST > 0 = o remetente RETEM o ST nesta operacao (substituto) -> CFOP x.403.
      substituto: (taxes.valorIcmsSt ?? 0) > 0
    };
    let cfop: string | null;
    if (item.servico) cfop = null;
    else if (document.finalidade === "DEVOLUCAO") {
      const explicitoEntrada = item.cfop && /^[12]/.test(item.cfop) ? item.cfop : null;
      cfop = explicitoEntrada ?? resolveCfopDevolucao(cfopCtx);
    } else cfop = resolveCfopSaida(document.modelo, item.cfop, cfopCtx);
    accumulateTotals(totals, item, taxes);
    return {
      numeroItem: index + 1,
      codigo: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm,
      cfop,
      origem: taxes.origem,
      quantidade: item.quantidade,
      valorTotal: item.valorTotal,
      cstIcms: taxes.cstIcms,
      csosn: taxes.csosn,
      baseIcms: taxes.baseIcms,
      aliquotaIcms: taxes.aliquotaIcms,
      valorIcms: taxes.valorIcms,
      baseIcmsSt: taxes.baseIcmsSt,
      aliquotaIcmsSt: taxes.aliquotaIcmsSt,
      valorIcmsSt: taxes.valorIcmsSt,
      valorFcp: taxes.valorFcp,
      cstIpi: taxes.cstIpi,
      aliquotaIpi: taxes.aliquotaIpi,
      valorIpi: taxes.valorIpi,
      cstPis: taxes.cstPis,
      aliquotaPis: taxes.aliquotaPis,
      valorPis: taxes.valorPis,
      cstCofins: taxes.cstCofins,
      aliquotaCofins: taxes.aliquotaCofins,
      valorCofins: taxes.valorCofins,
      cClassTrib: taxes.cClassTrib,
      baseIbsCbs: taxes.baseIbsCbs,
      aliquotaIbs: taxes.aliquotaIbs,
      valorIbs: taxes.valorIbs,
      aliquotaCbs: taxes.aliquotaCbs,
      valorCbs: taxes.valorCbs,
      aliquotaIs: taxes.aliquotaIs,
      valorIs: taxes.valorIs,
      valorTributos: taxes.valorTributos,
      regraNome: taxes.regraNome,
      regraAplicada: taxes.regraAplicada
    };
  });

  const baseValor = round2(totals.valorProdutos + totals.valorServicos);
  // vProd é bruto (sem desconto); o desconto total = descontos por item (totals.valorDesconto)
  // + desconto de documento. Subtrair só o de documento inflaria o vNF quando há desconto por
  // item e quebraria vNF = vProd - vDesc + frete + seg + outros + ST + IPI na validação da SEFAZ.
  const descontoTotal = round2(totals.valorDesconto + document.valorDesconto);
  const total = round2(
    baseValor -
      descontoTotal +
      document.valorFrete +
      document.valorSeguro +
      document.outrasDespesas +
      totals.valorIcmsSt +
      totals.valorIpi
  );

  return {
    modelo: document.modelo,
    regime: config.regime,
    serie: String(serie ?? ""),
    naturezaOperacao: document.naturezaOperacao,
    destinatarioNome: document.destinatario.nome,
    itens,
    totais: {
      valorProdutos: totals.valorProdutos,
      valorServicos: totals.valorServicos,
      // Desconto total efetivo = descontos por item + desconto de documento (mesma base do vNF).
      valorDesconto: descontoTotal,
      valorFrete: document.valorFrete,
      valorSeguro: document.valorSeguro,
      outrasDespesas: document.outrasDespesas,
      valorIcms: totals.valorIcms,
      valorIcmsSt: totals.valorIcmsSt,
      valorFcp: totals.valorFcp,
      valorIpi: totals.valorIpi,
      valorPis: totals.valorPis,
      valorCofins: totals.valorCofins,
      valorIss: totals.valorIss,
      valorIbs: totals.valorIbs,
      valorCbs: totals.valorCbs,
      valorIs: totals.valorIs,
      valorTotalTributos: totals.valorTotalTributos,
      total
    },
    avisos: collectFiscalIssues(config, document)
  };
}

export type FiscalDocumentLinks = {
  clienteId?: string | null;
  pedidoVendaId?: string | null;
  ordemServicoId?: string | null;
  /** NF-e de devolução: id da nota original que está sendo devolvida. */
  notaOrigemId?: string | null;
  /** Reenvio: id de uma nota anterior rejeitada/erro a reaproveitar (em vez de criar nova). */
  retryNotaId?: string | null;
  usuarioId?: string | null;
};

/**
 * Emite um documento fiscal de saída (NF-e/NFC-e/NFS-e) a partir de um documento
 * normalizado. Orquestra: configuração/emitente, cálculo de tributos por item, numeração
 * atômica por série, persistência (PROCESSANDO → AUTORIZADA/REJEITADA), chamada ao provedor
 * e registro de eventos/auditoria. A baixa de estoque e o contas a receber são de
 * responsabilidade do fluxo de origem (venda/OS), que chama esta função e reage ao retorno.
 */
export async function emitFiscalDocument(
  scope: TenantScope,
  document: NormalizedFiscalDocument,
  links: FiscalDocumentLinks = {}
) {
  if (!document.itens.length) {
    throw new Error("Documento fiscal sem itens.");
  }

  // Gate do PLANO comercial (ex.: Emissor de Notas = N notas/mês, editável em /admin/planos).
  await assertLimiteNotasDoPlano(scope);

  const config = await getFiscalRuntimeConfig(scope);
  await enrichMunicipioIbge(document);
  validateBeforeProvider(config, document);
  const modelo: ModeloFiscal = document.modelo;
  const serie =
    document.serie ||
    (modelo === "NFE" ? config.serieNfe : modelo === "NFCE" ? config.serieNfce : config.serieNfse);

  const rules = await loadSalesTaxRules(prisma, scope);
  // NFC-e é sempre interna: o destino efetivo para CFOP e tributação é a UF do emitente.
  const ufDestino = resolveUfDestino(document.modelo, config.emitter.uf, document.destinatario.uf);

  // DEVOLUÇÃO espelhada: quando há nota original referenciada (notaOrigemId) E ela tem itens
  // persistidos (foi emitida por este ERP), copiamos os tributos PERSISTIDOS dela (base/alíquota/
  // valor de ICMS/FCP/ST, CST/CSOSN) em vez de recalcular pelas regras atuais — evitando crédito
  // de ICMS incorreto se a regra mudou desde a emissão. Devolução PARCIAL é rateada por item.
  // Fallback ao recálculo (comportamento de hoje) quando: não é devolução, sem notaOrigemId,
  // ou a original não tem itens no banco (não emitida por este ERP).
  let devolucaoMatch: Map<number, NotaOriginalItem> | null = null;
  if (document.finalidade === "DEVOLUCAO" && links.notaOrigemId) {
    const notaOriginal = await prisma.notaFiscal.findFirst({
      where: { id: links.notaOrigemId, tenantId: scope.tenantId, empresaId: scope.empresaId },
      include: { itens: true }
    });
    if (notaOriginal && notaOriginal.itens.length > 0) {
      // Itens sem correspondência na original lançam erro claro aqui (antes de persistir).
      devolucaoMatch = matchDevolucaoItems(document.itens, notaOriginal.itens);
    }
  }

  const totals = emptyTotals();
  const computedItems = document.itens.map((item, index) => {
    // Espelha os tributos da original quando casado (devolução); senão recalcula pelas regras.
    const original = devolucaoMatch?.get(index);
    const taxes = original
      ? mirrorTaxesFromOriginal(item, original)
      : computeItemTaxes(item, rules, {
          regime: config.regime,
          ufOrigem: config.emitter.uf,
          ufDestino,
          servico: item.servico
        });
    // CFOP automático para mercadorias: respeita CFOP explícito do item; senão deriva de
    // origem/destino e da existência de substituição tributária nos tributos calculados.
    const cfopCtx = {
      ufOrigem: config.emitter.uf,
      ufDestino,
      substituicaoTributaria: isSubstituicaoTributaria(taxes),
      // vICMSST > 0 = o remetente RETEM o ST nesta operacao (substituto) -> CFOP x.403.
      substituto: (taxes.valorIcmsSt ?? 0) > 0
    };
    let cfop: string | null;
    if (item.servico) {
      cfop = null;
    } else if (document.finalidade === "DEVOLUCAO") {
      // Tributos da devolução: quando a nota original referenciada tem itens persistidos, os
      // tributos acima (taxes) já foram ESPELHADOS da original (mirrorTaxesFromOriginal),
      // rateados na devolução parcial; sem original no banco, caem no recálculo (fallback).
      // Devolução é emitida como entrada (tpNF=0): exige CFOP de entrada (1xxx/2xxx). Um CFOP
      // de saída (5/6) herdado do produto não vale — só respeitamos um CFOP explícito de entrada.
      const explicitoEntrada = item.cfop && /^[12]/.test(item.cfop) ? item.cfop : null;
      cfop = explicitoEntrada ?? resolveCfopDevolucao(cfopCtx);
    } else {
      cfop = resolveCfopSaida(document.modelo, item.cfop, cfopCtx);
    }
    accumulateTotals(totals, item, taxes);
    return { item, taxes, cfop, numeroItem: index + 1 };
  });

  const baseValor = round2(totals.valorProdutos + totals.valorServicos);
  // Desconto total = descontos por item (totals.valorDesconto) + desconto de documento.
  // Tem que bater com o vNF/ICMSTot.vDesc do XML, senão a SEFAZ rejeita (vProd-vDesc ≠ vNF).
  const descontoTotal = round2(totals.valorDesconto + document.valorDesconto);
  const total = round2(
    baseValor -
      descontoTotal +
      document.valorFrete +
      document.valorSeguro +
      document.outrasDespesas +
      totals.valorIcmsSt +
      totals.valorIpi
  );

  // IBPT / Lei 12.741: informa o valor aproximado dos tributos no documento.
  const ibptText = `Valor aproximado dos tributos: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totals.valorTotalTributos)} (Lei 12.741/2012).`;
  // Forma de pagamento nas Informações Complementares: o DANFE (modelo 55) não tem campo próprio
  // de pagamento, então este texto garante a informação impressa em qualquer DANFE/DANFCE.
  const formaLabel = (f: string): string => {
    const m: Record<string, string> = {
      DINHEIRO: "Dinheiro", PIX: "Pix", BOLETO: "Boleto", CREDIARIO: "Crediário",
      CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito", TRANSFERENCIA: "Transferência"
    };
    return m[f.toUpperCase()] ?? f;
  };
  const formasPagas = [...new Set((document.pagamentos ?? []).filter((p) => Number(p.valor) > 0).map((p) => formaLabel(p.forma)))];
  const pagamentoTexto = modelo !== "NFSE"
    ? (formasPagas.length ? `Pagamento: ${formasPagas.join(" + ")}.` : document.formaPagamento ? `Pagamento: ${formaLabel(document.formaPagamento)}.` : null)
    : null;
  // Faturas também em texto: além do grupo cobr do XML, o infCpl garante as parcelas visíveis em
  // qualquer DANFE (o quadro FATURA depende do gerador de PDF).
  const faturasTexto = modelo !== "NFSE" && document.faturas?.length
    ? `Faturas: ${document.faturas.map((f) => `${f.numero} venc. ${f.vencimento.toLocaleDateString("pt-BR")} R$ ${f.valor.toFixed(2).replace(".", ",")}`).join("; ")}.`
    : null;
  // ST interestadual retido pelo remetente (substituto, Conv. ICMS 142/2018): informa no DANFE o
  // recolhimento por GNRE à UF de destino — a guia acompanha o transporte (cláusula 18ª).
  const ufDestSt = document.destinatario.uf?.trim().toUpperCase() || null;
  const stInterestadualTexto =
    modelo === "NFE" && totals.valorIcmsSt > 0 && ufDestSt && config.emitter.uf && ufDestSt !== config.emitter.uf.toUpperCase()
      ? `ICMS-ST retido para a UF de destino (${ufDestSt}) conforme Conv. ICMS 142/2018: R$ ${totals.valorIcmsSt.toFixed(2).replace(".", ",")} — recolhimento por GNRE.`
      : null;
  const informacoesComplementares = [pagamentoTexto, faturasTexto, stInterestadualTexto, document.informacoesComplementares, ibptText]
    .filter((part) => part && part.trim())
    .join(" ");

  // 1) Persiste a nota em PROCESSANDO com itens e tributos calculados (numeração atômica).
  // Campos escalares da nota — reutilizados tanto na criação quanto no reenvio de um rascunho.
  // Provedor EFETIVO da nota, roteado por modelo: NFS-e → serviços (ex.: NACIONAL); demais → produtos.
  // Persistir o provedor correto em `nota.provedor` garante que cancelamento/correção/download
  // (que resolvem o provider por `nota.provedor`) usem a mesma implementação que emitiu a nota.
  const provedorNota = modelo === "NFSE" ? config.providerServicos : config.provider;
  const notaScalarData = {
    modelo,
    finalidade: document.finalidade,
    ambiente: config.ambiente,
    provedor: provedorNota,
    naturezaOperacao: document.naturezaOperacao,
    clienteId: links.clienteId ?? null,
    pedidoVendaId: links.pedidoVendaId ?? null,
    ordemServicoId: links.ordemServicoId ?? null,
    notaOrigemId: links.notaOrigemId ?? null,
    chaveReferenciada: document.chaveReferenciada ?? null,
    destinatarioNome: document.destinatario.nome,
    destinatarioDocumento: document.destinatario.documento,
    destinatarioIe: document.destinatario.inscricaoEstadual,
    destinatarioEmail: document.destinatario.email,
    valorProdutos: totals.valorProdutos,
    valorServicos: totals.valorServicos,
    // Desconto total da nota = descontos por item (totals.valorDesconto) + desconto de documento.
    // Mesmo valor que compõe o vNF e o ICMSTot.vDesc enviados à SEFAZ (coerência nota ↔ XML ↔ SPED).
    valorDesconto: descontoTotal,
    valorFrete: document.valorFrete,
    valorSeguro: document.valorSeguro,
    outrasDespesas: document.outrasDespesas,
    valorIcms: totals.valorIcms,
    valorIcmsSt: totals.valorIcmsSt,
    valorFcp: totals.valorFcp,
    valorIpi: totals.valorIpi,
    valorPis: totals.valorPis,
    valorCofins: totals.valorCofins,
    valorIss: totals.valorIss,
    valorTotalTributos: totals.valorTotalTributos,
    issRetido: document.retencoes?.issRetido ?? false,
    valorIrRetido: document.retencoes?.ir?.valor ?? 0,
    valorPisRetido: document.retencoes?.pis?.valor ?? 0,
    valorCofinsRetido: document.retencoes?.cofins?.valor ?? 0,
    valorCsllRetido: document.retencoes?.csll?.valor ?? 0,
    valorInssRetido: document.retencoes?.inss?.valor ?? 0,
    valorRetidoTotal: document.retencoes?.totalRetido ?? 0,
    valorLiquido: document.retencoes?.valorLiquido ?? total,
    total,
    formaPagamento: document.formaPagamento,
    condicaoPagamento: document.condicaoPagamento,
    informacoesComplementares
  };

  const itensCreate = computedItems.map(({ item, taxes, cfop, numeroItem }) => ({
    tenantId: scope.tenantId,
    empresaId: scope.empresaId,
    produtoId: item.produtoId,
    numeroItem,
    codigo: item.codigo,
    descricao: item.descricao,
    ncm: item.ncm,
    cest: item.cest,
    cfop,
    unidade: item.unidade,
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    valorTotal: item.valorTotal,
    desconto: item.desconto,
    origem: taxes.origem,
    cstIcms: taxes.cstIcms,
    csosn: taxes.csosn,
    baseIcms: taxes.baseIcms,
    aliquotaIcms: taxes.aliquotaIcms,
    valorIcms: taxes.valorIcms,
    percentualFcp: taxes.percentualFcp,
    valorFcp: taxes.valorFcp,
    modalidadeBcSt: taxes.modalidadeBcSt,
    percentualMva: taxes.percentualMva,
    baseIcmsSt: taxes.baseIcmsSt,
    aliquotaIcmsSt: taxes.aliquotaIcmsSt,
    valorIcmsSt: taxes.valorIcmsSt,
    valorTributos: taxes.valorTributos,
    cstIpi: taxes.cstIpi,
    aliquotaIpi: taxes.aliquotaIpi,
    valorIpi: taxes.valorIpi,
    cstPis: taxes.cstPis,
    aliquotaPis: taxes.aliquotaPis,
    valorPis: taxes.valorPis,
    cstCofins: taxes.cstCofins,
    aliquotaCofins: taxes.aliquotaCofins,
    valorCofins: taxes.valorCofins,
    itemListaServico: taxes.itemListaServico,
    aliquotaIss: taxes.aliquotaIss,
    valorIss: taxes.valorIss,
    cClassTrib: taxes.cClassTrib
  }));

  const created = await runInTransaction(async (tx) => {
    // Reenvio: se for indicada uma nota anterior rejeitada/erro (mesmo modelo), reaproveita
    // o registro e a numeração já atribuída (não autorizada) em vez de criar uma nova nota.
    const retry = links.retryNotaId
      ? await tx.notaFiscal.findFirst({
          where: { id: links.retryNotaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
        })
      : null;
    const reusar = retry && retry.modelo === modelo && (retry.status === "REJEITADA" || retry.status === "ERRO");

    if (reusar) {
      await tx.notaFiscalItem.deleteMany({ where: { notaFiscalId: retry.id } });
      const nota = await tx.notaFiscal.update({
        where: { id: retry.id },
        data: {
          ...notaScalarData,
          status: "PROCESSANDO",
          motivo: null,
          chaveAcesso: null,
          protocolo: null,
          reciboLote: null,
          providerRef: null,
          emitidaEm: new Date(),
          itens: { create: itensCreate }
        }
      });
      await createAuditLog(tx, {
        scope,
        entidade: "NotaFiscal",
        entidadeId: nota.id,
        acao: "EMIT_RETRY",
        payload: { modelo, serie: nota.serie, numero: nota.numero, total, itens: itensCreate.length }
      });
      return nota;
    }

    const numero = await nextFiscalNumber(tx, scope, modelo, serie, config.ambiente);
    const nota = await tx.notaFiscal.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ...notaScalarData,
        numero: String(numero),
        serie,
        status: "PROCESSANDO",
        emitidaEm: new Date(),
        itens: { create: itensCreate }
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "EMIT_REQUEST",
      payload: { modelo, serie, numero, total, itens: itensCreate.length }
    });

    return nota;
  }, TX_OPTIONS);

  // 2) Chama o provedor (fora da transação, pois pode ser I/O externo).
  // ROTEAMENTO POR MODELO: NFS-e segue pelo provedor de SERVIÇOS (ex.: NACIONAL, direto na SEFIN);
  // NF-e/NFC-e seguem pelo provedor de PRODUTOS (ex.: ACBr) — comportamento de hoje, sem regressão.
  const isNfse = modelo === "NFSE";
  const provedorAlvo = provedorNota;
  const provider = resolveFiscalProvider(provedorAlvo);
  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: provedorAlvo,
    baseUrl: config.baseUrl,
    emissionMode: config.emissionMode,
    nfseAmbienteNacional: config.nfseAmbienteNacional,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken,
    // Certificado A1 só é necessário (e só é carregado) para o NACIONAL na NFS-e.
    ...(isNfse && provedorAlvo === "NACIONAL" ? { certificado: config.certificado } : {}),
    // NF-e direto na SEFAZ: precisa do A1 (assinar + TLS-mútuo) e da UF do emitente (autorizadora/cUF).
    // NFC-e (mod 65) usa, além disso, o CSC + idCSC do cadastro para o QR Code (infNFeSupl).
    ...(!isNfse && provedorAlvo === "SEFAZ"
      ? { certificado: config.certificado, ufEmitente: config.emitter.uf, nfceIdCsc: config.nfceIdCsc, nfceCsc: config.nfceCsc }
      : {})
  };

  // Monta o EmitInput para um dado número (reusado no retry de duplicidade).
  const buildEmitInput = (numeroNota: number) => ({
    document: {
      ...document,
      // O documento vem do builder com ambiente/provedor placeholder ("HOMOLOGACAO"/"MANUAL").
      // O ambiente/provedor EFETIVOS são os da config da empresa — a NF-e/NFC-e usa document.ambiente,
      // então sobrescrever aqui evita o conflito "ambiente solicitado x configurado para a empresa".
      ambiente: config.ambiente,
      provedor: config.provider,
      serie,
      itens: computedItems.map(({ item, cfop }) => ({ ...item, cfop: cfop ?? item.cfop }))
    },
    emitter: { ...config.emitter, regime: config.regime },
    numero: numeroNota,
    totals,
    total,
    integrationId: (links.pedidoVendaId ?? links.ordemServicoId ?? created.id).slice(0, 36),
    computed: computedItems.map(({ numeroItem, cfop, taxes }) => ({ numeroItem, cfop, taxes }))
  });

  let emitResult;
  let numeroEmitido = Number(created.numero);
  try {
    emitResult = await provider.emit(buildEmitInput(numeroEmitido), ctx);
    // RETRY de DUPLICIDADE (cStat 539): o número já existe na SEFAZ (ex.: emitido por outro meio ou
    // ambiente de teste dessincronizado). Avança a SequenciaFiscal e re-emite, pulando só os números
    // realmente usados — sem queimar a faixa inteira. Limite de 30 tentativas.
    let tentativasDup = 0;
    while (
      emitResult.status === "REJEITADA" &&
      /\b539\b|duplicidade/i.test(emitResult.motivo ?? "") &&
      tentativasDup < 30
    ) {
      tentativasDup++;
      numeroEmitido = await runInTransaction((tx) => nextFiscalNumber(tx, scope, modelo, serie, config.ambiente), TX_OPTIONS);
      await prisma.notaFiscal.update({ where: { id: created.id }, data: { numero: String(numeroEmitido) } });
      emitResult = await provider.emit(buildEmitInput(numeroEmitido), ctx);
    }
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "Falha de comunicação com o provedor fiscal.";
    await runInTransaction(async (tx) => {
      await tx.notaFiscal.update({ where: { id: created.id }, data: { status: "ERRO", motivo } });
      await createAuditLog(tx, { scope, entidade: "NotaFiscal", entidadeId: created.id, acao: "EMIT_ERROR", payload: { motivo } });
    });
    throw new Error(motivo);
  }

  // 3) Atualiza com o resultado do provedor.
  const updated = await runInTransaction(async (tx) => {
    const authorized = emitResult.status === "AUTORIZADA";
    const nota = await tx.notaFiscal.update({
      where: { id: created.id },
      data: {
        status: emitResult.status,
        ...(emitResult.numero ? { numero: emitResult.numero } : {}),
        ...(emitResult.numeroNfse ? { numeroNfse: emitResult.numeroNfse } : {}),
        chaveAcesso: emitResult.chaveAcesso ?? null,
        protocolo: emitResult.protocolo ?? null,
        reciboLote: emitResult.reciboLote ?? null,
        providerRef: emitResult.providerRef ?? null,
        xml: emitResult.xml ?? null,
        xmlUrl: emitResult.xmlUrl ?? null,
        danfeUrl: emitResult.danfeUrl ?? null,
        motivo: emitResult.motivo ?? null,
        autorizadaEm: authorized ? new Date() : null
      },
      include: { itens: { orderBy: { numeroItem: "asc" } } }
    });

    // GUIA GNRE (Conv. 142/2018 cl. 18ª): NF-e interestadual com ICMS-ST retido pelo remetente →
    // registra a guia PENDENTE para a UF de destino (recolher POR OPERAÇÃO, antes da saída).
    if (authorized && modelo === "NFE" && totals.valorIcmsSt > 0 && ufDestSt && config.emitter.uf && ufDestSt !== config.emitter.uf.toUpperCase()) {
      // Código de PRODUTO da GNRE (exigido por algumas UFs): vem da regra tributária de ICMS do
      // primeiro item com ST retido (mesma regra do MVA — cadastrada por NCM+UF com o contador).
      const itemComSt = document.itens.find((i, idx) => (computedItems[idx]?.taxes.valorIcmsSt ?? 0) > 0);
      const regraSt = itemComSt ? pickRule(rules, "ICMS", itemComSt.ncm, ufDestSt) : null;
      await tx.guiaRecolhimento.upsert({
        where: { notaFiscalId_tipo: { notaFiscalId: nota.id, tipo: "GNRE_ICMS_ST" } },
        update: {
          valor: totals.valorIcmsSt, ufFavorecida: ufDestSt, status: "PENDENTE",
          produtoGnre: regraSt?.gnreProduto ?? null, receitaGnre: regraSt?.gnreReceita ?? null,
          tipoDocOrigemGnre: regraSt?.gnreTipoDocOrigem ?? null, detalhamentoGnre: regraSt?.gnreDetalhamento ?? null, camposExtrasGnre: regraSt?.gnreCamposExtras ?? null
        },
        create: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: config.ambiente,
          notaFiscalId: nota.id,
          tipo: "GNRE_ICMS_ST",
          ufFavorecida: ufDestSt,
          valor: totals.valorIcmsSt,
          produtoGnre: regraSt?.gnreProduto ?? null,
          receitaGnre: regraSt?.gnreReceita ?? null,
          tipoDocOrigemGnre: regraSt?.gnreTipoDocOrigem ?? null,
          detalhamentoGnre: regraSt?.gnreDetalhamento ?? null,
          camposExtrasGnre: regraSt?.gnreCamposExtras ?? null
        }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: authorized ? "EMIT_AUTHORIZED" : "EMIT_RESULT",
      payload: { status: emitResult.status, chave: emitResult.chaveAcesso ?? null, motivo: emitResult.motivo ?? null }
    });

    return nota;
  }, TX_OPTIONS);

  // Tempo real: a lista de notas (/erp/fiscal) reflete a nova nota sem F5.
  publishRealtime(scope, "fiscal");

  return updated;
}

export async function cancelNotaFiscal(scope: TenantScope, notaId: string, justificativa: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (nota.status !== "AUTORIZADA") {
    throw new Error("Apenas notas autorizadas podem ser canceladas.");
  }
  // Trava de prazo legal de cancelamento (a SEFAZ também valida, mas avisamos antes):
  //  - NF-e (mod 55): 24h após a autorização; após isso exige cancelamento extemporâneo.
  //  - NFC-e (mod 65): 30 min (regra adotada pela maioria das UFs).
  //  - NFS-e: prazo varia por município — não bloqueamos aqui, a prefeitura valida.
  const limiteCancelHoras = nota.modelo === "NFE" ? 24 : nota.modelo === "NFCE" ? 0.5 : null;
  if (limiteCancelHoras !== null) {
    const referencia = nota.autorizadaEm ?? nota.emitidaEm;
    const horas = referencia ? (Date.now() - referencia.getTime()) / 3_600_000 : 0;
    if (horas > limiteCancelHoras) {
      const prazoLabel = limiteCancelHoras < 1 ? `${limiteCancelHoras * 60} minutos` : `${limiteCancelHoras} horas`;
      throw new Error(
        `Prazo de cancelamento da ${nota.modelo} esgotado (${prazoLabel} após a autorização). Use o procedimento de cancelamento extemporâneo junto à SEFAZ, se aplicável.`
      );
    }
  }
  if (justificativa.trim().length < 15) {
    throw new Error("A justificativa de cancelamento deve ter ao menos 15 caracteres.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  // Provider resolvido pelo provedor EFETIVO persistido na nota (roteado por modelo na emissão).
  const provider = resolveFiscalProvider(nota.provedor);
  const result = await provider.cancel(
    {
      modelo: nota.modelo,
      chaveAcesso: nota.chaveAcesso,
      providerRef: nota.providerRef,
      justificativa: justificativa.trim()
    },
    {
      // O cancelamento ocorre no ambiente em que a NOTA foi emitida.
      ambiente: nota.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken,
      // Provedores DIRETOS exigem assinatura + mTLS com o A1: NACIONAL (NFS-e) e SEFAZ (NF-e). O
      // SEFAZ ainda precisa da UF do emitente para resolver a autorizadora.
      ...((nota.modelo === "NFSE" && nota.provedor === "NACIONAL") || nota.provedor === "SEFAZ"
        ? { certificado: config.certificado }
        : {}),
      ...(nota.provedor === "SEFAZ" ? { ufEmitente: config.emitter.uf } : {})
    }
  );

  const cancelamento = await runInTransaction(async (tx) => {
    const authorized = result.status === "AUTORIZADO";
    const evento = await tx.notaFiscalEvento.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        notaFiscalId: nota.id,
        tipo: "CANCELAMENTO",
        status: authorized ? "AUTORIZADO" : result.status === "REJEITADO" ? "REJEITADO" : "ERRO",
        justificativa: justificativa.trim(),
        protocolo: result.protocolo ?? null,
        mensagem: result.motivo ?? null
      }
    });

    if (authorized) {
      await tx.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "CANCELADA", canceladaEm: new Date(), motivo: justificativa.trim() }
      });
      // Nota cancelada → guia GNRE pendente da nota também é cancelada (nada mais a recolher).
      await tx.guiaRecolhimento.updateMany({
        where: { notaFiscalId: nota.id, status: "PENDENTE" },
        data: { status: "CANCELADA" }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "CANCEL",
      payload: { status: result.status, eventoId: evento.id }
    });

    if (!authorized) {
      throw new Error(result.motivo || "Provedor rejeitou o cancelamento da nota fiscal.");
    }

    // Tempo real: a lista de notas reflete o cancelamento.
    publishRealtime(scope, "fiscal");

    return { id: nota.id, status: "CANCELADA" as const, eventoId: evento.id };
  }, TX_OPTIONS);

  // CASCATA: nota cancelada e vinculada a um pedido de venda → estorna a venda (devolve estoque,
  // cancela as contas a receber em aberto e marca o pedido como CANCELADO). Import dinâmico para
  // evitar dependência circular (sales → fiscal). Não derruba o cancelamento da nota se falhar.
  if (nota.pedidoVendaId) {
    try {
      const { cancelSale } = await import("@/domains/sales/application/sale-use-cases");
      await cancelSale(scope, nota.pedidoVendaId);
    } catch {
      /* pedido já cancelado / sem reversão necessária — ignora */
    }
  }

  return cancelamento;
}

export async function createCartaCorrecao(scope: TenantScope, notaId: string, correcao: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { eventos: { where: { tipo: "CARTA_CORRECAO" } } }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (nota.status !== "AUTORIZADA") {
    throw new Error("Apenas notas autorizadas aceitam carta de correção.");
  }
  // Carta de correção é exclusiva de NF-e e tem prazo legal de 30 dias (720h) da autorização.
  if (nota.modelo !== "NFE") {
    throw new Error("Carta de correção é exclusiva de NF-e (modelo 55).");
  }
  {
    const referencia = nota.autorizadaEm ?? nota.emitidaEm;
    const horas = referencia ? (Date.now() - referencia.getTime()) / 3_600_000 : 0;
    if (horas > 720) {
      throw new Error("Prazo de carta de correção esgotado (30 dias após a autorização).");
    }
  }
  if (correcao.trim().length < 15) {
    throw new Error("O texto da carta de correção deve ter ao menos 15 caracteres.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  const sequencia = nota.eventos.length + 1;
  const result = await provider.correct(
    { chaveAcesso: nota.chaveAcesso, providerRef: nota.providerRef, sequencia, correcao: correcao.trim() },
    {
      ambiente: nota.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken,
      // SEFAZ (NF-e direto): CC-e exige assinatura + mTLS com o A1 e a UF do emitente.
      ...(nota.provedor === "SEFAZ" ? { certificado: config.certificado, ufEmitente: config.emitter.uf } : {})
    }
  );

  return runInTransaction(async (tx) => {
    const authorized = result.status === "AUTORIZADO";
    const evento = await tx.notaFiscalEvento.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        notaFiscalId: nota.id,
        tipo: "CARTA_CORRECAO",
        status: authorized ? "AUTORIZADO" : result.status === "REJEITADO" ? "REJEITADO" : "ERRO",
        sequencia,
        correcao: correcao.trim(),
        protocolo: result.protocolo ?? null,
        mensagem: result.motivo ?? null
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "CORRECTION",
      payload: { status: result.status, sequencia, eventoId: evento.id }
    });

    if (!authorized) {
      throw new Error(result.motivo || "Provedor rejeitou a carta de correção.");
    }

    return { id: nota.id, eventoId: evento.id, sequencia };
  }, TX_OPTIONS);
}

/**
 * Baixa o PDF (DANFE/DANFSE) ou o XML autorizado de uma nota, via provedor (server-side,
 * pois a ACBr exige Bearer). Retorna os bytes + content-type para a rota repassar.
 */
export async function downloadNotaFiscalDocumento(
  scope: TenantScope,
  notaId: string,
  kind: "pdf" | "xml"
): Promise<{ contentType: string; body: Buffer; filename: string }> {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (!nota.providerRef) {
    throw new Error("A nota ainda não possui referência no provedor (não foi transmitida).");
  }
  if (nota.status !== "AUTORIZADA" && nota.status !== "CANCELADA") {
    throw new Error("Só é possível baixar PDF/XML de notas autorizadas ou canceladas.");
  }

  // SEFAZ (NF-e direto): o XML autorizado (nfeProc) já está salvo localmente em nota.xml — o XML é
  // servido direto e o DANFE é gerado a partir dele (buildDanfe). Sem round-trip no provedor: pela
  // chave não é possível reconstruir o nfeProc completo, e nós já o temos.
  if (nota.provedor === "SEFAZ") {
    if (!nota.xml) {
      throw new Error("XML autorizado (nfeProc) não disponível para gerar o documento da nota.");
    }
    if (kind === "xml") {
      return { contentType: "application/xml", body: Buffer.from(nota.xml, "utf8"), filename: `${nota.modelo}-${nota.numero}.xml` };
    }
    // Documento auxiliar em PDF a partir do nfeProc: DANFCE (cupom 80mm) para NFC-e 65; DANFE A4
    // (padrão MOC + quadro IBS/CBS) para NF-e 55. Ambos sobre a lib nfe-danfe-pdf.
    if (nota.modelo === "NFCE") {
      const pdf = await gerarDanfcePdf(nota.xml);
      return { contentType: "application/pdf", body: pdf, filename: `${nota.modelo}-${nota.numero}.pdf` };
    }
    const cfg = await getFiscalRuntimeConfig(scope);
    const pdf = await gerarDanfePdf(nota.xml, { cancelada: nota.status === "CANCELADA", logoDataUrl: cfg.logotipoConteudo });
    return { contentType: "application/pdf", body: pdf, filename: `${nota.modelo}-${nota.numero}.pdf` };
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  if (!provider.downloadDocument) {
    throw new Error(`O provedor ${nota.provedor} não suporta download de PDF/XML pela plataforma.`);
  }

  const result = await provider.downloadDocument(
    kind,
    { providerRef: nota.providerRef, modelo: nota.modelo },
    {
      // O documento sai do ambiente em que a NOTA foi emitida (não o ambiente ATUAL da empresa):
      // uma nota de produção sempre baixa do ADN/SEFIN de produção, mesmo se a empresa hoje está em
      // homologação. Senão o download bate no ambiente errado (404) e cai no fallback.
      ambiente: nota.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken,
      // NACIONAL (NFS-e): download server-side exige mTLS com o A1 e gera o DANFSE com a logo da empresa.
      ...(nota.modelo === "NFSE" && nota.provedor === "NACIONAL"
        ? { certificado: config.certificado, logoDataUrl: config.logotipoInfo }
        : {})
    }
  );

  if (!result.ok) {
    throw new Error(result.error || `Não foi possível baixar o ${kind.toUpperCase()} da nota.`);
  }
  // Nome amigável: <modelo>-<numero>.<kind> (ex.: NFE-31.pdf).
  const filename = `${nota.modelo}-${nota.numero}.${kind}`;
  return { contentType: result.contentType, body: result.body, filename };
}

/**
 * EXCLUI uma nota fiscal — ação ADMIN. SOMENTE notas SEM validade fiscal (RASCUNHO, ERRO,
 * REJEITADA, DENEGADA). Notas AUTORIZADAS/CANCELADAS são documentos legais e nunca são apagadas
 * (use cancelamento). Remove itens/eventos e desvincula contas a receber e devoluções.
 */
export async function deleteNotaFiscal(scope: TenantScope, id: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { id: true, numero: true, modelo: true, status: true }
  });
  if (!nota) throw new Error("Nota fiscal não encontrada.");
  if (!["RASCUNHO", "ERRO", "REJEITADA", "DENEGADA"].includes(nota.status)) {
    throw new Error(
      "Só é possível excluir notas sem validade fiscal (rascunho, erro, rejeitada ou denegada). Notas autorizadas ou canceladas não podem ser excluídas."
    );
  }

  return runInTransaction(async (tx) => {
    await tx.contaReceber.updateMany({ where: { notaFiscalId: id }, data: { notaFiscalId: null } });
    await tx.notaFiscal.updateMany({ where: { notaOrigemId: id }, data: { notaOrigemId: null } });
    await tx.notaFiscalItem.deleteMany({ where: { notaFiscalId: id } });
    await tx.notaFiscalEvento.deleteMany({ where: { notaFiscalId: id } });
    const removido = await tx.notaFiscal.delete({ where: { id } });
    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: id,
      acao: "DELETE",
      payload: { numero: nota.numero, modelo: nota.modelo, statusAnterior: nota.status }
    });
    return removido;
  });
}
