/**
 * QR Code como SVG inline (sem <img>/base64), compartilhado pelos documentos auxiliares
 * (DANFE da NF-e, DANFSE da NFS-e). Usa a API SÍNCRONA `QRCode.create` (matriz de módulos) e
 * desenha um <rect> por módulo escuro, com zona de silêncio (margin) de 2 módulos — mantendo os
 * geradores de HTML (buildDanfe/buildDanfse) síncronos.
 */
import QRCode from "qrcode";

export function qrCodeSvg(text: string, displayPx = 96): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const bits = qr.modules.data;
  const margin = 2;
  const dim = n + margin * 2;
  let rects = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (bits[y * n + x]) rects += `<rect x="${x + margin}" y="${y + margin}" width="1" height="1"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${displayPx}" height="${displayPx}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR Code de consulta">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  );
}
