import type { FinalidadeNfe } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { exitStock, getDefaultDeposito, applyStockMovement } from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido, buildNfseFromOrdemServico } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument, previewFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { extrairCamposImutaveisSubstituicao } from "@/domains/fiscal/providers/nacional-provider";
import { isCodigoServicoValido } from "@/domains/fiscal/codigo-tributacao-nacional";
import { sugerirPorLc116 } from "@/domains/fiscal/nbs";
import type { ObraInfo, TaxationTypeIss } from "@/domains/fiscal/types";
import { computeRetencoes, issPorServico } from "@/domains/fiscal/nfse-tax";
import type { RetencoesInput } from "@/domains/fiscal/nfse-tax";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Emissão fiscal AVULSA — NF-e, NFC-e e NFS-e emitidas diretamente, sem exigir um pedido de
 * venda ou ordem de serviço. Atende empresas que usam o sistema apenas para emitir notas.
 * Reaproveita o motor de emissão (`emitFiscalDocument`): tributos são calculados pelas regras
 * tributárias/NCM da empresa; opcionalmente baixa estoque para itens de catálogo.
 */

export class StandaloneEmissionError extends Error {}

type EnderecoInput = {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade?: string | null;
  uf?: string | null;
  codigoMunicipioIbge?: string | null;
};

export type ReceiverInput = {
  /** Quando informado, carrega o cliente cadastrado (com endereço/contatos). */
  clienteId?: string | null;
  // Destinatário avulso (quando não há clienteId):
  nome?: string | null;
  documento?: string | null;
  inscricaoEstadual?: string | null;
  email?: string | null;
  endereco?: EnderecoInput | null;
};

export type ProductInvoiceItemInput = {
  /** Produto do catálogo (habilita baixa de estoque e herda NCM/CFOP/origem do cadastro). */
  produtoId?: string | null;
  // Item avulso (sem catálogo):
  codigo?: string | null;
  descricao?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  origem?: string | null;
  unidade?: string | null;
  quantidade: number;
  precoUnitario: number;
  desconto?: number;
};

export type ProductInvoiceAvulsaInput = {
  modelo?: "NFE" | "NFCE";
  finalidade?: FinalidadeNfe;
  naturezaOperacao?: string;
  /** NF-e de devolução: chave de acesso (44 dígitos) da nota original referenciada. */
  chaveReferenciada?: string | null;
  /** NF-e de devolução: id da nota original (vínculo interno). */
  notaOrigemId?: string | null;
  /** Reenvio: id de uma nota anterior rejeitada/erro a reaproveitar. */
  retryNotaId?: string | null;
  receiver: ReceiverInput;
  formaPagamento?: string | null;
  condicaoPagamento?: string | null;
  observacoes?: string | null;
  frete?: number;
  /** Modalidade do frete (modFrete): 0=CIF,1=FOB,2=terceiros,3/4=próprio,9=sem transporte. */
  modalidadeFrete?: number | null;
  seguro?: number;
  desconto?: number;
  outrasDespesas?: number;
  itens: ProductInvoiceItemInput[];
  /** Baixa estoque dos itens de catálogo após autorização (padrão: false). */
  baixarEstoque?: boolean;
  sendEmailToCustomer?: boolean;
};


export type ServiceInvoiceAvulsaInput = {
  receiver: ReceiverInput;
  observacoes?: string | null;
  condicaoPagamento?: string | null;
  formaPagamento?: string | null;
  /** Código LC 116 padrão do documento (usado quando o serviço não traz o próprio). */
  codigoServicoLc116?: string | null;
  /** Código NBS padrão do documento (cNBS, 9 dígitos) — usado quando o serviço não traz o próprio. */
  codigoNbs?: string | null;
  /** Alíquota de ISS informada (%) — sobrepõe a regra tributária. */
  aliquotaIss?: number | null;
  /** Deduções da base de cálculo do ISS (R$). */
  deducoes?: number | null;
  /** Base de cálculo do ISS informada (R$); quando ausente, usa valor dos serviços − deduções. */
  baseCalculoIss?: number | null;
  /** Natureza/exigibilidade do ISS (padrão: tributado no município). */
  taxationType?: TaxationTypeIss | null;
  servicos: Array<{ descricao: string; valor: number; codigoServicoLc116?: string | null; codigoNbs?: string | null; cClassTrib?: string | null }>;
  retencoes?: RetencoesInput | null;
  /** Informações da obra (construção civil) — exigidas no DPS para certos códigos de tributação. */
  obra?: ObraInfo | null;
  /** Substituição de NFS-e: nota a ser substituída (id no nosso banco) + chave + motivo. */
  substituicao?: {
    notaSubstituidaId?: string | null;
    chaveSubstituida: string;
    cMotivo: string;
    xMotivo?: string | null;
  } | null;
  /** Reenvio: id de uma NFS-e anterior rejeitada/erro a reaproveitar. */
  retryNotaId?: string | null;
};

