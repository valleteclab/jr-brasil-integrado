/**
 * Ajuste automático da logo da empresa para uso no DANFE/DANFCE/DANFSE.
 * Roda no navegador (canvas): redimensiona mantendo a proporção, achata em fundo branco
 * (o documento fiscal é impresso em fundo branco) e comprime para caber no limite de tamanho.
 *
 * Evita que o usuário precise editar a imagem manualmente: basta selecionar qualquer PNG/JPEG.
 */

export type LogoAjustada = {
  file: File;
  largura: number;
  altura: number;
  bytes: number;
  tipo: string;
};

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem selecionada."));
    };
    img.src = url;
  });
}

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))),
      tipo,
      qualidade
    );
  });
}

/**
 * Ajusta a logo: limita o maior lado a `maxLado` px e garante tamanho final ≤ `maxBytes`.
 * Tenta PNG (sem perdas); se exceder o limite, cai para JPEG com qualidade decrescente.
 */
export async function ajustarLogoFiscal(
  file: File,
  opts: { maxLado?: number; maxBytes?: number; fundoBranco?: boolean } = {}
): Promise<LogoAjustada> {
  const maxLado = opts.maxLado ?? 400;
  const maxBytes = opts.maxBytes ?? 200 * 1024;
  // fundoBranco=true (padrão): achata em branco — ideal para o DANFE. fundoBranco=false:
  // preserva transparência (logo do sistema sobre a barra lateral escura) e exporta sempre PNG.
  const fundoBranco = opts.fundoBranco ?? true;

  const img = await carregarImagem(file);
  const maiorLado = Math.max(img.width, img.height) || 1;
  const escala = Math.min(1, maxLado / maiorLado);
  const largura = Math.max(1, Math.round(img.width * escala));
  const altura = Math.max(1, Math.round(img.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta o ajuste automático de imagem.");
  if (fundoBranco) {
    // Achata transparência (PNG transparente fica estranho no DANFE) e evita fundo preto no JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, largura, altura);

  // Primeira tentativa: PNG (preserva nitidez de logos com texto/linhas e a transparência).
  let blob = await canvasParaBlob(canvas, "image/png");
  let tipo = "image/png";

  // Só cai para JPEG quando o fundo é branco (JPEG não tem transparência).
  if (blob.size > maxBytes && fundoBranco) {
    for (const q of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]) {
      const jpeg = await canvasParaBlob(canvas, "image/jpeg", q);
      blob = jpeg;
      tipo = "image/jpeg";
      if (jpeg.size <= maxBytes) break;
    }
  }

  const ext = tipo === "image/png" ? "png" : "jpg";
  const baseNome = (file.name.replace(/\.[^.]+$/, "") || "logo").slice(0, 40);
  const ajustada = new File([blob], `${baseNome}.${ext}`, { type: tipo });

  return { file: ajustada, largura, altura, bytes: ajustada.size, tipo };
}
