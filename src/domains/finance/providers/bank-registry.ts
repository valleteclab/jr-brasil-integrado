import type { TenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { pfxTlsOptions } from "@/domains/fiscal/providers/pfx-utils";
import { bancoValido, BankError, type BancoId, type BankProvider } from "./bank-provider";
import { createSicoobProvider } from "./sicoob-provider";
import { createSicrediProvider } from "./sicredi-provider";
import { createItauProvider } from "./itau-provider";

/**
 * REGISTRY MULTIBANCO — resolve as credenciais da ContaBancaria (descriptografa segredos, carrega o
 * A1 da empresa para o mTLS) e devolve o BankProvider do banco daquela conta (Sicoob/Sicredi/Itaú).
 * Ponto único de roteamento: os use-cases do financeiro chamam `getBankProvider(scope, conta)`.
 */

export type ContaBancariaRow = NonNullable<Awaited<ReturnType<typeof prisma.contaBancaria.findFirst>>>;

function dec(v: string | null | undefined): string {
  if (!v) return "";
  try { return decryptSecret(v); } catch { return v; }
}

const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D+/g, "");

/** A conta tem credencial de COBRANÇA (boleto) do seu banco configurada? */
export function contaTemBoleto(conta: ContaBancariaRow): boolean {
  switch (bancoValido(conta.bancoIntegrado)) {
    case "SICOOB":
      return Boolean(conta.sicoobNumeroCliente && (conta.sicoobSandbox ? conta.sicoobSandboxToken : conta.sicoobClientId));
    case "SICREDI":
      return Boolean(conta.bancoBeneficiario && conta.bancoCooperativa && conta.bancoApiKey && conta.bancoAcesso);
    case "ITAU":
      return Boolean(conta.bancoClientId && conta.bancoClientSecret && conta.bancoBeneficiario);
  }
}

/** A conta tem credencial de PIX do seu banco + chave Pix cadastrada? */
export function contaTemPix(conta: ContaBancariaRow): boolean {
  if (!conta.chavePix?.trim()) return false;
  switch (bancoValido(conta.bancoIntegrado)) {
    case "SICOOB":
      return contaTemBoleto(conta); // Pix Sicoob usa o mesmo credenciamento da cobrança
    case "SICREDI":
    case "ITAU":
      return Boolean(conta.bancoClientId && conta.bancoClientSecret);
  }
}

/** A conta suporta EXTRATO/conciliação pelo banco (hoje só Sicoob tem API própria). */
export function contaTemExtrato(conta: ContaBancariaRow): boolean {
  return bancoValido(conta.bancoIntegrado) === "SICOOB" && contaTemBoleto(conta);
}

export function bancoDaConta(conta: ContaBancariaRow): BancoId {
  return bancoValido(conta.bancoIntegrado);
}

/** A conta está em ambiente sandbox/homologação do seu banco? (dados de exemplo, sem mTLS). */
export function contaSandbox(conta: ContaBancariaRow): boolean {
  return bancoValido(conta.bancoIntegrado) === "SICOOB" ? conta.sicoobSandbox : conta.bancoSandbox;
}

/** Rótulo curto para a UI/erros. */
export function bancoLabel(conta: ContaBancariaRow): string {
  return { SICOOB: "Sicoob", SICREDI: "Sicredi", ITAU: "Itaú" }[bancoValido(conta.bancoIntegrado)];
}

/**
 * Provedor bancário da conta, com credenciais resolvidas e certificado carregado. Para os bancos que
 * usam mTLS (Sicoob produção, Pix Sicredi/Itaú) carrega o A1 da empresa; sandbox dispensa o certificado.
 */
export async function getBankProvider(scope: TenantScope, conta: ContaBancariaRow): Promise<BankProvider> {
  const banco = bancoValido(conta.bancoIntegrado);

  if (banco === "SICOOB") {
    if (!contaTemBoleto(conta)) {
      throw new BankError(`A conta "${conta.nome}" não está configurada para cobrança Sicoob (Configurações → Contas financeiras).`);
    }
    const certificado = conta.sicoobSandbox ? null : await carregarCertificado(scope);
    if (!conta.sicoobSandbox && !certificado) {
      throw new BankError("Certificado A1 da empresa não cadastrado — necessário para o mTLS do Sicoob (Configurações → Fiscal).");
    }
    return createSicoobProvider({
      auth: {
        sandbox: conta.sicoobSandbox,
        clientId: conta.sicoobClientId,
        sandboxToken: conta.sicoobSandboxToken ? dec(conta.sicoobSandboxToken) : null,
        certificado
      },
      numeroCliente: conta.sicoobNumeroCliente as number,
      codigoModalidade: conta.sicoobModalidade,
      numeroContaCorrente: conta.sicoobContaCorrente ? Number(onlyDigits(conta.sicoobContaCorrente)) : undefined
    });
  }

  // Sicredi/Itaú: mTLS (Pix) reaproveita o A1 da empresa; boleto Sicredi não usa cert.
  const sandbox = conta.bancoSandbox;
  const certificado = sandbox ? null : await carregarCertificado(scope);
  const tls = certificado ? pfxTlsOptions(certificado) : null;

  if (banco === "SICREDI") {
    return createSicrediProvider({
      sandbox,
      beneficiario: conta.bancoBeneficiario ?? "",
      cooperativa: conta.bancoCooperativa ?? "",
      posto: conta.bancoPosto ?? "",
      apiKey: dec(conta.bancoApiKey),
      codigoAcesso: dec(conta.bancoAcesso),
      clientId: conta.bancoClientId ?? "",
      clientSecret: dec(conta.bancoClientSecret),
      chavePix: conta.chavePix,
      tls
    });
  }

  return createItauProvider({
    sandbox,
    clientId: conta.bancoClientId ?? "",
    clientSecret: dec(conta.bancoClientSecret),
    beneficiario: conta.bancoBeneficiario ?? "",
    agencia: conta.bancoCooperativa ?? "",
    conta: conta.bancoConta ?? "",
    carteira: conta.bancoConvenio ?? "",
    chavePix: conta.chavePix,
    tls
  });
}
