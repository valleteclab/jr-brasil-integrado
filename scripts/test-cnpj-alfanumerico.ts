import assert from "node:assert/strict";
import { formatDocumento, isValidCnpj, normalizeDocumento } from "../src/lib/fiscal/documento";
import { deterministicCNF, montarChave, normalizeDfeKey } from "../src/domains/fiscal/providers/sefaz/chave";
import { buildEventoCancelamento } from "../src/domains/fiscal/providers/sefaz/eventos";
import { code128cValues } from "../src/domains/fiscal/providers/sefaz/danfe";

const CNPJ_OFICIAL = "12.ABC.345/01DE-35";
const cnpj = normalizeDocumento(CNPJ_OFICIAL);

assert.equal(cnpj, "12ABC34501DE35");
assert.equal(isValidCnpj(CNPJ_OFICIAL), true);
assert.equal(isValidCnpj("12.ABC.345/01DE-34"), false);
assert.equal(formatDocumento(cnpj), CNPJ_OFICIAL);

const cNF = deterministicCNF(cnpj, "55", "1", "123");
assert.equal(cNF, "96628441");
const { chave, cDV } = montarChave({
  cUF: "29",
  aamm: "2607",
  cnpj,
  mod: "55",
  serie: "1",
  nNF: "123",
  tpEmis: "1",
  cNF
});
assert.equal(chave, "29260712ABC34501DE35550010000001231966284411");
assert.equal(chave.slice(6, 20), cnpj);
assert.equal(cDV, "1");
assert.equal(normalizeDfeKey(chave.toLowerCase()), chave);

const evento = buildEventoCancelamento({
  ambiente: "HOMOLOGACAO",
  cUF: "29",
  cnpj,
  chNFe: chave,
  nProt: "129260000000001",
  xJust: "Cancelamento de teste do CNPJ alfanumerico"
});
assert.match(evento.xml, new RegExp(`<CNPJ>${cnpj}</CNPJ>`));
assert.match(evento.xml, new RegExp(`<chNFe>${chave}</chNFe>`));

const barcode = code128cValues(chave);
assert.ok(barcode.values.every(Number.isInteger));
assert.ok(barcode.values.includes(101), "o código deve alternar para Code Set A nas letras");
assert.ok(barcode.values.includes(99), "o código deve retornar ao Code Set C nos trechos numéricos");

console.log("CNPJ alfanumérico: vetores oficiais, chave DFe, evento e Code-128 A/C válidos.");
process.exit(0);
