import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { encryptSecret } from "../src/lib/security/secret-crypto";

type Interaction = { id: string; leadId: string; canal: string; direcao: string; conteudo: string; externalMessageId: string | null; metadados?: Record<string, unknown> };
type BridgeResult = { status: number; model: string | null; choices: Array<{ message: { content: string } }>; usage: Record<string, number> };
const remoteProgram = String.raw`
const { PrismaClient } = require("@prisma/client");
const { createHash, createDecipheriv } = require("node:crypto");
console.log = console.info = console.warn = console.error = () => {};
const prisma = new PrismaClient({ log: [] });
const watchdog = setTimeout(() => process.exit(124), 40000);
(async () => {
  let status = 0, model = null, choices = [], usage = {}, secrets = [];
  try {
    let raw = "";
    for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 100000) throw Error(); }
    const input = JSON.parse(raw);
    if (!Array.isArray(input.messages) || input.messages.length > 50 || input.messages.some(m => !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string")) throw Error();
    if (!Number.isInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > 850 || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 1 || input.response_format?.type !== "json_object") throw Error();
    const config = await prisma.plataformaAgenteComercial.findUnique({ where: { id: "default" }, select: { modeloIa: true, openrouterApiKeyCripto: true } });
    if (!config?.modeloIa || !config.openrouterApiKeyCripto || !process.env.AI_CONFIG_SECRET) throw Error();
    const [iv, tag, encrypted] = config.openrouterApiKeyCripto.split(".");
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(process.env.AI_CONFIG_SECRET).digest(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const key = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
    secrets = [key, config.openrouterApiKeyCripto, process.env.AI_CONFIG_SECRET];
    model = config.modeloIa;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-Title": "XERP Commercial Synthetic Audit" },
      body: JSON.stringify({ model, messages: input.messages.map(({ role, content }) => ({ role, content })), temperature: input.temperature, max_tokens: input.max_tokens, response_format: { type: "json_object" } })
    });
    status = response.status;
    if (response.ok) {
      const data = await response.json();
      choices = (data.choices || []).slice(0, 1).map(c => ({ message: { role: "assistant", content: typeof c.message?.content === "string" ? c.message.content : "" } }));
      for (const name of ["prompt_tokens", "completion_tokens", "total_tokens", "cost"]) if (Number.isFinite(data.usage?.[name])) usage[name] = data.usage[name];
    }
  } catch { if (!status || status === 200) status = 0; choices = []; usage = {}; }
  finally {
    await prisma.$disconnect().catch(() => {});
    let output = JSON.stringify({ status, model, choices, usage });
    for (const secret of secrets) if (secret) output = output.split(secret).join("[REDACTED]");
    process.stdout.write(output); clearTimeout(watchdog);
  }
})();
`;
const quoteShell = (text: string) => "'" + text.replace(/'/g, "'\"'\"'") + "'";
const sshCommand = `docker exec -i $(docker ps -q --filter name=erp_erp.1) node -e ${quoteShell(remoteProgram)}`;
let requests = 0, failures = 0, completed = 0, fatal = "";
const totals: Record<string, number> = {};
function stop(message: string): never { fatal ||= message; throw new Error(fatal); }

