import Link from "next/link";

/**
 * Tela exibida quando o usuário acessa (pela URL) um módulo que o dono do SaaS não liberou para
 * o tenant. Bloqueia o conteúdo de verdade no servidor — não apenas esconde o item do menu.
 */
export function ModuloBloqueado({ titulo, descricao }: { titulo?: string; descricao?: string }) {
  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="erp-card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <div className="erp-card-body" style={{ padding: "32px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">🔒</div>
          <h2 style={{ margin: "0 0 6px" }}>{titulo ?? "Recurso não liberado"}</h2>
          <p className="block-muted" style={{ marginBottom: 18 }}>
            {descricao ??
              "Este recurso não está liberado para a sua conta. Fale com o suporte para contratá-lo."}
          </p>
          <Link className="btn-erp primary" href="/erp">← Voltar ao início</Link>
        </div>
      </div>
    </div>
  );
}
