import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { createPayable, settlePayable } from "@/domains/finance/application/finance-use-cases";
import { extrairCupomComIa } from "./cupom-ia";
import { canonizarCategoria } from "../categorias";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";

type GastoItemInput = { descricao: string; quantidade?: number | null; valor: number };

function parseData(data?: string | null): Date {
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) return new Date(`${data}T12:00:00`);
  return new Date();
}

/** Cria um gasto a partir da imagem do cupom (data URL base64): IA extrai e persiste para revisão. */
export async function criarGastoDeCupom(
  scope: TenantScope,
  input: { imagem: string; origem: "PWA" | "WHATSAPP"; criadoPor?: string | null }
) {
  await assertModuloLiberado(scope, "gastosHabilitado");
  const extraido = await extrairCupomComIa(scope, input.imagem);

  const gasto = await prisma.$transaction(async (tx) => {
    const g = await tx.gasto.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        estabelecimento: extraido.estabelecimento,
        documento: extraido.documento,
        categoria: extraido.categoria,
        data: parseData(extraido.data),
        valorTotal: extraido.valorTotal,
        origem: input.origem,
        status: "PENDENTE",
        imagemCupom: input.imagem.startsWith("data:") ? input.imagem : null,
        iaConfianca: extraido.confianca,
        iaBruto: extraido as unknown as object,
        criadoPor: input.criadoPor ?? null
      }
    });
    if (extraido.itens.length) {
      await tx.gastoItem.createMany({
        data: extraido.itens.map((i) => ({
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          gastoId: g.id,
          descricao: i.descricao,
          quantidade: i.quantidade ?? null,
          valor: i.valor
        }))
      });
    }
    await createAuditLog(tx, {
      scope,
      entidade: "Gasto",
      entidadeId: g.id,
      acao: "CREATE_FROM_CUPOM",
      payload: { estabelecimento: g.estabelecimento, valor: extraido.valorTotal, origem: input.origem }
    });
    return g;
  });

  return { id: gasto.id, ...extraido };
}

export async function criarGastoManual(
  scope: TenantScope,
  input: {
    estabelecimento: string;
    documento?: string | null;
    categoria: string;
    data?: string | null;
    valorTotal: number;
    formaPagamento?: string | null;
    observacoes?: string | null;
    itens?: GastoItemInput[];
    criadoPor?: string | null;
  }
) {
  await assertModuloLiberado(scope, "gastosHabilitado");
  if (!input.estabelecimento?.trim()) throw new Error("Informe o estabelecimento.");
  if (!(input.valorTotal > 0)) throw new Error("Informe um valor maior que zero.");

  const gasto = await prisma.$transaction(async (tx) => {
    const g = await tx.gasto.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        estabelecimento: input.estabelecimento.trim(),
        documento: input.documento?.replace(/\D/g, "") || null,
        categoria: canonizarCategoria(input.categoria),
        data: parseData(input.data),
        valorTotal: input.valorTotal,
        formaPagamento: input.formaPagamento || null,
        origem: "MANUAL",
        status: "CONFIRMADO",
        observacoes: input.observacoes || null,
        criadoPor: input.criadoPor ?? null
      }
    });
    if (input.itens?.length) {
      await tx.gastoItem.createMany({
        data: input.itens
          .filter((i) => i.descricao?.trim())
          .map((i) => ({
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            gastoId: g.id,
            descricao: i.descricao.trim(),
            quantidade: i.quantidade ?? null,
            valor: i.valor
          }))
      });
    }
    await createAuditLog(tx, { scope, entidade: "Gasto", entidadeId: g.id, acao: "CREATE", payload: { estabelecimento: g.estabelecimento } });
    return g;
  });
  return { id: gasto.id };
}

