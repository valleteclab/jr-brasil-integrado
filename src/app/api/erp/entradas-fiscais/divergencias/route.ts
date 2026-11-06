import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import {
  itensComFinalidade,
  listarVinculosDivergentes,
  resumoFinalidadesDoMes
} from "@/domains/products/application/vinculo-divergente-use-cases";

// Varredura de vínculos errados e de finalidades do mês. Só leitura: a correção passa pela
// rota de vínculos em lote, que já tem auditoria e recálculo de estoque/crédito.
export async function GET(request: Request) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const hoje = new Date();
    const ano = Number(url.searchParams.get("ano")) || hoje.getFullYear();
    const mes = Math.min(12, Math.max(1, Number(url.searchParams.get("mes")) || hoje.getMonth() + 1));
    const finalidade = url.searchParams.get("finalidade");

    // Com ?finalidade=, devolve só os IDs — é o que a tela usa para montar a troca em lote.
    if (finalidade) {
      return NextResponse.json({ itemIds: await itensComFinalidade(scope, { ano, mes, finalidade }) });
    }

    const [divergencias, finalidades] = await Promise.all([
      listarVinculosDivergentes(scope, { ano, mes }),
      resumoFinalidadesDoMes(scope, { ano, mes })
    ]);
    return NextResponse.json({ ano, mes, divergencias, finalidades });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível varrer o período.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
