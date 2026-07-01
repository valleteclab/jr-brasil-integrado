import type { Prisma, TipoClassificacaoFinanceira, FinalidadeEntrada } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * CLASSIFICAÇÃO FINANCEIRA gerencial (plano de contas do financeiro).
 *
 * Categoriza ContaPagar/ContaReceber em dois níveis (grupo → classificação) para os relatórios
 * "pagamentos por classificação" e "fechamento mensal" (orçado IDEAL × realizado). O plano é
 * cadastrável por empresa (multi-tenant); o seed abaixo é só um ponto de partida, moldado no
 * plano real de uma autopeças (grupos do fechamento em Excel do cliente piloto).
 */

export class ClassificacaoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassificacaoValidationError";
  }
}

export type ClassificacaoResumo = {
  id: string;
  codigo: string | null;
  nome: string;
  grupo: string;
  tipo: TipoClassificacaoFinanceira;
  orcamentoMensal: number;
  ativo: boolean;
  contasVinculadas: number;
};

export type ClassificacaoInput = {
  codigo?: string | null;
  nome: string;
  grupo: string;
  tipo?: TipoClassificacaoFinanceira;
  orcamentoMensal?: number;
  ativo?: boolean;
};

/** Ordem canônica dos grupos no fechamento (grupos fora da lista vão ao final, em ordem alfabética). */
export const GRUPOS_ORDEM = [
  "Custos operacionais",
  "Custos com pessoal",
  "Pró-labore",
  "Administrativo",
  "Custos financeiros",
  "Investimentos / patrimônio",
  "Receitas"
];

export function ordenarGrupos(grupos: string[]): string[] {
  return [...grupos].sort((a, b) => {
    const ia = GRUPOS_ORDEM.indexOf(a);
    const ib = GRUPOS_ORDEM.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, "pt-BR");
  });
}

export async function listClassificacoes(scope: TenantScope, opts?: { incluirInativas?: boolean }): Promise<ClassificacaoResumo[]> {
  const rows = await prisma.classificacaoFinanceira.findMany({
    where: { ...scopedByTenantCompany(scope), ...(opts?.incluirInativas ? {} : { ativo: true }) },
    orderBy: [{ grupo: "asc" }, { nome: "asc" }],
    include: { _count: { select: { contasPagar: true, contasReceber: true } } }
  });
  return rows.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    grupo: c.grupo,
    tipo: c.tipo,
    orcamentoMensal: Number(c.orcamentoMensal),
    ativo: c.ativo,
    contasVinculadas: c._count.contasPagar + c._count.contasReceber
  }));
}

export async function createClassificacao(scope: TenantScope, input: ClassificacaoInput) {
  const nome = input.nome?.trim();
  const grupo = input.grupo?.trim();
  if (!nome) throw new ClassificacaoValidationError("Informe o nome da classificação.");
  if (!grupo) throw new ClassificacaoValidationError("Informe o grupo da classificação.");
  const existente = await prisma.classificacaoFinanceira.findFirst({
    where: { ...scopedByTenantCompany(scope), nome: { equals: nome, mode: "insensitive" } },
    select: { id: true }
  });
  if (existente) throw new ClassificacaoValidationError(`Já existe uma classificação chamada "${nome}".`);
  return prisma.classificacaoFinanceira.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      codigo: input.codigo?.trim() || null,
      nome,
      grupo,
      tipo: input.tipo ?? "DESPESA",
      orcamentoMensal: input.orcamentoMensal ?? 0,
      ativo: input.ativo ?? true
    }
  });
}

export async function updateClassificacao(scope: TenantScope, id: string, input: Partial<ClassificacaoInput>) {
  const atual = await prisma.classificacaoFinanceira.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!atual) throw new ClassificacaoValidationError("Classificação não encontrada.");
  const data: Prisma.ClassificacaoFinanceiraUpdateInput = {};
  if (input.nome !== undefined) {
    const nome = input.nome.trim();
    if (!nome) throw new ClassificacaoValidationError("Informe o nome da classificação.");
    data.nome = nome;
  }
  if (input.grupo !== undefined) {
    const grupo = input.grupo.trim();
    if (!grupo) throw new ClassificacaoValidationError("Informe o grupo da classificação.");
    data.grupo = grupo;
  }
  if (input.codigo !== undefined) data.codigo = input.codigo?.trim() || null;
  if (input.tipo !== undefined) data.tipo = input.tipo;
  if (input.orcamentoMensal !== undefined) data.orcamentoMensal = input.orcamentoMensal;
  if (input.ativo !== undefined) data.ativo = input.ativo;
  return prisma.classificacaoFinanceira.update({ where: { id }, data });
}

