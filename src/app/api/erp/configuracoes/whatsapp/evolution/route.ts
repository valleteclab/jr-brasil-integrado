import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  conexaoEvolution, desconectarEvolution, evolutionOperacionalDisponivel, instanciaEvolutionValida,
  provisionarInstanciaEvolution, removerInstanciaEvolution
} from "@/lib/whatsapp/evolution-client";
import { desvincularInstanciaEvolution, getWhatsappRuntime, vincularInstanciaEvolution } from "@/lib/whatsapp/whatsapp-service";

export const dynamic = "force-dynamic";

/**
 * Conexão do XERP WhatsApp (Evolution) da EMPRESA: GET consulta o estado; POST {acao} executa
 * conectar (provisiona a instância na primeira vez e devolve o QR Code), desconectar ou remover.
 * Espelha /api/admin/agente-comercial/conexao, só que escopado à empresa e restrito a admin.
 */
type Acao = "conectar" | "desconectar" | "remover";

const NAO_PROVISIONADO = { status: "nao_provisionado", qrCode: null };
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    if (!evolutionOperacionalDisponivel()) return NextResponse.json({ status: "indisponivel", qrCode: null }, SEM_CACHE);
    const cfg = await getWhatsappRuntime(scope);
    if (cfg?.provedor !== "EVOLUTION" || !instanciaEvolutionValida(cfg.instanceId)) return NextResponse.json(NAO_PROVISIONADO, SEM_CACHE);
    return NextResponse.json(await conexaoEvolution(cfg, false), SEM_CACHE);
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível consultar a conexão do WhatsApp." }, { status: authErrorStatus(error, 502) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    if (!evolutionOperacionalDisponivel()) return NextResponse.json({ error: "O XERP WhatsApp não está habilitado neste servidor." }, { status: 400 });
    if (request.headers.get("origin") !== new URL(process.env.ERP_BASE || request.url).origin) {
      return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
    }
    const { acao } = (await request.json().catch(() => ({}))) as { acao?: Acao };
    let cfg = await getWhatsappRuntime(scope);
    const provisionada = cfg?.provedor === "EVOLUTION" && instanciaEvolutionValida(cfg.instanceId) && Boolean(cfg.token);

    if (acao === "remover") {
      // Instância pode já não existir no servidor; o vínculo local é desfeito mesmo assim.
      if (provisionada) await removerInstanciaEvolution(cfg!.instanceId!).catch(() => undefined);
      await desvincularInstanciaEvolution(scope);
      console.info("[whatsapp/evolution]", { usuarioId: user.usuarioId, empresaId: scope.empresaId, acao });
      return NextResponse.json(NAO_PROVISIONADO, SEM_CACHE);
    }
    if (acao === "desconectar") {
      if (!provisionada) return NextResponse.json(NAO_PROVISIONADO, SEM_CACHE);
      await desconectarEvolution(cfg!);
      console.info("[whatsapp/evolution]", { usuarioId: user.usuarioId, empresaId: scope.empresaId, acao });
      return NextResponse.json(await conexaoEvolution(cfg!, false), SEM_CACHE);
    }
    if (acao !== "conectar") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

    if (!provisionada) {
      const inst = await provisionarInstanciaEvolution(scope.empresaId);
      await vincularInstanciaEvolution(scope, inst);
      cfg = await getWhatsappRuntime(scope);
    }
    const result = await conexaoEvolution(cfg!, true);
    console.info("[whatsapp/evolution]", { usuarioId: user.usuarioId, empresaId: scope.empresaId, acao, status: result.status });
    return NextResponse.json(result, SEM_CACHE);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 502) });
  }
}
