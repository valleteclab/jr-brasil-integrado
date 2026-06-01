import { deflateRawSync } from "node:zlib";

/**
 * Gerador de arquivo ZIP em Node puro (sem dependências externas). Suporta o método
 * DEFLATE (8). Suficiente para empacotar XMLs/relatórios em memória.
 * Implementa o formato APPNOTE.TXT (local file header + central directory + EOCD).
 */

type Entry = { name: string; data: Buffer };

// CRC-32 (polinômio padrão do ZIP).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Monta um ZIP (DEFLATE) com os arquivos informados. Nomes duplicados são desambiguados. */
export function createZip(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const usados = new Set<string>();
  const entries: Entry[] = files.map((f) => {
    let nome = f.name.replace(/[\\/]+/g, "_");
    let i = 2;
    while (usados.has(nome)) {
      const dot = nome.lastIndexOf(".");
      nome = dot > 0 ? `${nome.slice(0, dot)}_${i}${nome.slice(dot)}` : `${nome}_${i}`;
      i++;
    }
    usados.add(nome);
    return { name: nome, data: Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, "utf8") };
  });

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const compressed = deflateRawSync(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura local file header
    local.writeUInt16LE(20, 4); // versão
    local.writeUInt16LE(0x0800, 6); // flag: UTF-8 nos nomes
    local.writeUInt16LE(8, 8); // método: deflate
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // data (placeholder)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const localBuf = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}
