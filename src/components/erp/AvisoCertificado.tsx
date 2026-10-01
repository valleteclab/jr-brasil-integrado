import Link from "next/link";
import { getAvisoCertificado } from "@/lib/services/certificado-aviso";

/**
 * Faixa de aviso do certificado A1 (vencido / vencendo / ausente) nas telas de operação.
 * Sem certificado válido a SEFAZ recusa a conexão e TODA emissão falha — o operador precisa ver
 * isso antes de vender, não depois da nota ser rejeitada.
 */
export async function AvisoCertificado() {
  let aviso;
  try {
    aviso = await getAvisoCertificado();
  } catch {
    return null; // aviso nunca derruba a tela
  }
  if (aviso.situacao === "OK") return null;

  const dataFmt = aviso.validade ? new Date(aviso.validade).toLocaleDateString("pt-BR") : null;
  const texto =
    aviso.situacao === "VENCIDO"
      ? `Certificado digital VENCIDO${dataFmt ? ` em ${dataFmt}` : ""}. Enquanto não for renovado, nenhuma nota é autorizada — as emissões serão rejeitadas.`
      : aviso.situacao === "VENCENDO"
        ? `Certificado digital vence em ${aviso.dias} dia(s)${dataFmt ? ` (${dataFmt})` : ""}. Renove antes para não parar de emitir.`
        : "Certificado digital não cadastrado. Envie o arquivo .pfx para emitir notas.";

  return (
    <div className={aviso.situacao === "VENCENDO" ? "alert warn" : "alert danger"} style={{ marginBottom: 14 }}>
      <span className="lead">{aviso.situacao === "VENCIDO" ? "Atenção:" : "Aviso:"}</span> {texto}{" "}
      <Link href="/erp/configuracoes/fiscal" style={{ fontWeight: 600 }}>Enviar certificado</Link>
    </div>
  );
}
