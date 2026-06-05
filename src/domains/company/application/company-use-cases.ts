import type { SegmentoEmpresa } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import type { TipoNegocio } from "@/lib/auth/modules";

export type EmpresaPerfil = {
  razaoSocial: string;
  nomeFantasia: string | null;
  tipoNegocio: TipoNegocio;
  segmento: SegmentoEmpresa;
};

export type UpdateEmpresaPerfilInput = {
  nomeFantasia?: string | null;
  tipoNegocio?: string;
  segmento?: string;
};

const TIPOS_VALIDOS: TipoNegocio[] = ["VENDA", "SERVICO", "AMBOS"];
const SEGMENTOS_VALIDOS: SegmentoEmpresa[] = ["GERAL", "AUTOPECAS", "MATERIAL_CONSTRUCAO", "MERCADO"];

function isTipoNegocio(value: unknown): value is TipoNegocio {
  return typeof value === "string" && (TIPOS_VALIDOS as string[]).includes(value);
}

function isSegmento(value: unknown): value is SegmentoEmpresa {
  return typeof value === "string" && (SEGMENTOS_VALIDOS as string[]).includes(value);
}

export async function getEmpresaPerfil(scope: TenantScope): Promise<EmpresaPerfil> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { razaoSocial: true, nomeFantasia: true, tipoNegocio: true, segmento: true }
  });
  return {
    razaoSocial: empresa?.razaoSocial ?? "",
    nomeFantasia: empresa?.nomeFantasia ?? null,
    tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
    segmento: empresa?.segmento ?? "GERAL"
  };
}

export async function updateEmpresaPerfil(scope: TenantScope, input: UpdateEmpresaPerfilInput): Promise<EmpresaPerfil> {
  if (input.tipoNegocio !== undefined && !isTipoNegocio(input.tipoNegocio)) {
    throw new Error("Tipo de negócio inválido.");
  }
  if (input.segmento !== undefined && !isSegmento(input.segmento)) {
    throw new Error("Segmento inválido.");
  }

  const empresa = await prisma.empresa.update({
    where: { id: scope.empresaId },
    data: {
      ...(input.nomeFantasia !== undefined ? { nomeFantasia: input.nomeFantasia?.trim() || null } : {}),
      ...(input.tipoNegocio !== undefined ? { tipoNegocio: input.tipoNegocio as TipoNegocio } : {}),
      ...(input.segmento !== undefined ? { segmento: input.segmento as SegmentoEmpresa } : {})
    },
    select: { razaoSocial: true, nomeFantasia: true, tipoNegocio: true, segmento: true }
  });

  await createAuditLog(prisma, {
    scope,
    entidade: "Empresa",
    entidadeId: scope.empresaId,
    acao: "UPDATE_PERFIL",
    payload: { nomeFantasia: empresa.nomeFantasia, tipoNegocio: empresa.tipoNegocio, segmento: empresa.segmento }
  });

  return {
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    tipoNegocio: empresa.tipoNegocio,
    segmento: empresa.segmento
  };
}
