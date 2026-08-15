import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { gerarDamdfePdf } from "@/domains/fiscal/providers/sefaz/mdfe/damdfe-pdf";

export const dynamic = "force-dynamic";

/** DAMDFE em PDF do manifesto autorizado — o documento que viaja com o motorista. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const m = await prisma.manifesto.findFirst({
      where: { id: params.id, tenantId: scope.tenantId, empresaId: scope.empresaId },
      include: { empresa: { select: { razaoSocial: true, cnpj: true, inscricaoEstadual: true, enderecoCidade: true, enderecoUf: true } } }
    });
    if (!m || !m.chave) {
      return NextResponse.json({ error: "Manifesto autorizado não encontrado." }, { status: 404 });
    }
    // QR do XML autorizado (infMDFeSupl/qrCodMDFe) — decodifica entidades.
    const qrRaw = /<qrCodMDFe>\s*(?:<!\[CDATA\[)?([^<\]]+)/.exec(m.xml ?? "")?.[1] ?? null;
    const qr = qrRaw ? qrRaw.replace(/&amp;/g, "&").trim() : null;

    const pdf = await gerarDamdfePdf({
      ambiente: m.ambiente as "PRODUCAO" | "HOMOLOGACAO",
      chave: m.chave,
      protocolo: m.protocolo,
      autorizadoEm: m.criadoEm.toISOString(),
      serie: m.serie,
      numero: m.numero,
      status: m.status,
      emitente: {
        razaoSocial: m.empresa.razaoSocial,
        cnpj: m.empresa.cnpj.replace(/\D/g, ""),
        inscricaoEstadual: m.empresa.inscricaoEstadual,
        municipio: m.empresa.enderecoCidade,
        uf: m.empresa.enderecoUf
      },
      ufInicio: m.ufInicio,
      ufFim: m.ufFim,
      municipioCarrega: m.municipioCarregaNome,
      municipioDescarga: m.municipioDescargaNome,
      veiculoPlaca: m.veiculoPlaca,
      veiculoTara: m.veiculoTara,
      condutorNome: m.condutorNome,
      condutorCpf: m.condutorCpf,
      chavesNfe: Array.isArray(m.chavesNfe) ? (m.chavesNfe as string[]) : [],
      valorCarga: Number(m.valorCarga),
      pesoBrutoKg: Number(m.pesoBrutoKg),
      qrCodeUrl: qr
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="damdfe-${m.numero}.pdf"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o DAMDFE.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
