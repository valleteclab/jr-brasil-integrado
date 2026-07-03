import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import type { TipoNegocio } from "@/lib/auth/modules";
import { listContasComCobranca } from "@/domains/finance/application/boleto-use-cases";

export type PdvProduto = { id: string; sku: string; nome: string; descricao: string | null; descricaoComercial: string | null; gtin: string | null; codigoOriginal: string | null; codigoFabricante: string | null; preco: number; precoPrazo: number; precoMinimo: number; disponivel: number; unidade: string };
export type PdvServico = { id: string; nome: string; preco: number; codigoServicoLc116: string | null; codigoNbs: string | null };
export type PdvCliente = { id: string; label: string; documento: string | null };
export type PdvContaRecebedora = { id: string; nome: string; chavePix: string | null; tipoChavePix: string | null };
export type PdvMaquinaCartao = { id: string; nome: string; adquirente: string | null };

export type PdvData = {
  tipoNegocio: TipoNegocio;
  /** Defaults fiscais de serviço da empresa (para a NFS-e dos serviços do PDV). */
  lc116Padrao: string | null;
  nbsPadrao: string | null;
  /** Regra da empresa: permite vender produtos sem saldo (não bloqueia ao adicionar). */
  permiteVendaSemEstoque: boolean;
  /** Empresa permite fechar a venda só com RECIBO (sem NF-e/NFC-e). Mostra opção "Recibo" no PDV. */
  permiteVendaNaoFiscal: boolean;
  /** % de desconto que o vendedor pode aplicar sem senha de admin. */
  descontoSemAutorizacaoPct: number;
  /** Módulo Expedição habilitado para o tenant (mostra a opção de recibo de retirada). */
  expedicaoHabilitada: boolean;
  clientes: PdvCliente[];
  produtos: PdvProduto[];
  servicos: PdvServico[];
  vendedores: Array<{ id: string; nome: string }>;
  /** Vendedor do usuário logado (pré-selecionado no PDV). Criado on-the-fly se faltar. */
  vendedorLogadoId: string | null;
  /** Contas recebedoras (PIX/transferência) e maquininhas (cartão) para detalhar o recebimento. */
  contas: PdvContaRecebedora[];
  maquinas: PdvMaquinaCartao[];
  /** Formas de pagamento cadastradas (ativas) — o que aparece no PDV. */
  formas: Array<{ id: string; nome: string; tipo: string }>;
  /** Contas com cobrança de boleto ativa (escolha do banco na venda em boleto). */
  contasCobranca: Array<{ id: string; nome: string }>;
};

/**
 * Dados para o PDV full screen: clientes, produtos vendáveis (com saldo) e serviços (catálogo
 * de itens tipo SERVICO). O `tipoNegocio` controla quais seções aparecem no PDV.
 */
export async function getPdvData(): Promise<PdvData> {
  const scope = await getDevelopmentTenantScope();
  const base = scopedByTenantCompany(scope);

  const [empresa, tenant, config, clientes, itens, vendedores, contas, maquinas, formas] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { tipoNegocio: true, permiteVendaSemEstoque: true, permiteVendaNaoFiscal: true, descontoSemAutorizacaoPct: true } }),
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { expedicaoHabilitada: true } }),
    prisma.configuracaoFiscal.findUnique({
      where: { empresaId: scope.empresaId },
      select: { codigoServicoLc116Padrao: true, codigoNbsPadrao: true }
    }),
    prisma.cliente.findMany({
      where: { ...base, status: "ATIVO" },
      select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
      orderBy: { razaoSocial: "asc" }
    }),
    prisma.produto.findMany({
      where: { ...base, ativo: true },
      select: {
        id: true,
        sku: true,
        nome: true,
        descricao: true,
        descricaoComercial: true,
        gtin: true,
        codigoOriginal: true,
        codigoFabricante: true,
        tipo: true,
        precoVenda: true,
        precoVendaPrazo: true,
        precoMinimo: true,
        unidade: true,
        saldosEstoque: { select: { quantidade: true, reservado: true } }
      },
      orderBy: { nome: "asc" }
    }),
    prisma.vendedor.findMany({
      where: { ...base, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" }
    }),
    prisma.contaBancaria.findMany({
      where: { ...base, ativo: true },
      select: { id: true, nome: true, chavePix: true, tipoChavePix: true },
      orderBy: { nome: "asc" }
    }),
    prisma.maquinaCartao.findMany({
      where: { ...base, ativo: true },
      select: { id: true, nome: true, adquirente: true },
      orderBy: { nome: "asc" }
    }),
    prisma.formaPagamento.findMany({
      where: { ...base, ativo: true },
      select: { id: true, nome: true, tipo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    })
  ]);

  const produtos: PdvProduto[] = [];
  const servicos: PdvServico[] = [];
  for (const p of itens) {
    if (p.tipo === "SERVICO") {
      servicos.push({
        id: p.id,
        nome: p.nome,
        preco: Number(p.precoVenda),
        codigoServicoLc116: config?.codigoServicoLc116Padrao || null,
        codigoNbs: config?.codigoNbsPadrao || null
      });
    } else {
      const disponivel = p.saldosEstoque.reduce(
        (sum, s) => sum + Math.max(Number(s.quantidade) - Number(s.reservado), 0),
        0
      );
      produtos.push({ id: p.id, sku: p.sku, nome: p.nome, descricao: p.descricao, descricaoComercial: p.descricaoComercial, gtin: p.gtin, codigoOriginal: p.codigoOriginal, codigoFabricante: p.codigoFabricante, preco: Number(p.precoVenda), precoPrazo: Number(p.precoVendaPrazo), precoMinimo: Number(p.precoMinimo), disponivel, unidade: p.unidade });
    }
  }

  // Vendedor = usuário logado: match por nome. Cria se não existir, pra cair pré-selecionado.
  const sessao = await getSession();
  const nomeLogado = sessao?.nome?.trim() ?? null;
  let vendedorLogadoId: string | null = null;
  if (nomeLogado) {
    const existente = vendedores.find((v) => v.nome.trim().toLowerCase() === nomeLogado.toLowerCase());
    if (existente) {
      vendedorLogadoId = existente.id;
    } else {
      const criado = await prisma.vendedor.create({
        data: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeLogado, email: sessao?.email ?? null, ativo: true }
      });
      vendedorLogadoId = criado.id;
      vendedores.push({ id: criado.id, nome: criado.nome });
      vendedores.sort((a, b) => a.nome.localeCompare(b.nome));
    }
  }

  return {
    tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
    lc116Padrao: config?.codigoServicoLc116Padrao || null,
    nbsPadrao: config?.codigoNbsPadrao || null,
    permiteVendaSemEstoque: Boolean(empresa?.permiteVendaSemEstoque),
    permiteVendaNaoFiscal: Boolean(empresa?.permiteVendaNaoFiscal),
    descontoSemAutorizacaoPct: Number(empresa?.descontoSemAutorizacaoPct ?? 0),
    expedicaoHabilitada: Boolean(tenant?.expedicaoHabilitada),
    clientes: clientes.map((c) => ({
      id: c.id,
      label: c.nomeFantasia ? `${c.nomeFantasia} (${c.razaoSocial})` : c.razaoSocial,
      documento: c.documento
    })),
    produtos,
    servicos,
    vendedores,
    vendedorLogadoId,
    contas,
    maquinas,
    formas,
    contasCobranca: await listContasComCobranca(scope)
  };
}
