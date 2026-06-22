import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";
import { getSession } from "@/lib/auth/session";
import type { StatusPedido, ModeloFiscal, FinalidadeNfe, StatusNotaFiscal } from "@prisma/client";

const MODELO_NOTA_LABEL: Record<ModeloFiscal, string> = { NFE: "NF-e", NFCE: "NFC-e", NFSE: "NFS-e" };
const FINALIDADE_NOTA_LABEL: Record<FinalidadeNfe, string> = {
  NORMAL: "Normal", COMPLEMENTAR: "Complementar", AJUSTE: "Ajuste", DEVOLUCAO: "Devolução"
};
const STATUS_NOTA_LABEL: Record<StatusNotaFiscal, { label: string; tone: SaleSummary["statusTone"] }> = {
  RASCUNHO: { label: "Rascunho", tone: "mute" },
  PROCESSANDO: { label: "Processando", tone: "warn" },
  AUTORIZADA: { label: "Autorizada", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "danger" },
  REJEITADA: { label: "Rejeitada", tone: "danger" },
  DENEGADA: { label: "Denegada", tone: "danger" },
  ERRO: { label: "Erro", tone: "danger" }
};

export type SaleSummary = {
  id: string;
  numero: string;
  clienteNome: string;
  canal: string;
  status: StatusPedido;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "violet" | "mute";
  total: string;
  totalNumber: number;
  itensCount: number;
  criadoEm: string;
  confirmadoEm: string | null;
  faturadoEm: string | null;
  canceladoEm: string | null;
  canConfirm: boolean;
  canInvoice: boolean;
  canCancel: boolean;
  temNotaAutorizada: boolean;
  /** NF-e/NFC-e de venda autorizada (para atalho de PDF/XML direto na lista). */
  notaFiscalId: string | null;
  notaCanDownload: boolean;
  /** Pedido ainda pode ser editado (estoque/itens). Clique na linha → /editar quando true. */
  editavel: boolean;
};

export type SaleDetail = SaleSummary & {
  clienteId: string;
  clienteDocumento: string | null;
  depositoId: string | null;
  canal: string;
  subtotal: number;
  desconto: number;
  frete: number;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  observacoes: string | null;
  /** Pedido faturado com nota autorizada — pode receber devolução de itens. */
  canReturn: boolean;
  itens: Array<{
    id: string;
    produtoId: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    /** Quantidade já devolvida (NF-e de devolução autorizada/processando). */
    devolvido: number;
    precoUnitario: number;
    custoUnitario: number;
    desconto: number;
    total: number;
  }>;
  notas: Array<{
    id: string;
    numero: string | null;
    modelo: string;
    modeloLabel: string;
    finalidade: string;
    finalidadeLabel: string | null;
    status: string;
    statusLabel: string;
    statusTone: SaleSummary["statusTone"];
    total: number;
    emitidaEm: string | null;
    chaveAcesso: string;
    // Mesmas ações da tela de Notas Emitidas, disponíveis direto na venda.
    canDownload: boolean;
    canClone: boolean;
    canDevolver: boolean;
    canCorrect: boolean;
    canCancel: boolean;
  }>;
};

export type SaleFormData = {
  clientes: Array<{ id: string; label: string; documento: string | null }>;
  produtos: Array<{ id: string; sku: string; nome: string; descricao: string | null; descricaoComercial: string | null; gtin: string | null; codigoOriginal: string | null; codigoFabricante: string | null; preco: number; disponivel: number; unidade: string }>;
  vendedores: Array<{ id: string; nome: string }>;
  formas: Array<{ id: string; nome: string; tipo: string }>;
  /** Vendedor vinculado ao usuário logado (pelo nome). Criado on-the-fly se não existia. */
  vendedorLogadoId: string | null;
  /** Nome do usuário logado — mostrado na UI ("Vendedor: …"). */
  vendedorLogadoNome: string | null;
  /** Empresa permite finalizar a venda direto no atendimento (sem caixa). Padrão false. */
  permiteVendaDiretaBalcao: boolean;
  /** Empresa aceita vender produto sem saldo (estoque negativo). Padrão false. */
  permiteVendaSemEstoque: boolean;
  /** Empresa permite fechar a venda só com RECIBO (sem NF-e/NFC-e). Padrão false. */
  permiteVendaNaoFiscal: boolean;
  /** % de desconto que o vendedor pode aplicar sem senha de admin (0 = sempre exige). */
  descontoSemAutorizacaoPct: number;
};

function statusLabel(status: StatusPedido): string {
  const map: Record<StatusPedido, string> = {
    RASCUNHO: "Rascunho",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    AGUARDANDO_NOTA: "Aguardando nota",
    SEPARACAO: "Em separação",
    ENVIADO: "Faturado/Enviado",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado"
  };
  return map[status] ?? status;
}

function statusTone(status: StatusPedido): SaleSummary["statusTone"] {
  const map: Record<StatusPedido, SaleSummary["statusTone"]> = {
    RASCUNHO: "mute",
    AGUARDANDO_PAGAMENTO: "warn",
    AGUARDANDO_NOTA: "info",
    SEPARACAO: "violet",
    ENVIADO: "success",
    ENTREGUE: "success",
    CANCELADO: "danger"
  };
  return map[status] ?? "mute";
}

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("pt-BR");
}

