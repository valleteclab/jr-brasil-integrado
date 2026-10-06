/**
 * Teste do grupo IBS/CBS no DPS (NT 009 SE/CGNFS-e) — SEM REDE, SEM EMITIR.
 * Garante o contrato que protege a produção:
 *   1. chave DESLIGADA  → XML idêntico ao de hoje (leiaute 1.00, sem IBSCBS);
 *   2. chave LIGADA     → grupo IBSCBS no lugar certo (após </valores>) e leiaute 1.01;
 *   3. chave LIGADA sem cClassTrib → cai no leiaute 1.00 (não inventa classificação).
 * Uso: npx tsx scripts/test-dps-ibscbs.ts
 */
import assert from "node:assert/strict";
import { buildDpsXml } from "../src/domains/fiscal/providers/nacional-provider";
import type { EmitInput, ProviderContext } from "../src/domains/fiscal/providers/types";

const item = (extra: Record<string, unknown> = {}) => ({
  descricao: "Servico de teste", quantidade: 1, valorUnitario: 100, desconto: 0, total: 100,
  servico: true, itemListaServico: "01.05.01", codigoNbs: "111032100", ...extra
});

const input = (extra: Record<string, unknown> = {}) => ({
  document: {
    modelo: "NFSE", finalidade: "NORMAL", naturezaOperacao: "Prestacao de servico",
    ambiente: "HOMOLOGACAO", provedor: "NACIONAL", serie: "900",
    destinatario: { nome: "Cliente Teste", documento: "04214440000100", inscricaoEstadual: null, email: null, endereco: null },
    itens: [item(extra)],
    retencoes: null
  },
  emitter: { cnpj: "15130181000148", razaoSocial: "VALLETECLAB", codigoMunicipioIbge: "2919553", inscricaoMunicipal: "99014665", regime: "LUCRO_PRESUMIDO" },
  numero: 123,
  totals: { valorServicos: 100, valorIss: 2 },
  total: 100,
  computed: []
} as unknown as EmitInput);

const ctx = (ibsCbsNfse: boolean) => ({ ambiente: "HOMOLOGACAO", provedor: "NACIONAL", baseUrl: null, token: null, cscId: null, cscToken: null, ibsCbsNfse } as unknown as ProviderContext);

// 1) Desligada: nada muda (é o que protege os clientes que já emitem hoje).
const desligada = buildDpsXml(input({ cClassTribServico: "000001" }), ctx(false)).xml;
assert.ok(desligada.includes('versao="1.00"'), "chave desligada deve manter o leiaute 1.00");
assert.ok(!desligada.includes("<IBSCBS>"), "chave desligada nao pode enviar o grupo IBSCBS");

// 2) Ligada: grupo presente, na posicao do Anexo VI (depois de </valores>), leiaute 1.01.
const ligada = buildDpsXml(input({ cClassTribServico: "000001" }), ctx(true)).xml;
assert.ok(ligada.includes('versao="1.01"'), "com o grupo, o DPS passa a ser 1.01");
assert.ok(ligada.includes("<IBSCBS><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS>"), "grupo IBSCBS mal formado");
assert.ok(ligada.includes("</valores><IBSCBS>"), "IBSCBS deve vir logo apos o grupo valores");
assert.ok(ligada.endsWith("</infDPS></DPS>"), "IBSCBS deve ficar dentro do infDPS");

// 3) Ligada, mas sem classificacao: sem adivinhacao — volta ao leiaute atual.
const semClass = buildDpsXml(input(), ctx(true)).xml;
assert.ok(semClass.includes('versao="1.00"') && !semClass.includes("<IBSCBS>"), "sem cClassTrib nao envia o grupo");

// 4) CST informado no item prevalece sobre o padrao 000.
const cstProprio = buildDpsXml(input({ cClassTribServico: "000001", cstIbsCbsServico: "200" }), ctx(true)).xml;
assert.ok(cstProprio.includes("<CST>200</CST>"), "CST do item deve prevalecer");

// 5) O resto do XML e byte-a-byte igual com e sem o grupo (nenhum efeito colateral).
const semGrupo = ligada.replace("<IBSCBS><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS>", "").replace('versao="1.01"', 'versao="1.00"');
assert.equal(semGrupo.replace(/<dhEmi>[^<]*<\/dhEmi>/, ""), desligada.replace(/<dhEmi>[^<]*<\/dhEmi>/, ""), "o grupo nao pode alterar mais nada do DPS");

console.log("DPS IBS/CBS: chave desligada preserva o XML atual; ligada monta o grupo da NT 009. OK");
