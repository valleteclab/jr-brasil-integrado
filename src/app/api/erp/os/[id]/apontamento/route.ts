import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { addApontamento } from "@/domains/service-order/application/service-order-use-cases";
import { tecnicoDoUsuario } from "@/domains/service-order/application/tecnico-use-cases";

/**
 * APONTAMENTO: o técnico registra o que foi feito + horas. O técnico é RESOLVIDO pelo usuário
 * logado (vínculo Tecnico.usuarioId); um coordenador pode informar tecnicoId explicitamente.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { descricao?: string; horas?: number; tecnicoId?: string };

    // Técnico: o do usuário logado (auto) OU o informado explicitamente.
    let tecnicoId = body.tecnicoId?.trim() || null;
    if (!tecnicoId && session?.usuarioId) {
      const meuTecnico = await tecnicoDoUsuario(scope, session.usuarioId);
      tecnicoId = meuTecnico?.id ?? null;
    }
    if (!tecnicoId) {
      return NextResponse.json(
        { error: "Selecione o técnico (ou vincule seu login a um técnico no cadastro de Técnicos)." },
        { status: 400 }
      );
    }

    const a = await addApontamento(scope, params.id, {
      tecnicoId,
      descricao: body.descricao ?? "",
      horas: body.horas != null ? Number(body.horas) : null
    });
    return NextResponse.json({ id: a.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar apontamento.";
    const isValidation = message.includes("Descreva") || message.includes("não encontrad") || message.includes("faturada");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}
