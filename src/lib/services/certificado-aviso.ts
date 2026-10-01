import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export type AvisoCertificado = {
  situacao: "VENCIDO" | "VENCENDO" | "AUSENTE" | "OK";
  validade: string | null;
  dias: number | null;
};

/**
 * Saúde do certificado A1 da empresa do escopo, para avisar NA TELA (o sino depende do cron e o
 * operador só descobre o vencimento quando a nota é rejeitada pela SEFAZ).
 * AUSENTE só é avisado quando a empresa já tem emissão configurada — empresa nova não é alertada.
 */
export async function getAvisoCertificado(): Promise<AvisoCertificado> {
  const scope = await getDevelopmentTenantScope();
  const [cert, configuracao] = await Promise.all([
    prisma.certificadoDigital.findUnique({ where: { empresaId: scope.empresaId }, select: { validade: true } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { id: true } })
  ]);
  if (!cert) {
    return { situacao: configuracao ? "AUSENTE" : "OK", validade: null, dias: null };
  }
  if (!cert.validade) return { situacao: "OK", validade: null, dias: null };
  const dias = Math.ceil((cert.validade.getTime() - Date.now()) / 86_400_000);
  return {
    situacao: dias < 0 ? "VENCIDO" : dias <= 30 ? "VENCENDO" : "OK",
    validade: cert.validade.toISOString(),
    dias
  };
}
