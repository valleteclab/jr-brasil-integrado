/**
 * Valida o gerador de SPED Fiscal (EFD ICMS/IPI) com dados reais do banco.
 *
 * Gera o arquivo em memória para uma empresa/competência e confere a estrutura:
 * número de campos por registro (leiaute 020), totalizadores (x990, 9900, 9990, 9999)
 * e imprime o resumo da apuração + primeiras linhas.
 *
 * Uso:
 *   npx tsx scripts/sped-validar.ts                # escolhe a empresa/competência com mais notas
 *   npx tsx scripts/sped-validar.ts <empresaId> <ano> <mes>
 *
 * Requer DATABASE_URL no ambiente (mesmo banco da aplicação). Não grava nada no banco.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { carregarSpedInput } from "../src/domains/fiscal/sped/dados";
import { gerarSpedFiscal } from "../src/domains/fiscal/sped/gerador";
import type { SpedInput } from "../src/domains/fiscal/sped/types";
import { dadosDaChave, parseXmlSped } from "../src/domains/fiscal/sped/xml-avulso";

// Campos esperados por registro (incluindo o próprio campo REG) — leiaute 020.
const CAMPOS_ESPERADOS: Record<string, number> = {
  "0000": 15, "0001": 2, "0005": 10, "0100": 14, "0150": 13, "0190": 3, "0200": 13, "0990": 2,
  B001: 2, B990: 2,
  C001: 2, C100: 29, C170: 38, C190: 12, C990: 2,
  D001: 2, D990: 2,
  E001: 2, E100: 3, E110: 15, E116: 10, E200: 4, E210: 15, E500: 4, E510: 6, E520: 8, E990: 2,
  G001: 2, G990: 2,
  H001: 2, H005: 4, H010: 11, H990: 2,
  K001: 2, K990: 2,
  "1001": 2, "1010": 14, "1990": 2,
  "9001": 2, "9900": 3, "9990": 2, "9999": 2
};

/** Fixture sintética cobrindo: NF-e e NFC-e de saída, cancelada, entrada com C170, ST, IPI e inventário. */
function inputSintetico(): SpedInput {
  const item = (over: Partial<SpedInput["documentos"][number]["itens"][number]> = {}) => ({
    numeroItem: 1,
    codigoItem: "SKU-001",
    descricaoComplementar: null,
    quantidade: 2,
    unidade: "UN",
    valorItem: 200,
    valorDesconto: 0,
    movimentaEstoque: true,
    cfop: "5102",
    cstIcms: "000",
    baseIcms: 200,
    aliquotaIcms: 18,
    valorIcms: 36,
    baseIcmsSt: 0,
    aliquotaIcmsSt: 0,
    valorIcmsSt: 0,
    valorReducaoBc: 0,
    cstIpi: null,
    baseIpi: 0,
    aliquotaIpi: 0,
    valorIpi: 0,
    cstPis: "01",
    basePis: 200,
    aliquotaPis: 1.65,
    valorPis: 3.3,
    cstCofins: "01",
    baseCofins: 200,
    aliquotaCofins: 7.6,
    valorCofins: 15.2,
    ...over
  });
  const docBase = {
    serie: "1",
    dataEmissao: new Date(2026, 4, 10),
    dataEntradaSaida: new Date(2026, 4, 10),
    aPrazo: false,
    valorDesconto: 0,
    valorFrete: 0,
    valorSeguro: 0,
    outrasDespesas: 0,
    ufDestino: null as string | null,
    cancelado: false
  };
  return {
    periodo: { ano: 2026, mes: 5, inicio: new Date(2026, 4, 1), fim: new Date(2026, 4, 31, 23, 59, 59) },
    empresa: {
      razaoSocial: "Empresa Teste LTDA",
      cnpj: "12345678000195",
      inscricaoEstadual: "123456789",
      inscricaoMunicipal: null,
      uf: "SP",
      codigoMunicipioIbge: "3550308",
      nomeFantasia: "Teste",
      cep: "01001000",
      logradouro: "Rua Teste",
      numero: "100",
      complemento: null,
      bairro: "Centro",
      telefone: "1133334444",
      email: "teste@empresa.com.br",
      regimeTributario: "LUCRO_PRESUMIDO"
    },
    config: {
      perfilArquivo: "B",
      indAtividade: "1",
      finalidade: "ORIGINAL",
      contador: {
        nome: "Contador Teste",
        cpf: "11122233344",
        crc: "1SP123456",
        cnpj: null,
        cep: "01001000",
        endereco: "Rua do Contador",
        numero: "10",
        complemento: null,
        bairro: "Centro",
        telefone: "1133335555",
        email: "contador@teste.com.br",
        codigoMunicipioIbge: "3550308"
      },
      codigoReceitaIcms: "046-2",
      diaVencimentoIcms: 10,
      saldoCredorAnterior: 0,
      saldoCredorAnteriorIpi: 0
    },
    versaoLeiaute: "020",
    participantes: [
      {
        codigo: "CLI1",
        nome: "Cliente Teste SA",
        cnpj: "98765432000110",
        cpf: null,
        inscricaoEstadual: "987654321",
        codigoMunicipioIbge: "3550308",
        logradouro: "Av Cliente",
        numero: "200",
        complemento: null,
        bairro: "Centro"
      },
      {
        codigo: "FORN1",
        nome: "Fornecedor Teste LTDA",
        cnpj: "11222333000144",
        cpf: null,
        inscricaoEstadual: "112233445",
        codigoMunicipioIbge: "3106200",
        logradouro: "Rua Fornecedor",
        numero: "300",
        complemento: null,
        bairro: "Industrial"
      }
    ],
    itensCatalogo: [
      { codigo: "SKU-001", descricao: "Produto Teste 1", gtin: "7891234567895", unidade: "UN", tipoItem: "00", ncm: "84099999", cest: null },
      { codigo: "SKU-002", descricao: "Produto Teste 2", gtin: null, unidade: "UN", tipoItem: "00", ncm: "40169300", cest: "0100100" }
    ],
    documentos: [
      // NF-e de saída com ST e IPI
      {
        ...docBase,
        tipo: "SAIDA",
        modelo: "55",
        codigoParticipante: "CLI1",
        numero: "101",
        chaveAcesso: "35260612345678000195550010000001011000001019",
        valorDocumento: 500.5,
        valorMercadorias: 450,
        ufDestino: "SP",
        rotulo: "NF-e 101",
        itens: [
          item(),
          item({
            numeroItem: 2,
            codigoItem: "SKU-002",
            cfop: "5405",
            cstIcms: "060",
            valorItem: 250,
            baseIcms: 0,
            aliquotaIcms: 0,
            valorIcms: 0,
            baseIcmsSt: 300,
            aliquotaIcmsSt: 18,
            valorIcmsSt: 30.5,
            cstIpi: "50",
            baseIpi: 250,
            aliquotaIpi: 8,
            valorIpi: 20
          })
        ]
      },
      // NFC-e de saída
      {
        ...docBase,
        tipo: "SAIDA",
        modelo: "65",
        codigoParticipante: null,
        numero: "5001",
        chaveAcesso: "35260612345678000195650010000050011000050013",
        dataEntradaSaida: null,
        valorDocumento: 200,
        valorMercadorias: 200,
        rotulo: "NFC-e 5001",
        itens: [item()]
      },
      // NF-e cancelada
      {
        ...docBase,
        tipo: "SAIDA",
        modelo: "55",
        cancelado: true,
        codigoParticipante: null,
        numero: "102",
        chaveAcesso: "35260612345678000195550010000001021000001024",
        valorDocumento: 0,
        valorMercadorias: 0,
        rotulo: "NF-e 102 (cancelada)",
        itens: []
      },
      // Entrada de fornecedor (gera C170 + C190 de entrada com crédito)
      {
        ...docBase,
        tipo: "ENTRADA",
        modelo: "55",
        codigoParticipante: "FORN1",
        numero: "777",
        chaveAcesso: "31260611222333000144550010000007771000007779",
        aPrazo: true,
        valorDocumento: 1000,
        valorMercadorias: 1000,
        rotulo: "Entrada NF 777",
        itens: [
          item({
            codigoItem: "SKU-001",
            cfop: "1102",
            cstIcms: "000",
            quantidade: 10,
            valorItem: 1000,
            baseIcms: 1000,
            aliquotaIcms: 12,
            valorIcms: 120,
            cstPis: null,
            basePis: 0,
            aliquotaPis: 0,
            valorPis: 0,
            cstCofins: null,
            baseCofins: 0,
            aliquotaCofins: 0,
            valorCofins: 0
          })
        ]
      }
    ],
    inventario: {
      data: new Date(2026, 4, 31),
      itens: [{ codigoItem: "SKU-001", unidade: "UN", quantidade: 50, valorUnitario: 80.5 }]
    },
    avisos: []
  };
}

