import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { notificar } from "@/domains/comunicacao/application/comunicacao-use-cases";
import { apuracaoSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";

/**
 * ALERTAS de retenção do plano EMISSOR (rodado pelo cron): avisa pelo SINO (notificações) quando —
 *  - as notas do mês chegam a 80%/100% do limite do plano;
 *  - o faturamento do MEI chega a 80%/100% do limite anual (R$ 81 mil);
 *  - o certificado A1 está vencendo (≤30 dias) ou vencido;
 *  - o DAS do mês está perto de vencer (dias 13–20).
 * Idempotente: cada alerta deduplica pela existência de notificação do mesmo tipo na janela
 * (mês para limites/DAS; 7 dias para certificado) — o cron pode rodar quantas vezes quiser.
 */

async function jaAlertado(scope: TenantScope, tipo: string, desde: Date): Promise<boolean> {
  const n = await prisma.notificacao.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, tipo, criadoEm: { gte: desde } },
    select: { id: true }
  });
  return Boolean(n);
}

async function alertar(scope: TenantScope, tipo: string, desde: Date, titulo: string, mensagem: string, link: string): Promise<number> {
  if (await jaAlertado(scope, tipo, desde)) return 0;
  return notificar(scope, { setor: "fiscal", tipo, titulo, mensagem, link });
}

export async function rodarAlertasEmissor(): Promise<{ tenants: number; notificacoes: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { plano: "EMISSOR", ativo: true },
    select: { id: true, plano: true }
  });
  const planoCfg = await prisma.plataformaPlano.findUnique({ where: { codigo: "EMISSOR" } });
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const seteDiasAtras = new Date(Date.now() - 7 * 86400000);
  let notificacoes = 0;

  for (const t of tenants) {
    const empresa = await prisma.empresa.findFirst({
      where: { tenantId: t.id, status: "ATIVA" },
      orderBy: { matriz: "desc" },
      select: { id: true }
    });
    if (!empresa) continue;
    const scope: TenantScope = { tenantId: t.id, empresaId: empresa.id };

    try {
      // 1) Limite de notas do plano (80% / 100%).
      const limite = planoCfg?.limiteNotasMes ?? null;
      if (limite) {
        const emitidas = await prisma.notaFiscal.count({
          where: { tenantId: t.id, status: { in: ["AUTORIZADA", "CANCELADA", "SUBSTITUIDA"] }, emitidaEm: { gte: inicioMes } }
        });
        if (emitidas >= limite) {
          notificacoes += await alertar(scope, "EMISSOR_NOTAS_100", inicioMes,
            "Limite de notas do plano atingido",
            `Você usou as ${limite} notas do mês do seu plano. Para continuar emitindo, faça upgrade com o suporte.`,
            "/erp/fiscal");
        } else if (emitidas >= Math.ceil(limite * 0.8)) {
          notificacoes += await alertar(scope, "EMISSOR_NOTAS_80", inicioMes,
            "Notas do plano quase no limite",
            `Você já emitiu ${emitidas} de ${limite} notas neste mês (${Math.round((emitidas / limite) * 100)}%).`,
            "/erp/fiscal");
        }
      }

      // 2) Limite anual do MEI (80% / excedido).
      try {
        const ap = await apuracaoSimples(scope, { mes: agora.getMonth() + 1, ano: agora.getFullYear() });
        if (ap.mei) {
          if (ap.mei.excedeu) {
            notificacoes += await alertar(scope, "EMISSOR_MEI_100", inicioMes,
              "Limite anual do MEI ultrapassado",
              `Seu faturamento (${ap.mei.acumuladoAno.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) passou do limite do MEI — fale com seu contador sobre o desenquadramento.`,
              "/erp/fiscal/simples");
          } else if (ap.mei.percentualConsumido >= 80) {
            notificacoes += await alertar(scope, "EMISSOR_MEI_80", inicioMes,
              "Você já usou " + ap.mei.percentualConsumido.toFixed(0) + "% do limite do MEI",
              `Projeção anual: ${ap.mei.projecaoAnual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (limite ${ap.mei.limite.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Acompanhe no painel.`,
              "/erp/fiscal/simples");
          }
        }
      } catch { /* empresa fora do Simples/sem anexo → sem alerta MEI */ }

      // 3) Certificado A1 (vencendo/vencido) — 1 aviso por semana.
      const cert = await prisma.certificadoDigital.findUnique({ where: { empresaId: empresa.id }, select: { validade: true } });
      if (cert?.validade) {
        const dias = Math.ceil((cert.validade.getTime() - Date.now()) / 86400000);
        if (dias < 0) {
          notificacoes += await alertar(scope, "EMISSOR_A1_VENCIDO", seteDiasAtras,
            "Certificado A1 VENCIDO",
            "Seu certificado digital venceu — sem ele não é possível emitir notas. Renove com sua certificadora e envie o novo .pfx.",
            "/erp/configuracoes/fiscal");
        } else if (dias <= 30) {
          notificacoes += await alertar(scope, "EMISSOR_A1_30D", seteDiasAtras,
            `Certificado A1 vence em ${dias} dia(s)`,
            "Renove com antecedência para não parar de emitir. Depois é só enviar o novo .pfx nas configurações.",
            "/erp/configuracoes/fiscal");
        }
      }

      // 4) Lembrete do DAS (vence dia 20) — aviso único entre os dias 13 e 20.
      const dia = agora.getDate();
      if (dia >= 13 && dia <= 20) {
        const mesLabel = agora.toLocaleDateString("pt-BR", { month: "long" });
        notificacoes += await alertar(scope, "EMISSOR_DAS", inicioMes,
          "DAS vence dia 20",
          `Não esqueça: a guia DAS de ${mesLabel} vence dia 20. Emita no portal do Simples Nacional.`,
          "/erp/fiscal/simples");
      }
    } catch (e) {
      console.error("[emissor-alertas] tenant", t.id, e instanceof Error ? e.message : e);
    }
  }

  return { tenants: tenants.length, notificacoes };
}
