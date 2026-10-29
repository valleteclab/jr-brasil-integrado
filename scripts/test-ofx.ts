/**
 * Teste do leitor de OFX — SEM REDE, SEM BANCO.
 * Cobre os dois formatos que os bancos brasileiros exportam (1.x SGML e 2.x XML), o acento em
 * Windows-1252, a data/valor do padrão e o FITID, que é o que impede importar duas vezes.
 *
 * Uso: npx tsx scripts/test-ofx.ts
 */
import assert from "node:assert/strict";
import { parseOfx, decodificarOfx, OfxParseError } from "../src/lib/ofx/parse-ofx";

/* ── OFX 1.x (SGML, tags sem fechamento, charset 1252) ──────────────────────────────────── */
const ofx1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-194.64<FITID>2026100500001<NAME>PAULISTA PARAFUSOS LTDA<MEMO>PAGAMENTO FORNECEDOR</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261010<TRNAMT>20000.00<FITID>2026101000002<NAME>CAMARA MUNICIPAL<MEMO>TRANSFERENCIA RECEBIDA</STMTTRN>
<STMTTRN><TRNTYPE>FEE<DTPOSTED>20261031<TRNAMT>-39.90<FITID>2026103100003<MEMO>TARIFA MANUTENCAO CONTA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>19765.46<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const e1 = parseOfx(Buffer.from(ofx1, "latin1"));
assert.equal(e1.banco, "341");
assert.equal(e1.conta, "12345-6");
assert.equal(e1.tipoConta, "CORRENTE");
assert.equal(e1.moeda, "BRL");
assert.equal(e1.transacoes.length, 3);
assert.equal(e1.saldo.valor, 19765.46);
assert.equal(e1.saldo.data?.toISOString().slice(0, 10), "2026-10-31");
assert.equal(e1.periodo.inicio?.toISOString().slice(0, 10), "2026-10-01");

const debito = e1.transacoes[0];
assert.equal(debito.fitid, "2026100500001");
assert.equal(debito.valor, -194.64, "débito tem que vir negativo");
assert.equal(debito.data.toISOString().slice(0, 10), "2026-10-05");
assert.equal(debito.descricao, "PAULISTA PARAFUSOS LTDA - PAGAMENTO FORNECEDOR");
assert.equal(e1.transacoes[1].valor, 20000);
assert.equal(e1.transacoes[2].descricao, "TARIFA MANUTENCAO CONTA", "sem NAME, usa o MEMO");

/* ── OFX 2.x (XML) e fatura de cartão ───────────────────────────────────────────────────── */
const ofx2 = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
    <CURDEF>BRL</CURDEF>
    <CCACCTFROM><ACCTID>************1234</ACCTID></CCACCTFROM>
    <BANKTRANLIST>
      <DTSTART>20261001</DTSTART><DTEND>20261031</DTEND>
      <STMTTRN>
        <TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261012</DTPOSTED><TRNAMT>-1398.00</TRNAMT>
        <FITID>CC2026101200077</FITID><MEMO>ALL SUPRIMENTOS INFORM&#193;TICA</MEMO>
      </STMTTRN>
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>-1398.00</BALAMT><DTASOF>20261031</DTASOF></LEDGERBAL>
  </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

const e2 = parseOfx(ofx2);
assert.equal(e2.tipoConta, "CARTAO", "arquivo de cartão precisa ser reconhecido como CARTAO");
assert.equal(e2.conta, "************1234");
assert.equal(e2.transacoes.length, 1);
assert.equal(e2.transacoes[0].valor, -1398);
assert.ok(e2.transacoes[0].descricao.includes("INFORMÁTICA"), "entidade HTML deve virar acento");

/* ── Acento em Windows-1252 ─────────────────────────────────────────────────────────────── */
const comAcento = ofx1.replace("PAGAMENTO FORNECEDOR", "DÉBITO AUTOMÁTICO");
const e3 = parseOfx(Buffer.from(comAcento, "latin1"));
assert.ok(e3.transacoes[0].descricao.includes("DÉBITO AUTOMÁTICO"), "charset 1252 deve ser decodificado em latin1");
assert.ok(decodificarOfx(Buffer.from(comAcento, "latin1")).includes("DÉBITO"));

/* ── Arquivo inválido e arquivo sem movimento ───────────────────────────────────────────── */
assert.throws(() => parseOfx("isto não é um ofx"), OfxParseError);
assert.throws(() => parseOfx("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>"), OfxParseError);

/* ── FITID ausente: a chave é derivada (data|valor|descrição) e continua estável ─────────── */
const semFitid = `<OFX><STMTTRN><DTPOSTED>20261005</DTPOSTED><TRNAMT>-10.00</TRNAMT><MEMO>PIX ENVIADO</MEMO></STMTTRN></OFX>`;
const a = parseOfx(semFitid).transacoes[0].fitid;
const b = parseOfx(semFitid).transacoes[0].fitid;
assert.equal(a, b, "sem FITID, a chave derivada precisa ser a mesma nas duas leituras");
assert.ok(a.includes("2026-10-05") && a.includes("-10.00"));

console.log(`OFX: 1.x SGML (${e1.transacoes.length} lançamentos), 2.x XML de cartão, acentuação 1252 e dedupe por FITID. OK`);