type ClienteLike = {
  razaoSocial: string;
  documento: string | null;
  inscricaoEstadual: string | null;
  enderecos: Array<{
    uf: string;
    padrao: boolean;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cep?: string | null;
    cidade?: string | null;
    codigoMunicipioIbge?: string | null;
  }>;
  contatos: Array<{ email: string | null; principal: boolean }>;
};

/**
 * Resolve o destinatário: cliente cadastrado (carrega do banco) ou destinatário avulso.
 * NFC-e (mod 65) admite venda a consumidor final NÃO identificado — sem cliente nem nome —,
 * então nesse caso devolve um destinatário genérico (CPF opcional) em vez de exigir.
 */
async function resolveReceiver(
  scope: TenantScope,
  receiver: ReceiverInput,
  modelo: "NFE" | "NFCE" | "NFSE"
): Promise<ClienteLike> {
  if (receiver.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: receiver.clienteId, ...scopedByTenantCompany(scope) },
      include: { enderecos: true, contatos: true }
    });
    if (!cliente) throw new StandaloneEmissionError("Cliente informado não encontrado nesta empresa.");
    return {
      razaoSocial: cliente.razaoSocial,
      documento: cliente.documento,
      inscricaoEstadual: cliente.inscricaoEstadual,
      enderecos: cliente.enderecos.map((e) => ({
        uf: e.uf,
        padrao: e.padrao,
        logradouro: e.logradouro,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        cep: e.cep,
        cidade: e.cidade,
        codigoMunicipioIbge: e.codigoMunicipioIbge
      })),
      contatos: cliente.contatos.map((c) => ({ email: c.email, principal: c.principal }))
    };
  }

  const nome = receiver.nome?.trim();
  if (!nome) {
    // NFC-e a consumidor final não identificado: destinatário genérico, com CPF opcional na nota.
    if (modelo === "NFCE") {
      return {
        razaoSocial: "Consumidor não identificado",
        documento: receiver.documento?.replace(/\D/g, "") || null,
        inscricaoEstadual: null,
        enderecos: [],
        contatos: receiver.email?.trim() ? [{ email: receiver.email.trim(), principal: true }] : []
      };
    }
    throw new StandaloneEmissionError("Informe o destinatário (cliente cadastrado ou nome do destinatário avulso).");
  }
  const end = receiver.endereco ?? null;
  return {
    razaoSocial: nome,
    documento: receiver.documento?.replace(/\D/g, "") || null,
    inscricaoEstadual: receiver.inscricaoEstadual?.trim() || null,
    enderecos: end
      ? [
          {
            uf: end.uf ?? "",
            padrao: true,
            logradouro: end.logradouro ?? null,
            numero: end.numero ?? null,
            complemento: end.complemento ?? null,
            bairro: end.bairro ?? null,
            cep: end.cep ?? null,
            cidade: end.cidade ?? null,
            codigoMunicipioIbge: end.codigoMunicipioIbge ?? null
          }
        ]
      : [],
    contatos: receiver.email?.trim() ? [{ email: receiver.email.trim(), principal: true }] : []
  };
}

/** Emite NF-e ou NFC-e avulsa (sem pedido de venda). */
/**
 * Monta o documento fiscal normalizado de uma emissão avulsa de produto (sem persistir nem
 * emitir). Reaproveitado pela emissão real e pelo espelho fiscal (preview), garantindo que a
 * prévia reflita exatamente o que será enviado. As validações específicas da SEFAZ (NCM/
 * endereço) ficam fora daqui — a emissão as aplica como bloqueio; o preview as mostra como aviso.
 */
