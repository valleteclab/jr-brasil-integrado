import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { salvarAsaasConfig, getAsaasRuntime, asaasRegistrarWebhook } from "@/lib/asaas/asaas-service";

/**
 * CONFIG de plataforma do módulo de crédito via CRON_SECRET (enquanto a tela /admin não existe):
 * salva credenciais do Asaas + preços de revenda e registra o webhook.
 *
 *   GET  → estado atual (sem segredos)
 *   POST { asaasApiKey?, asaasWalletId?, asaasSandbox?, precoPF?, precoPJ?, registrarWebhook?, baseUrl? }
 */
export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    configurado: Boolean(cfg?.asaasApiKeyCripto),
    asaasSandbox: cfg?.asaasSandbox ?? null,
    asaasWalletId: cfg?.asaasWalletId ?? null,
    temWebhookToken: Boolean(cfg?.asaasWebhookToken),
    precoConsultaPF: cfg ? Number(cfg.precoConsultaPF) : null,
    precoConsultaPJ: cfg ? Number(cfg.precoConsultaPJ) : null,
    apibrasilConfigurado: Boolean(cfg?.apibrasilTokenCripto)
  });
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = (await request.json()) as {
      asaasApiKey?: string;
      asaasWalletId?: string;
      asaasSandbox?: boolean;
      precoPF?: number;
      precoPJ?: number;
      registrarWebhook?: boolean;
      baseUrl?: string;
      webhookEmail?: string;
    };

    // Garante um webhookToken estável (usado na URL do webhook e no header do Asaas).
    const atual = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
    const webhookToken = atual?.asaasWebhookToken ?? randomBytes(24).toString("hex");

    if (body.asaasApiKey || body.asaasWalletId || body.asaasSandbox !== undefined) {
      await salvarAsaasConfig({
        apiKey: body.asaasApiKey ?? null,
        walletId: body.asaasWalletId ?? null,
        sandbox: body.asaasSandbox ?? atual?.asaasSandbox ?? true,
        webhookToken
      });
    }
    if (body.precoPF !== undefined || body.precoPJ !== undefined) {
      await prisma.plataformaCredito.update({
        where: { id: "default" },
        data: {
          ...(body.precoPF !== undefined ? { precoConsultaPF: body.precoPF } : {}),
          ...(body.precoPJ !== undefined ? { precoConsultaPJ: body.precoPJ } : {})
        }
      });
    }

    // ApiBrasil (bureau): token mestre (criptografado) + device tokens PF/PJ + sandbox.
    const ab = body as { apibrasilToken?: string; apibrasilDevicePF?: string; apibrasilDevicePJ?: string; apibrasilSandbox?: boolean };
    if (ab.apibrasilToken || ab.apibrasilDevicePF !== undefined || ab.apibrasilDevicePJ !== undefined || ab.apibrasilSandbox !== undefined) {
      const { encryptSecret } = await import("@/lib/security/secret-crypto");
      await prisma.plataformaCredito.upsert({
        where: { id: "default" },
        update: {
          ...(ab.apibrasilToken?.trim() ? { apibrasilTokenCripto: encryptSecret(ab.apibrasilToken.trim()) } : {}),
          ...(ab.apibrasilDevicePF !== undefined ? { apibrasilDevicePF: ab.apibrasilDevicePF || null } : {}),
          ...(ab.apibrasilDevicePJ !== undefined ? { apibrasilDevicePJ: ab.apibrasilDevicePJ || null } : {}),
          ...(ab.apibrasilSandbox !== undefined ? { apibrasilSandbox: ab.apibrasilSandbox } : {})
        },
        create: {
          id: "default",
          apibrasilTokenCripto: ab.apibrasilToken?.trim() ? encryptSecret(ab.apibrasilToken.trim()) : null,
          apibrasilDevicePF: ab.apibrasilDevicePF || null,
          apibrasilDevicePJ: ab.apibrasilDevicePJ || null,
          apibrasilSandbox: ab.apibrasilSandbox ?? true
        }
      });
    }

    // Teste do fluxo COMPLETO (consultarCredito: cache+débito+SALVA ConsultaCredito) p/ um CNPJ.
    const tcc = body as { testarConsultaCompletaCnpj?: string; documento?: string; tipoTeste?: "PF" | "PJ" };
    if (tcc.testarConsultaCompletaCnpj) {
      const empresa = await prisma.empresa.findFirst({ where: { cnpj: tcc.testarConsultaCompletaCnpj.replace(/\D/g, "") }, select: { id: true, tenantId: true } });
      if (!empresa) throw new Error("Empresa não encontrada.");
      const { consultarCredito } = await import("@/domains/credito/application/consulta-credito-use-cases");
      const r = await consultarCredito({ tenantId: empresa.tenantId, empresaId: empresa.id }, { documento: tcc.documento ?? "00000000000", forcar: true });
      const total = await prisma.consultaCredito.count({ where: { tenantId: empresa.tenantId } });
      return NextResponse.json({ ok: true, salvouId: r.id, emCache: r.emCache, custo: r.custo, decisao: r.normalizado.decisao, score: r.normalizado.score, totalConsultasSalvas: total });
    }

    // Normaliza um JSON cru colado (sem consultar/gastar): valida o normalizador contra dado real.
    const nb = body as { normalizarBruto?: { tipo: "PF" | "PJ"; body: unknown } };
    if (nb.normalizarBruto) {
      const { normalizarBureau } = await import("@/domains/credito/application/bureau-normalizer");
      return NextResponse.json({ normalizado: normalizarBureau(nb.normalizarBruto.body, nb.normalizarBruto.tipo) });
    }

    // Teste de consulta ao bureau (RAW, sem debitar carteira): calibra endpoint/body contra o painel.
    const tc = body as { testarConsulta?: { tipo: "PF" | "PJ"; documento: string; path?: string; tipoProduto?: string; homolog?: boolean; body?: Record<string, unknown>; normalizar?: boolean } };
    if (tc.testarConsulta) {
      const { getApiBrasilRuntime, consultarCreditoApiBrasil } = await import("@/lib/apibrasil/apibrasil-service");
      const rt = await getApiBrasilRuntime();
      if (!rt) throw new Error("ApiBrasil não configurado.");
      const t = tc.testarConsulta;
      const resp = await consultarCreditoApiBrasil(rt, t.tipo, t.documento, { path: t.path, tipo: t.tipoProduto, homolog: t.homolog, body: t.body });
      let normalizado: unknown = undefined;
      if (t.normalizar && resp.ok) {
        const { normalizarBureau } = await import("@/domains/credito/application/bureau-normalizer");
        normalizado = normalizarBureau(resp.body, t.tipo);
      }
      return NextResponse.json({ status: resp.status, ok: resp.ok, normalizado, body: resp.body });
    }

    // Limpeza: remove recargas de TESTE pendentes de um tenant (após validar o sandbox).
    const limpar = body as { limparRecargasPendentesCnpj?: string };
    if (limpar.limparRecargasPendentesCnpj) {
      const cnpj = limpar.limparRecargasPendentesCnpj.replace(/\D/g, "");
      const empresa = await prisma.empresa.findFirst({ where: { cnpj }, select: { tenantId: true } });
      if (!empresa) throw new Error(`Empresa CNPJ ${cnpj} não encontrada.`);
      const r = await prisma.recargaCredito.deleteMany({ where: { tenantId: empresa.tenantId, status: "PENDENTE" } });
      return NextResponse.json({ ok: true, removidas: r.count });
    }

    // Diagnóstico: QR Pix cru de uma recarga (mostra o erro do Asaas, ex.: falta chave Pix).
    const diag = body as { diagRecargaId?: string };
    if (diag.diagRecargaId) {
      const rec = await prisma.recargaCredito.findUnique({ where: { id: diag.diagRecargaId }, select: { asaasPaymentId: true } });
      if (!rec?.asaasPaymentId) throw new Error("Recarga sem asaasPaymentId.");
      const rt = await getAsaasRuntime();
      if (!rt) throw new Error("Asaas não configurado.");
      const { asaasPixQrCodeRaw } = await import("@/lib/asaas/asaas-service");
      const raw = await asaasPixQrCodeRaw(rt, rec.asaasPaymentId);
      return NextResponse.json(raw);
    }

    // Teste ponta a ponta no sandbox: cria uma recarga Pix para a empresa do CNPJ informado.
    const teste = body as { testarRecargaCnpj?: string; testarValor?: number };
    if (teste.testarRecargaCnpj) {
      const cnpj = teste.testarRecargaCnpj.replace(/\D/g, "");
      const empresa = await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true, tenantId: true } });
      if (!empresa) throw new Error(`Empresa CNPJ ${cnpj} não encontrada.`);
      const { criarRecarga } = await import("@/domains/credito/application/carteira-use-cases");
      const r = await criarRecarga({ tenantId: empresa.tenantId, empresaId: empresa.id }, { valor: teste.testarValor ?? 10 });
      return NextResponse.json({ ok: true, recargaId: r.id, valor: r.valor, temQr: Boolean(r.qrBase64), payload: r.payload, expiraEm: r.expiraEm });
    }

    let webhook: string | null = null;
    if (body.registrarWebhook) {
      const rt = await getAsaasRuntime();
      if (!rt) throw new Error("Configure a chave do Asaas antes de registrar o webhook.");
      const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
      const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
      const base = (body.baseUrl ?? (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
      if (!/^https:\/\//.test(base)) throw new Error("baseUrl público (https) indeterminado para o webhook.");
      webhook = `${base}/api/webhooks/asaas/${webhookToken}`;
      await asaasRegistrarWebhook(rt, webhook, webhookToken, body.webhookEmail?.trim() || "loamesilva@valleteclab.com.br");
    }

    return NextResponse.json({ ok: true, webhook });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha." }, { status: 400 });
  }
}
