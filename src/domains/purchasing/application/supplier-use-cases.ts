import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { isValidDocumento, normalizeDocumento } from "@/lib/fiscal/documento";

export class SupplierValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierValidationError";
  }
}

export type CreateSupplierInput = {
  razaoSocial: string;
  nomeFantasia?: string;
  documento: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
  condicaoPagamento?: string;
};

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

export async function createSupplier(scope: TenantScope, input: CreateSupplierInput) {
  // Preserva letras (CNPJ alfanumérico); só remove máscara e normaliza para maiúsculas.
  const documento = normalizeDocumento(input.documento);

  if (!input.razaoSocial?.trim()) {
    throw new SupplierValidationError("Razão social é obrigatória.");
  }

  if (!documento) {
    throw new SupplierValidationError("CNPJ/CPF é obrigatório.");
  }

  if (!isValidDocumento(documento)) {
    throw new SupplierValidationError("CNPJ/CPF inválido. Confira o número e os dígitos verificadores.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.fornecedor.findUnique({
      where: {
        tenantId_empresaId_documento: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          documento
        }
      }
    });

    if (existing) {
      throw new SupplierValidationError("Já existe um fornecedor com este documento cadastrado.");
    }

    const fornecedor = await tx.fornecedor.create({
      data: {
        ...scopedByTenantCompany(scope),
        razaoSocial: input.razaoSocial.trim(),
        nomeFantasia: input.nomeFantasia?.trim() || null,
        documento,
        email: input.email?.trim() || null,
        telefone: input.telefone?.trim() || null,
        cidade: input.cidade?.trim() || null,
        uf: input.uf?.trim() || null,
        condicaoPagamento: input.condicaoPagamento?.trim() || null,
        ativo: true
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Fornecedor",
      entidadeId: fornecedor.id,
      acao: "CREATE",
      payload: { razaoSocial: fornecedor.razaoSocial, documento }
    });

    return fornecedor;
  });
}

export async function updateSupplier(scope: TenantScope, id: string, input: UpdateSupplierInput) {
  return prisma.$transaction(async (tx) => {
    const fornecedor = await tx.fornecedor.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!fornecedor) {
      throw new SupplierValidationError("Fornecedor não encontrado.");
    }

    const documento = input.documento ? normalizeDocumento(input.documento) : undefined;

    if (documento !== undefined && !isValidDocumento(documento)) {
      throw new SupplierValidationError("CNPJ/CPF inválido. Confira o número e os dígitos verificadores.");
    }

    if (documento && documento !== fornecedor.documento) {
      const existing = await tx.fornecedor.findFirst({
        where: {
          ...scopedByTenantCompany(scope),
          documento,
          id: { not: id }
        }
      });

      if (existing) {
        throw new SupplierValidationError("Já existe um fornecedor com este documento cadastrado.");
      }
    }

    const updated = await tx.fornecedor.update({
      where: { id },
      data: {
        ...(input.razaoSocial !== undefined && { razaoSocial: input.razaoSocial.trim() }),
        ...(input.nomeFantasia !== undefined && { nomeFantasia: input.nomeFantasia?.trim() || null }),
        ...(documento !== undefined && { documento }),
        ...(input.email !== undefined && { email: input.email?.trim() || null }),
        ...(input.telefone !== undefined && { telefone: input.telefone?.trim() || null }),
        ...(input.cidade !== undefined && { cidade: input.cidade?.trim() || null }),
        ...(input.uf !== undefined && { uf: input.uf?.trim() || null }),
        ...(input.condicaoPagamento !== undefined && { condicaoPagamento: input.condicaoPagamento?.trim() || null })
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Fornecedor",
      entidadeId: id,
      acao: "UPDATE",
      payload: input
    });

    return updated;
  });
}

export async function archiveSupplier(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const fornecedor = await tx.fornecedor.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!fornecedor) {
      throw new SupplierValidationError("Fornecedor não encontrado.");
    }

    const updated = await tx.fornecedor.update({
      where: { id },
      data: { ativo: false }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Fornecedor",
      entidadeId: id,
      acao: "ARCHIVE",
      payload: { razaoSocial: fornecedor.razaoSocial }
    });

    return updated;
  });
}