/** Exclui quando não há contas vinculadas; senão apenas desativa (preserva o histórico dos relatórios). */
export async function deleteClassificacao(scope: TenantScope, id: string): Promise<{ excluida: boolean }> {
  const atual = await prisma.classificacaoFinanceira.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: { _count: { select: { contasPagar: true, contasReceber: true } } }
  });
  if (!atual) throw new ClassificacaoValidationError("Classificação não encontrada.");
  if (atual._count.contasPagar + atual._count.contasReceber > 0) {
    await prisma.classificacaoFinanceira.update({ where: { id }, data: { ativo: false } });
    return { excluida: false };
  }
  await prisma.classificacaoFinanceira.delete({ where: { id } });
  return { excluida: true };
}

/** Define/remove a classificação de uma conta a pagar ou a receber. */
export async function setClassificacaoConta(
  scope: TenantScope,
  tipo: "pagar" | "receber",
  contaId: string,
  classificacaoId: string | null
) {
  if (classificacaoId) {
    const c = await prisma.classificacaoFinanceira.findFirst({
      where: { id: classificacaoId, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    if (!c) throw new ClassificacaoValidationError("Classificação não encontrada.");
  }
  if (tipo === "pagar") {
    const conta = await prisma.contaPagar.findFirst({ where: { id: contaId, ...scopedByTenantCompany(scope) }, select: { id: true } });
    if (!conta) throw new ClassificacaoValidationError("Conta a pagar não encontrada.");
    return prisma.contaPagar.update({ where: { id: contaId }, data: { classificacaoId } });
  }
  const conta = await prisma.contaReceber.findFirst({ where: { id: contaId, ...scopedByTenantCompany(scope) }, select: { id: true } });
  if (!conta) throw new ClassificacaoValidationError("Conta a receber não encontrada.");
  return prisma.contaReceber.update({ where: { id: contaId }, data: { classificacaoId } });
}

// ─── Plano padrão (seed) ─────────────────────────────────────────────────────

/**
 * Plano inicial sugerido (o usuário edita/estende livremente). Estruturado a partir do fechamento
 * mensal real do cliente piloto (autopeças): grupos do Excel + classificações analíticas do
 * relatório do sistema anterior. `receita: true` marca classificações de ContaReceber.
 */
const PLANO_PADRAO: Array<{ grupo: string; nomes: string[]; receita?: boolean }> = [
  {
    grupo: "Custos operacionais",
    nomes: [
      "Mercadoria para revenda",
      "Frete de mercadoria",
      "Transporte de peças",
      "Impostos sobre vendas (DAS/Simples)",
      "DAE sobre compra (ICMS)",
      "Serviços de terceiros",
      "Uso loja",
      "Uso oficina",
      "Garantia ao cliente",
      "Marketing e publicidade",
      "Patrocínios e brindes",
      "Combustível",
      "Software",
      "Energia",
      "Internet",
      "Telefone",
      "Água",
      "Manutenção predial",
      "Manutenção de veículos",
      "IPVA / multas",
      "Rastreamento de veículos",
      "Aluguel"
    ]
  },
  {
    grupo: "Custos com pessoal",
    nomes: [
      "Salários",
      "Adiantamento salarial",
      "13º salário",
      "Férias",
      "Vale / benefícios",
      "Hora extra",
      "Rescisão",
      "Comissões",
      "Exames (admissional/demissional)",
      "Encargos (FGTS/INSS)"
    ]
  },
  { grupo: "Pró-labore", nomes: ["Pró-labore"] },
  {
    grupo: "Administrativo",
    nomes: [
      "Honorários contábeis",
      "Assessoria jurídica",
      "Segurança do trabalho",
      "Consultoria",
      "Cursos e treinamentos",
      "Material de escritório",
      "Material copa",
      "Segurança / vigilância",
      "Seguros",
      "Fatura de cartão de crédito"
    ]
  },
  {
    grupo: "Custos financeiros",
    nomes: [
      "Empréstimos",
      "Financiamentos",
      "Juros de antecipação",
      "Juros de cheque especial",
      "Juros por atraso",
      "Tarifas bancárias"
    ]
  },
  {
    grupo: "Investimentos / patrimônio",
    nomes: ["Máquinas e equipamentos", "Consórcios", "Obras e imóveis"]
  },
  {
    grupo: "Receitas",
    receita: true,
    nomes: ["Receita de vendas", "Receita de serviços", "Outras receitas"]
  }
];

/** Cria o plano padrão (só as classificações que ainda não existem). Retorna quantas foram criadas. */
export async function seedPlanoPadrao(scope: TenantScope): Promise<{ criadas: number }> {
  const existentes = await prisma.classificacaoFinanceira.findMany({
    where: scopedByTenantCompany(scope),
    select: { nome: true }
  });
  const nomes = new Set(existentes.map((c) => c.nome.trim().toLowerCase()));
  let criadas = 0;
  for (const bloco of PLANO_PADRAO) {
    for (const nome of bloco.nomes) {
      if (nomes.has(nome.toLowerCase())) continue;
      await prisma.classificacaoFinanceira.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          nome,
          grupo: bloco.grupo,
          tipo: bloco.receita ? "RECEITA" : "DESPESA"
        }
      });
      criadas++;
    }
  }
  return { criadas };
}

