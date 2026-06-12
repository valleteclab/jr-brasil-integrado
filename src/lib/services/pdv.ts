import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import type { TipoNegocio } from "@/lib/auth/modules";

export type PdvProduto = { id: string; sku: string; nome: string; descricao: string | null; descricaoComercial: string | null; gtin: string | null; codigoOriginal: string | null; codigoFabricante: string | null; preco: number; disponivel: number };
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
  /** Módulo Expedição habilitado para o tenant (mostra a opção de recibo de retirada). */
  expedicaoHabilitada: boolean;
  clientes: PdvCliente[];
  produtos: PdvProduto[];
  servicos: PdvServico[];
  vendedores: Array<{ id: string; nome: string }>;
  /** Contas recebedoras (PIX/transferência) e maquininhas (cartão) para detalhar o recebimento. */
  contas: PdvContaRecebedora[];
  maquinas: PdvMaquinaCartao[];
};

/**
 * Dados para o PDV full screen: clientes, produtos vendáveis (com saldo) e serviços (catálogo
 * de itens tipo SERVICO). O `tipoNegocio` controla quais seções aparecem no PDV.
 */
export async function getPdvData(): Promise<PdvData> {
  const scope = await getDevelopmentTenantScope();
  const base = scopedByTenantCompany(scope);

  const [empresa, tenant, config, clientes, itens, vendedores, contas, maquinas] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { tipoNegocio: true, permiteVendaSemEstoque: true } }),
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
      produtos.push({ id: p.id, sku: p.sku, nome: p.nome, descricao: p.descricao, descricaoComercial: p.descricaoComercial, gtin: p.gtin, codigoOriginal: p.codigoOriginal, codigoFabricante: p.codigoFabricante, preco: Number(p.precoVenda), disponivel });
    }
  }

  return {
    tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
    lc116Padrao: config?.codigoServicoLc116Padrao || null,
    nbsPadrao: config?.codigoNbsPadrao || null,
    permiteVendaSemEstoque: Boolean(empresa?.permiteVendaSemEstoque),
    expedicaoHabilitada: Boolean(tenant?.expedicaoHabilitada),
    clientes: clientes.map((c) => ({
      id: c.id,
      label: c.nomeFantasia ? `${c.nomeFantasia} (${c.razaoSocial})` : c.razaoSocial,
      documento: c.documento
    })),
    produtos,
    servicos,
    vendedores,
    contas,
    maquinas
  };
}
