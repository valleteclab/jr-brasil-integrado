/**
 * Carga de dados do SPED Fiscal: lê notas de saída (NotaFiscal), entradas (EntradaFiscal),
 * participantes, itens e inventário do período e monta o SpedInput consumido pelo gerador.
 *
 * Todas as queries são escopadas por tenantId + empresaId (multitenancy obrigatória).
 */

import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { RegimeTributario, TipoTributo } from "@prisma/client";
import {
  creditoPorFinalidade,
  finalidadeMovimentaEstoque,
  isFinalidadeEntrada,
  resolveCfopEntrada,
  sugerirFinalidadeEntrada,
  type FinalidadeEntrada
} from "@/domains/fiscal/finalidade-entrada";
import { loadFinalidadeRules, pickFinalidadeRule } from "@/domains/fiscal/application/finalidade-regra-use-cases";
import { aliquotaInternaIcmsSafe, aliquotaIcmsVendaSafe } from "@/domains/fiscal/national-tax-baseline";
import { parseXmlSped, type XmlDocumentoSped, type XmlItem, type XmlParticipante } from "./xml-avulso";
import type {
  SpedConfig,
  SpedDocumento,
  SpedDocumentoItem,
  SpedInput,
  SpedItemCatalogo,
  SpedParticipante,
  SpedPeriodo
} from "./types";
import { resolveVersaoLeiaute } from "./gerador";

export class SpedError extends Error {}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * CST de 3 dígitos (origem + CST ICMS). Empresas do Simples emitem com CSOSN; quando só
 * há CSOSN, aplica um de-para conservador para a escrituração (validar com o contador).
 */
function cstIcms3(origem: string | null | undefined, cst: string | null | undefined, csosn: string | null | undefined): string {
  const o = (origem ?? "0").trim().slice(0, 1) || "0";
  let c = (cst ?? "").replace(/\D/g, "");
  if (c.length === 3) return c; // já veio com origem embutida
  if (!c && csosn) {
    const mapa: Record<string, string> = {
      "101": "90",
      "102": "90",
      "103": "41",
      "201": "10",
      "202": "10",
      "203": "30",
      "300": "41",
      "400": "41",
      "500": "60",
      "900": "90"
    };
    c = mapa[csosn.replace(/\D/g, "")] ?? "90";
  }
  if (!c) c = "90";
  return `${o}${c.padStart(2, "0")}`;
}

/** Espelha um CFOP de saída do fornecedor para o CFOP de entrada do declarante. */
function espelharCfopEntrada(cfop: string | null | undefined): string {
  const c = (cfop ?? "").replace(/\D/g, "");
  if (c.length !== 4) return "1102";
  if (c.startsWith("5")) return `1${c.slice(1)}`;
  if (c.startsWith("6")) return `2${c.slice(1)}`;
  if (c.startsWith("7")) return `3${c.slice(1)}`;
  return c;
}