// ─── Auto-classificação ──────────────────────────────────────────────────────

/**
 * Id da classificação de RECEITA padrão para recebíveis automáticos (vendas/PDV/adquirente → "Receita
 * de vendas"; ordem de serviço → "Receita de serviços"). Lookup por nome no plano da empresa (o seed
 * cria ambas); null quando o plano não existe — a conta fica sem classificação, sem erro.
 */
export async function classificacaoReceitaPadraoId(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  tipo: "vendas" | "servicos"
): Promise<string | null> {
  const nome = tipo === "servicos" ? "Receita de serviços" : "Receita de vendas";
  const c = await tx.classificacaoFinanceira.findFirst({
    where: { ...scopedByTenantCompany(scope), ativo: true, tipo: "RECEITA", nome: { equals: nome, mode: "insensitive" } },
    select: { id: true }
  });
  return c?.id ?? null;
}

/** Nome da classificação-alvo por finalidade de entrada (batido com o PLANO_PADRAO acima). */
const CLASSIFICACAO_POR_FINALIDADE: Partial<Record<FinalidadeEntrada, string>> = {
  REVENDA: "Mercadoria para revenda",
  INDUSTRIALIZACAO: "Mercadoria para revenda",
  DEVOLUCAO_VENDA: "Mercadoria para revenda",
  TRANSFERENCIA: "Mercadoria para revenda",
  RETORNO_INDUSTRIALIZACAO: "Mercadoria para revenda",
  BONIFICACAO: "Mercadoria para revenda",
  USO_CONSUMO: "Uso loja",
  MATERIAL_SERVICO_ICMS: "Uso oficina",
  MATERIAL_SERVICO_ISS: "Uso oficina",
  COMBUSTIVEL_LUBRIFICANTE: "Combustível",
  IMOBILIZADO: "Máquinas e equipamentos"
};

/**
 * Sugere a classificação para a ContaPagar gerada por uma ENTRADA FISCAL, em duas tentativas:
 * 1) pela finalidade predominante (maior soma de valor entre os itens) → nome canônico do plano;
 * 2) memória do fornecedor: a classificação da conta mais recente já classificada dele.
 * Retorna null quando nada casa (o usuário classifica na tela do financeiro).
 * Roda dentro da transação do processamento (tx).
 */
