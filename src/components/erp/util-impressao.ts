/**
 * Impressão de cupom/recibo no PDV e no Caixa.
 *
 * Com o navegador em modo QUIOSQUE (Chrome/Edge com --kiosk-printing e a impressora térmica como
 * padrão do sistema), o cupom sai DIRETO na impressora, sem diálogo. Sem o modo quiosque, o diálogo
 * de impressão abre sozinho. Se algo falhar, cai no fallback de abrir o documento em nova aba.
 *
 * A preferência de "imprimir automático" é POR MÁQUINA (localStorage): o computador do caixa com a
 * impressora térmica deixa ligado; um tablet/consulta pode desligar e só abrir o documento.
 */

const LS_KEY = "xerp.impressaoAuto";

/** Impressão automática ligada nesta máquina? (padrão: ligada). */
export function impressaoAutoAtiva(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setImpressaoAuto(on: boolean): void {
  try {
    localStorage.setItem(LS_KEY, on ? "1" : "0");
  } catch {
    /* localStorage indisponível — ignora */
  }
}

/** Carrega o documento num iframe fora da tela e dispara a impressão (silenciosa no modo quiosque). */
function imprimirViaIframe(url: string): void {
  const iframe = document.createElement("iframe");
  // IMPORTANTE: o iframe precisa ter TAMANHO REAL para o PDF renderizar antes do print — um iframe
  // 0×0 (ou display:none) imprime EM BRANCO. Então damos dimensão de verdade e escondemos FORA da
  // tela (left negativo), não com tamanho zero.
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "820px";
  iframe.style.height = "1160px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  let disparado = false;
  const disparar = () => {
    if (disparado) return;
    disparado = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove o iframe depois — dá tempo do spool da impressora consumir o documento.
      window.setTimeout(() => iframe.remove(), 60000);
    } catch {
      iframe.remove();
      window.open(url, "_blank", "noopener,noreferrer"); // fallback: abre pra imprimir manual
    }
  };

  // Espera o PDF renderizar antes de mandar imprimir (o load do PDF no iframe é assíncrono; um
  // tempo extra garante que o visualizador de PDF pintou o conteúdo, evitando cupom em branco).
  iframe.onload = () => window.setTimeout(disparar, 700);
  iframe.onerror = () => {
    iframe.remove();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  iframe.src = url;
  document.body.appendChild(iframe);
}

/**
 * Imprime um cupom/recibo respeitando a preferência da máquina:
 *  - "qz": impressão direta via QZ Tray na impressora escolhida (sem diálogo);
 *  - "iframe" com auto ligado: dispara a impressão (silenciosa no modo quiosque, senão diálogo);
 *  - "iframe" com auto desligado: abre o documento em nova aba.
 * Import dinâmico do QZ pra não carregar a lib quando o método é o navegador.
 */
export function imprimirCupom(url: string): void {
  if (typeof window === "undefined") return;

  import("./qz-print").then(({ metodoImpressao, imprimirPdfViaQz }) => {
    if (metodoImpressao() === "qz") {
      imprimirPdfViaQz(url).catch((e) => {
        console.warn("[impressao] QZ Tray falhou, abrindo o documento:", e instanceof Error ? e.message : e);
        window.open(url, "_blank", "noopener,noreferrer");
      });
      return;
    }
    if (impressaoAutoAtiva()) {
      try { imprimirViaIframe(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }).catch(() => {
    // Se nem o módulo carregar, cai no comportamento simples.
    if (impressaoAutoAtiva()) imprimirViaIframe(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  });
}
