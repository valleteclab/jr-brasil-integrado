import Link from "next/link";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { planoDoTenantAtual, getEmissorSetupStatus } from "@/lib/services/emissor-home";

/**
 * AVISO de configuração incompleta nas telas de emissão (server component): no plano EMISSOR,
 * enquanto faltar item obrigatório (endereço fiscal / certificado A1), mostra o alerta com os
 * links para resolver — a SEFAZ rejeitaria a nota de qualquer forma. Nos demais planos ou com
 * tudo pronto, não renderiza nada.
 */
export async function EmissorSetupAviso() {
  try {
    if (!["EMISSOR", "CHAT"].includes(await planoDoTenantAtual())) return null;
    const scope = await getDevelopmentTenantScope();
    const setup = await getEmissorSetupStatus(scope);
    if (setup.completo) return null;
    const obrigatorias = setup.pendencias.filter((p) => p.obrigatorio);

    return (
      <div className="alert warn" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>⚠️ Falta configurar antes de emitir</strong>
        <span style={{ fontSize: 13 }}>
          A SEFAZ exige o cadastro completo — sem isso a nota é rejeitada. Resolva primeiro:
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {obrigatorias.map((p) => (
            <span key={p.titulo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>• {p.titulo}</span>
              <Link href={p.link} className="btn-erp light xs">Resolver →</Link>
            </span>
          ))}
        </div>
      </div>
    );
  } catch {
    return null; // aviso é cortesia — nunca derruba a tela de emissão
  }
}