export async function listSales(): Promise<SaleSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar vendas.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const pedidos = await prisma.pedidoVenda.findMany({
      // Isola por ambiente: vendas de homologação não aparecem quando a empresa está em produção.
      where: scopedByTenantCompanyAmbiente(scope),
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: { select: { id: true } },
        notasFiscais: {
          where: { status: "AUTORIZADA" },
          select: { id: true, finalidade: true, providerRef: true }
        }
      },
      orderBy: { criadoEm: "desc" }
    });

    return pedidos.map((p) => {
      const temNota = p.notasFiscais.length > 0;
      // Nota de VENDA (finalidade Normal) para o atalho de impressão; ignora devoluções.
      const notaVenda = p.notasFiscais.find((n) => n.finalidade === "NORMAL") ?? null;
      return {
        id: p.id,
        numero: p.numero,
        clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : "Consumidor não identificado",
        canal: p.canal,
        status: p.status,
        statusLabel: statusLabel(p.status),
        statusTone: statusTone(p.status),
        total: formatBrl(Number(p.total)),
        totalNumber: Number(p.total),
        itensCount: p.itens.length,
        criadoEm: formatDate(p.criadoEm) ?? "",
        confirmadoEm: formatDate(p.confirmadoEm),
        faturadoEm: formatDate(p.faturadoEm),
        canceladoEm: formatDate(p.canceladoEm),
        canConfirm: p.status === "RASCUNHO", // AGUARDANDO_PAGAMENTO (pre-venda) e recebido no CAIXA, nao confirmado aqui
        canInvoice: p.status === "AGUARDANDO_NOTA",
        canCancel: p.status !== "CANCELADO" && !temNota,
        temNotaAutorizada: temNota,
        notaFiscalId: notaVenda?.id ?? null,
        notaCanDownload: Boolean(notaVenda?.providerRef),
        // Edição reaproveita a regra de "ainda não saiu da casa": sem NF e em status mutável.
        editavel: !temNota && ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO"].includes(p.status)
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar vendas: ${message}`);
  }
}

export async function getSaleDetail(id: string): Promise<SaleDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const p = await prisma.pedidoVenda.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
        itens: {
          include: {
            produto: { select: { nome: true, sku: true } }
          }
        },
        notasFiscais: {
          select: {
            id: true,
            numero: true,
            modelo: true,
            finalidade: true,
            status: true,
            total: true,
            emitidaEm: true,
            chaveAcesso: true,
            providerRef: true,
            itens: { select: { produtoId: true, quantidade: true } }
          }
        }
      }
    });

    if (!p) return null;

    const temNota = p.notasFiscais.some((n) => n.status === "AUTORIZADA");
    const temNotaVendaComChave = p.notasFiscais.some(
      (n) => n.finalidade === "NORMAL" && n.status === "AUTORIZADA" && Boolean(n.chaveAcesso)
    );
    // NF-e de venda (Normal) autorizada — usada no atalho de impressão da lista/detalhe.
    const notaVendaPrincipal = p.notasFiscais.find((n) => n.finalidade === "NORMAL" && n.status === "AUTORIZADA") ?? null;

    // Quantidades já devolvidas por produto (devoluções autorizadas ou em processamento).
    const devolvidoPorProduto = new Map<string, number>();
    for (const nota of p.notasFiscais) {
      if (nota.finalidade !== "DEVOLUCAO") continue;
      if (nota.status !== "AUTORIZADA" && nota.status !== "PROCESSANDO") continue;
      for (const item of nota.itens) {
        if (!item.produtoId) continue;
        devolvidoPorProduto.set(item.produtoId, (devolvidoPorProduto.get(item.produtoId) ?? 0) + Number(item.quantidade));
      }
    }

    return {
      id: p.id,
      numero: p.numero,
      clienteId: p.clienteId ?? "",
      clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : "Consumidor não identificado",
      clienteDocumento: p.cliente?.documento ?? "",
      status: p.status,
      statusLabel: statusLabel(p.status),
      statusTone: statusTone(p.status),
      total: formatBrl(Number(p.total)),
      totalNumber: Number(p.total),
      subtotal: Number(p.subtotal),
      desconto: Number(p.desconto),
      frete: Number(p.frete),
      canal: p.canal,
      depositoId: p.depositoId,
      condicaoPagamento: p.condicaoPagamento,
      formaPagamento: p.formaPagamento,
      observacoes: p.observacoes,
      itensCount: p.itens.length,
      criadoEm: formatDate(p.criadoEm) ?? "",
      confirmadoEm: formatDate(p.confirmadoEm),
      faturadoEm: formatDate(p.faturadoEm),
      canceladoEm: formatDate(p.canceladoEm),
      canConfirm: p.status === "RASCUNHO", // AGUARDANDO_PAGAMENTO (pre-venda) e recebido no CAIXA, nao confirmado aqui
      canInvoice: p.status === "AGUARDANDO_NOTA",
      canCancel: p.status !== "CANCELADO" && !temNota,
      temNotaAutorizada: temNota,
      notaFiscalId: notaVendaPrincipal?.id ?? null,
      notaCanDownload: Boolean(notaVendaPrincipal?.providerRef),
      editavel: !temNota && ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO"].includes(p.status),
      canReturn: temNotaVendaComChave && (p.status === "ENVIADO" || p.status === "ENTREGUE"),
      itens: p.itens.map((item) => {
        // Distribui o devolvido do produto pelas linhas, na ordem (cobre produto repetido).
        const restanteDevolvido = devolvidoPorProduto.get(item.produtoId) ?? 0;
        const qtd = Number(item.quantidade);
        const devolvido = Math.min(restanteDevolvido, qtd);
        devolvidoPorProduto.set(item.produtoId, restanteDevolvido - devolvido);
        return {
          id: item.id,
          produtoId: item.produtoId,
          produtoNome: item.produto.nome,
          produtoSku: item.produto.sku,
          quantidade: qtd,
          devolvido,
          precoUnitario: Number(item.precoUnitario),
          custoUnitario: Number(item.custoUnitario),
          desconto: Number(item.desconto),
          total: Number(item.total)
        };
      }),
      notas: p.notasFiscais.map((n) => {
        const st = STATUS_NOTA_LABEL[n.status];
        const podeBaixar = Boolean(n.providerRef) && (n.status === "AUTORIZADA" || n.status === "CANCELADA");
        return {
          id: n.id,
          numero: n.numero,
          modelo: n.modelo,
          modeloLabel: MODELO_NOTA_LABEL[n.modelo],
          finalidade: n.finalidade,
          finalidadeLabel: n.finalidade === "NORMAL" ? null : FINALIDADE_NOTA_LABEL[n.finalidade],
          status: n.status,
          statusLabel: st.label,
          statusTone: st.tone,
          total: Number(n.total),
          emitidaEm: formatDate(n.emitidaEm),
          chaveAcesso: n.chaveAcesso ?? "",
          canDownload: podeBaixar,
          canClone: true,
          canDevolver:
            (n.modelo === "NFE" || n.modelo === "NFCE") &&
            n.status === "AUTORIZADA" &&
            Boolean(n.chaveAcesso) &&
            n.finalidade === "NORMAL",
          canCorrect: n.status === "AUTORIZADA" && n.modelo === "NFE",
          canCancel: n.status === "AUTORIZADA"
        };
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar detalhe da venda: ${message}`);
  }
}

