import assert from "node:assert/strict";
import { commercialEvolutionConfig, commercialEvolutionRequest, evolutionConnection, parseCommercialEvolutionInbound, validEvolutionSecret } from "../src/lib/whatsapp/commercial-evolution";
import { sendCommercialWhatsappText } from "../src/domains/platform-sales/runtime/commercial-whatsapp-transport";

async function main() {
  process.env.COMMERCIAL_WHATSAPP_PROVIDER = "EVOLUTION";
  process.env.COMMERCIAL_EVOLUTION_URL = "http://evolution.test";
  process.env.COMMERCIAL_EVOLUTION_INSTANCE = "xerp-comercial-test";
  process.env.COMMERCIAL_EVOLUTION_API_KEY = "test-instance-key";
  process.env.COMMERCIAL_EVOLUTION_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.ERP_BASE = "https://erp.test";
  const instance = commercialEvolutionConfig().instance;
  const payload = { instance, event: "messages.upsert", data: { key: { id: "ABC", fromMe: false, remoteJid: "5577999999999@s.whatsapp.net" }, message: { conversation: "Olá" } } };
  assert.equal(parseCommercialEvolutionInbound(payload, instance)?.text, "Olá");
  assert.equal(parseCommercialEvolutionInbound(payload, "crm-instance"), null);
  for (const jid of ["123@g.us", "status@broadcast", "123@newsletter", "123@lid", "123@s.whatsapp.net"]) {
    assert.equal(parseCommercialEvolutionInbound({ ...payload, data: { ...payload.data, key: { ...payload.data.key, remoteJid: jid } } }, instance), null);
  }
  assert.equal(parseCommercialEvolutionInbound({ ...payload, data: { ...payload.data, key: { ...payload.data.key, fromMe: true } } }, instance), null);
  assert.equal(parseCommercialEvolutionInbound({ ...payload, event: "connection.update" }, instance), null);
  assert.equal(parseCommercialEvolutionInbound(null, instance), null);
  assert.equal(validEvolutionSecret("secret", "secret"), true);
  assert.equal(validEvolutionSecret("bad", "secret"), false);
  assert.equal(validEvolutionSecret(null, "secret"), false);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let connected = false;
  let qrRequests = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("connectionState")) return Response.json({ instance: { state: connected ? "open" : "close" } });
    if (String(url).includes("instance/connect/")) return Response.json(++qrRequests === 1 ? {} : { code: "test-qr" });
    return Response.json({ key: { id: "sent" } });
  };
  assert.deepEqual(await evolutionConnection(), { status: "disconnected", qrCode: null });
  assert.equal(calls.length, 1); // GET status nunca conecta nem troca webhook.
  const qr = await evolutionConnection(true);
  assert.ok(qr.qrCode?.startsWith("data:image/png;base64,"));
  assert.equal(qrRequests, 2, "primeiro QR deve aguardar preparação assíncrona do provedor");
  const webhook = calls.find(c => c.url.includes("webhook/set"))!;
  const body = JSON.parse(String(webhook.init?.body));
  assert.equal(body.webhook.url, "https://erp.test/api/webhooks/comercial/evolution");
  assert.equal(body.webhook.headers["x-webhook-secret"], "test-webhook-secret");
  assert.ok(calls.every(c => c.url.endsWith(`/${instance}`)));
  connected = true;
  assert.deepEqual(await evolutionConnection(true), { status: "connected", qrCode: null });
  assert.equal((await sendCommercialWhatsappText({ instanceId: "ignored", token: "ignored", clientToken: null }, "5577999999999", "test")).ok, true);
  assert.ok(calls.at(-1)?.url.includes("message/sendText"));
  globalThis.fetch = async () => new Response("secret-provider-error", { status: 500 });
  await assert.rejects(() => commercialEvolutionRequest("/instance/connectionState"), /^Error: WhatsApp próprio retornou HTTP 500\.$/);
  assert.equal((await sendCommercialWhatsappText({ instanceId: null, token: null, clientToken: null }, "5577999999999", "test")).ok, false);
  process.env.COMMERCIAL_EVOLUTION_INSTANCE = "campanha-2026";
  assert.throws(() => commercialEvolutionConfig());
  console.log("Evolution: isolamento de instância, webhook, QR, autenticação e transporte verificados sem envios reais.");
}
main().catch(() => { console.error("Falha nos testes da Evolution."); process.exitCode = 1; });
