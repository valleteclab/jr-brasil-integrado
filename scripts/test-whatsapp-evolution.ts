import assert from "node:assert/strict";
import {
  conexaoEvolution, evolutionOperacionalDisponivel, instanciaEvolutionValida, nomeInstanciaEvolution,
  parseEvolutionInbound, provisionarInstanciaEvolution, sendEvolutionAudio, sendEvolutionDocument, sendEvolutionText,
  validEvolutionWebhookSecret
} from "../src/lib/whatsapp/evolution-client";

/** Testa o transporte do XERP WhatsApp das empresas com fetch simulado — nenhum envio real. */
async function main() {
  process.env.WHATSAPP_EVOLUTION_URL = "http://evolution.test";
  process.env.WHATSAPP_EVOLUTION_API_KEY = "global-test-key";
  process.env.ERP_BASE = "https://erp.test";
  assert.equal(evolutionOperacionalDisponivel(), true);

  const instance = nomeInstanciaEvolution("cmEmpresa123ABC");
  assert.equal(instance, "xerp-emp-cmempresa123abc");
  assert.equal(instanciaEvolutionValida("xerp-comercial-v1"), false, "instância do comercial nunca é aceita no fluxo das empresas");
  assert.equal(instanciaEvolutionValida("zapi-123"), false);

  const payload = { instance, event: "messages.upsert", data: { key: { id: "ABC", fromMe: false, remoteJid: "5577999999999@s.whatsapp.net" }, message: { conversation: "Oi" } } };
  const inbound = parseEvolutionInbound(payload);
  assert.equal(inbound?.text, "Oi");
  assert.equal(inbound?.instance, instance);
  assert.equal(inbound?.phone, "5577999999999");
  assert.equal(inbound?.messageId, `evo:${instance}:ABC`);
  assert.equal(parseEvolutionInbound({ ...payload, instance: "xerp-comercial-v1" }), null);
  for (const jid of ["123@g.us", "status@broadcast", "123@newsletter", "123@lid", "123@s.whatsapp.net"]) {
    assert.equal(parseEvolutionInbound({ ...payload, data: { ...payload.data, key: { ...payload.data.key, remoteJid: jid } } }), null);
  }
  assert.equal(parseEvolutionInbound({ ...payload, data: { ...payload.data, key: { ...payload.data.key, fromMe: true } } }), null);
  assert.equal(parseEvolutionInbound({ ...payload, event: "connection.update" }), null);
  assert.equal(parseEvolutionInbound(null), null);
  const comAudio = parseEvolutionInbound({ ...payload, data: { ...payload.data, message: { audioMessage: { seconds: 12 } } } });
  assert.equal(comAudio?.audio?.seconds, 12);
  assert.equal(comAudio?.text, "");
  const comFoto = parseEvolutionInbound({ ...payload, data: { ...payload.data, message: { imageMessage: { caption: "cupom" } } } });
  assert.equal(comFoto?.image?.caption, "cupom");

  assert.equal(validEvolutionWebhookSecret("s", "s"), true);
  assert.equal(validEvolutionWebhookSecret("x", "s"), false);
  assert.equal(validEvolutionWebhookSecret(null, "s"), false);
  assert.equal(validEvolutionWebhookSecret("s", null), false);

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let connected = false;
  let qrRequests = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes("fetchInstances")) return Response.json([{ name: "xerp-comercial-v1" }]);
    if (u.includes("connectionState")) return Response.json({ instance: { state: connected ? "open" : "close" } });
    if (u.includes("instance/connect/")) return Response.json(++qrRequests === 1 ? {} : { code: "test-qr" });
    return Response.json({ key: { id: "sent" } });
  };

  const inst = await provisionarInstanciaEvolution("cmEmpresa123ABC");
  assert.equal(inst.instanceId, instance);
  assert.equal(inst.token.length, 64);
  assert.equal(inst.webhookSecret.length, 64);
  assert.ok(!calls.some((c) => c.url.includes("/instance/delete/")), "instância nova não apaga nada");
  const create = calls.find((c) => c.url.endsWith("/instance/create"))!;
  assert.equal((create.init?.headers as Record<string, string>).apikey, "global-test-key", "criação usa a chave global");
  assert.equal(JSON.parse(String(create.init?.body)).token, inst.token);
  const webhook = calls.find((c) => c.url.includes("webhook/set"))!;
  assert.equal((webhook.init?.headers as Record<string, string>).apikey, inst.token, "webhook é configurado com o token da instância, não a global");
  const wbody = JSON.parse(String(webhook.init?.body));
  assert.equal(wbody.webhook.url, "https://erp.test/api/webhooks/whatsapp/evolution");
  assert.equal(wbody.webhook.headers["x-webhook-secret"], inst.webhookSecret);

  const cred = { instanceId: inst.instanceId, token: inst.token };
  calls.length = 0;
  assert.deepEqual(await conexaoEvolution(cred), { status: "disconnected", qrCode: null });
  assert.equal(calls.length, 1, "GET de estado nunca inicia pareamento");
  const qr = await conexaoEvolution(cred, true);
  assert.ok(qr.qrCode?.startsWith("data:image/png;base64,"));
  assert.equal(qrRequests, 2, "primeiro QR espera a preparação assíncrona do provedor");
  connected = true;
  assert.deepEqual(await conexaoEvolution(cred, true), { status: "connected", qrCode: null });

  assert.equal((await sendEvolutionText(cred, "(77) 99999-9999", "oi")).ok, true);
  assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).number, "77999999999", "telefone vai só com dígitos");
  assert.equal((await sendEvolutionAudio(cred, "5577999999999", Buffer.from("mp3"))).ok, true);
  assert.ok(calls.at(-1)?.url.includes("sendWhatsAppAudio"));
  assert.equal((await sendEvolutionDocument(cred, "5577999999999", { base64: "QUJD", fileName: "nota.pdf", caption: "NF" })).ok, true);
  assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).mediatype, "document");
  assert.ok(calls.every((c) => c.url.endsWith(`/${instance}`)), "toda chamada de instância vai para a instância da empresa");

  assert.equal((await sendEvolutionText({ instanceId: "xerp-comercial-v1", token: "t" }, "5577999999999", "oi")).ok, false, "credencial fora do padrão xerp-emp-* é recusada");
  globalThis.fetch = async () => new Response("secret-provider-error", { status: 500 });
  const erro = await sendEvolutionText(cred, "5577999999999", "oi");
  assert.equal(erro.ok, false);
  assert.match(erro.error ?? "", /^WhatsApp próprio retornou HTTP 500\.$/, "corpo do provedor nunca vaza no erro");

  delete process.env.WHATSAPP_EVOLUTION_API_KEY;
  assert.equal(evolutionOperacionalDisponivel(), false);
  console.log("XERP WhatsApp (Evolution por empresa): instância, webhook, QR, envio e isolamento verificados sem envios reais.");
}
main().catch((e) => { console.error("Falha nos testes do XERP WhatsApp:", e instanceof Error ? e.message : e); process.exitCode = 1; });
