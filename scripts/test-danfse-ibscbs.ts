/**
 * Teste do DANFSE com o grupo IBS/CBS (Reforma Tributária) — SEM REDE.
 * Usa um XML de NFS-e no formato que a SEFIN devolve (grupo IBSCBS calculado no infNFSe,
 * tipo TCRTCIBSCBS) e garante que os valores aparecem na representação gráfica.
 * Uso: npx tsx scripts/test-danfse-ibscbs.ts   (OUT=<dir> salva o HTML para inspeção)
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import { buildDanfse, parseNfse } from "../src/domains/fiscal/providers/nacional/danfse";

const ibsCbsNfse = `<IBSCBS><cLocalidadeIncid>2919553</cLocalidadeIncid><xLocalidadeIncid>Lauro de Freitas</xLocalidadeIncid>` +
  `<valores><vBC>97.50</vBC><uf><pIBSUF>0.10</pIBSUF><pAliqEfetUF>0.10</pAliqEfetUF></uf>` +
  `<mun><pIBSMun>0.00</pIBSMun><pAliqEfetMun>0.00</pAliqEfetMun></mun>` +
  `<fed><pCBS>0.90</pCBS><pAliqEfetCBS>0.90</pAliqEfetCBS></fed></valores>` +
  `<totCIBS><vTotNF>100.00</vTotNF><gIBS><vIBSTot>0.10</vIBSTot><gIBSUFTot><vIBSUF>0.10</vIBSUF></gIBSUFTot>` +
  `<gIBSMunTot><vIBSMun>0.00</vIBSMun></gIBSMunTot></gIBS><gCBS><vCBS>0.88</vCBS></gCBS></totCIBS></IBSCBS>`;

const ibsCbsDps = `<IBSCBS><finNFSe>0</finNFSe><cIndOp>100301</cIndOp><indDest>0</indDest>` +
  `<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>`;

const xmlNfse = (comRtc: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS29195532215130181000148900000000000000006912345678">
<nNFSe>69</nNFSe><cStat>100</cStat><dhProc>2026-10-06T15:15:00-03:00</dhProc><ambGer>1</ambGer><verAplic>1.00</verAplic>
<xLocEmi>Lauro de Freitas</xLocEmi><xLocPrestacao>Lauro de Freitas</xLocPrestacao><xLocIncid>Lauro de Freitas</xLocIncid>
<xTribNac>Analise e desenvolvimento de sistemas</xTribNac>
<emit><CNPJ>15130181000148</CNPJ><xNome>VALLETECLAB EMPREENDIMENTOS LTDA</xNome><IM>99014665</IM>
<enderNac><xLgr>RUA A</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><cMun>2919553</cMun><xMun>Lauro de Freitas</xMun><UF>BA</UF><CEP>42700000</CEP></enderNac></emit>
<valores><vBC>100.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>2.00</vISSQN><vTotalRet>0.00</vTotalRet><vLiq>100.00</vLiq></valores>
${comRtc ? ibsCbsNfse : ""}
<DPS><infDPS Id="DPS291955321513018100014800900000000000000069"><tpAmb>1</tpAmb><dhEmi>2026-10-06T15:14:00-03:00</dhEmi>
<dCompet>2026-10-01</dCompet><serie>900</serie><nDPS>69</nDPS><tpEmit>1</tpEmit>
<toma><CNPJ>04214440000100</CNPJ><xNome>CLIENTE TESTE</xNome><end><cMun>2919553</cMun></end></toma>
<serv><cServ><cTribNac>010501</cTribNac><cTribMun>0105</cTribMun><cNBS>111032100</cNBS><xDescServ>Servico de teste</xDescServ></cServ></serv>
<valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
<totTrib><vTotTribFed>0.00</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>0.00</vTotTribMun></totTrib></trib></valores>
${comRtc ? ibsCbsDps : ""}
</infDPS></DPS></infNFSe></NFSe>`;

// 1) Nota COM o grupo: valores da SEFIN parseados e impressos.
const comRtc = parseNfse(xmlNfse(true));
assert.ok(comRtc.ibsCbs, "o grupo IBS/CBS do infNFSe deveria ter sido lido");
assert.equal(comRtc.ibsCbs?.vBC, "97.50");
assert.equal(comRtc.ibsCbs?.vIBSUF, "0.10");
assert.equal(comRtc.ibsCbs?.vCBS, "0.88");
assert.equal(comRtc.ibsCbs?.pAliqEfetCBS, "0.90");
assert.equal(comRtc.ibsCbs?.vTotNF, "100.00");
assert.equal(comRtc.ibsCbs?.cClassTrib, "000001", "classificação enviada no DPS");
assert.equal(comRtc.ibsCbs?.cst, "000");
assert.equal(comRtc.ibsCbs?.cIndOp, "100301");

const htmlCom = buildDanfse(xmlNfse(true)).body.toString("utf8");
assert.ok(htmlCom.includes("IBS / CBS — REFORMA TRIBUTÁRIA"), "a seção IBS/CBS não saiu no DANFSE");
for (const esperado of ["97,50", "0,10%", "0,90%", "0,88", "000001"]) {
  assert.ok(htmlCom.includes(esperado), `o DANFSE deveria mostrar ${esperado}`);
}

// 2) Nota SEM o grupo (leiaute atual): DANFSE intocado, sem a seção.
const semRtc = parseNfse(xmlNfse(false));
assert.equal(semRtc.ibsCbs, null, "sem o grupo na nota, nada deve ser inventado");
const htmlSem = buildDanfse(xmlNfse(false)).body.toString("utf8");
assert.ok(!htmlSem.includes("REFORMA TRIBUTÁRIA"), "nota sem IBS/CBS não pode ganhar a seção");
assert.ok(htmlSem.includes("VALOR TOTAL DA NFS-e"), "o resto do DANFSE segue igual");

if (process.env.OUT) {
  fs.writeFileSync(`${process.env.OUT}/danfse-com-ibscbs.html`, htmlCom);
  fs.writeFileSync(`${process.env.OUT}/danfse-sem-ibscbs.html`, htmlSem);
  console.log(`HTML salvo em ${process.env.OUT}`);
}
console.log("DANFSE IBS/CBS: seção impressa com os valores da SEFIN; nota sem o grupo segue idêntica. OK");
