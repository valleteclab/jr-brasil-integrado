import type { FinalidadeNfe } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { exitStock, getDefaultDeposito } from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido, buildNfseFromOrdemServico } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { isValidLc116 } from "@/domains/fiscal/lc116";
import type { TaxationTypeIss } from "@/domains/fiscal/types";
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
  /** Alíquota de ISS informada (%) — sobrepõe a regra tributária. */
  aliquotaIss?: number | null;
  /** Deduções da base de cálculo do ISS (R$). */
  deducoes?: number | null;
  /** Base de cálculo do ISS informada (R$); quando ausente, usa valor dos serviços − deduções. */
  baseCalculoIss?: number | null;
  /** Natureza/exigibilidade do ISS (padrão: tributado no município). */
  taxationType?: TaxationTypeIss | null;
  servicos: Array<{ descricao: string; valor: number; codigoServicoLc116?: string | null }>;
  retencoes?: RetencoesInput | null;
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

/** Resolve o destinatário: cliente cadastrado (carrega do banco) ou destinatário avulso. */
async function resolveReceiver(scope: TenantScope, receiver: ReceiverInput): Promise<ClienteLike> {
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
  if (!nome) throw new StandaloneEmissionError("Informe o destinatário (cliente cadastrado ou nome do destinatário avulso).");
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
export async function emitProductInvoiceAvulsa(scope: TenantScope, input: ProductInvoiceAvulsaInput) {
  if (!input.itens?.length) throw new StandaloneEmissionError("Informe ao menos um item.");

  const cliente = await resolveReceiver(scope, input.receiver);
  const modelo = input.modelo ?? "NFE";

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
            ? { ncm: p.fiscal.ncm, cest: p.fiscal.cest, origem: p.fiscal.origem, regraTributariaId: p.fiscal.regraTributariaId }
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

  // Validações de schema da SEFAZ feitas ANTES de enviar (espelham as rejeições da Spedy):
  // NCM obrigatório (8 dígitos) por item e endereço do destinatário com tamanhos mínimos.
  linhas.forEach((linha, index) => {
    const ncm = (linha.produto.ncm ?? "").replace(/\D/g, "");
    if (ncm.length !== 8) {
      throw new StandaloneEmissionError(`Item ${index + 1} (${linha.produto.nome}): informe o NCM com 8 dígitos (obrigatório na NF-e/NFC-e).`);
    }
  });
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

  const nota = await emitFiscalDocument(scope, doc, {
    clienteId: input.receiver.clienteId ?? null,
    notaOrigemId: input.notaOrigemId ?? null,
    retryNotaId: input.retryNotaId ?? null
  });

  // Baixa de estoque opcional (somente itens de catálogo) após autorização.
  if (input.baixarEstoque && nota.status === "AUTORIZADA") {
    const itensCatalogo = input.itens.filter((i) => i.produtoId);
    if (itensCatalogo.length) {
      await prisma.$transaction(async (tx) => {
        const deposito = await getDefaultDeposito(tx, scope);
        await exitStock(
          tx,
          scope,
          itensCatalogo.map((i) => ({ produtoId: i.produtoId as string, depositoId: deposito.id, quantidade: i.quantidade })),
          { documentoTipo: "NOTA_FISCAL_AVULSA", documentoId: nota.id, observacoes: `Baixa por emissão avulsa ${modelo} ${nota.numero ?? ""}`.trim() }
        );
        await createAuditLog(tx, {
          scope,
          entidade: "NotaFiscal",
          entidadeId: nota.id,
          acao: "AVULSA_STOCK_EXIT",
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
  if (docDefault && !isValidLc116(docDefault)) {
    throw new StandaloneEmissionError("Código de serviço LC 116 inválido.");
  }

  const cliente = await resolveReceiver(scope, input.receiver);

  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { codigoServicoLc116Padrao: true }
  });
  const fallback = docDefault ?? config?.codigoServicoLc116Padrao ?? null;

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
    if (codigo && !isValidLc116(codigo)) {
      throw new StandaloneEmissionError(`Código LC 116 inválido no serviço ${index + 1}.`);
    }
    return {
      descricao: s.descricao.trim(),
      valor: s.valor,
      itemListaServico: codigo,
      aliquotaIss,
      baseIss: distribuirBaseIss ? round2(baseIssTotal * (s.valor / valorServicos)) : null
    };
  });

  const retencoes = computeRetencoes(valorServicos, input.retencoes);

  const doc = buildNfseFromOrdemServico({
    cliente,
    observacoes: input.observacoes ?? null,
    condicaoPagamento: input.condicaoPagamento ?? null,
    formaPagamento: input.formaPagamento ?? null,
    servicos,
    retencoes,
    taxationType: input.taxationType ?? null
  });

  return emitFiscalDocument(scope, doc, {
    clienteId: input.receiver.clienteId ?? null,
    retryNotaId: input.retryNotaId ?? null
  });
}