export async function listSaleFormData(): Promise<SaleFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const [empresa, clientes, produtos, vendedores, formas] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { permiteVendaDiretaBalcao: true, permiteVendaSemEstoque: true, permiteVendaNaoFiscal: true, descontoSemAutorizacaoPct: true } }),
      prisma.cliente.findMany({
        where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
        select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
        orderBy: { razaoSocial: "asc" }
      }),
      prisma.produto.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: {
          id: true,
          sku: true,
          nome: true,
          descricao: true,
          descricaoComercial: true,
          gtin: true,
          codigoOriginal: true,
          codigoFabricante: true,
          precoVenda: true,
          unidade: true,
          saldosEstoque: {
            select: { quantidade: true, reservado: true }
          }
        },
        orderBy: { nome: "asc" }
      }),
      prisma.vendedor.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" }
      }),
      prisma.formaPagamento.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: { id: true, nome: true, tipo: true },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }]
      })
    ]);

    // Vendedor = usuário logado. Match por nome (Vendedor.nome == sessão.nome). Se não houver,
    // cria um vendedor com esse nome (ativo, comissão 0) — pra próxima venda já estar no select.
    const sessao = await getSession();
    const nomeLogado = sessao?.nome?.trim() ?? null;
    let vendedorLogadoId: string | null = null;
    let vendedorLogadoNome: string | null = nomeLogado;
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
      clientes: clientes.map((c) => ({
        id: c.id,
        label: c.nomeFantasia ? `${c.nomeFantasia} (${c.razaoSocial})` : c.razaoSocial,
        documento: c.documento
      })),
      produtos: produtos.map((p) => {
        const disponivel = p.saldosEstoque.reduce(
          (sum, s) => sum + Math.max(Number(s.quantidade) - Number(s.reservado), 0),
          0
        );
        return {
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          descricao: p.descricao,
          descricaoComercial: p.descricaoComercial,
          gtin: p.gtin,
          codigoOriginal: p.codigoOriginal,
          codigoFabricante: p.codigoFabricante,
          preco: Number(p.precoVenda),
          disponivel,
          unidade: p.unidade
        };
      }),
      vendedores,
      formas,
      vendedorLogadoId,
      vendedorLogadoNome,
      permiteVendaDiretaBalcao: Boolean(empresa?.permiteVendaDiretaBalcao),
      permiteVendaSemEstoque: Boolean(empresa?.permiteVendaSemEstoque),
      permiteVendaNaoFiscal: Boolean(empresa?.permiteVendaNaoFiscal),
      descontoSemAutorizacaoPct: Number(empresa?.descontoSemAutorizacaoPct ?? 0)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar dados do formulário de venda: ${message}`);
  }
}
