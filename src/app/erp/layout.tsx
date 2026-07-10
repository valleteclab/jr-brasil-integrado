import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp/ErpShell";
import { AssinarButton } from "@/components/erp/AssinarButton";
import { getErpShellContext } from "@/lib/services/erp-shell";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Dono da plataforma não pertence a nenhum cliente: mandamos ao painel /admin.
  if (!session.scope) redirect("/admin");

  const context = await getErpShellContext();

  // MENSALIDADE em atraso ≥ 7 dias: bloqueia com o link direto da fatura vencida (dados intactos).
  // O webhook libera assim que o pagamento é confirmado.
  if (context.mensalidade.bloqueado) {
    const url = context.mensalidade.faturaUrl;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0f172a" }}>
        <div style={{ maxWidth: 460, background: "#fff", borderRadius: 14, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>Mensalidade em atraso</h1>
          <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            O acesso do <strong>{context.empresaNome}</strong> está suspenso porque a mensalidade está
            {context.mensalidade.diasAtraso != null ? ` ${context.mensalidade.diasAtraso} dias` : ""} em atraso.
            Seus dados e notas estão guardados — pague a fatura para liberar na hora.
          </p>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 16, background: "#2563eb", color: "#fff", padding: "12px 26px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
              💳 Pagar agora
            </a>
          ) : (
            <p style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>Fale com o suporte para receber o link de pagamento.</p>
          )}
          <a
            href="https://wa.me/5577998755764?text=Quero%20regularizar%20minha%20mensalidade%20do%20XERP"
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", marginTop: 12, color: "#16a34a", textDecoration: "none", fontWeight: 700, fontSize: 13 }}
          >
            💬 falar com o suporte (WhatsApp)
          </a>
        </div>
      </div>
    );
  }

  // TRIAL vencido: bloqueia o ERP inteiro com aviso (dados intactos). O cliente pode ASSINAR na
  // hora (fatura Asaas — o webhook libera ao confirmar) ou falar com o suporte.
  if (context.trialVencido) {
    const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: context.plano } }).catch(() => null);
    const preco = plano ? Number(plano.precoMensal) : null;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0f172a" }}>
        <div style={{ maxWidth: 460, background: "#fff", borderRadius: 14, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>Seu período de teste terminou</h1>
          <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            O teste grátis do <strong>{context.empresaNome}</strong> chegou ao fim
            {context.trialFimEm ? ` em ${new Date(context.trialFimEm).toLocaleDateString("pt-BR")}` : ""}.
            Seus dados e notas emitidas estão guardados — assine para continuar usando.
          </p>
          <AssinarButton precoMensal={preco && preco > 0 ? preco : null} />
          <a
            href="https://wa.me/5577998755764?text=Quero%20ativar%20minha%20assinatura%20do%20emissor"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: 12, color: "#16a34a", textDecoration: "none", fontWeight: 700, fontSize: 13 }}
          >
            💬 ou fale com o suporte (WhatsApp)
          </a>
        </div>
      </div>
    );
  }

  return (
    <ErpShell context={context} modulos={session.modulos}>
      {children}
    </ErpShell>
  );
}
