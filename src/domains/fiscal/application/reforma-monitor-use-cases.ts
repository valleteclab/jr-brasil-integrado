import { gunzipSync } from "zlib";
import { request as httpsRequest } from "https";
import { prisma } from "@/lib/db/prisma";
import { notificar } from "@/domains/comunicacao/application/comunicacao-use-cases";

/**
 * MONITOR da REFORMA TRIBUTÁRIA (ver docs/REFORMA-ROADMAP.md):
 *  1) Vigia as FONTES OFICIAIS (portal da NF-e e documentação da NFS-e nacional). Item novo
 *     (NT, Informe Técnico da RTC, leiaute) → notificação no sino dos ADMINISTRADORES da
 *     plataforma (resolvidos dinamicamente — nada hardcoded).
 *  2) AUTO-CHECK de prontidão: confere que as notas de PRODUÇÃO (2026+) continuam saindo com o
 *     grupo IBSCBS (regressão de leiaute → alerta crítico).
 * Roda 1×/dia (throttle interno) de carona no cron de boletos, ou sob demanda em /api/cron/reforma.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; xerp-monitor/1.0)";

type Fonte = {
  id: string;
  nome: string;
  url: string;
  /** Extrai os títulos relevantes do HTML da fonte. */
  extrair: (html: string) => string[];
};

const dedupe = (itens: string[]) => Array.from(new Set(itens.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)));

