import { headers } from "next/headers";
import { MpPlataformaForm } from "@/components/admin/MpPlataformaForm";

export const dynamic = "force-dynamic";

/** Integrações de pagamento da PLATAFORMA — hoje: aplicação Mercado Pago (OAuth marketplace). */
export default function AdminPagamentosPage() {
  const h = headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "";
  const redirectUri = host ? `${proto}://${host}/api/erp/mercadopago/callback` : "/api/erp/mercadopago/callback";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: "0 0 4px" }}>Pagamentos — Mercado Pago</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--erp-slate)" }}>
          Com a aplicação configurada, cada cliente conecta a <strong>própria conta Mercado Pago</strong> em
          Configurações → Contas financeiras e passa a cobrar por Pix e boleto por ela (inclusive pelo
          assistente de IA) — sem certificado e sem credenciamento bancário.
        </p>
      </div>
      <MpPlataformaForm redirectUri={redirectUri} />
    </div>
  );
}
