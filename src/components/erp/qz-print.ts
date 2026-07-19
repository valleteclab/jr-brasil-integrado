/**
 * Impressão direta via QZ Tray (agente local instalado na máquina do caixa).
 *
 * O QZ Tray roda um serviço local (WebSocket) que a página conecta e manda imprimir DIRETO numa
 * impressora escolhida — sem diálogo, sem depender da "impressora padrão" nem de flag do navegador.
 * O PDF do cupom é buscado no navegador (autenticado) e enviado em base64 ao QZ, que imprime.
 *
 * Preferências por MÁQUINA (localStorage): método de impressão e impressora escolhida.
 */

const LS_METODO = "xerp.impressaoMetodo"; // "iframe" | "qz"
const LS_PRINTER = "xerp.qzPrinter";

export type MetodoImpressao = "iframe" | "qz";

export function metodoImpressao(): MetodoImpressao {
  if (typeof window === "undefined") return "iframe";
  try {
    return localStorage.getItem(LS_METODO) === "qz" ? "qz" : "iframe";
  } catch {
    return "iframe";
  }
}
export function setMetodoImpressao(m: MetodoImpressao): void {
  try { localStorage.setItem(LS_METODO, m); } catch { /* ignore */ }
}
export function impressoraQzSalva(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(LS_PRINTER) ?? ""; } catch { return ""; }
}
export function setImpressoraQz(nome: string): void {
  try { localStorage.setItem(LS_PRINTER, nome); } catch { /* ignore */ }
}

async function getQz(): Promise<any> {
  const mod: any = await import("qz-tray");
  return mod.default ?? mod;
}

let segurancaConfigurada = false;
/**
 * Configura a ASSINATURA das requisições ao QZ Tray: pega o certificado público da plataforma e
 * assina cada desafio via `/api/erp/qz/sign` (a chave privada fica no servidor). Assinar faz o
 * "Remember this decision" do QZ funcionar. Sem certificado configurado, segue no modo não assinado
 * (o QZ pede permissão a cada impressão).
 */
async function configurarSeguranca(qz: any): Promise<void> {
  if (segurancaConfigurada) return;
  segurancaConfigurada = true;
  try {
    const resp = await fetch("/api/erp/qz/certificate", { credentials: "include" });
    const cert = resp.ok ? (await resp.text()).trim() : "";
    if (!cert.includes("BEGIN CERTIFICATE")) return; // sem cert → modo não assinado
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(cert));
    if (typeof qz.security.setSignatureAlgorithm === "function") qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => {
      fetch("/api/erp/qz/sign", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: toSign })
      })
        .then((r) => r.json())
        .then((d) => (d?.signature ? resolve(d.signature) : reject(new Error(d?.error || "Falha ao assinar."))))
        .catch(reject);
    });
  } catch {
    /* falha no setup não trava a impressão (cai no modo não assinado) */
  }
}

/** Conecta ao QZ Tray local (reusa a conexão se já estiver ativa). */
export async function conectarQz(): Promise<any> {
  const qz = await getQz();
  await configurarSeguranca(qz);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 3, delay: 1 });
  }
  return qz;
}

export async function listarImpressorasQz(): Promise<string[]> {
  const qz = await conectarQz();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : found ? [found] : [];
}

export async function impressoraPadraoQz(): Promise<string | null> {
  const qz = await conectarQz();
  try { return await qz.printers.getDefault(); } catch { return null; }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000; // converte em blocos pra não estourar a pilha em PDFs grandes
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** Imprime um PDF (buscado autenticado no navegador) direto na impressora via QZ Tray. */
export async function imprimirPdfViaQz(pdfUrl: string, printer?: string): Promise<void> {
  const qz = await conectarQz();
  const alvo = printer || impressoraQzSalva() || (await impressoraPadraoQz()) || "";
  if (!alvo) throw new Error("Nenhuma impressora selecionada no QZ Tray.");
  const resp = await fetch(pdfUrl, { credentials: "include" });
  if (!resp.ok) throw new Error(`Falha ao carregar o documento (HTTP ${resp.status}).`);
  const base64 = arrayBufferToBase64(await resp.arrayBuffer());
  // Config afinada para cupom de bobina (ex.: Epson TM-T20, 80mm): sem margens, escala o conteúdo
  // para a largura do papel e imprime em tons de cinza (impressora térmica é monocromática).
  const cfg = qz.configs.create(alvo, { margins: 0, scaleContent: true, colorType: "grayscale", rasterize: false });
  await qz.print(cfg, [{ type: "pixel", format: "pdf", flavor: "base64", data: base64 }]);
}

/** Impressão de teste (texto simples ESC/POS) para validar a impressora escolhida. */
export async function imprimirTesteQz(printer: string): Promise<void> {
  const qz = await conectarQz();
  const cfg = qz.configs.create(printer);
  await qz.print(cfg, [
    "\n** TESTE DE IMPRESSAO - XERP **\n",
    "Impressora: " + printer + "\n",
    "Se voce esta lendo isto, a impressao\n",
    "direta via QZ Tray esta funcionando.\n\n\n\n"
  ]);
}