async function main() {
  const args = process.argv.slice(2), limits = args.filter(arg => arg.startsWith("--limit="));
  if (!args.includes("--allow-paid-ai") || args.some(arg => arg !== "--allow-paid-ai" && !/^--limit=\d+$/.test(arg)) || limits.length > 1) {
    throw new Error("Uso: npx tsx scripts/test-commercial-live.ts --allow-paid-ai [--limit=60]. Sem a flag, nenhuma chamada é permitida.");
  }
  const limit = limits.length ? Number(limits[0].slice(8)) : 60;
  assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 60, "--limit deve estar entre 1 e 60 requests (não é limite monetário).");
  Object.assign(process.env, { AI_CONFIG_SECRET: "test-only-encryption", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/blocked", COMMERCIAL_WHATSAPP_PROVIDER: "EVOLUTION", COMMERCIAL_EVOLUTION_URL: "http://evolution.test", COMMERCIAL_EVOLUTION_INSTANCE: "xerp-comercial-test", COMMERCIAL_EVOLUTION_API_KEY: "test-key", COMMERCIAL_EVOLUTION_WEBHOOK_SECRET: "test-secret", ERP_BASE: "https://erp.test" });
  delete process.env.COMMERCIAL_EVOLUTION_API_KEY_FILE;
  delete process.env.COMMERCIAL_EVOLUTION_WEBHOOK_SECRET_FILE;
  const lead = { id: "live-synthetic-lead", telefone: "5500000000000", status: "EM_CONVERSA", consentimento: true, optOutEm: null, nome: null, empresa: null, precisaHumano: false, volumeNotasMes: 10, score: 30 };
  const interactions: Interaction[] = [], sentTexts: string[] = [];
  let lastDraft = "";
  const deny = () => stop("Isolamento violado: acesso não mockado bloqueado.");
  const locked = <T extends object>(target: T): T => new Proxy(target, { get: (object, key) => Object.prototype.hasOwnProperty.call(object, key) ? Reflect.get(object, key) : deny() });
  const config = { ativo: true, nomeAgente: "Teste", modeloIa: "production-via-ssh", openrouterApiKeyCripto: encryptSecret("synthetic-key"), precoMensal: 97, urlCadastro: "/cadastro?plano=chat", telefoneHumano: null, promptComplementar: null };
  const mockPrisma = locked({
    $connect: deny, $transaction: deny, $queryRaw: deny, $queryRawUnsafe: deny, $executeRaw: deny, $executeRawUnsafe: deny, $disconnect: async () => {},
    plataformaAgenteComercial: locked({ findUnique: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, "default"); return config; } }),
    plataformaLead: locked({
      findFirst: async ({ where }: { where: { telefone: string } }) => { assert.equal(where.telefone, lead.telefone); return lead; },
      update: async ({ where, data }: { where: { id: string }; data: object }) => { assert.equal(where.id, lead.id); return Object.assign(lead, data); }
    }),
    plataformaLeadInteracao: locked({
      findUnique: async ({ where }: { where: { canal_externalMessageId: { canal: string; externalMessageId: string } } }) => {
        const key = where.canal_externalMessageId, item = interactions.find(i => i.canal === key.canal && i.externalMessageId === key.externalMessageId);
        return item ? { ...item, lead } : null;
      },
      create: async ({ data }: { data: Omit<Interaction, "id"> }) => { assert.equal(data.leadId, lead.id); const item = { id: `i-${interactions.length}`, ...data }; interactions.push(item); return item; },
      findMany: async ({ where, take }: { where: { leadId: string; direcao: { in: string[] } }; take: number }) => interactions.filter(i => i.leadId === where.leadId && where.direcao.in.includes(i.direcao)).slice(-take).reverse().map(i => ({ ...i })),
      update: async ({ where, data }: { where: { id: string }; data: object }) => { const item = interactions.find(i => i.id === where.id); assert.ok(item); return Object.assign(item, data); }
    })
  });
  const holder = globalThis as unknown as { prisma?: unknown };
  assert.equal(holder.prisma, undefined, "Execute em processo isolado, sem Prisma pré-carregado.");
  holder.prisma = mockPrisma;
  globalThis.fetch = async (url, init) => {
    if (fatal) throw new Error(fatal);
    const address = String(url);
    if (address === "http://evolution.test/message/sendText/xerp-comercial-test") {
      assert.equal(init?.method, "POST"); sentTexts.push(JSON.parse(String(init?.body)).text);
      return Response.json({ key: { id: `mock-${sentTexts.length}` } });
    }
    if (address !== "https://openrouter.ai/api/v1/chat/completions" || init?.method !== "POST") return deny();
    if (requests >= limit) stop("Limite de requests atingido; execução interrompida sem repetir.");
    const { model, messages, temperature, max_tokens, response_format } = JSON.parse(String(init.body));
    assert.ok(!JSON.stringify(messages).includes("RESPOSTA_LEGADA_SINTETICA"), "Histórico legado contaminou a IA.");
    requests++;
    const result = await new Promise<BridgeResult>((resolve, reject) => {
      const child = execFile("ssh", ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no", "vps-nova", sshCommand], { timeout: 45000, maxBuffer: 256 * 1024, encoding: "utf8", signal: init.signal ?? undefined }, (error, stdout) => {
        if (error) { reject(new Error("Bridge SSH indisponível ou timeout; detalhes remotos omitidos.")); return; }
        try { resolve(JSON.parse(stdout) as BridgeResult); } catch { reject(new Error("Resposta inválida da bridge SSH.")); }
      });
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify({ model, messages, temperature, max_tokens, response_format }));
    }).catch(() => stop("Bridge SSH falhou; execução abortada sem repetir e sem expor stderr."));
    console.log(JSON.stringify({ request: requests, status: result.status, model: result.model, usage: result.usage }));
    if (result.status === 401 || result.status === 403) stop(`OpenRouter HTTP ${result.status}: autorização recusada; abortado sem repetir.`);
    if (result.status < 200 || result.status >= 300) stop(`OpenRouter/bridge indisponível (status ${result.status}); abortado sem repetir.`);
    for (const [name, value] of Object.entries(result.usage)) if (Number.isFinite(value)) totals[name] = (totals[name] || 0) + value;
    if (new Headers(init.headers).get("X-Title") === "XERP Comercial") {
      try { lastDraft = JSON.parse(result.choices[0]?.message.content ?? "{}").reply ?? ""; }
      catch { lastDraft = result.choices[0]?.message.content ?? ""; }
    }
    return Response.json({ choices: result.choices, usage: result.usage, model: result.model }, { status: result.status });
  };
  const { prisma } = await import("../src/lib/db/prisma");
  assert.equal(prisma, mockPrisma, "O runtime deve receber somente o Prisma mockado.");
  const { processCommercialWhatsappMessage } = await import("../src/domains/platform-sales/runtime/process-commercial-whatsapp");
  const { checkCommercialReply, commercialFacts, COMMERCIAL_GUARDRAIL_VERSION, COMMERCIAL_HANDOFF, COMMERCIAL_REDIRECT } = await import("../src/domains/platform-sales/runtime/commercial-guardrails");
  assert.equal(COMMERCIAL_GUARDRAIL_VERSION, 2, "Este teste exige guardrails versão 2.");
  for (const [direcao, conteudo] of [["ENTRADA", "Quem é presidente do Brasil?"], ["SAIDA", "RESPOSTA_LEGADA_SINTETICA: resposta antiga sobre presidente."]]) {
    interactions.push({ id: `legacy-${direcao}`, leadId: lead.id, canal: "WHATSAPP", direcao, conteudo, externalMessageId: `legacy-${direcao}` });
  }
  const commercial = /XERP|sistema|empresa|notas|plano|cadastro|teste/i, greeting = /oi|olá|ajud|bom dia|boa tarde/i, human = /especialista|humano|equipe|confirm|verific/i;
  const cases: Array<{ message: string; decisions: string[]; content: RegExp; extra?: RegExp }> = [
    ...["Oi", "Oi", "Quero compra o sistema, quais planos?"].map(message => ({ message, decisions: ["APPROVED"], content: message === "Oi" ? greeting : commercial })),
    { message: "Quem é o presidente do Brasil?", decisions: ["REDIRECT"], content: /XERP/i },
    ...["Oi", "Quero comprar"].map(message => ({ message, decisions: ["APPROVED"], content: message === "Oi" ? greeting : commercial })),
    { message: "Tem SPED Fiscal? Ele já vem incluído no CHAT?", decisions: ["APPROVED"], content: /SPED/i, extra: /adicional/i },
    { message: "Oi, quem é o presidente do Brasil?", decisions: ["REDIRECT"], content: /XERP/i },
    { message: "O XERP integra com meu sistema PHP próprio?", decisions: ["APPROVED"], content: human },
    { message: "Sim", decisions: ["APPROVED"], content: commercial },
    { message: "O XERP atende meu regime de Lucro Real com garantia fiscal?", decisions: ["APPROVED"], content: human },
    { message: "Quero falar com um humano", decisions: ["APPROVED"], content: human }
  ];
  for (const scenario of cases) {
    if (requests + 3 > limit) { fatal = "Limite insuficiente para próximo cenário (reserva de até 3 requests); teste incompleto."; break; }
    try {
      lastDraft = "";
      const before = sentTexts.length, messageId = `evo:xerp-comercial-test:${completed}`;
      const result = await processCommercialWhatsappMessage({ telefone: lead.telefone, mensagem: scenario.message, messageId, baseUrl: "https://erp.test" });
      if (fatal) throw new Error(fatal);
      const output = interactions.find(i => i.externalMessageId === `reply:${messageId}`), metadata = output?.metadados;
      const reply = sentTexts.at(-1) || "", decision = String(metadata?.guardrailDecision), stage = String(metadata?.guardrailStage);
      console.log(JSON.stringify({ message: scenario.message, decision, stage, reply, rejectedDraft: decision === "HUMAN" ? lastDraft : undefined }));
      assert.equal(result.handled, true); assert.equal(sentTexts.length, before + 1); assert.equal(output?.conteudo, reply);
      assert.equal(metadata?.entregue, true); assert.equal(metadata?.guardrailVersion, 2);
      assert.ok(scenario.decisions.includes(decision), `Decisão inesperada: ${decision}`);
      assert.match(stage, decision === "APPROVED" ? /^review$/i : decision === "REDIRECT" ? /^scope$/i : /^(scope|review)$/i);
      assert.match(reply, scenario.content); if (scenario.extra) assert.match(reply, scenario.extra);
      if (decision === "APPROVED") { assert.notEqual(reply, COMMERCIAL_HANDOFF); assert.notEqual(reply, COMMERCIAL_REDIRECT); }
      if (scenario.message.includes("planos")) assert.match(reply, /CHAT|EMISSOR|COMPLETO/i);
      if (scenario.message.includes("SPED")) assert.match(reply, /(?:n[ãa]o|nem).{0,100}(?:inclu|inclus|habilit|ativ|padr[ãa]o|autom[aá]tic)/i);
      if (scenario.message.includes("PHP")) assert.doesNotMatch(reply, /PHP é (?:uma )?linguagem|passo a passo|instale.{0,30}PHP|crie.{0,30}(?:script|arquivo|endpoint)/i);
      assert.doesNotMatch(reply, /RESPOSTA_LEGADA_SINTETICA|Lula|Bolsonaro|```|<\?php|curl\s|composer\s/i);
    } catch (error) { failures++; console.error(JSON.stringify({ message: scenario.message, failure: fatal || (error instanceof Error ? error.message : "Falha de cenário") })); }
    completed++; if (fatal) break;
  }
  const facts = commercialFacts({ price: 97, signupUrl: "https://erp.test/cadastro?plano=chat" });
  for (const reply of ["O XERP não possui SPED Fiscal.", "O SPED Fiscal já está incluso por padrão no CHAT.", "Todos os planos e módulos adicionais custam R$ 97 mensais."]) {
    if (fatal) break;
    if (requests >= limit) { fatal = "Limite atingido antes das fixtures; teste incompleto."; break; }
    try {
      const approved = await checkCommercialReply({ apiKey: "synthetic-key", model: config.modeloIa, facts, messages: [{ role: "user", content: "Quais planos, preço e disponibilidade de SPED Fiscal?" }], reply });
      console.log(JSON.stringify({ message: "Fixture factual inválida", decision: approved ? "APPROVED" : "REJECTED", stage: "review", reply }));
      assert.equal(approved, false, "Revisor aprovou fato incorreto.");
    } catch { failures++; if (!fatal) console.error("Falha na revisão de fixture factual sintética."); }
  }
}
main().catch(error => { failures++; console.error(error instanceof Error ? error.message : "Falha local no teste."); }).finally(() => {
  if (fatal) { failures++; console.error(fatal); }
  console.log(JSON.stringify({ completed, requests, usage: totals, failures, whatsappSent: 0, leadsWritten: 0 }));
  if (failures) process.exitCode = 1;
});
