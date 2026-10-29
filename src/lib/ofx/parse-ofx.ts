/**
 * LEITOR DE OFX (Open Financial Exchange) — extrato bancário e fatura de cartão.
 *
 * Trata os dois formatos que os bancos brasileiros exportam:
 *  - OFX 1.x: cabeçalho `CHAVE:VALOR` + corpo SGML com tags que NÃO fecham (`<TRNAMT>-10.00`);
 *  - OFX 2.x: XML bem formado.
 * A estratégia é a mesma nos dois: ler o valor que vem depois de cada tag até a próxima tag ou
 * quebra de linha — isso funciona para SGML e também para XML.
 *
 * Codificação: arquivo brasileiro costuma vir em Windows-1252/ISO-8859-1 (acentos de "DÉBITO",
 * "TRANSFERÊNCIA"). O cabeçalho declara CHARSET/ENCODING; quando declara 1252/8859-1,
 * decodificamos com latin1 — decodificar como UTF-8 quebraria os acentos em "Ã©".
 */

export type TransacaoOfx = {
  /** Identificador único da transação no banco: é o que evita importar duas vezes. */
  fitid: string;
  data: Date;
  /** Positivo = entrada; negativo = saída (como vem no OFX). */
  valor: number;
  tipo: string;
  descricao: string;
  documento: string | null;
};

export type ExtratoOfx = {
  /** BANKID (número do banco) ou, no cartão, vazio. */
  banco: string | null;
  conta: string | null;
  tipoConta: "CORRENTE" | "POUPANCA" | "CARTAO" | "OUTRO";
  moeda: string | null;
  periodo: { inicio: Date | null; fim: Date | null };
  saldo: { valor: number | null; data: Date | null };
  transacoes: TransacaoOfx[];
};

export class OfxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfxParseError";
  }
}

/** Decodifica respeitando o charset declarado no cabeçalho do OFX 1.x. */
export function decodificarOfx(buffer: Buffer): string {
  const amostra = buffer.subarray(0, 512).toString("latin1").toUpperCase();
  const latin = /CHARSET:\s*(1252|ISO-8859-1|8859-1)/.test(amostra) || /ENCODING:\s*USASCII/.test(amostra);
  if (latin) return buffer.toString("latin1");
  const utf8 = buffer.toString("utf8");
  // Texto com "�" indica que não era UTF-8 — cai para latin1.
  return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}

/** Valor de uma tag SGML/XML: tudo até a próxima tag ou fim de linha. */
function tag(texto: string, nome: string): string | null {
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i");
  return re.exec(texto)?.[1]?.trim() || null;
}

/** Data OFX: AAAAMMDD[HHMMSS][.xxx][fuso] — guardamos o dia (meio-dia UTC evita virar de dia). */
function dataOfx(valor: string | null): Date | null {
  if (!valor) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Número OFX: ponto decimal, mas alguns bancos exportam com vírgula. */
function numeroOfx(valor: string | null): number | null {
  if (!valor) return null;
  const limpo = valor.trim().replace(/\s/g, "");
  const normalizado = limpo.includes(",") && !limpo.includes(".") ? limpo.replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

const limparTexto = (v: string | null) =>
  (v ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ")
    .trim();

export function parseOfx(entrada: Buffer | string): ExtratoOfx {
  const texto = typeof entrada === "string" ? entrada : decodificarOfx(entrada);
  if (!/<OFX>/i.test(texto)) {
    throw new OfxParseError("Arquivo não parece ser um OFX (não encontrei a marcação <OFX>).");
  }

  const ehCartao = /<CCSTMTRS>|<CCACCTFROM>/i.test(texto);
  const blocoConta = /<(?:BANKACCTFROM|CCACCTFROM)>([\s\S]*?)<\/(?:BANKACCTFROM|CCACCTFROM)>/i.exec(texto)?.[1] ?? texto;

  const tipoBruto = (tag(blocoConta, "ACCTTYPE") ?? "").toUpperCase();
  const tipoConta: ExtratoOfx["tipoConta"] = ehCartao
    ? "CARTAO"
    : tipoBruto.includes("SAVING")
      ? "POUPANCA"
      : tipoBruto.includes("CHECKING")
        ? "CORRENTE"
        : "OUTRO";

  const saldoBloco = /<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i.exec(texto)?.[1] ?? "";

  const transacoes: TransacaoOfx[] = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const bloco = m[1];
    const valor = numeroOfx(tag(bloco, "TRNAMT"));
    const data = dataOfx(tag(bloco, "DTPOSTED"));
    if (valor == null || !data) continue;

    const nome = limparTexto(tag(bloco, "NAME"));
    const memo = limparTexto(tag(bloco, "MEMO"));
    // NAME costuma trazer o contraparte e MEMO o histórico; juntamos sem repetir.
    const descricao = [nome, memo && memo !== nome ? memo : ""].filter(Boolean).join(" - ") || "Lançamento do extrato";
    const fitid = limparTexto(tag(bloco, "FITID")) || `${data.toISOString().slice(0, 10)}|${valor.toFixed(2)}|${descricao}`;

    transacoes.push({
      fitid: fitid.slice(0, 120),
      data,
      valor,
      tipo: (tag(bloco, "TRNTYPE") ?? "OTHER").toUpperCase(),
      descricao: descricao.slice(0, 300),
      documento: limparTexto(tag(bloco, "CHECKNUM")) || null
    });
  }

  if (transacoes.length === 0) {
    throw new OfxParseError("Nenhum lançamento encontrado no arquivo. Confira se o período exportado tem movimento.");
  }

  const datas = transacoes.map((t) => t.data.getTime());
  return {
    banco: tag(blocoConta, "BANKID"),
    conta: tag(blocoConta, "ACCTID"),
    tipoConta,
    moeda: tag(texto, "CURDEF"),
    periodo: {
      inicio: dataOfx(tag(texto, "DTSTART")) ?? new Date(Math.min(...datas)),
      fim: dataOfx(tag(texto, "DTEND")) ?? new Date(Math.max(...datas))
    },
    saldo: { valor: numeroOfx(tag(saldoBloco, "BALAMT")), data: dataOfx(tag(saldoBloco, "DTASOF")) },
    transacoes
  };
}