/** Atualiza campos do gasto e substitui os itens (revisão da extração da IA). */
export async function updateGasto(
  scope: TenantScope,
  id: string,
  input: {
    estabelecimento?: string;
    documento?: string | null;
    categoria?: string;
    data?: string | null;
    valorTotal?: number;
    formaPagamento?: string | null;
    observacoes?: string | null;
    itens?: GastoItemInput[];
  }
) {
  const gasto = await prisma.gasto.findFirst({ where: { id, ...scopedByTenantCompany(scope) }, select: { id: true } });
  if (!gasto) throw new Error("Gasto não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.gasto.update({
      where: { id },
      data: {
        ...(input.estabelecimento != null ? { estabelecimento: input.estabelecimento.trim() } : {}),
        ...(input.documento !== undefined ? { documento: input.documento?.replace(/\D/g, "") || null } : {}),
        ...(input.categoria != null ? { categoria: canonizarCategoria(input.categoria) } : {}),
        ...(input.data !== undefined ? { data: parseData(input.data) } : {}),
        ...(input.valorTotal != null ? { valorTotal: input.valorTotal } : {}),
        ...(input.formaPagamento !== undefined ? { formaPagamento: input.formaPagamento || null } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes || null } : {})
      }
    });
    if (input.itens) {
      await tx.gastoItem.deleteMany({ where: { gastoId: id } });
      if (input.itens.length) {
        await tx.gastoItem.createMany({
          data: input.itens
            .filter((i) => i.descricao?.trim())
            .map((i) => ({
              tenantId: scope.tenantId,
              empresaId: scope.empresaId,
              gastoId: id,
              descricao: i.descricao.trim(),
              quantidade: i.quantidade ?? null,
              valor: i.valor
            }))
        });
      }
    }
    return { id };
  });
}

export async function confirmarGasto(scope: TenantScope, id: string) {
  const gasto = await prisma.gasto.findFirst({ where: { id, ...scopedByTenantCompany(scope) }, select: { id: true } });
  if (!gasto) throw new Error("Gasto não encontrado.");
  await prisma.gasto.update({ where: { id }, data: { status: "CONFIRMADO" } });
  return { id };
}

/** EXCLUI um gasto (ação ADMIN — gate na rota). Remove itens; desvincula nada (controle próprio). */
export async function deleteGasto(scope: TenantScope, id: string) {
  const gasto = await prisma.gasto.findFirst({ where: { id, ...scopedByTenantCompany(scope) }, select: { id: true, estabelecimento: true } });
  if (!gasto) throw new Error("Gasto não encontrado.");
  return prisma.$transaction(async (tx) => {
    await tx.gastoItem.deleteMany({ where: { gastoId: id } });
    const removido = await tx.gasto.delete({ where: { id } });
    await createAuditLog(tx, { scope, entidade: "Gasto", entidadeId: id, acao: "DELETE", payload: { estabelecimento: gasto.estabelecimento } });
    return removido;
  });
}

/** Lança o gasto no financeiro: cria conta a pagar já quitada (à vista) e vincula. */
export async function lancarGastoNoFinanceiro(scope: TenantScope, id: string) {
  const gasto = await prisma.gasto.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!gasto) throw new Error("Gasto não encontrado.");
  if (gasto.lancadoFinanceiro) throw new Error("Este gasto já foi lançado no financeiro.");

  let fornecedorId: string | undefined;
  if (gasto.documento) {
    const f = await prisma.fornecedor.findFirst({
      where: { documento: gasto.documento, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    fornecedorId = f?.id;
  }

  const valor = Number(gasto.valorTotal);
  const conta = await createPayable(scope, {
    descricao: `Gasto: ${gasto.estabelecimento}`,
    fornecedorId,
    valor,
    vencimento: gasto.data,
    formaPagamento: gasto.formaPagamento ?? undefined,
    observacoes: `Gasto ${gasto.categoria} (origem ${gasto.origem})`
  });
  await settlePayable(scope, conta.id, {
    valor,
    formaPagamento: gasto.formaPagamento ?? undefined,
    dataPagamento: gasto.data
  });
  await prisma.gasto.update({ where: { id }, data: { contaPagarId: conta.id, lancadoFinanceiro: true, status: "CONFIRMADO" } });
  return { contaPagarId: conta.id };
}
