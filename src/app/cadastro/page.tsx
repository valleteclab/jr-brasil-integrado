import { prisma } from "@/lib/db/prisma";
import { CadastroEmissorForm } from "@/components/public/CadastroEmissorForm";

export const dynamic = "force-dynamic";

/** Cadastro público do plano EMISSOR DE NOTAS — preço/trial vêm de /admin/planos (nada fixo). */
export default async function CadastroEmissorPage() {
  const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: "EMISSOR" } }).catch(() => null);
  const preco = plano ? Number(plano.precoMensal) : null;
  const trialDias = plano?.trialDias ?? 7;
  const limite = plano?.limiteNotasMes ?? null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0f172a" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 14, padding: "28px 26px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 36 }}>🧾</div>
          <h1 style={{ fontSize: 20, margin: "8px 0 4px" }}>Emissor de Notas</h1>
          <p style={{ color: "#475569", fontSize: 13, margin: 0 }}>
            NF-e e NFS-e direto na SEFAZ, com PDF na hora + painel do Simples/MEI.
          </p>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            <strong>Teste grátis por {trialDias} dias</strong>
            {preco != null && preco > 0 && <> · depois {preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</>}
            {limite != null && <> · até {limite} notas/mês</>}
          </p>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
            Requisito: certificado digital A1 (.pfx) da sua empresa.
          </p>
        </div>
        <CadastroEmissorForm />
        <p style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 14 }}>
          Já tem conta? <a href="/login" style={{ fontWeight: 700 }}>Entrar</a>
        </p>
      </div>
    </div>
  );
}
