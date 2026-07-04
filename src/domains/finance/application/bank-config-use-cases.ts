import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { encryptSecret } from "@/lib/security/secret-crypto";
import { bancoValido, type BancoId } from "@/domains/finance/providers/bank-provider";
import { contaTemBoleto, contaTemPix } from "@/domains/finance/providers/bank-registry";

/**
 * Configuração do BANCO INTEGRADO por conta (Sicredi/Itaú — Sicoob tem tela própria). Escolhe o
 * provedor (bancoIntegrado) e guarda as credenciais; segredos (client_secret, x-api-key, código de
 * acesso) ficam criptografados. Nunca devolve os segredos, só flags de "preenchido".
 */

export class BancoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BancoConfigError";
  }
}

export type ConfigBancoConta = {
  id: string;
  nome: string;
  bancoIntegrado: BancoId;
  bancoSandbox: boolean;
  chavePix: string | null;
  // Valores não-secretos (editáveis)
  bancoClientId: string | null;
  bancoBeneficiario: string | null;
  bancoCooperativa: string | null;
  bancoPosto: string | null;
  bancoConta: string | null;
  bancoConvenio: string | null;
  // Segredos já preenchidos? (para a UI mostrar "•••" sem expor)
  temClientSecret: boolean;
  temApiKey: boolean;
  temAcesso: boolean;
  // Estado
  temBoleto: boolean;
  temPix: boolean;
};

export async function listConfigBancos(scope: TenantScope): Promise<ConfigBancoConta[]> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true },
    orderBy: { nome: "asc" }
  });
  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    bancoIntegrado: bancoValido(c.bancoIntegrado),
    bancoSandbox: c.bancoSandbox,
    chavePix: c.chavePix,
    bancoClientId: c.bancoClientId,
    bancoBeneficiario: c.bancoBeneficiario,
    bancoCooperativa: c.bancoCooperativa,
    bancoPosto: c.bancoPosto,
    bancoConta: c.bancoConta,
    bancoConvenio: c.bancoConvenio,
    temClientSecret: Boolean(c.bancoClientSecret),
    temApiKey: Boolean(c.bancoApiKey),
    temAcesso: Boolean(c.bancoAcesso),
    temBoleto: contaTemBoleto(c),
    temPix: contaTemPix(c)
  }));
}

export type ConfigBancoInput = {
  bancoIntegrado?: string;
  bancoSandbox?: boolean;
  bancoClientId?: string | null;
  bancoClientSecret?: string | null;
  bancoApiKey?: string | null;
  bancoAcesso?: string | null;
  bancoBeneficiario?: string | null;
  bancoCooperativa?: string | null;
  bancoPosto?: string | null;
  bancoConta?: string | null;
  bancoConvenio?: string | null;
};

const txt = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
/** Segredo: só grava se veio conteúdo (não apaga com vazio); criptografa. */
const seg = (v: string | null | undefined) => (v && v.trim() ? encryptSecret(v.trim()) : undefined);

export async function configurarBancoIntegrado(scope: TenantScope, contaId: string, input: ConfigBancoInput) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaId, ...scopedByTenantCompany(scope) } });
  if (!conta) throw new BancoConfigError("Conta bancária não encontrada.");
  const banco = input.bancoIntegrado !== undefined ? bancoValido(input.bancoIntegrado) : undefined;

  return prisma.contaBancaria.update({
    where: { id: contaId },
    data: {
      ...(banco !== undefined ? { bancoIntegrado: banco } : {}),
      ...(input.bancoSandbox !== undefined ? { bancoSandbox: Boolean(input.bancoSandbox) } : {}),
      ...(input.bancoClientId !== undefined ? { bancoClientId: txt(input.bancoClientId) } : {}),
      ...(input.bancoBeneficiario !== undefined ? { bancoBeneficiario: txt(input.bancoBeneficiario) } : {}),
      ...(input.bancoCooperativa !== undefined ? { bancoCooperativa: txt(input.bancoCooperativa) } : {}),
      ...(input.bancoPosto !== undefined ? { bancoPosto: txt(input.bancoPosto) } : {}),
      ...(input.bancoConta !== undefined ? { bancoConta: txt(input.bancoConta) } : {}),
      ...(input.bancoConvenio !== undefined ? { bancoConvenio: txt(input.bancoConvenio) } : {}),
      ...(seg(input.bancoClientSecret) ? { bancoClientSecret: seg(input.bancoClientSecret) } : {}),
      ...(seg(input.bancoApiKey) ? { bancoApiKey: seg(input.bancoApiKey) } : {}),
      ...(seg(input.bancoAcesso) ? { bancoAcesso: seg(input.bancoAcesso) } : {})
    }
  });
}
