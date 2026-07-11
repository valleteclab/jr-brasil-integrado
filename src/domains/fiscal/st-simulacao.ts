import { prisma } from "@/lib/db/prisma";
import { emitProductInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import type { TenantScope } from "@/lib/auth/dev-session";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * SIMULAÇÃO ponta a ponta do ST INTERESTADUAL (remetente substituto, Conv. ICMS 142/2018):
 * cadastra produto ST + regra de MVA (idempotente, prefixo TESTE-ST) e emite a NF-e avulsa em
 * HOMOLOGAÇÃO pelos provedores pedidos (alterna o provedor global e RESTAURA ao final).
 * Compartilhada pelo script CLI (scripts/simular-st-interestadual.ts) e pela rota administrativa
 * (/api/admin/simular-st) — TRAVA: aborta se a empresa estiver em produção ou destino na mesma UF.
 */

export type SimulacaoStParams = {
  /** id, CNPJ (14 dígitos) ou parte do nome da empresa emitente. */
  empresa: string;
  clienteCnpj: string;
  clienteIe: string;
  clienteUf: string;
  clienteNome?: string;
  cidade?: string;
  ibge?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  telefone?: string;
  mva?: number;
  aliqSt?: number;
  valor?: number;
  ncm?: string;
  provedores?: string[];
  /** Código de produto GNRE da UF destino (tabela por UF via GnreConfigUF; ex.: DF 20 = autopeças). */
  gnreProduto?: string;
  /** Código de RECEITA GNRE da UF destino (ex.: PR 100099 = ST por operação; default 100048). */
  gnreReceita?: string;
  /** Tipo de doc de origem GNRE (10 = nº da nota; 22 = chave — MT/PA exigem 22). */
  gnreTipoDocOrigem?: string;
  /** Detalhamento da receita GNRE (TO 000003 · MT 000017 · MA 000020). */
  gnreDetalhamento?: string;
  /** JSON [{codigo, valor}] dos campos extras GNRE da UF ({CHAVE}/{NUMERO} substituídos). */
  gnreCamposExtras?: string;
};

export type SimulacaoStResultado = {
  provedor: string;
  status: string;
  motivo: string | null;
  chave: string | null;
  notaId: string | null;
  csosn: string | null;
  cfop: string | null;
  mva: number | null;
  baseSt: number | null;
  valorSt: number | null;
  totalNota: number | null;
  guiaGnre: { uf: string; valor: number; status: string } | null;
};

const dig = (v: string) => (v ?? "").replace(/\D+/g, "");

export async function simularStInterestadual(params: SimulacaoStParams): Promise<{
  empresa: string;
  ambiente: string;
  resultados: SimulacaoStResultado[];
  log: string[];
}> {
  const log: string[] = [];
  const clienteCnpj = normalizeDocumento(params.clienteCnpj);
  const clienteIe = dig(params.clienteIe);
  const clienteUf = (params.clienteUf ?? "").toUpperCase();
  if (!params.empresa || !isValidCnpj(clienteCnpj) || !clienteIe || !clienteUf) {
    throw new Error("Obrigatórios: empresa, clienteCnpj, clienteIe e clienteUf (cliente REAL de outra UF, com IE ativa).");
  }
  const mva = Number(params.mva ?? 71.78);
  const aliqSt = Number(params.aliqSt ?? 18);
  const valor = Number(params.valor ?? 100);
  const NCM = dig(params.ncm ?? "87089990");
  const provedores = (params.provedores?.length ? params.provedores : ["SEFAZ", "ACBR"]).map((p) => p.toUpperCase());

  // ── Empresa + trava de ambiente ──
  const cnpjEmpresa = normalizeDocumento(params.empresa);
  const empresa = await prisma.empresa.findFirst({
    where: cnpjEmpresa.length === 14
      ? { cnpj: cnpjEmpresa }
      : params.empresa.length > 20
        ? { id: params.empresa }
        : { razaoSocial: { contains: params.empresa, mode: "insensitive" } }
  });
  if (!empresa) throw new Error(`Empresa não encontrada: ${params.empresa}`);
  const configFiscal = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: empresa.id } });
  const ambiente = configFiscal?.ambiente ?? "HOMOLOGACAO";
  if (ambiente !== "HOMOLOGACAO") {
    throw new Error(`ABORTADO: a empresa ${empresa.razaoSocial} está em ${ambiente}. A simulação só roda em HOMOLOGAÇÃO.`);
  }
  if (clienteUf === (empresa.enderecoUf ?? "").toUpperCase()) {
    throw new Error(`O cliente informado é da MESMA UF da empresa (${clienteUf}) — a simulação é de venda INTERESTADUAL.`);
  }
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id, ambiente } as TenantScope;
  log.push(`Empresa: ${empresa.razaoSocial} (${empresa.enderecoUf}) · ambiente ${ambiente}`);
  log.push(`Destino: ${clienteUf} · NCM ${NCM} · MVA ${mva}% · alíq. interna destino ${aliqSt}% · valor R$ ${valor.toFixed(2)}`);

  // ── 1. Produto ST de teste (idempotente) ──
  const sku = "TESTE-ST-8708";
  let produto = await prisma.produto.findFirst({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku } });
  if (!produto) {
    const categoria =
      (await prisma.produtoCategoria.findFirst({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId } })) ??
      (await prisma.produtoCategoria.create({ data: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: "TESTE ST", slug: "teste-st" } }));
    produto = await prisma.produto.create({
      data: {
        tenantId: scope.tenantId, empresaId: scope.empresaId, sku, categoriaId: categoria.id,
        nome: "TESTE ST - Parachoque dianteiro (simulação)", unidade: "UN",
        precoVenda: valor, ncm: NCM, origem: "0", ativo: true
      }
    });
    log.push(`Produto criado: ${sku}`);
  } else {
    log.push(`Produto já existia: ${sku}`);
  }
  await prisma.produtoFiscal.upsert({
    where: { produtoId: produto.id },
    update: { ncm: NCM, icmsSt: true, pisCofinsMonofasico: true },
    create: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: produto.id, ncm: NCM, icmsSt: true, pisCofinsMonofasico: true }
  });

  // ── 2. Regra tributária do protocolo (NCM + UF destino + MVA ORIGINAL) ──
  const nomeRegra = `TESTE-ST ${NCM} → ${clienteUf}`;
  const regraExistente = await prisma.regraTributaria.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeRegra }
  });
  const gnre = {
    gnreProduto: params.gnreProduto ?? null,
    gnreReceita: params.gnreReceita ?? null,
    gnreTipoDocOrigem: params.gnreTipoDocOrigem ?? null,
    gnreDetalhamento: params.gnreDetalhamento ?? null,
    gnreCamposExtras: params.gnreCamposExtras ?? null
  };
  if (regraExistente) {
    await prisma.regraTributaria.update({
      where: { id: regraExistente.id },
      data: { mva, aliquotaIcmsSt: aliqSt, ativo: true, ...gnre }
    });
    log.push(`Regra atualizada: ${nomeRegra}`);
  } else {
    await prisma.regraTributaria.create({
      data: {
        tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeRegra,
        tributo: "ICMS", operacao: "VENDA", ncm: NCM, ufDestino: clienteUf,
        mva, aliquotaIcmsSt: aliqSt, ativo: true, vigenciaInicio: new Date("2020-01-01"),
        ...gnre
      }
    });
    log.push(`Regra criada: ${nomeRegra}`);
  }

  // ── 2b. Cadastro REAL do cliente (idempotente por tenant+documento) com endereço padrão ──
  const endereco = {
    logradouro: params.logradouro ?? "Rua Teste",
    numero: params.numero ?? "100",
    bairro: params.bairro ?? "Centro",
    cep: dig(params.cep ?? "01310100"),
    cidade: params.cidade ?? "Sao Paulo",
    uf: clienteUf,
    codigoMunicipioIbge: dig(params.ibge ?? "3550308")
  };
  const cliente = await prisma.cliente.upsert({
    where: { tenantId_documento: { tenantId: scope.tenantId, documento: clienteCnpj } },
    update: {
      razaoSocial: params.clienteNome ?? "CLIENTE TESTE ST INTERESTADUAL",
      inscricaoEstadual: clienteIe,
      status: "ATIVO"
    },
    create: {
      tenantId: scope.tenantId, empresaId: scope.empresaId,
      razaoSocial: params.clienteNome ?? "CLIENTE TESTE ST INTERESTADUAL",
      documento: clienteCnpj, inscricaoEstadual: clienteIe, status: "ATIVO"
    }
  });
  const temEndereco = await prisma.clienteEndereco.findFirst({ where: { clienteId: cliente.id } });
  if (!temEndereco) {
    await prisma.clienteEndereco.create({
      data: {
        tenantId: scope.tenantId, empresaId: scope.empresaId, clienteId: cliente.id,
        apelido: "Principal", padrao: true, ...endereco
      }
    });
  }
  if (params.telefone) {
    const temContato = await prisma.clienteContato.findFirst({ where: { clienteId: cliente.id } });
    if (!temContato) {
      await prisma.clienteContato.create({
        data: {
          tenantId: scope.tenantId, empresaId: scope.empresaId, clienteId: cliente.id,
          nome: cliente.razaoSocial, telefone: dig(params.telefone), principal: true
        }
      });
    }
  }
  log.push(`Cliente cadastrado: ${cliente.razaoSocial} (${clienteCnpj}) · IE ${clienteIe} · ${endereco.cidade}/${endereco.uf}`);

  // ── 3. Emissão pelos provedores (alterna provedor global e restaura) ──
  const plataforma = await prisma.plataformaConfiguracao.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const provedorOriginal = plataforma.provedorFiscalAtivo;
  log.push(`Provedor global atual: ${provedorOriginal} (restaurado ao final)`);

  const resultados: SimulacaoStResultado[] = [];
  try {
    for (const provedor of provedores) {
      await prisma.plataformaConfiguracao.update({ where: { id: "default" }, data: { provedorFiscalAtivo: provedor } });
      try {
        const nota = await emitProductInvoiceAvulsa(scope, {
          modelo: "NFE",
          naturezaOperacao: "VENDA DE MERCADORIA",
          receiver: {
            nome: cliente.razaoSocial,
            documento: clienteCnpj,
            inscricaoEstadual: clienteIe,
            endereco
          },
          formaPagamento: "Dinheiro",
          itens: [{ produtoId: produto.id, quantidade: 1, precoUnitario: valor }],
          baixarEstoque: false
        });
        const notaDb = await prisma.notaFiscal.findUnique({
          where: { id: nota.id },
          include: {
            itens: { select: { csosn: true, cstIcms: true, cfop: true, percentualMva: true, baseIcmsSt: true, valorIcmsSt: true } },
            guiasRecolhimento: true
          }
        });
        const item = notaDb?.itens[0];
        const guia = notaDb?.guiasRecolhimento[0];
        resultados.push({
          provedor,
          status: nota.status,
          motivo: nota.motivo ?? null,
          chave: nota.chaveAcesso ?? null,
          notaId: nota.id,
          csosn: item?.csosn ?? item?.cstIcms ?? null,
          cfop: item?.cfop ?? null,
          mva: item?.percentualMva != null ? Number(item.percentualMva) : null,
          baseSt: item?.baseIcmsSt != null ? Number(item.baseIcmsSt) : null,
          valorSt: item?.valorIcmsSt != null ? Number(item.valorIcmsSt) : null,
          totalNota: notaDb ? Number(notaDb.total) : null,
          guiaGnre: guia ? { uf: guia.ufFavorecida, valor: Number(guia.valor), status: guia.status } : null
        });
      } catch (e) {
        resultados.push({
          provedor, status: "ERRO", motivo: e instanceof Error ? e.message : String(e),
          chave: null, notaId: null, csosn: null, cfop: null, mva: null, baseSt: null, valorSt: null, totalNota: null, guiaGnre: null
        });
      }
    }
  } finally {
    await prisma.plataformaConfiguracao.update({ where: { id: "default" }, data: { provedorFiscalAtivo: provedorOriginal } });
    log.push(`Provedor global restaurado para ${provedorOriginal}.`);
  }

  return { empresa: empresa.razaoSocial, ambiente, resultados, log };
}
