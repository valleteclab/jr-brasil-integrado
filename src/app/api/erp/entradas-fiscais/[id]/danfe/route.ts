import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { gerarDanfePdf } from "@/domains/fiscal/providers/sefaz/danfe-pdf";

/**
 * DANFE (PDF) da nota de ENTRADA, gerado na hora a partir do XML guardado na importação.
 *
 * Existe para o atalho do contas a pagar: a conta nasce de uma entrada fiscal, e quem está
 * conferindo o pagamento quer ver a nota sem sair da tela. Entrada lançada à mão não tem XML,
 * então não tem DANFE — o atalho nem aparece nesse caso.
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessão sem empresa." }, { status: 401 });

    // O filtro por tenant/empresa é o que impede ler a nota de outra empresa pelo id.
    const entrada = await prisma.entradaFiscal.findFirst({
      where: { id: params.id, ...scopedByTenantCompany(session.scope) },
      select: { chaveAcesso: true, numero: true, xmlImportacao: { select: { xmlOriginal: true } } }
    });
    if (!entrada) {
      return NextResponse.json({ error: "Entrada fiscal não encontrada." }, { status: 404 });
    }

    const xml = entrada.xmlImportacao?.xmlOriginal ?? "";
    if (!xml.includes("<NFe") && !xml.includes("<nfeProc")) {
      return NextResponse.json(
        { error: "Esta entrada não tem XML da NF-e (lançamento manual), então não há DANFE para exibir." },
        { status: 404 }
      );
    }

    const pdf = await gerarDanfePdf(xml);
    const nome = entrada.chaveAcesso || entrada.numero || params.id;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // inline: abre na aba em vez de baixar — o uso é conferir, não arquivar.
        "Content-Disposition": `inline; filename="danfe-${nome}.pdf"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar o DANFE.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
