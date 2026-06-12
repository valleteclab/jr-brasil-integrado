import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { addServico, removeServico } from "@/domains/service-order/application/service-order-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.descricao) {
      return NextResponse.json({ error: "Descrição é obrigatória." }, { status: 400 });
    }
    if (!body.horas || Number(body.horas) <= 0) {
      return NextResponse.json({ error: "Horas deve ser maior que zero." }, { status: 400 });
    }
    if (!body.valorHora || Number(body.valorHora) <= 0) {
      return NextResponse.json({ error: "Valor por hora deve ser maior que zero." }, { status: 400 });
    }

    const servico = await addServico(scope, params.id, {
      descricao: body.descricao,
      horas: Number(body.horas),
      valorHora: Number(body.valorHora),
      codigoServicoLc116: body.codigoServicoLc116 ?? null,
    });
    return NextResponse.json({ id: servico.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao adicionar serviço.";
    const isValidation = message.includes("obrigatória") || message.includes("maior que zero");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.servicoId) {
      return NextResponse.json({ error: "servicoId é obrigatório." }, { status: 400 });
    }

    const result = await removeServico(scope, params.id, body.servicoId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover serviço.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