/** Extrai títulos de documentos do CONTEÚDO das páginas gov.br (Plone): anchors após #content. */
function extrairDocsGovBr(html: string): string[] {
  const pos = Math.max(html.indexOf('id="content-core"'), html.indexOf('id="content"'));
  const corpo = pos > 0 ? html.slice(pos) : html;
  const anchors = corpo.match(/<a\b[^>]*>[\s\S]{0,220}?<\/a>/g) ?? [];
  const textos = anchors
    .map((a) => decodeEntities(a.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 8 && t.length <= 160 && !t.includes("@"))
    .filter((t) => /nota t[eé]cnica|anexo|leiaute|vers[aã]o|esquema|manual|comunicado|DPS|IBS|CBS|RTC|resolu|portaria/i.test(t));
  return dedupe(textos).slice(0, 60);
}

const FONTES: Fonte[] = [
  {
    id: "nfe-portal",
    nome: "Portal da NF-e (notícias/NTs)",
    url: "https://www.nfe.fazenda.gov.br/portal/principal.aspx",
    // Toda NT/Informe Técnico é anunciado como "Publicada NT ..." / "Publicado Informe Técnico ... RTC".
    extrair: (html) => dedupe((html.match(/Publicad[ao][^<]{5,160}/g) ?? []).map(decodeEntities)).slice(0, 30),
  },
  {
    id: "nfse-rtc",
    nome: "NFS-e Nacional — RTC (leiautes IBS/CBS)",
    // AQUI saem as NTs do CGNFS-e com os leiautes IBS/CBS da NFS-e (RN_RTC_IBSCBS).
    url: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc",
    extrair: extrairDocsGovBr,
  },
  {
    id: "nfse-docs-atual",
    nome: "NFS-e Nacional — Documentação Atual (Produção)",
    url: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual",
    extrair: extrairDocsGovBr,
  },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç")
    .replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ").replace(/&acirc;/g, "â")
    .replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô");
}

/** GET https nativo devolvendo status/headers/corpo (uma requisição, sem seguir redirect). */
function httpsGet(url: string, cookieHeader: string): Promise<{ status: number; location: string | null; setCookies: string[]; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpsRequest(
      {
        method: "GET",
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { "User-Agent": UA, Accept: "text/html,*/*", ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
        // O portal da NF-e usa cadeia ICP-Brasil, ausente da CA store do Node — sem isto o TLS
        // falha (UNABLE_TO_GET_ISSUER_CERT_LOCALLY). Aceitável aqui: o monitor só LÊ títulos
        // públicos dessas páginas do governo (nada sensível é enviado).
        rejectUnauthorized: false,
        timeout: 20000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const setCookies = ([] as string[]).concat((res.headers["set-cookie"] as string[] | undefined) ?? []);
          resolve({
            status: res.statusCode ?? 0,
            location: (res.headers.location as string | undefined) ?? null,
            setCookies,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

/**
 * GET que SEGUE redirects reenviando os cookies de cada hop (o portal da NF-e faz 302 com
 * set-cookie de sessão; o fetch nativo não propaga cookies entre hops).
 */
async function fetchComCookies(url: string, maxHops = 5): Promise<string> {
  const cookies = new Map<string, string>();
  let atual = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const cookieHeader = Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; ");
    const res = await httpsGet(atual, cookieHeader);
    for (const sc of res.setCookies) {
      const par = sc.split(";")[0];
      const eq = par.indexOf("=");
      if (eq > 0) cookies.set(par.slice(0, eq).trim(), par.slice(eq + 1).trim());
    }
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error(`Redirect sem Location (HTTP ${res.status}).`);
      atual = new URL(res.location, atual).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} em ${atual}`);
    return res.body;
  }
  throw new Error("Redirects demais na fonte.");
}

/** Administradores da plataforma (dono do SaaS) com vínculo ativo — alvo das notificações. */
async function scopesDosAdminsPlataforma(): Promise<Array<{ tenantId: string; empresaId: string; usuarioId: string }>> {
  const admins = await prisma.usuario.findMany({
    where: { plataformaAdmin: true, status: "ATIVO" },
    select: { id: true, vinculos: { where: { ativo: true, empresaId: { not: null } }, take: 1, select: { tenantId: true, empresaId: true } } },
  });
  return admins
    .filter((a) => a.vinculos.length && a.vinculos[0].empresaId)
    .map((a) => ({ usuarioId: a.id, tenantId: a.vinculos[0].tenantId, empresaId: a.vinculos[0].empresaId as string }));
}

async function notificarAdmins(tipo: string, titulo: string, mensagem: string, link?: string): Promise<number> {
  const alvos = await scopesDosAdminsPlataforma();
  let n = 0;
  for (const alvo of alvos) {
    n += await notificar(
      { tenantId: alvo.tenantId, empresaId: alvo.empresaId },
      { destinoUsuarioId: alvo.usuarioId, tipo, titulo, mensagem, link: link ?? null }
    ).catch(() => 0);
  }
  return n;
}

export type MonitorReformaResult = {
  fontes: Array<{ fonte: string; itens: number; novos: string[]; erro?: string }>;
  prontidao: { nfeProducaoComIbsCbs: boolean | null; detalhe: string };
  notificacoes: number;
  pulado?: boolean;
};

/** Descomprime o XML salvo em NotaFiscal.xml (gzip+b64 / b64 / texto puro). */
function decodificarXml(raw: string | null): string {
  if (!raw) return "";
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf8");
    const texto = buf.toString("utf8");
    if (texto.trimStart().startsWith("<")) return texto;
  } catch { /* não era base64 */ }
  return raw.trimStart().startsWith("<") ? raw : "";
}

/** AUTO-CHECK: a última NF-e/NFC-e AUTORIZADA de produção (2026+) contém o grupo IBSCBS? */
async function checarProntidao(): Promise<MonitorReformaResult["prontidao"]> {
  const corte = new Date("2026-01-01T00:00:00-03:00");
  const nota = await prisma.notaFiscal.findFirst({
    where: {
      status: "AUTORIZADA",
      ambiente: "PRODUCAO",
      modelo: { in: ["NFE", "NFCE"] },
      emitidaEm: { gte: corte },
      xml: { not: null },
    },
    orderBy: { emitidaEm: "desc" },
    select: { id: true, modelo: true, emitidaEm: true, xml: true },
  });
  if (!nota) return { nfeProducaoComIbsCbs: null, detalhe: "Sem NF-e/NFC-e de produção (2026+) com XML salvo para conferir." };
  const xml = decodificarXml(nota.xml);
  if (!xml) return { nfeProducaoComIbsCbs: null, detalhe: `XML da nota ${nota.id} não pôde ser decodificado.` };
  const ok = xml.includes("<IBSCBS");
  return {
    nfeProducaoComIbsCbs: ok,
    detalhe: ok
      ? `OK — última ${nota.modelo} de produção (${nota.emitidaEm?.toISOString().slice(0, 10)}) contém o grupo IBSCBS.`
      : `⚠ Última ${nota.modelo} de produção (${nota.emitidaEm?.toISOString().slice(0, 10)}) SEM o grupo IBSCBS — regressão de leiaute!`,
  };
}

/** Já rodou nas últimas `horas`? (throttle do carona no cron de boletos — 1×/dia basta). */
async function rodouRecentemente(horas: number): Promise<boolean> {
  const ultimo = await prisma.monitorFonteFiscal.findFirst({ orderBy: { verificadoEm: "desc" }, select: { verificadoEm: true } });
  return Boolean(ultimo && Date.now() - ultimo.verificadoEm.getTime() < horas * 3600000);
}

export async function monitorarReforma(opts: { forcar?: boolean } = {}): Promise<MonitorReformaResult> {
  if (!opts.forcar && (await rodouRecentemente(20))) {
    return { fontes: [], prontidao: { nfeProducaoComIbsCbs: null, detalhe: "pulado (throttle diário)" }, notificacoes: 0, pulado: true };
  }

  let notificacoes = 0;
  const fontes: MonitorReformaResult["fontes"] = [];

  for (const fonte of FONTES) {
    try {
      const html = await fetchComCookies(fonte.url);
      const itens = fonte.extrair(html);
      const snap = await prisma.monitorFonteFiscal.findUnique({ where: { fonte: fonte.id } });
      const vistos = new Set(Array.isArray(snap?.itens) ? (snap.itens as string[]) : []);
      // Novidade = item que não estava no snapshot. Na 1ª execução (sem snapshot) só semeia, sem avisar.
      const novos = snap ? itens.filter((i) => !vistos.has(i)) : [];
      // Snapshot acumula (novos + antigos) para um item que sair da página não "voltar" como novo.
      const acumulado = dedupe([...itens, ...Array.from(vistos)]).slice(0, 200);
      await prisma.monitorFonteFiscal.upsert({
        where: { fonte: fonte.id },
        create: { fonte: fonte.id, itens: acumulado, verificadoEm: new Date() },
        update: { itens: acumulado, verificadoEm: new Date() },
      });
      for (const item of novos.slice(0, 5)) {
        notificacoes += await notificarAdmins(
          "REFORMA_FONTE",
          `📜 Novidade fiscal — ${fonte.nome}`,
          `${item} — confira a fonte oficial e o docs/REFORMA-ROADMAP.md.`,
          fonte.url
        );
      }
      fontes.push({ fonte: fonte.id, itens: itens.length, novos });
    } catch (e) {
      fontes.push({ fonte: fonte.id, itens: 0, novos: [], erro: e instanceof Error ? e.message : String(e) });
    }
  }

  const prontidao = await checarProntidao();
  if (prontidao.nfeProducaoComIbsCbs === false) {
    notificacoes += await notificarAdmins(
      "REFORMA_PRONTIDAO",
      "🚨 Nota de produção SEM grupo IBS/CBS",
      prontidao.detalhe,
      "/erp/fiscal"
    );
  }

  return { fontes, prontidao, notificacoes };
}
