import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";

/**
 * Dados do PAINEL DA OFICINA (TV de acompanhamento): as OS EM ABERTO agrupadas por status,
 * do escopo autenticado. Leve (sem valores financeiros) — só o que a equipe precisa ver de longe.
 */
export const dynamic = "force-dynamic";

const STATUS_PAINEL = ["ABERTA", "AGUARDANDO_PECAS", "EM_ANDAMENTO", "FINALIZADA_NAO_FATURADA"] as const;

export async function GET() {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const agora = Date.now();

    const ordens = await prisma.ordemServico.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { in: [...STATUS_PAINEL] } },
      orderBy: [{ previsaoEm: "asc" }, { criadoEm: "asc" }],
      take: 120,
      select: {
        id: true, numero: true, status: true, equipamento: true, placaOuSerial: true,
        problemaRelatado: true, previsaoEm: true, criadoEm: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    });

    const ordensDto = ordens.map((os) => {
      const previsao = os.previsaoEm ? os.previsaoEm.getTime() : null;
      return {
        id: os.id,
        numero: os.numero,
        status: os.status,
        equipamento: os.equipamento,
        placa: os.placaOuSerial ?? null,
        problema: os.problemaRelatado ?? null,
        cliente: os.cliente.nomeFantasia || os.cliente.razaoSocial,
        previsaoEm: os.previsaoEm?.toISOString() ?? null,
        criadoEm: os.criadoEm.toISOString(),
        // Atrasada: tem previsão no passado e ainda não finalizou.
        atrasada: previsao != null && previsao < agora && os.status !== "FINALIZADA_NAO_FATURADA"
      };
    });

    const contagem = STATUS_PAINEL.reduce<Record<string, number>>((acc, s) => {
      acc[s] = ordensDto.filter((o) => o.status === s).length;
      return acc;
    }, {});

    return NextResponse.json({ ordens: ordensDto, contagem, ts: agora });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar o painel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