export async function sugerirClassificacaoEntrada(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  entrada: {
    fornecedorId: string | null;
    itens: Array<{ finalidade: FinalidadeEntrada | null; valorTotal: Prisma.Decimal | number }>;
  }
): Promise<string | null> {
  // Finalidade predominante por valor.
  const somaPorFinalidade = new Map<FinalidadeEntrada, number>();
  for (const item of entrada.itens) {
    if (!item.finalidade) continue;
    somaPorFinalidade.set(item.finalidade, (somaPorFinalidade.get(item.finalidade) ?? 0) + Number(item.valorTotal));
  }
  const predominante = [...somaPorFinalidade.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const nomeAlvo = predominante ? CLASSIFICACAO_POR_FINALIDADE[predominante] : undefined;
  if (nomeAlvo) {
    const c = await tx.classificacaoFinanceira.findFirst({
      where: { ...scopedByTenantCompany(scope), ativo: true, nome: { equals: nomeAlvo, mode: "insensitive" } },
      select: { id: true }
    });
    if (c) return c.id;
  }
  // Memória do fornecedor.
  if (entrada.fornecedorId) {
    const ultima = await tx.contaPagar.findFirst({
      where: { ...scopedByTenantCompany(scope), fornecedorId: entrada.fornecedorId, classificacaoId: { not: null } },
      orderBy: { criadoEm: "desc" },
      select: { classificacaoId: true }
    });
    if (ultima?.classificacaoId) return ultima.classificacaoId;
  }
  return null;
}

/**
 * BACKFILL: classifica em lote as contas EXISTENTES sem classificação, usando só inferências seguras —
 * mesma lógica da criação, aplicada ao legado (contas criadas antes do plano existir):
 *  - ContaPagar de entrada fiscal → finalidade predominante dos itens (+ memória do fornecedor);
 *  - ContaPagar restantes com fornecedor → memória do fornecedor;
 *  - ContaReceber de OS → "Receita de serviços"; de venda/PDV/adquirente/NF → "Receita de vendas".
 * Idempotente (só toca classificacaoId = null). Roda após o seed do plano e pelo botão da tela.
 */
export async function backfillClassificacoes(scope: TenantScope): Promise<{ pagar: number; receber: number }> {
  const where = scopedByTenantCompany(scope);
  let pagar = 0;

  // 1) Contas de ENTRADA FISCAL: agrupa por entrada (todas as parcelas recebem a mesma classificação).
  const contasEntrada = await prisma.contaPagar.findMany({
    where: { ...where, classificacaoId: null, entradaFiscalId: { not: null } },
    select: { id: true, entradaFiscalId: true }
  });
  const porEntrada = new Map<string, string[]>();
  for (const c of contasEntrada) {
    const arr = porEntrada.get(c.entradaFiscalId as string) ?? [];
    arr.push(c.id);
    porEntrada.set(c.entradaFiscalId as string, arr);
  }
  for (const [entradaId, contaIds] of porEntrada) {
    const entrada = await prisma.entradaFiscal.findFirst({
      where: { id: entradaId, ...where },
      select: { fornecedorId: true, itens: { select: { finalidade: true, valorTotal: true } } }
    });
    if (!entrada) continue;
    const classificacaoId = await sugerirClassificacaoEntrada(prisma, scope, entrada);
    if (!classificacaoId) continue;
    await prisma.contaPagar.updateMany({ where: { id: { in: contaIds } }, data: { classificacaoId } });
    pagar += contaIds.length;
  }

  // 2) Demais contas a pagar com fornecedor: memória (última classificação usada para ele).
  const manuais = await prisma.contaPagar.findMany({
    where: { ...where, classificacaoId: null, fornecedorId: { not: null } },
    select: { id: true, fornecedorId: true }
  });
  const memoria = new Map<string, string | null>();
  for (const c of manuais) {
    const fid = c.fornecedorId as string;
    if (!memoria.has(fid)) {
      const ultima = await prisma.contaPagar.findFirst({
        where: { ...where, fornecedorId: fid, classificacaoId: { not: null } },
        orderBy: { criadoEm: "desc" },
        select: { classificacaoId: true }
      });
      memoria.set(fid, ultima?.classificacaoId ?? null);
    }
    const classificacaoId = memoria.get(fid);
    if (!classificacaoId) continue;
    await prisma.contaPagar.update({ where: { id: c.id }, data: { classificacaoId } });
    pagar++;
  }

  // 3) Contas a receber automáticas → receita padrão.
  let receber = 0;
  const recServicos = await classificacaoReceitaPadraoId(prisma, scope, "servicos");
  const recVendas = await classificacaoReceitaPadraoId(prisma, scope, "vendas");
  if (recServicos) {
    receber += (await prisma.contaReceber.updateMany({
      where: { ...where, classificacaoId: null, ordemServicoId: { not: null } },
      data: { classificacaoId: recServicos }
    })).count;
  }
  if (recVendas) {
    receber += (await prisma.contaReceber.updateMany({
      where: {
        ...where,
        classificacaoId: null,
        OR: [{ pedidoVendaId: { not: null } }, { notaFiscalId: { not: null } }, { origem: { in: ["VENDA", "ADQUIRENTE", "PDV"] } }]
      },
      data: { classificacaoId: recVendas }
    })).count;
  }

  return { pagar, receber };
}