/** Smoke test do parser de XML avulso (NF-e completa + evento de cancelamento). */
function validarParserXml(): number {
  let erros = 0;
  const chave = "35260611222333000144550010000007771000007779";
  const xmlNfe = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${chave}" versao="4.00">
    <ide><mod>55</mod><serie>1</serie><nNF>777</nNF><dhEmi>2026-05-10T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000144</CNPJ><xNome>Fornecedor XML LTDA</xNome><IE>112233445</IE>
      <enderEmit><xLgr>Rua F</xLgr><nro>30</nro><xBairro>Industrial</xBairro><cMun>3106200</cMun><UF>MG</UF></enderEmit></emit>
    <dest><CNPJ>12345678000195</CNPJ><xNome>Empresa Teste LTDA</xNome>
      <enderDest><xLgr>Rua T</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF></enderDest></dest>
    <det nItem="1"><prod><cProd>ABC1</cProd><xProd>Peca para revenda</xProd><cEAN>SEM GTIN</cEAN><NCM>84099999</NCM>
      <CFOP>6102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>100.00</vUnCom><vProd>1000.00</vProd></prod>
      <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>12.00</pICMS><vICMS>120.00</vICMS></ICMS00></ICMS>
      <PIS><PISAliq><CST>01</CST><vBC>1000.00</vBC><pPIS>1.65</pPIS><vPIS>16.50</vPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><CST>01</CST><vBC>1000.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>76.00</vCOFINS></COFINSAliq></COFINS></imposto></det>
    <total><ICMSTot><vBC>1000.00</vBC><vICMS>120.00</vICMS><vProd>1000.00</vProd><vNF>1000.00</vNF></ICMSTot></total>
    <cobr><dup><nDup>001</nDup><dVenc>2026-06-10</dVenc><vDup>1000.00</vDup></dup></cobr>
  </infNFe></NFe>
  <protNFe><infProt><chNFe>${chave}</chNFe></infProt></protNFe>
</nfeProc>`;
  const xmlEvento = `<?xml version="1.0"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento><infEvento><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;

  const checar = (cond: boolean, msg: string) => {
    if (!cond) {
      erros++;
      console.log(`  ✗ parser XML: ${msg}`);
    }
  };

  const doc = parseXmlSped(xmlNfe);
  checar(doc.kind === "DOCUMENTO", "NF-e não reconhecida como documento");
  if (doc.kind === "DOCUMENTO") {
    checar(doc.chaveAcesso === chave, "chave de acesso incorreta");
    checar(doc.modelo === "55" && doc.numero === "777" && doc.serie === "1", "mod/numero/serie incorretos");
    checar(doc.emitente.documento === "11222333000144" && doc.emitente.uf === "MG", "emitente incorreto");
    checar(doc.destinatario?.codigoMunicipioIbge === "3550308", "destinatário incorreto");
    checar(doc.aPrazo, "duplicata não marcou a prazo");
    const item = doc.itens[0];
    checar(item.cstIcms === "00" && item.baseIcms === 1000 && item.valorIcms === 120, "ICMS do item incorreto");
    checar(item.valorPis === 16.5 && item.valorCofins === 76, "PIS/COFINS do item incorretos");
    checar(item.gtin === null, "SEM GTIN deveria virar null");
  }

  const evento = parseXmlSped(xmlEvento);
  checar(evento.kind === "CANCELAMENTO" && evento.chaveAcesso === chave, "evento de cancelamento não reconhecido");

  const dc = dadosDaChave(chave);
  checar(dc.modelo === "55" && dc.serie === "1" && dc.numero === "777" && dc.ano === 2026 && dc.mes === 6, "dadosDaChave incorreto");
  checar(dc.emitenteDocumento === "11222333000144", "CNPJ da chave incorreto");

  console.log(erros === 0 ? "✓ Parser de XML avulso OK (NF-e completa + cancelamento + dados da chave)" : `${erros} erro(s) no parser XML`);
  return erros;
}

