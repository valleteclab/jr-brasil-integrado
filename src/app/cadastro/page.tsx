import { prisma } from "@/lib/db/prisma";
import { CadastroEmissorForm } from "@/components/public/CadastroEmissorForm";

export const dynamic = "force-dynamic";

/**
 * Cadastro público self-service — plano EMISSOR (padrão) ou CHAT (?plano=chat).
 * Preço/trial/nome vêm de /admin/planos (nada fixo).
 */
export default async function CadastroEmissorPage({ searchParams }: { searchParams?: { plano?: string } }) {
  const isChat = (searchParams?.plano ?? "").toUpperCase() === "CHAT";
  const codigo = isChat ? "CHAT" : "EMISSOR";
  const plano = await prisma.plataformaPlano.findUnique({ where: { codigo } }).catch(() => null);
  const preco = plano ? Number(plano.precoMensal) : null;
  const trialDias = plano?.trialDias ?? 7;
  const limite = plano?.limiteNotasMes ?? null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0f172a" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 14, padding: "28px 26px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 36 }}>{isChat ? "💬" : "🧾"}</div>
          <h1 style={{ fontSize: 20, margin: "8px 0 4px" }}>{isChat ? (plano?.nome ?? "Assistente por chat") : "Emissor de Notas"}</h1>
          <p style={{ color: "#475569", fontSize: 13, margin: 0 }}>
            {isChat
              ? "Seu funcionário de IA no WhatsApp e Telegram: emite nota, cobra por Pix/boleto e lança gastos por foto."
              : "NF-e e NFS-e direto na SEFAZ, com PDF na hora + painel do Simples/MEI."}
          </p>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            <strong>Teste grátis por {trialDias} dias</strong>
            {preco != null && preco > 0 && <> · depois {preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</>}
            {limite != null && <> · até {limite} notas/mês</>}
          </p>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
            Requisito: certificado digital A1 (.pfx) da sua empresa.
            {isChat && " Dá até para enviá-lo pelo próprio chat."}
          </p>
        </div>
        <CadastroEmissorForm plano={isChat ? "CHAT" : "EMISSOR"} />
        <p style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 14 }}>
          Já tem conta? <a href="/login" style={{ fontWeight: 700 }}>Entrar</a>
        </p>
      </div>
    </div>
  );
}