/** TIPO_ITEM do registro 0200 conforme a finalidade da entrada / tipo do produto. */
function tipoItem0200(finalidade: string | null | undefined, tipoProduto?: string | null): string {
  if (finalidade === "REVENDA") return "00";
  if (finalidade === "INDUSTRIALIZACAO") return "01";
  if (finalidade === "USO_CONSUMO") return "07";
  if (finalidade === "IMOBILIZADO") return "08";
  if (tipoProduto === "SERVICO") return "09";
  if (tipoProduto === "INSUMO") return "01";
  return "00";
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * ICMS Antecipação Parcial (ex.: BA, Lei 7.014/96): nas COMPRAS INTERESTADUAIS de mercadoria
 * PARA REVENDA sem ST, antecipa-se (alíquota interna da UF da empresa − alíquota interestadual)
 * sobre o valor da aquisição. Usa a alíquota destacada no documento quando houver; sem destaque
 * (ex.: fornecedor do Simples), cai na interestadual padrão por origem/destino (7%/12%).
 */
function calcularAntecipacaoParcial(args: {
  ativa: boolean;
  finalidade: FinalidadeEntrada;
  cfopEntrada: string;
  st: boolean;
  base: number;
  aliquotaDestacada: number;
  ufFornecedor: string | null | undefined;
  ufEmpresa: string | null | undefined;
}): number {
  if (!args.ativa || args.st || args.base <= 0) return 0;
  if (args.finalidade !== "REVENDA") return 0;
  if (!args.cfopEntrada.startsWith("2")) return 0; // só interestadual
  const interna = aliquotaInternaIcmsSafe(args.ufEmpresa);
  if (interna <= 0) return 0;
  const interestadual =
    args.aliquotaDestacada > 0
      ? args.aliquotaDestacada
      : aliquotaIcmsVendaSafe(args.ufFornecedor, args.ufEmpresa) || 12;
  const diferenca = interna - interestadual;
  return diferenca > 0 ? round2((args.base * diferenca) / 100) : 0;
}

type EmitenteXml = {
  inscricaoEstadual: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  codigoMunicipioIbge: string | null;
};

/** Extrai endereço/IE do emitente do XML original da NF-e de entrada (registro 0150). */
function extrairEmitenteXml(xml: string | null | undefined): EmitenteXml | null {
  if (!xml) return null;
  try {
    const parsed = xmlParser.parse(xml);
    const emit = (parsed?.nfeProc?.NFe ?? parsed?.NFe)?.infNFe?.emit;
    if (!emit) return null;
    const end = emit.enderEmit ?? {};
    const texto = (v: unknown) => (v == null ? null : String(v).trim() || null);
    return {
      inscricaoEstadual: texto(emit.IE),
      logradouro: texto(end.xLgr),
      numero: texto(end.nro),
      complemento: texto(end.xCpl),
      bairro: texto(end.xBairro),
      codigoMunicipioIbge: texto(end.cMun)
    };
  } catch {
    return null;
  }
}

export type CarregarSpedParams = {
  ano: number;
  mes: number;
  finalidade?: "ORIGINAL" | "RETIFICADORA";
};

export async function carregarSpedInput(scope: TenantScope, params: CarregarSpedParams): Promise<SpedInput> {
  const { ano, mes } = params;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new SpedError("Ano da competência inválido.");
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new SpedError("Mês da competência inválido.");

  const inicio = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const fim = new Date(ano, mes, 0, 23, 59, 59, 999);
  const periodo: SpedPeriodo = { ano, mes, inicio, fim };
  const avisos: string[] = [];

  const base = { tenantId: scope.tenantId, empresaId: scope.empresaId };

  const [empresa, spedConfig] = await Promise.all([
    prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId } }),
    prisma.spedConfiguracao.findFirst({ where: { ...base } })
  ]);
  if (!empresa) throw new SpedError("Empresa não encontrada para o escopo atual.");

  if (!empresa.inscricaoEstadual) {
    avisos.push("Empresa sem Inscrição Estadual cadastrada — campo IE do registro 0000 ficará vazio (o PVA rejeita). Complete em Configurações → Dados da empresa.");
  }
  if (!empresa.codigoMunicipioIbge) {
    avisos.push("Empresa sem código de município (IBGE) — obrigatório no registro 0000. Complete em Configurações → Dados da empresa.");
  }
  if (!empresa.enderecoUf) {
    avisos.push("Empresa sem UF cadastrada — obrigatória no registro 0000.");
  }
  if (!spedConfig?.contadorNome || !spedConfig?.contadorCpf || !spedConfig?.contadorCrc) {
    avisos.push("Dados do contador incompletos (registro 0100 é obrigatório: nome, CPF e CRC). Preencha em SPED Fiscal → Configurações.");
  }
  if (empresa.regimeTributario === "SIMPLES_NACIONAL" || empresa.regimeTributario === "MEI") {
    avisos.push("Empresa no Simples Nacional/MEI: a EFD ICMS/IPI normalmente não é exigida nesse regime (obrigação típica do regime normal ou do Simples acima do sublimite). Confirme a obrigatoriedade com o contador.");
  }

  // Saldo credor do período anterior (ICMS e IPI), vindo do último arquivo gerado.
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const arquivoAnterior = await prisma.spedArquivo.findUnique({
    where: { tenantId_empresaId_ano_mes: { ...base, ano: anoAnterior, mes: mesAnterior } },
    select: { resumo: true }
  });
  let saldoCredorAnterior = 0;
  let saldoCredorAnteriorIpi = 0;
  if (arquivoAnterior?.resumo && typeof arquivoAnterior.resumo === "object") {
    const r = arquivoAnterior.resumo as Record<string, unknown>;
    saldoCredorAnterior = num((r.apuracaoIcms as Record<string, unknown> | undefined)?.saldoCredorTransportar);
    saldoCredorAnteriorIpi = num((r.apuracaoIpi as Record<string, unknown> | undefined)?.saldoCredorTransportar);
  }

  // ---------------------------------------------------------------------------
  // Saídas: NF-e/NFC-e autorizadas e canceladas do período (NFS-e fica fora da EFD ICMS/IPI)
  // ---------------------------------------------------------------------------
  const notasTodas = await prisma.notaFiscal.findMany({
    where: {
      ...base,
      modelo: { in: ["NFE", "NFCE"] },
      status: { in: ["AUTORIZADA", "CANCELADA"] },
      emitidaEm: { gte: inicio, lte: fim }
    },
    include: {
      itens: { orderBy: { numeroItem: "asc" }, include: { produto: { select: { sku: true } } } },
      cliente: { include: { enderecos: { orderBy: { padrao: "desc" } } } }
    },
    orderBy: { emitidaEm: "asc" }
  });

  // SPED só escritura documentos de produção; em ambiente de teste, aceita homologação com aviso.
  let notas = notasTodas.filter((n) => n.ambiente === "PRODUCAO");
  if (notas.length === 0 && notasTodas.length > 0) {
    notas = notasTodas;
    avisos.push("Nenhuma nota de PRODUÇÃO no período — o arquivo foi montado com notas de HOMOLOGAÇÃO e serve apenas para teste, não para entrega.");
  }

  const documentos: SpedDocumento[] = [];
  const participantes = new Map<string, SpedParticipante>();
  const catalogo = new Map<string, SpedItemCatalogo>();

  for (const nota of notas) {
    const modelo = nota.modelo === "NFCE" ? "65" : "55";
    const cancelada = nota.status === "CANCELADA";
    const rotulo = `${nota.modelo === "NFCE" ? "NFC-e" : "NF-e"} ${nota.numero ?? "s/nº"} série ${nota.serie ?? "?"}`;

    if (!cancelada && (!nota.numero || !nota.chaveAcesso)) {
      avisos.push(`${rotulo}: autorizada sem número/chave de acesso — verifique a sincronização com o provedor antes de entregar o arquivo.`);
    }

    // Participante: somente NF-e identifica destinatário no C100 (NFC-e fica sem COD_PART).
    let codigoParticipante: string | null = null;
    if (modelo === "55" && nota.cliente && !cancelada) {
      codigoParticipante = nota.cliente.id;
      if (!participantes.has(nota.cliente.id)) {
        const end = nota.cliente.enderecos[0] ?? null;
        const doc = (nota.cliente.documento ?? "").replace(/\D/g, "");
        participantes.set(nota.cliente.id, {
          codigo: nota.cliente.id,
          nome: nota.cliente.razaoSocial,
          cnpj: doc.length === 14 ? doc : null,
          cpf: doc.length === 11 ? doc : null,
          inscricaoEstadual: nota.cliente.inscricaoEstadual,
          codigoMunicipioIbge: end?.codigoMunicipioIbge ?? null,
          logradouro: end?.logradouro ?? null,
          numero: end?.numero ?? null,
          complemento: end?.complemento ?? null,
          bairro: end?.bairro ?? null,
          uf: end?.uf ?? null
        });
        if (!end?.codigoMunicipioIbge) {
          avisos.push(`Cliente "${nota.cliente.razaoSocial}": sem código de município no endereço — registro 0150 ficará incompleto.`);
        }
      }
    }

    const itens: SpedDocumentoItem[] = nota.itens.map((item) => {
      const valorPis = num(item.valorPis);
      const valorCofins = num(item.valorCofins);
      const valorIpi = num(item.valorIpi);
      const valorLiquido = num(item.valorTotal) - num(item.desconto);
      if (!item.ncm) {
        avisos.push(`${rotulo}, item ${item.numeroItem} (${item.codigo}): sem NCM.`);
      }
      return {
        numeroItem: item.numeroItem,
        codigoItem: item.produto?.sku ?? item.codigo,
        descricaoComplementar: null,
        quantidade: num(item.quantidade),
        unidade: item.unidade,
        valorItem: num(item.valorTotal),
        valorDesconto: num(item.desconto),
        movimentaEstoque: true,
        cfop: (item.cfop ?? "").replace(/\D/g, "") || "5102",
        cstIcms: cstIcms3(item.origem, item.cstIcms, item.csosn),
        baseIcms: num(item.baseIcms),
        aliquotaIcms: num(item.aliquotaIcms),
        valorIcms: num(item.valorIcms),
        baseIcmsSt: num(item.baseIcmsSt),
        aliquotaIcmsSt: num(item.aliquotaIcmsSt),
        valorIcmsSt: num(item.valorIcmsSt),
        valorReducaoBc: 0,
        cstIpi: item.cstIpi,
        baseIpi: valorIpi > 0 ? valorLiquido : 0,
        aliquotaIpi: num(item.aliquotaIpi),
        valorIpi,
        cstPis: item.cstPis,
        basePis: valorPis > 0 ? valorLiquido : 0,
        aliquotaPis: num(item.aliquotaPis),
        valorPis,
        cstCofins: item.cstCofins,
        baseCofins: valorCofins > 0 ? valorLiquido : 0,
        aliquotaCofins: num(item.aliquotaCofins),
        valorCofins,
        antecipacaoParcial: 0
      };
    });

    const temSt = itens.some((i) => i.valorIcmsSt > 0);
    const ufDestino = temSt ? nota.cliente?.enderecos[0]?.uf ?? empresa.enderecoUf ?? null : null;

    documentos.push({
      tipo: "SAIDA",
      modelo,
      cancelado: cancelada,
      codigoParticipante,
      serie: nota.serie,
      numero: nota.numero,
      chaveAcesso: nota.chaveAcesso,
      dataEmissao: nota.emitidaEm,
      dataEntradaSaida: modelo === "55" ? nota.emitidaEm : null,
      aPrazo: Boolean(nota.condicaoPagamento),
      valorDocumento: num(nota.total),
      valorDesconto: num(nota.valorDesconto),
      valorMercadorias: num(nota.valorProdutos),
      valorFrete: num(nota.valorFrete),
      valorSeguro: num(nota.valorSeguro),
      outrasDespesas: num(nota.outrasDespesas),
      ufDestino,
      itens,
      rotulo
    });
  }

  // ---------------------------------------------------------------------------
  // Entradas: notas de fornecedores conferidas/processadas, pela data de entrada
  // ---------------------------------------------------------------------------
  const entradas = await prisma.entradaFiscal.findMany({
    where: {
      ...base,
      status: { in: ["CONFERIDA", "ESTOQUE_PROCESSADO"] },
      OR: [
        { recebidaEm: { gte: inicio, lte: fim } },
        { recebidaEm: null, emitidaEm: { gte: inicio, lte: fim } }
      ]
    },
    include: {
      itens: {
        orderBy: { itemNumero: "asc" },
        include: {
          impostos: true,
          produto: { select: { sku: true, nome: true, unidade: true, tipo: true, ncm: true, cest: true, gtin: true } }
        }
      },
      fornecedor: true,
      parcelas: { select: { id: true } },
      xmlImportacao: { select: { xmlOriginal: true } }
    },
    orderBy: { emitidaEm: "asc" }
  });

  for (const entrada of entradas) {
    const rotulo = `Entrada NF ${entrada.numero ?? "s/nº"} (${entrada.fornecedor?.razaoSocial ?? "fornecedor não identificado"})`;

    if (!entrada.fornecedorId || !entrada.fornecedor) {
      avisos.push(`${rotulo}: sem fornecedor vinculado — documento NÃO incluído no arquivo. Vincule o fornecedor e regere.`);
      continue;
    }

    if (!participantes.has(entrada.fornecedorId)) {
      const doc = (entrada.fornecedor.documento ?? "").replace(/\D/g, "");
      const emitXml = extrairEmitenteXml(entrada.xmlImportacao?.xmlOriginal);
      participantes.set(entrada.fornecedorId, {
        codigo: entrada.fornecedorId,
        nome: entrada.fornecedor.razaoSocial,
        cnpj: doc.length === 14 ? doc : null,
        cpf: doc.length === 11 ? doc : null,
        inscricaoEstadual: emitXml?.inscricaoEstadual ?? null,
        codigoMunicipioIbge: emitXml?.codigoMunicipioIbge ?? null,
        logradouro: emitXml?.logradouro ?? null,
        numero: emitXml?.numero ?? null,
        complemento: emitXml?.complemento ?? null,
        bairro: emitXml?.bairro ?? null,
        uf: entrada.fornecedor.uf ?? null
      });
      if (!emitXml?.codigoMunicipioIbge) {
        avisos.push(`Fornecedor "${entrada.fornecedor.razaoSocial}": sem código de município (não foi possível ler do XML) — registro 0150 ficará incompleto.`);
      }
    }

    const itens: SpedDocumentoItem[] = entrada.itens.map((item) => {
      const impostoPor = (tributo: string) => item.impostos.find((i) => i.tributo === tributo) ?? null;
      const icms = impostoPor("ICMS");
      const ipi = impostoPor("IPI");
      const pis = impostoPor("PIS");
      const cofins = impostoPor("COFINS");

      // "Sob o enfoque do declarante": só escritura crédito quando o imposto é recuperável
      // (finalidade × regime, já avaliado na conferência da entrada). Sem crédito → CST 90
      // (ou 60 quando a mercadoria veio com ICMS-ST retido) e valores zerados.
      const icmsRecuperavel = Boolean(icms?.recuperavel);
      const veioComSt = icms?.cst === "60" || icms?.csosn === "500";
      const cstEntrada = icmsRecuperavel ? icms?.cst ?? "00" : veioComSt ? "60" : "90";

      // Fornecedor do Simples (art. 23 LC 123): sem destaque de ICMS, mas o XML traz o crédito
      // permitido em pCredSN/vCredICMSSN (guardados em dadosOriginais). Escritura com CST 90.
      const dadosIcms = (icms?.dadosOriginais ?? {}) as Record<string, unknown>;
      const credSNValor = num(dadosIcms.vCredICMSSN);
      const credSNAliq = num(dadosIcms.pCredSN);
      const liquidoItem = round2(num(item.valorTotal) - num(item.valorDesconto));
      const aplicaCredSN =
        credSNValor > 0 &&
        num(icms?.valor) === 0 &&
        !veioComSt &&
        creditoPorFinalidade(item.finalidade ?? "REVENDA", empresa.regimeTributario, "ICMS", { st: false }).recuperavel;
      if (aplicaCredSN) {
        avisos.push(
          `${rotulo}, item ${item.itemNumero}: crédito de ICMS do Simples Nacional (LC 123, art. 23) apropriado — R$ ${credSNValor.toFixed(2).replace(".", ",")} (${credSNAliq.toFixed(2).replace(".", ",")}%).`
        );
      }
      const cfopEntradaItem = (item.cfopEntradaDerivado ?? "").replace(/\D/g, "") || espelharCfopEntrada(item.cfop);
      const antecipacaoParcial = calcularAntecipacaoParcial({
        ativa: Boolean(spedConfig?.antecipacaoParcialAtiva),
        finalidade: item.finalidade ?? "REVENDA",
        cfopEntrada: cfopEntradaItem,
        st: veioComSt,
        base: round2(num(item.valorTotal) - num(item.valorDesconto)),
        aliquotaDestacada: num(icms?.aliquota),
        ufFornecedor: entrada.fornecedor?.uf ?? null,
        ufEmpresa: empresa.enderecoUf
      });

      const codigoItem = item.produto?.sku ?? `FORN-${item.codigoFornecedor}`.slice(0, 60);
      const ncm = item.produto?.ncm ?? item.ncm;
      if (!ncm) avisos.push(`${rotulo}, item ${item.itemNumero}: sem NCM.`);
      if (!catalogo.has(codigoItem)) {
        catalogo.set(codigoItem, {
          codigo: codigoItem,
          descricao: item.produto?.nome ?? item.descricaoFornecedor,
          gtin: item.produto?.gtin ?? item.gtin,
          unidade: item.unidade,
          tipoItem: tipoItem0200(item.finalidade, item.produto?.tipo),
          ncm,
          cest: item.produto?.cest ?? item.cest
        });
      }
      if (!item.finalidade) {
        avisos.push(`${rotulo}, item ${item.itemNumero}: sem finalidade de entrada definida — classificado como revenda no 0200.`);
      }

      return {
        numeroItem: item.itemNumero,
        codigoItem,
        descricaoComplementar: item.produto ? item.descricaoFornecedor : null,
        quantidade: num(item.quantidade),
        unidade: item.unidade,
        valorItem: num(item.valorTotal),
        valorDesconto: num(item.valorDesconto),
        movimentaEstoque: item.movimentaEstoque,
        cfop: cfopEntradaItem,
        cstIcms: aplicaCredSN ? cstIcms3(null, "90", null) : cstIcms3(null, cstEntrada, null),
        baseIcms: aplicaCredSN ? liquidoItem : icmsRecuperavel ? num(icms?.baseCalculo) : 0,
        aliquotaIcms: aplicaCredSN ? credSNAliq : icmsRecuperavel ? num(icms?.aliquota) : 0,
        valorIcms: aplicaCredSN ? credSNValor : icmsRecuperavel ? num(icms?.valor) : 0,
        creditoSimplesLc123: aplicaCredSN,
        baseIcmsSt: 0,
        aliquotaIcmsSt: 0,
        valorIcmsSt: 0,
        valorReducaoBc: 0,
        cstIpi: ipi?.recuperavel ? ipi?.cst ?? null : null,
        baseIpi: ipi?.recuperavel ? num(ipi?.baseCalculo) : 0,
        aliquotaIpi: ipi?.recuperavel ? num(ipi?.aliquota) : 0,
        valorIpi: ipi?.recuperavel ? num(ipi?.valor) : 0,
        cstPis: pis?.recuperavel ? pis?.cst ?? null : null,
        basePis: pis?.recuperavel ? num(pis?.baseCalculo) : 0,
        aliquotaPis: pis?.recuperavel ? num(pis?.aliquota) : 0,
        valorPis: pis?.recuperavel ? num(pis?.valor) : 0,
        cstCofins: cofins?.recuperavel ? cofins?.cst ?? null : null,
        baseCofins: cofins?.recuperavel ? num(cofins?.baseCalculo) : 0,
        aliquotaCofins: cofins?.recuperavel ? num(cofins?.aliquota) : 0,
        valorCofins: cofins?.recuperavel ? num(cofins?.valor) : 0,
        antecipacaoParcial
      };
    });

    documentos.push({
      tipo: "ENTRADA",
      modelo: entrada.modelo === "65" ? "65" : "55",
      cancelado: false,
      codigoParticipante: entrada.fornecedorId,
      serie: entrada.serie,
      numero: entrada.numero,
      chaveAcesso: entrada.chaveAcesso,
      dataEmissao: entrada.emitidaEm,
      dataEntradaSaida: entrada.recebidaEm ?? entrada.emitidaEm,
      aPrazo: entrada.parcelas.length > 0,
      valorDocumento: num(entrada.totalNota),
      valorDesconto: num(entrada.valorDesconto),
      valorMercadorias: num(entrada.totalProdutos),
      valorFrete: num(entrada.valorFrete),
      valorSeguro: num(entrada.valorSeguro),
      outrasDespesas: num(entrada.outrasDespesas),
      ufDestino: null,
      itens,
      rotulo
    });
  }

  // ---------------------------------------------------------------------------
  // XMLs avulsos: notas emitidas fora do ERP ou recebidas sem o fluxo de entradas.
  // Dedupe por chave de acesso — documentos já escriturados pelo banco prevalecem.
  // ---------------------------------------------------------------------------
  const xmlDocs = await prisma.spedXmlDocumento.findMany({
    where: { ...base, competenciaAno: ano, competenciaMes: mes },
    orderBy: { emitidaEm: "asc" }
  });

  if (xmlDocs.length > 0) {
    const chavesDoBanco = new Set(documentos.map((d) => d.chaveAcesso).filter(Boolean) as string[]);

    // Para a finalidade dos itens de entrada por XML: regras De/Para vigentes (uma carga só)
    // e mapa documento→fornecedorId (permite casar regras por fornecedor pelo CNPJ do XML).
    const [regrasFinalidade, fornecedoresDocs] = await Promise.all([
      loadFinalidadeRules(prisma, scope, new Date()),
      prisma.fornecedor.findMany({ where: { ...base }, select: { id: true, documento: true } })
    ]);
    const fornecedorPorDocumento = new Map(
      fornecedoresDocs.map((f) => [(f.documento ?? "").replace(/\D/g, ""), f.id])
    );
    const participanteXml = (p: XmlParticipante): string => {
      const codigo = `X-${p.documento || p.nome.slice(0, 20)}`;
      if (!participantes.has(codigo)) {
        participantes.set(codigo, {
          codigo,
          nome: p.nome,
          cnpj: p.documento.length === 14 ? p.documento : null,
          cpf: p.documento.length === 11 ? p.documento : null,
          inscricaoEstadual: p.inscricaoEstadual,
          codigoMunicipioIbge: p.codigoMunicipioIbge,
          logradouro: p.logradouro,
          numero: p.numero,
          complemento: p.complemento,
          bairro: p.bairro,
          uf: p.uf
        });
      }
      return codigo;
    };

    for (const registro of xmlDocs) {
      if (registro.chaveAcesso && chavesDoBanco.has(registro.chaveAcesso)) {
        avisos.push(
          `XML avulso ${registro.numero ?? registro.chaveAcesso}: ignorado — a mesma chave já está escriturada pelas notas do sistema.`
        );
        continue;
      }

      const tipoXml = registro.tipo === "ENTRADA" ? "ENTRADA" : "SAIDA";

      // Cancelada (inclusive stub criado só a partir do evento): C100 de identificação.
      if (registro.cancelada) {
        documentos.push({
          tipo: tipoXml,
          modelo: registro.modelo === "65" ? "65" : "55",
          cancelado: true,
          codigoParticipante: null,
          serie: registro.serie,
          numero: registro.numero,
          chaveAcesso: registro.chaveAcesso,
          dataEmissao: registro.emitidaEm,
          dataEntradaSaida: null,
          aPrazo: false,
          valorDocumento: 0,
          valorDesconto: 0,
          valorMercadorias: 0,
          valorFrete: 0,
          valorSeguro: 0,
          outrasDespesas: 0,
          ufDestino: null,
          itens: [],
          rotulo: `XML ${registro.numero ?? registro.chaveAcesso} (cancelada)`
        });
        continue;
      }

      let parsed: XmlDocumentoSped;
      try {
        const p = parseXmlSped(registro.xml);
        if (p.kind !== "DOCUMENTO") continue;
        parsed = p;
      } catch (e) {
        avisos.push(
          `XML avulso ${registro.numero ?? registro.chaveAcesso}: não foi possível reler o XML (${e instanceof Error ? e.message : "erro"}) — documento NÃO incluído.`
        );
        continue;
      }

      const rotulo = `${parsed.modelo === "65" ? "NFC-e" : "NF-e"} ${parsed.numero} (XML avulso)`;
      const entrada = tipoXml === "ENTRADA";
      const regime = empresa.regimeTributario as RegimeTributario;
      const interestadual = Boolean(parsed.emitente.uf && empresa.enderecoUf && parsed.emitente.uf !== empresa.enderecoUf);
      const fornecedorId = fornecedorPorDocumento.get(parsed.emitente.documento) ?? null;
      const finalidadesManuais = (registro.finalidadesItens ?? {}) as Record<string, unknown>;
      let itensManuais = 0;
      let itensPorRegra = 0;
      let itensPorHeuristica = 0;

      let codigoParticipante: string | null = null;
      if (entrada) {
        codigoParticipante = participanteXml(parsed.emitente);
      } else if (parsed.modelo === "55" && parsed.destinatario) {
        codigoParticipante = participanteXml(parsed.destinatario);
      }

      // Crédito do Simples (LC 123): preferir os campos estruturados (vCredICMSSN por item);
      // sem eles, ratear pelo valor dos itens o crédito mencionado no TEXTO do infCpl.
      const temCredEstruturado = parsed.itens.some((i) => i.valorCredSN > 0);
      const totalLiquidoDoc = round2(parsed.itens.reduce((s, i) => s + i.valorTotal - i.valorDesconto, 0));
      const infCplCred = entrada ? parsed.creditoSimplesInfCpl : 0;
      let credSNDocTotal = 0;

      const itens: SpedDocumentoItem[] = parsed.itens.map((item: XmlItem) => {
        if (!entrada) {
          // Saída de emissão própria: escritura como destacado no documento (C100 + C190).
          return {
            numeroItem: item.numeroItem,
            codigoItem: item.codigo,
            descricaoComplementar: null,
            quantidade: item.quantidade,
            unidade: item.unidade,
            valorItem: item.valorTotal,
            valorDesconto: item.valorDesconto,
            movimentaEstoque: true,
            cfop: (item.cfop ?? "").replace(/\D/g, "") || "5102",
            cstIcms: cstIcms3(item.origem, item.cstIcms, item.csosn),
            baseIcms: item.baseIcms,
            aliquotaIcms: item.aliquotaIcms,
            valorIcms: item.valorIcms,
            baseIcmsSt: item.baseIcmsSt,
            aliquotaIcmsSt: item.aliquotaIcmsSt,
            valorIcmsSt: item.valorIcmsSt,
            valorReducaoBc: 0,
            cstIpi: item.cstIpi,
            baseIpi: item.baseIpi,
            aliquotaIpi: item.aliquotaIpi,
            valorIpi: item.valorIpi,
            cstPis: item.cstPis,
            basePis: item.basePis,
            aliquotaPis: item.aliquotaPis,
            valorPis: item.valorPis,
            cstCofins: item.cstCofins,
            baseCofins: item.baseCofins,
            aliquotaCofins: item.aliquotaCofins,
            valorCofins: item.valorCofins,
            antecipacaoParcial: 0
          };
        }

        // Entrada por XML: a finalidade (e portanto o crédito) segue a precedência
        // MANUAL (por item ou da nota inteira, chave "*") → regra De/Para → heurística.
        const manual = finalidadesManuais[String(item.numeroItem)] ?? finalidadesManuais["*"];
        let finalidade: FinalidadeEntrada;
        if (isFinalidadeEntrada(manual)) {
          finalidade = manual;
          itensManuais++;
        } else {
          const regra = pickFinalidadeRule(regrasFinalidade, { ncm: item.ncm, cfopOrigem: item.cfop, fornecedorId });
          if (regra) {
            finalidade = regra.finalidade;
            itensPorRegra++;
          } else {
            finalidade = sugerirFinalidadeEntrada({ ncm: item.ncm, cfop: item.cfop, descricao: item.descricao }).finalidade;
            itensPorHeuristica++;
          }
        }
        const st =
          ["10", "30", "60", "70"].includes(item.cstIcms ?? "") ||
          ["201", "202", "203", "500"].includes(item.csosn ?? "");
        const cred = (tributo: TipoTributo) => creditoPorFinalidade(finalidade, regime, tributo, { st }).recuperavel;
        const credIcms = cred("ICMS");
        const credPis = cred("PIS");
        const credCofins = cred("COFINS");
        const cfopEntradaXml = resolveCfopEntrada(finalidade, { interestadual, st });
        const antecipacaoParcial = calcularAntecipacaoParcial({
          ativa: Boolean(spedConfig?.antecipacaoParcialAtiva),
          finalidade,
          cfopEntrada: cfopEntradaXml,
          st,
          base: round2(item.valorTotal - item.valorDesconto),
          aliquotaDestacada: item.aliquotaIcms,
          ufFornecedor: parsed.emitente.uf,
          ufEmpresa: empresa.enderecoUf
        });

        // Crédito do Simples (LC 123): estruturado por item ou rateio do infCpl.
        const liquidoXml = round2(item.valorTotal - item.valorDesconto);
        let credSNValor = item.valorCredSN;
        let credSNAliq = item.aliquotaCredSN;
        if (credSNValor <= 0 && !temCredEstruturado && infCplCred > 0 && totalLiquidoDoc > 0) {
          credSNValor = round2((liquidoXml / totalLiquidoDoc) * infCplCred);
          credSNAliq = liquidoXml > 0 ? round2((credSNValor / liquidoXml) * 100) : 0;
        }
        const aplicaCredSN = entrada && credIcms && !st && item.valorIcms <= 0 && credSNValor > 0;
        if (aplicaCredSN) credSNDocTotal = round2(credSNDocTotal + credSNValor);

        // CST da entrada: preserva o CST/origem do XML (como fazem os geradores de mercado);
        // o crédito é decidido pelos VALORES (zerados quando não recuperável). Sem CST no XML
        // (fornecedor do Simples emite CSOSN), o de-para de CSOSN resolve.
        const cstXml = (item.cstIcms ?? "").replace(/\D/g, "");
        const cst3Entrada = cstXml
          ? cstIcms3(item.origem, cstXml, null)
          : cstIcms3(item.origem, credIcms ? "00" : st ? "60" : "90", item.csosn);

        const codigoItem = `XML-${(parsed.emitente.documento || "X").slice(-6)}-${item.codigo}`.slice(0, 60);
        if (!catalogo.has(codigoItem)) {
          catalogo.set(codigoItem, {
            codigo: codigoItem,
            descricao: item.descricao,
            gtin: item.gtin,
            unidade: item.unidade,
            tipoItem: tipoItem0200(finalidade, null),
            ncm: item.ncm,
            cest: item.cest
          });
        }

        return {
          numeroItem: item.numeroItem,
          codigoItem,
          descricaoComplementar: null,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valorItem: item.valorTotal,
          valorDesconto: item.valorDesconto,
          movimentaEstoque: finalidadeMovimentaEstoque(finalidade),
          cfop: cfopEntradaXml,
          cstIcms: aplicaCredSN ? cstIcms3(item.origem, "90", null) : cst3Entrada,
          baseIcms: aplicaCredSN ? liquidoXml : credIcms ? item.baseIcms : 0,
          aliquotaIcms: aplicaCredSN ? credSNAliq : credIcms ? item.aliquotaIcms : 0,
          valorIcms: aplicaCredSN ? credSNValor : credIcms ? item.valorIcms : 0,
          creditoSimplesLc123: aplicaCredSN,
          baseIcmsSt: 0,
          aliquotaIcmsSt: 0,
          valorIcmsSt: 0,
          valorReducaoBc: 0,
          cstIpi: null,
          baseIpi: 0,
          aliquotaIpi: 0,
          valorIpi: 0,
          cstPis: credPis ? item.cstPis : null,
          basePis: credPis ? item.basePis : 0,
          aliquotaPis: credPis ? item.aliquotaPis : 0,
          valorPis: credPis ? item.valorPis : 0,
          cstCofins: credCofins ? item.cstCofins : null,
          baseCofins: credCofins ? item.baseCofins : 0,
          aliquotaCofins: credCofins ? item.aliquotaCofins : 0,
          valorCofins: credCofins ? item.valorCofins : 0,
          antecipacaoParcial
        };
      });

      if (credSNDocTotal > 0) {
        avisos.push(
          `${rotulo}: crédito de ICMS do Simples Nacional (LC 123, art. 23) apropriado — R$ ${credSNDocTotal.toFixed(2).replace(".", ",")} ${temCredEstruturado ? "(campos pCredSN/vCredICMSSN do XML)" : "(rateado a partir do TEXTO das informações complementares — confirme com o contador)"}.`
        );
      }

      if (entrada && itensPorHeuristica > 0) {
        const detalhe = [
          itensManuais > 0 ? `${itensManuais} definido(s) por você` : null,
          itensPorRegra > 0 ? `${itensPorRegra} por regra De/Para` : null,
          `${itensPorHeuristica} INFERIDO(S) por heurística`
        ]
          .filter(Boolean)
          .join(", ");
        avisos.push(
          `${rotulo}: finalidades dos itens — ${detalhe}. Para os inferidos, defina a finalidade no card "XMLs avulsos" (ou crie uma regra em Regras de finalidade) e regere o arquivo.`
        );
      }

      documentos.push({
        tipo: tipoXml,
        modelo: parsed.modelo,
        cancelado: false,
        codigoParticipante,
        serie: parsed.serie,
        numero: parsed.numero,
        chaveAcesso: parsed.chaveAcesso,
        dataEmissao: parsed.emitidaEm,
        dataEntradaSaida: entrada ? parsed.emitidaEm : parsed.modelo === "55" ? parsed.emitidaEm : null,
        aPrazo: parsed.aPrazo,
        valorDocumento: parsed.totais.valorNota,
        valorDesconto: parsed.totais.valorDesconto,
        valorMercadorias: parsed.totais.valorProdutos,
        valorFrete: parsed.totais.valorFrete,
        valorSeguro: parsed.totais.valorSeguro,
        outrasDespesas: parsed.totais.outrasDespesas,
        ufDestino: !entrada && parsed.destinatario?.uf ? parsed.destinatario.uf : null,
        itens,
        rotulo
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Inventário (bloco H): inventário FINALIZADO dentro do período
  // ---------------------------------------------------------------------------
  const inventarioDb = await prisma.inventario.findFirst({
    where: { ...base, status: "FINALIZADO", finalizadoEm: { gte: inicio, lte: fim } },
    include: {
      itens: { include: { produto: { select: { sku: true, nome: true, unidade: true, ncm: true, cest: true, gtin: true, tipo: true } } } }
    },
    orderBy: { finalizadoEm: "desc" }
  });

  let inventario: SpedInput["inventario"] = null;
  if (inventarioDb?.finalizadoEm) {
    const itensInv = inventarioDb.itens
      .filter((i) => num(i.saldoContado ?? i.saldoSistema) > 0)
      .map((i) => {
        const codigo = i.produto.sku;
        if (!catalogo.has(codigo)) {
          catalogo.set(codigo, {
            codigo,
            descricao: i.produto.nome,
            gtin: i.produto.gtin,
            unidade: i.produto.unidade,
            tipoItem: tipoItem0200(null, i.produto.tipo),
            ncm: i.produto.ncm,
            cest: i.produto.cest
          });
        }
        return {
          codigoItem: codigo,
          unidade: i.produto.unidade,
          quantidade: num(i.saldoContado ?? i.saldoSistema),
          valorUnitario: num(i.custoUnitario)
        };
      });
    if (itensInv.length > 0) {
      inventario = { data: inventarioDb.finalizadoEm, itens: itensInv };
    }
  }

  const config: SpedConfig = {
    perfilArquivo: (spedConfig?.perfilArquivo === "A" || spedConfig?.perfilArquivo === "C" ? spedConfig.perfilArquivo : "B") as SpedConfig["perfilArquivo"],
    indAtividade: spedConfig?.indAtividade === "0" ? "0" : "1",
    finalidade: params.finalidade === "RETIFICADORA" ? "RETIFICADORA" : "ORIGINAL",
    contador: {
      nome: spedConfig?.contadorNome ?? null,
      cpf: spedConfig?.contadorCpf ?? null,
      crc: spedConfig?.contadorCrc ?? null,
      cnpj: spedConfig?.contadorCnpj ?? null,
      cep: spedConfig?.contadorCep ?? null,
      endereco: spedConfig?.contadorEndereco ?? null,
      numero: spedConfig?.contadorNumero ?? null,
      complemento: spedConfig?.contadorComplemento ?? null,
      bairro: spedConfig?.contadorBairro ?? null,
      telefone: spedConfig?.contadorTelefone ?? null,
      email: spedConfig?.contadorEmail ?? null,
      codigoMunicipioIbge: spedConfig?.contadorCodigoMunicipioIbge ?? null
    },
    codigoReceitaIcms: spedConfig?.codigoReceitaIcms ?? null,
    diaVencimentoIcms: spedConfig?.diaVencimentoIcms ?? 10,
    saldoCredorAnterior,
    saldoCredorAnteriorIpi,
    antecipacaoParcialAtiva: Boolean(spedConfig?.antecipacaoParcialAtiva),
    codAjusteDebitoAntecipacao: spedConfig?.codAjusteDebitoAntecipacao ?? null,
    codAjusteCreditoAntecipacao: spedConfig?.codAjusteCreditoAntecipacao ?? null,
    codigoReceitaAntecipacao: spedConfig?.codigoReceitaAntecipacao ?? null,
    diaVencimentoAntecipacao: spedConfig?.diaVencimentoAntecipacao ?? 25
  };

  return {
    periodo,
    empresa: {
      razaoSocial: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual,
      inscricaoMunicipal: empresa.inscricaoMunicipal,
      uf: empresa.enderecoUf,
      codigoMunicipioIbge: empresa.codigoMunicipioIbge,
      nomeFantasia: empresa.nomeFantasia,
      cep: empresa.enderecoCep,
      logradouro: empresa.enderecoLogradouro,
      numero: empresa.enderecoNumero,
      complemento: empresa.enderecoComplemento,
      bairro: empresa.enderecoBairro,
      telefone: empresa.telefone,
      email: empresa.email,
      regimeTributario: empresa.regimeTributario
    },
    config,
    versaoLeiaute: resolveVersaoLeiaute(ano),
    participantes: Array.from(participantes.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
    itensCatalogo: Array.from(catalogo.values()).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    documentos,
    inventario,
    avisos
  };
}