export async function buildProductInvoiceDocument(scope: TenantScope, input: ProductInvoiceAvulsaInput) {
  if (!input.itens?.length) throw new StandaloneEmissionError("Informe ao menos um item.");

  const modelo = input.modelo ?? "NFE";
  const cliente = await resolveReceiver(scope, input.receiver, modelo);

  // Carrega produtos de catálogo (com ficha fiscal) referenciados pelos itens.
  const produtoIds = Array.from(new Set(input.itens.map((i) => i.produtoId).filter((id): id is string => Boolean(id))));
  const produtos = produtoIds.length
    ? await prisma.produto.findMany({
        where: { id: { in: produtoIds }, ...scopedByTenantCompany(scope) },
        include: { fiscal: true }
      })
    : [];
  const produtoMap = new Map(produtos.map((p) => [p.id, p]));

  const linhas = input.itens.map((item, index) => {
    if (item.quantidade <= 0) throw new StandaloneEmissionError(`Quantidade inválida no item ${index + 1}.`);
    if (item.precoUnitario < 0) throw new StandaloneEmissionError(`Preço inválido no item ${index + 1}.`);

    if (item.produtoId) {
      const p = produtoMap.get(item.produtoId);
      if (!p) throw new StandaloneEmissionError(`Produto do item ${index + 1} não encontrado nesta empresa.`);
      return {
        produto: {
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          ncm: item.ncm ?? p.ncm,
          cest: item.cest ?? p.cest,
          cfop: item.cfop ?? p.cfop,
          origem: item.origem ?? p.origem,
          unidade: item.unidade ?? p.unidade,
          fiscal: p.fiscal
            ? { ncm: p.fiscal.ncm, cest: p.fiscal.cest, origem: p.fiscal.origem, regraTributariaId: p.fiscal.regraTributariaId, icmsSt: p.fiscal.icmsSt }
            : null
        },
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        desconto: item.desconto ?? 0
      };
    }

    // Item avulso (sem catálogo): exige descrição.
    const descricao = item.descricao?.trim();
    if (!descricao) throw new StandaloneEmissionError(`Informe a descrição do item avulso ${index + 1}.`);
    return {
      produto: {
        id: `avulso-${index + 1}`,
        sku: item.codigo?.trim() || `AVULSO-${index + 1}`,
        nome: descricao,
        ncm: item.ncm ?? null,
        cest: item.cest ?? null,
        cfop: item.cfop ?? null,
        origem: item.origem ?? "0",
        unidade: item.unidade ?? "UN",
        fiscal: null
      },
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      desconto: item.desconto ?? 0
    };
  });

  const doc = buildDocumentFromPedido({
    cliente,
    modelo,
    finalidade: input.finalidade ?? "NORMAL",
    chaveReferenciada: input.chaveReferenciada ?? null,
    naturezaOperacao: input.naturezaOperacao ?? "Venda de mercadoria",
    formaPagamento: input.formaPagamento ?? null,
    condicaoPagamento: input.condicaoPagamento ?? null,
    observacoes: input.observacoes ?? null,
    frete: input.frete ?? 0,
    modalidadeFrete: input.modalidadeFrete ?? null,
    valorSeguro: input.seguro ?? 0,
    desconto: input.desconto ?? 0,
    outrasDespesas: input.outrasDespesas ?? 0,
    itens: linhas
  });

  // Itens avulsos (sem catálogo) não devem persistir produtoId (id sintético viola a FK).
  doc.itens.forEach((item, index) => {
    if (!input.itens[index]?.produtoId) {
      item.produtoId = null;
    }
  });

  return { doc, modelo, cliente, linhas };
}

/**
 * Validações de schema da SEFAZ feitas ANTES de enviar (espelham as rejeições da Spedy):
 * NCM obrigatório (8 dígitos) por item e endereço do destinatário com tamanhos mínimos.
 */
function validateProductInvoiceForSefaz(
  linhas: Awaited<ReturnType<typeof buildProductInvoiceDocument>>["linhas"],
  cliente: Awaited<ReturnType<typeof buildProductInvoiceDocument>>["cliente"],
  modelo: "NFE" | "NFCE" | "NFSE"
) {
  linhas.forEach((linha, index) => {
    const ncm = (linha.produto.ncm ?? "").replace(/\D/g, "");
    if (ncm.length !== 8) {
      throw new StandaloneEmissionError(`Item ${index + 1} (${linha.produto.nome}): informe o NCM com 8 dígitos (obrigatório na NF-e/NFC-e).`);
    }
  });

  // Endereço do destinatário só é exigido na NF-e (mod 55). A NFC-e (mod 65) é venda a
  // consumidor presencial: o endereço do destinatário é opcional e normalmente nem vai na nota.
  if (modelo !== "NFE") return;

  const end = cliente.enderecos[0];
  if (!end || (end.logradouro ?? "").trim().length < 2) {
    throw new StandaloneEmissionError("Endereço do destinatário incompleto: o logradouro deve ter ao menos 2 caracteres (exigência da SEFAZ).");
  }
  if (!(end.bairro ?? "").trim() || (end.bairro ?? "").trim().length < 2) {
    throw new StandaloneEmissionError("Endereço do destinatário incompleto: informe o bairro (mínimo 2 caracteres).");
  }
  if ((end.cep ?? "").replace(/\D/g, "").length !== 8) {
    throw new StandaloneEmissionError("Endereço do destinatário incompleto: informe um CEP válido (8 dígitos).");
  }
}

