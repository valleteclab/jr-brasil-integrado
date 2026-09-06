import assert from "node:assert/strict";
import { prisma } from "../src/lib/db/prisma";
import { encryptSecret } from "../src/lib/security/secret-crypto";
import { processCommercialWhatsappMessage } from "../src/domains/platform-sales/runtime/process-commercial-whatsapp";

async function main() {
  process.env.AI_CONFIG_SECRET = "test-only-encryption";
  process.env.COMMERCIAL_WHATSAPP_PROVIDER = "EVOLUTION";
  process.env.COMMERCIAL_EVOLUTION_URL = "http://evolution.test";
  process.env.COMMERCIAL_EVOLUTION_INSTANCE = "xerp-comercial-test";
  process.env.COMMERCIAL_EVOLUTION_API_KEY = "test-key";
  process.env.COMMERCIAL_EVOLUTION_WEBHOOK_SECRET = "test-secret";
  process.env.ERP_BASE = "https://erp.test";
  const lead = { id: "lead-test", telefone: "5577999999999", status: "EM_CONVERSA", consentimento: true, optOutEm: null, nome: null, empresa: null };
  type Interaction = { id: string; leadId: string; canal: string; direcao: string; conteudo: string; externalMessageId: string | null; metadados?: { entregue: boolean } };
  const interactions: Interaction[] = [];
  let sendAttempts = 0, failSend = false, aiCalls = 0;
  // Todos os métodos usados são substituídos; estes testes nunca conectam a um banco.
  prisma.plataformaAgenteComercial.findUnique = (async () => ({ ativo: true, nomeAgente: "Teste", openrouterApiKeyCripto: encryptSecret("test-ai"), modeloIa: "test", precoMensal: 97, urlCadastro: "/cadastro", telefoneHumano: null })) as never;
  prisma.plataformaLead.findFirst = (async () => lead) as never;
  prisma.plataformaLead.update = (async ({ data }: { data: object }) => Object.assign(lead, data)) as never;
  prisma.plataformaLeadInteracao.findUnique = (async ({ where }: { where: { canal_externalMessageId: { externalMessageId: string } } }) => {
    const item = interactions.find(i => i.externalMessageId === where.canal_externalMessageId.externalMessageId);
    return item ? { ...item, lead } : null;
  }) as never;
  prisma.plataformaLeadInteracao.create = (async ({ data }: { data: Omit<Interaction, "id"> }) => {
    const item = { id: String(interactions.length + 1), ...data }; interactions.push(item); return item;
  }) as never;
  prisma.plataformaLeadInteracao.findMany = (async () => [...interactions].reverse()) as never;
  prisma.plataformaLeadInteracao.update = (async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(interactions.find(i => i.id === where.id)!, data)) as never;
  globalThis.fetch = async (url) => {
    if (String(url).includes("openrouter")) { aiCalls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "Como posso ajudar?", status: "EM_CONVERSA" }) } }] }); }
    assert.ok(String(url).startsWith("http://evolution.test/message/sendText/"));
    sendAttempts++;
    return failSend ? new Response("unavailable", { status: 503 }) : Response.json({ key: { id: "sent" } });
  };
  const incoming = { telefone: lead.telefone, mensagem: "Olá", messageId: "evo:xerp-comercial-test:1" };
  await processCommercialWhatsappMessage(incoming);
  assert.equal(sendAttempts, 1);
  await processCommercialWhatsappMessage(incoming);
  assert.equal(sendAttempts, 1, "reentrega confirmada não pode enviar outra resposta");
  assert.equal(aiCalls, 1);
  failSend = true;
  await assert.rejects(() => processCommercialWhatsappMessage({ ...incoming, messageId: "evo:xerp-comercial-test:2" }));
  assert.equal(interactions.at(-1)?.metadados?.entregue, false);
  failSend = false;
  await processCommercialWhatsappMessage({ ...incoming, messageId: "evo:xerp-comercial-test:2" });
  assert.equal(aiCalls, 2, "retry deve reutilizar a resposta salva");
  assert.equal(interactions.at(-1)?.metadados?.entregue, true);
  const optout = { ...incoming, mensagem: "SAIR", messageId: "evo:xerp-comercial-test:3" };
  await processCommercialWhatsappMessage(optout);
  assert.equal(lead.status, "OPT_OUT");
  const previousAttempts = sendAttempts;
  await processCommercialWhatsappMessage(optout);
  assert.equal(lead.status, "OPT_OUT", "reentrega de SAIR não pode reativar consentimento");
  assert.equal(sendAttempts, previousAttempts);
  console.log("Entrega comercial: deduplicação, retry de envio, resposta persistida e opt-out verificados com banco/transporte simulados.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
