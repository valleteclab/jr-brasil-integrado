// Driver Playwright para passear pelo ERP tela a tela e capturar screenshots.
// Uso: node scripts/erp-walkthrough.mjs <passo>
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.ERP_BASE || "http://localhost:3000";
const SHOT = "/tmp/shots";
fs.mkdirSync(SHOT, { recursive: true });
const step = process.argv[2] || "config-open";

const log = (...a) => console.log("[wt]", ...a);
const shot = async (page, name) => {
  const p = `${SHOT}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  log("screenshot:", p);
};

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on("pageerror", (e) => log("page.error:", String(e).slice(0, 200)));

try {
  if (step === "config-open") {
    await page.goto(`${BASE}/erp/configuracoes/fiscal`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await shot(page, "01-config-inicial");
  }

  if (step === "config-acbr") {
    const CLIENT_ID = process.env.ACBR_CLIENT_ID;
    const CLIENT_SECRET = process.env.ACBR_CLIENT_SECRET;
    await page.goto(`${BASE}/erp/configuracoes/fiscal`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('select', { has: page.locator('option[value="ACBR"]') }).first().selectOption("ACBR");
    await page.locator('select', { has: page.locator('option[value="HOMOLOGACAO"]') }).first().selectOption("HOMOLOGACAO");
    await page.waitForTimeout(800);
    await shot(page, "02-acbr-selecionado");
    await page.getByLabel("Client ID", { exact: false }).fill(CLIENT_ID);
    await page.getByLabel("Client Secret", { exact: false }).fill(CLIENT_SECRET);
    await page.waitForTimeout(400);
    await shot(page, "03-credenciais-preenchidas");
    await page.getByRole("button", { name: /Salvar configura/i }).click();
    await page.waitForTimeout(2500);
    await shot(page, "04-apos-salvar");
    await page.getByRole("button", { name: /Testar conex/i }).click();
    await page.waitForTimeout(6000);
    await shot(page, "05-teste-conexao");
    const alerts = await page.locator(".alert").allInnerTexts();
    log("alerts:", JSON.stringify(alerts));
  }

  if (step === "emit-open") {
    await page.goto(`${BASE}/erp/fiscal/emitir`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await shot(page, "10-emitir-inicial");
  }

  if (step === "emit-nfe") {
    const apiResult = {};
    page.on("response", async (resp) => {
      if (resp.url().includes("/api/erp/fiscal/emitir")) {
        apiResult.url = resp.url();
        apiResult.status = resp.status();
        try { apiResult.body = await resp.json(); } catch { apiResult.body = await resp.text().catch(() => null); }
      }
    });

    await page.goto(`${BASE}/erp/fiscal/emitir`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    // NF-e já é o tipo default. Natureza da operação:
    await page.getByPlaceholder("Venda de mercadoria").fill("VENDA DE MERCADORIA");
    // Destinatário avulso (homologação NF-e exige o xNome padrão da SEFAZ).
    await page.getByRole("button", { name: "Destinatário avulso" }).click();
    await page.waitForTimeout(500);
    const byLabel = (re) => page.locator("label", { hasText: re }).locator("input, select, textarea").first();
    await byLabel(/Nome \/ Razão social/).fill("NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL");
    await byLabel(/CPF \/ CNPJ/).fill("11444777000161");
    await byLabel(/E-mail/).fill("teste@teste.com");
    await byLabel(/Logradouro/).fill("Rua Teste");
    await byLabel(/^Número/).fill("100");
    await byLabel(/Bairro/).fill("Centro");
    await byLabel(/CEP/).fill("47850000");
    await byLabel(/Cidade/).fill("Luís Eduardo Magalhães");
    await byLabel(/^UF/).selectOption("BA");
    await byLabel(/Cód\. município/).fill("2919553");
    // Item avulso.
    await page.getByRole("button", { name: /\+ Item avulso/ }).click();
    await page.waitForTimeout(500);
    await page.getByLabel("Descrição do item").fill("PRODUTO TESTE");
    await page.getByLabel("NCM").fill("84713012");
    await page.getByLabel("CFOP").fill("5102");
    await page.getByLabel("Unidade").fill("UN");
    await page.getByLabel("Quantidade").fill("1");
    await page.getByLabel("Preço unitário").fill("100");
    await page.waitForTimeout(500);
    await shot(page, "30-NFE-preenchido");

    await page.getByRole("button", { name: /Emitir NF-e/i }).click();
    for (let i = 0; i < 15 && apiResult.status === undefined; i++) await page.waitForTimeout(2000);
    await page.waitForTimeout(3000);
    await shot(page, "31-NFE-resultado");
    const alerts = await page.locator(".alert, [role=alert]").allInnerTexts().catch(() => []);
    log("emit-url:", apiResult.url);
    log("emit-status:", apiResult.status);
    log("emit-body:", JSON.stringify(apiResult.body || null).slice(0, 1200));
    log("alerts:", JSON.stringify(alerts).slice(0, 600));
    fs.writeFileSync(`${SHOT}/emit-result-NFE.json`, JSON.stringify({ apiResult, alerts, url: page.url() }, null, 2));
  }
} catch (e) {
  log("ERRO:", String(e).slice(0, 400));
  await shot(page, "erro").catch(() => {});
} finally {
  await browser.close();
}