/** Espelho fiscal de uma emissão avulsa de produto: tributos por item + totais, sem emitir. */
export async function previewProductInvoiceAvulsa(scope: TenantScope, input: ProductInvoiceAvulsaInput) {
  const { doc } = await buildProductInvoiceDocument(scope, input);
  return previewFiscalDocument(scope, doc);
}

export async function emitProductInvoiceAvulsa(scope: TenantScope, input: ProductInvoiceAvulsaInput) {
  const { doc, modelo, cliente, linhas } = await buildProductInvoiceDocument(scope, input);
  validateProductInvoiceForSefaz(linhas, cliente, modelo);

  const nota = await emitFiscalDocument(scope, doc, {
    clienteId: input.receiver.clienteId ?? null,
    notaOrigemId: input.notaOrigemId ?? null,
    retryNotaId: input.retryNotaId ?? null
  });

  // Movimento de estoque opcional (somente itens de catálogo) após autorização. Devolução
  // (finalidade DEVOLUCAO) faz ENTRADA — a mercadoria volta ao estoque; demais fazem SAÍDA.
  if (input.baixarEstoque && nota.status === "AUTORIZADA") {
    const itensCatalogo = input.itens.filter((i) => i.produtoId);
    if (itensCatalogo.length) {
      const isDevolucao = (input.finalidade ?? "NORMAL") === "DEVOLUCAO";
      await prisma.$transaction(async (tx) => {
        const deposito = await getDefaultDeposito(tx, scope);
        if (isDevolucao) {
          for (const i of itensCatalogo) {
            await applyStockMovement(tx, scope, {
              produtoId: i.produtoId as string,
              depositoId: deposito.id,
              tipo: "ENTRADA",
              quantidade: i.quantidade,
              documentoTipo: "NOTA_FISCAL_AVULSA",
              documentoId: nota.id,
              observacoes: `Devolução por NF-e avulsa ${nota.numero ?? ""}`.trim()
            });
          }
        } else {
          await exitStock(
            tx,
            scope,
            itensCatalogo.map((i) => ({ produtoId: i.produtoId as string, depositoId: deposito.id, quantidade: i.quantidade })),
            { documentoTipo: "NOTA_FISCAL_AVULSA", documentoId: nota.id, observacoes: `Baixa por emissão avulsa ${modelo} ${nota.numero ?? ""}`.trim() }
          );
        }
        await createAuditLog(tx, {
          scope,
          entidade: "NotaFiscal",
          entidadeId: nota.id,
          acao: isDevolucao ? "AVULSA_STOCK_ENTRY" : "AVULSA_STOCK_EXIT",
          payload: { modelo, itens: itensCatalogo.length }
        });
      });
    }
  }

  return nota;
}

