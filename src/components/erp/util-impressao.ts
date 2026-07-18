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

/** Carrega o documento num iframe oculto e dispara a impressão (silenciosa no modo quiosque). */
function imprimirViaIframe(url: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
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

  // Espera o PDF renderizar antes de mandar imprimir (o load do PDF no iframe é assíncrono).
  iframe.onload = () => window.setTimeout(disparar, 500);
  iframe.onerror = () => {
    iframe.remove();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  document.body.appendChild(iframe);
}

/**
 * Imprime um cupom/recibo respeitando a preferência da máquina: automático (iframe) quando ligado,
 * senão abre o documento em nova aba (comportamento antigo).
 */
export function imprimirCupom(url: string): void {
  if (typeof window === "undefined") return;
  if (impressaoAutoAtiva()) {
    try {
      imprimirViaIframe(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
