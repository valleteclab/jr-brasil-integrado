import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp/ErpShell";
import { getErpShellContext } from "@/lib/services/erp-shell";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Dono da plataforma não pertence a nenhum cliente: mandamos ao painel /admin.
  if (!session.scope) redirect("/admin");

  const context = await getErpShellContext();

  // TRIAL vencido: bloqueia o ERP inteiro com aviso (dados intactos; o dono do SaaS estende/libera
  // no /admin). Admins da plataforma nunca chegam aqui (redirecionados acima).
  if (context.trialVencido) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0f172a" }}>
        <div style={{ maxWidth: 460, background: "#fff", borderRadius: 14, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>Seu período de teste terminou</h1>
          <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            O teste grátis do <strong>{context.empresaNome}</strong> chegou ao fim
            {context.trialFimEm ? ` em ${new Date(context.trialFimEm).toLocaleDateString("pt-BR")}` : ""}.
            Seus dados e notas emitidas estão guardados — para continuar usando, fale com o suporte
            e ative sua assinatura.
          </p>
          <a
            href="https://wa.me/5577998755764?text=Quero%20ativar%20minha%20assinatura%20do%20emissor"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: 18, background: "#16a34a", color: "#fff", padding: "10px 22px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}
          >
            💬 Falar com o suporte (WhatsApp)
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