/** Emite NFS-e avulsa (sem ordem de serviço). */
export async function emitServiceInvoiceAvulsa(scope: TenantScope, input: ServiceInvoiceAvulsaInput) {
  if (!input.servicos?.length) throw new StandaloneEmissionError("Informe ao menos um serviço.");

  const docDefault = input.codigoServicoLc116?.trim() || null;
  if (docDefault && !isCodigoServicoValido(docDefault)) {
    throw new StandaloneEmissionError("Código de Tributação Nacional (serviço) inválido.");
  }

  const cliente = await resolveReceiver(scope, input.receiver, "NFSE");

  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { codigoServicoLc116Padrao: true, codigoNbsPadrao: true }
  });
  const fallback = docDefault ?? config?.codigoServicoLc116Padrao ?? null;
  const nbsFallback = input.codigoNbs?.trim() || config?.codigoNbsPadrao || null;

  const valorServicos = round2(input.servicos.reduce((sum, s) => sum + (Number(s.valor) || 0), 0));

  // Base de cálculo do ISS: informada, ou valor dos serviços − deduções.
  const aliquotaIss = input.aliquotaIss != null && input.aliquotaIss > 0 ? input.aliquotaIss : null;
  const deducoes = input.deducoes != null && input.deducoes > 0 ? round2(input.deducoes) : 0;
  const baseIssTotal =
    input.baseCalculoIss != null && input.baseCalculoIss > 0
      ? round2(input.baseCalculoIss)
      : round2(Math.max(valorServicos - deducoes, 0));
  // Base de ISS é distribuída entre os serviços proporcionalmente ao valor de cada um.
  const distribuirBaseIss = aliquotaIss != null && (deducoes > 0 || input.baseCalculoIss != null) && valorServicos > 0;

  const servicos = input.servicos.map((s, index) => {
    if (!s.descricao?.trim()) throw new StandaloneEmissionError(`Informe a descrição do serviço ${index + 1}.`);
    if (s.valor <= 0) throw new StandaloneEmissionError(`Valor inválido no serviço ${index + 1}.`);
    const codigo = s.codigoServicoLc116?.trim() || fallback;
    if (codigo && !isCodigoServicoValido(codigo)) {
      throw new StandaloneEmissionError(`Código de Tributação Nacional inválido no serviço ${index + 1}.`);
    }
    // Sugestão automática (tabela oficial): NBS e cClassTrib derivados do LC 116, quando o
    // serviço não trouxer os próprios. O informado pelo usuário sempre tem prioridade.
    const sug = sugerirPorLc116(codigo);
    return {
      descricao: s.descricao.trim(),
      valor: s.valor,
      itemListaServico: codigo,
      codigoNbs: s.codigoNbs?.trim() || nbsFallback || sug?.nbsPadrao || null,
      cClassTrib: s.cClassTrib?.trim() || sug?.classTribPadrao || null,
      aliquotaIss,
      baseIss: distribuirBaseIss ? round2(baseIssTotal * (s.valor / valorServicos)) : null
    };
  });

  const retencoes = computeRetencoes(valorServicos, input.retencoes);

  // Substituição de NFS-e: a SEFIN não deixa alterar data de competência, subitem da lista, código
  // complementar municipal e local da prestação (E0060). Extrai esses campos do XML da NFS-e original
  // e os repassa, para a substituta repeti-los idênticos.
  let camposImutaveisSubst: ReturnType<typeof extrairCamposImutaveisSubstituicao> | null = null;
  if (input.substituicao) {
    const chave = input.substituicao.chaveSubstituida.replace(/\D/g, "");
    const original = await prisma.notaFiscal.findFirst({
      where: {
        ...scopedByTenantCompany(scope),
        ...(input.substituicao.notaSubstituidaId ? { id: input.substituicao.notaSubstituidaId } : { chaveAcesso: chave })
      },
      select: { xml: true, emitidaEm: true }
    });
    if (original?.xml) camposImutaveisSubst = extrairCamposImutaveisSubstituicao(original.xml);
    // Fallback da data de competência: se não veio do XML, a competência original = data de emissão
    // (no fuso de Brasília, -03:00), que foi como o dCompet foi gerado na emissão original.
    if (original?.emitidaEm && !camposImutaveisSubst?.dCompet) {
      const dCompetFallback = new Date(original.emitidaEm.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      camposImutaveisSubst = { ...(camposImutaveisSubst ?? { dCompet: null, cTribNac: null, cLocPrestacao: null, cTribMun: null }), dCompet: dCompetFallback };
    }
  }

  const doc = buildNfseFromOrdemServico({
    cliente,
    observacoes: input.observacoes ?? null,
    condicaoPagamento: input.condicaoPagamento ?? null,
    formaPagamento: input.formaPagamento ?? null,
    servicos,
    retencoes,
    taxationType: input.taxationType ?? null,
    obra: input.obra ?? null,
    substituicao: input.substituicao
      ? {
          chaveSubstituida: input.substituicao.chaveSubstituida,
          cMotivo: input.substituicao.cMotivo,
          xMotivo: input.substituicao.xMotivo ?? null,
          dCompetOriginal: camposImutaveisSubst?.dCompet ?? null,
          cTribNacOriginal: camposImutaveisSubst?.cTribNac ?? null,
          cLocPrestacaoOriginal: camposImutaveisSubst?.cLocPrestacao ?? null,
          cTribMunOriginal: camposImutaveisSubst?.cTribMun ?? null
        }
      : null
  });

  const nota = await emitFiscalDocument(scope, doc, {
    clienteId: input.receiver.clienteId ?? null,
    retryNotaId: input.retryNotaId ?? null
  });

  // Substituição autorizada: marca a NFS-e antiga como SUBSTITUIDA e liga a nova a ela.
  if (input.substituicao?.notaSubstituidaId && nota.status === "AUTORIZADA") {
    await prisma.$transaction([
      prisma.notaFiscal.update({
        where: { id: nota.id },
        data: { notaSubstituidaId: input.substituicao.notaSubstituidaId }
      }),
      prisma.notaFiscal.updateMany({
        where: { id: input.substituicao.notaSubstituidaId, ...scopedByTenantCompany(scope) },
        data: { status: "SUBSTITUIDA" }
      })
    ]);
  }

  return nota;
}