async function main() {
  const errosParser = validarParserXml();
  if (errosParser > 0) process.exitCode = 1;
  console.log("");

  const [empresaIdArg, anoArg, mesArg] = process.argv.slice(2);

  let empresaId = empresaIdArg ?? null;
  let tenantId: string | null = null;
  let ano = anoArg ? Number(anoArg) : 0;
  let mes = mesArg ? Number(mesArg) : 0;
  let sintetico = false;

  if (!empresaId) {
    const nota = await prisma.notaFiscal.findFirst({
      where: { status: { in: ["AUTORIZADA", "CANCELADA"] }, modelo: { in: ["NFE", "NFCE"] }, emitidaEm: { not: null } },
      orderBy: { emitidaEm: "desc" },
      select: { empresaId: true, tenantId: true, emitidaEm: true }
    });
    if (!nota?.emitidaEm) {
      console.log("Nenhuma nota autorizada no banco — validando com dados SINTÉTICOS (fixture em memória).\n");
      sintetico = true;
      ano = 2026;
      mes = 5;
    } else {
      empresaId = nota.empresaId;
      tenantId = nota.tenantId;
      ano = ano || nota.emitidaEm.getFullYear();
      mes = mes || nota.emitidaEm.getMonth() + 1;
    }
  } else {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { tenantId: true } });
    if (!empresa) throw new Error(`Empresa ${empresaId} não encontrada.`);
    tenantId = empresa.tenantId;
    if (!ano || !mes) throw new Error("Informe ano e mês: npx tsx scripts/sped-validar.ts <empresaId> <ano> <mes>");
  }

  if (!sintetico) {
    console.log(`Empresa ${empresaId} · competência ${String(mes).padStart(2, "0")}/${ano}\n`);
  }

  const input = sintetico
    ? inputSintetico()
    : await carregarSpedInput({ tenantId: tenantId!, empresaId: empresaId! }, { ano, mes });
  const gerado = gerarSpedFiscal(input);
  const linhas = gerado.conteudo.split("\r\n").filter((l) => l.length > 0);

  let erros = 0;
  const avisar = (msg: string) => { erros++; console.log(`  ✗ ${msg}`); };

  // 1) Número de campos por registro
  const contagem = new Map<string, number>();
  for (const [i, linha] of linhas.entries()) {
    if (!linha.startsWith("|") || !linha.endsWith("|")) {
      avisar(`linha ${i + 1} não começa/termina com '|': ${linha.slice(0, 60)}`);
      continue;
    }
    const campos = linha.slice(1, -1).split("|");
    const reg = campos[0];
    contagem.set(reg, (contagem.get(reg) ?? 0) + 1);
    const esperado = CAMPOS_ESPERADOS[reg];
    if (!esperado) {
      avisar(`registro inesperado ${reg} (linha ${i + 1})`);
    } else if (campos.length !== esperado) {
      avisar(`registro ${reg} (linha ${i + 1}) tem ${campos.length} campos, esperado ${esperado}`);
    }
  }

  // 2) Totalizador 9999
  const linha9999 = linhas[linhas.length - 1];
  const total9999 = Number(linha9999.split("|")[2]);
  if (total9999 !== linhas.length) avisar(`9999 informa ${total9999} linhas, arquivo tem ${linhas.length}`);

  // 3) 9900 × contagem real
  for (const linha of linhas.filter((l) => l.startsWith("|9900|"))) {
    const [, , reg, qtd] = linha.split("|");
    if (Number(qtd) !== (contagem.get(reg) ?? 0)) {
      avisar(`9900 de ${reg} informa ${qtd}, contagem real é ${contagem.get(reg) ?? 0}`);
    }
  }

  // 4) Encerramentos de bloco (x990) — soma de linhas por bloco
  const blocoDe = (reg: string) => (/^\d/.test(reg) ? reg[0] : reg[0]);
  const linhasPorBloco = new Map<string, number>();
  for (const linha of linhas) {
    const reg = linha.split("|")[1];
    const bloco = blocoDe(reg);
    linhasPorBloco.set(bloco, (linhasPorBloco.get(bloco) ?? 0) + 1);
  }
  for (const linha of linhas.filter((l) => /^\|\w990\|/.test(l))) {
    const [, reg, qtd] = linha.split("|");
    const bloco = blocoDe(reg);
    let esperado = linhasPorBloco.get(bloco) ?? 0;
    if (bloco === "9") esperado = (linhasPorBloco.get("9") ?? 0) - 1; // 9990 não conta a 9999? (confere abaixo)
    // Regra do leiaute: x990 = nº de linhas do bloco x (incluindo abertura e o próprio x990).
    // No bloco 9, a 9990 INCLUI a 9999. Portanto compara com o total do bloco.
    if (bloco === "9") esperado = linhasPorBloco.get("9") ?? 0;
    if (Number(qtd) !== esperado) avisar(`${reg} informa ${qtd} linhas, bloco ${bloco} tem ${esperado}`);
  }

  console.log(erros === 0 ? "✓ Estrutura do arquivo OK (campos, contadores e totalizadores)" : `\n${erros} problema(s) de estrutura encontrados`);

  // Resumo
  const r = gerado.resumo;
  console.log("\n--- Resumo da apuração ---");
  console.log(`Leiaute ${r.versaoLeiaute} · perfil ${r.perfilArquivo} · ${r.totalLinhas} linhas`);
  console.log(`Documentos: ${r.documentos.saidasNfe} NF-e + ${r.documentos.saidasNfce} NFC-e de saída (${r.documentos.saidasCanceladas} canceladas), ${r.documentos.entradas} entradas`);
  console.log(`ICMS: débitos ${r.apuracaoIcms.debitos.toFixed(2)} · créditos ${r.apuracaoIcms.creditos.toFixed(2)} · a recolher ${r.apuracaoIcms.icmsARecolher.toFixed(2)} · saldo credor ${r.apuracaoIcms.saldoCredorTransportar.toFixed(2)}`);
  console.log(`ICMS-ST: ${r.apuracaoIcmsSt.total.toFixed(2)} · IPI: ${r.apuracaoIpi ? `déb ${r.apuracaoIpi.debitos.toFixed(2)} / créd ${r.apuracaoIpi.creditos.toFixed(2)}` : "sem movimento"}`);
  console.log(`Registros: ${r.registros.map((x) => `${x.registro}×${x.quantidade}`).join("  ")}`);

  if (gerado.avisos.length) {
    console.log(`\n--- Avisos (${gerado.avisos.length}) ---`);
    for (const a of gerado.avisos) console.log(`  • ${a}`);
  }

  const destino = join(tmpdir(), `sped-validacao-${ano}${String(mes).padStart(2, "0")}.txt`);
  writeFileSync(destino, gerado.conteudo, "latin1");
  console.log(`\nArquivo gravado em: ${destino}`);
  console.log("\n--- Primeiras linhas ---");
  for (const l of linhas.slice(0, 20)) console.log(l);

  if (erros > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
