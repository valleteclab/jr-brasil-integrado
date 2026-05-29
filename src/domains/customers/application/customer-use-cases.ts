import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

export class CustomerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerValidationError";
  }
}

type ContatoInput = {
  nome: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
  cargo?: string;
  principal?: boolean;
};

type EnderecoInput = {
  apelido: string;
  cep: string;
  logradouro: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  padrao?: boolean;
};

type CreateCustomerInput = {
  razaoSocial: string;
  nomeFantasia?: string;
  documento: string;
  inscricaoEstadual?: string;
  segmento?: string;
  limiteCredito?: number;
  condicaoPagamento?: string;
  tabelaPrecoId?: string;
  status?: string;
  contatos?: ContatoInput[];
  enderecos?: EnderecoInput[];
};

type UpdateCustomerInput = Partial<CreateCustomerInput>;

export async function createCustomer(scope: TenantScope, input: CreateCustomerInput) {
  if (!input.razaoSocial?.trim()) {
    throw new CustomerValidationError("Razão social é obrigatória.");
  }
  if (!input.documento?.trim()) {
    throw new CustomerValidationError("Documento (CPF/CNPJ) é obrigatório.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.cliente.findUnique({
      where: { tenantId_documento: { tenantId: scope.tenantId, documento: input.documento } }
    });

    if (existing) {
      throw new CustomerValidationError(`Já existe um cliente com o documento ${input.documento}.`);
    }

    const cliente = await tx.cliente.create({
      data: {
        ...scopedByTenantCompany(scope),
        razaoSocial: input.razaoSocial.trim(),
        nomeFantasia: input.nomeFantasia?.trim() ?? null,
        documento: input.documento.trim(),
        inscricaoEstadual: input.inscricaoEstadual?.trim() ?? null,
        segmento: input.segmento?.trim() ?? null,
        limiteCredito: input.limiteCredito ?? 0,
        condicaoPagamento: input.condicaoPagamento?.trim() ?? null,
        tabelaPrecoId: input.tabelaPrecoId ?? null,
        status: (input.status as "PENDENTE_APROVACAO" | "ATIVO" | "BLOQUEADO" | "INATIVO") ?? "PENDENTE_APROVACAO",
        contatos: {
          create: (input.contatos ?? []).map((c) => ({
            ...scopedByTenantCompany(scope),
            nome: c.nome,
            email: c.email ?? null,
            telefone: c.telefone ?? null,
            whatsapp: c.whatsapp ?? null,
            cargo: c.cargo ?? null,
            principal: c.principal ?? false
          }))
        },
        enderecos: {
          create: (input.enderecos ?? []).map((e) => ({
            ...scopedByTenantCompany(scope),
            apelido: e.apelido,
            cep: e.cep,
            logradouro: e.logradouro,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            cidade: e.cidade,
            uf: e.uf,
            padrao: e.padrao ?? false
          }))
        }
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Cliente",
      entidadeId: cliente.id,
      acao: "CRIAR",
      payload: { razaoSocial: cliente.razaoSocial, documento: cliente.documento }
    });

    return cliente;
  });
}

export async function updateCustomer(scope: TenantScope, id: string, input: UpdateCustomerInput) {
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!cliente) {
      throw new CustomerValidationError("Cliente não encontrado.");
    }

    if (input.documento && input.documento !== cliente.documento) {
      const existing = await tx.cliente.findUnique({
        where: { tenantId_documento: { tenantId: scope.tenantId, documento: input.documento } }
      });
      if (existing && existing.id !== id) {
        throw new CustomerValidationError(`Já existe outro cliente com o documento ${input.documento}.`);
      }
    }

    const updated = await tx.cliente.update({
      where: { id },
      data: {
        razaoSocial: input.razaoSocial?.trim() ?? cliente.razaoSocial,
        nomeFantasia: input.nomeFantasia !== undefined ? (input.nomeFantasia?.trim() ?? null) : cliente.nomeFantasia,
        documento: input.documento?.trim() ?? cliente.documento,
        inscricaoEstadual: input.inscricaoEstadual !== undefined ? (input.inscricaoEstadual?.trim() ?? null) : cliente.inscricaoEstadual,
        segmento: input.segmento !== undefined ? (input.segmento?.trim() ?? null) : cliente.segmento,
        limiteCredito: input.limiteCredito !== undefined ? input.limiteCredito : cliente.limiteCredito,
        condicaoPagamento: input.condicaoPagamento !== undefined ? (input.condicaoPagamento?.trim() ?? null) : cliente.condicaoPagamento,
        tabelaPrecoId: input.tabelaPrecoId !== undefined ? (input.tabelaPrecoId ?? null) : cliente.tabelaPrecoId
      }
    });

    if (input.contatos !== undefined) {
      await tx.clienteContato.deleteMany({ where: { clienteId: id } });
      if (input.contatos.length > 0) {
        await tx.clienteContato.createMany({
          data: input.contatos.map((c) => ({
            ...scopedByTenantCompany(scope),
            clienteId: id,
            nome: c.nome,
            email: c.email ?? null,
            telefone: c.telefone ?? null,
            whatsapp: c.whatsapp ?? null,
            cargo: c.cargo ?? null,
            principal: c.principal ?? false
          }))
        });
      }
    }

    if (input.enderecos !== undefined) {
      await tx.clienteEndereco.deleteMany({ where: { clienteId: id } });
      if (input.enderecos.length > 0) {
        await tx.clienteEndereco.createMany({
          data: input.enderecos.map((e) => ({
            ...scopedByTenantCompany(scope),
            clienteId: id,
            apelido: e.apelido,
            cep: e.cep,
            logradouro: e.logradouro,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            cidade: e.cidade,
            uf: e.uf,
            padrao: e.padrao ?? false
          }))
        });
      }
    }

    await createAuditLog(tx, {
      scope,
      entidade: "Cliente",
      entidadeId: id,
      acao: "ATUALIZAR",
      payload: { razaoSocial: updated.razaoSocial }
    });

    return updated;
  });
}

export async function approveCustomer(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!cliente) throw new CustomerValidationError("Cliente não encontrado.");
    if (cliente.status !== "PENDENTE_APROVACAO") {
      throw new CustomerValidationError("Apenas clientes com status Pendente de Aprovação podem ser aprovados.");
    }

    const updated = await tx.cliente.update({
      where: { id },
      data: { status: "ATIVO" }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Cliente",
      entidadeId: id,
      acao: "APROVAR",
      payload: { statusAnterior: cliente.status, statusNovo: "ATIVO" }
    });

    return updated;
  });
}

export async function blockCustomer(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!cliente) throw new CustomerValidationError("Cliente não encontrado.");

    const updated = await tx.cliente.update({
      where: { id },
      data: { status: "BLOQUEADO" }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Cliente",
      entidadeId: id,
      acao: "BLOQUEAR",
      payload: { statusAnterior: cliente.status, statusNovo: "BLOQUEADO" }
    });

    return updated;
  });
}

export async function archiveCustomer(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!cliente) throw new CustomerValidationError("Cliente não encontrado.");

    const updated = await tx.cliente.update({
      where: { id },
      data: { status: "INATIVO" }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Cliente",
      entidadeId: id,
      acao: "ARQUIVAR",
      payload: { statusAnterior: cliente.status, statusNovo: "INATIVO" }
    });

    return updated;
  });
}