/**
 * Emite uma NF-e de TESTE em homologação para validar a configuração fiscal de ponta a ponta
 * (certificado + provedor + dados do emitente). Usa a própria empresa como destinatário e um item
 * genérico. Só roda em ambiente de HOMOLOGAÇÃO — recusa em produção para não gerar nota real.
 * Reusa todo o pipeline de emissão (emitProductInvoiceAvulsa).
 */
export type ModeloTesteFiscal = "NFE" | "NFCE" | "NFSE";

export async function emitirNotaTesteHomologacao(scope: TenantScope, modelo: ModeloTesteFiscal = "NFE") {
  const config = await getFiscalRuntimeConfig(scope);
  if (config.ambiente !== "HOMOLOGACAO") {
    throw new StandaloneEmissionError(
      "Coloque o ambiente fiscal em HOMOLOGAÇÃO antes de emitir a nota de teste (evita gerar nota real em produção)."
    );
  }

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } });
  const endereco = {
    logradouro: empresa.enderecoLogradouro ?? undefined,
    numero: empresa.enderecoNumero ?? undefined,
    complemento: empresa.enderecoComplemento ?? undefined,
    bairro: empresa.enderecoBairro ?? undefined,
    cep: empresa.enderecoCep ?? undefined,
    cidade: empresa.enderecoCidade ?? undefined,
    uf: empresa.enderecoUf ?? undefined,
    codigoMunicipioIbge: empresa.codigoMunicipioIbge ?? undefined
  };

  // Destinatário/tomador de TESTE — precisa ser DIFERENTE do emitente (a SEFAZ recusa NFC-e/NFS-e
  // com destinatário = emitente). CNPJ de teste com dígitos válidos (não é o da empresa).
  const CNPJ_TESTE = "11222333000181";
  const receiver = {
    // Nome exigido pela SEFAZ em homologação (NF-e/NFC-e). NFS-e não valida este nome.
    nome: "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
    documento: CNPJ_TESTE,
    endereco
  };

  // NFS-e: usa o código de serviço PADRÃO da empresa (config) — a empresa é credenciada nele no
  // município (o CNC recusa códigos não autorizados). Só cai para "17.01" se não houver padrão.
  if (modelo === "NFSE") {
    const cfg = await prisma.configuracaoFiscal.findUnique({
      where: { empresaId: scope.empresaId },
      select: { codigoServicoLc116Padrao: true }
    });
    const lc116 = cfg?.codigoServicoLc116Padrao?.trim() || "17.01";
    return emitServiceInvoiceAvulsa(scope, {
      receiver,
      codigoServicoLc116: lc116,
      servicos: [{ descricao: "SERVICO DE TESTE HOMOLOGACAO", valor: 1 }]
    });
  }

  // NF-e (55) / NFC-e (65): produto de teste.
  return emitProductInvoiceAvulsa(scope, {
    modelo,
    naturezaOperacao: "Venda de teste (homologação)",
    // Forma de pagamento explícita (Dinheiro → tPag 01); sem isso cai em "99-outros", que a SEFAZ
    // rejeita por exigir descrição do pagamento.
    formaPagamento: "Dinheiro",
    receiver,
    itens: [
      { descricao: "PRODUTO TESTE HOMOLOGACAO", ncm: "84799090", cfop: "5102", origem: "0", unidade: "UN", quantidade: 1, precoUnitario: 1, desconto: 0 }
    ]
  });
}
