/**
 * Teste do ARQUIVO gerado com crédito presumido — SEM REDE, SEM BANCO.
 *
 * O cálculo isolado já tem teste (test-credito-presumido.ts). Aqui o que importa é o que sai
 * no .txt entregue à SEFAZ: os E111 na ordem certa, o E115, e o E110 com os valores nos campos
 * certos. O campo errado no E110 é o erro que passa despercebido, porque o arquivo "abre"
 * normalmente no validador e só a conta é que fica errada.
 *
 * Cenário: outubro/2026 da Valleteclab, com o benefício do Decreto BA 23.481/2025 ligado.
 */
import { gerarSpedFiscal } from "../src/domains/fiscal/sped/gerador";
import type {
  SpedDocumento,
  SpedDocumentoItem,
  SpedInput,
  SpedItemCatalogo
} from "../src/domains/fiscal/sped/types";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}

/** O arquivo SPED é gravado em CRLF (exigência do leiaute); aqui só interessam as linhas. */
function linhasDe(conteudo: string): string[] {
  return conteudo
    .split("\n")
    .map((linha) => linha.trimEnd())
    .filter(Boolean);
}

const catalogo: SpedItemCatalogo[] = [
  { codigo: "SRV", descricao: "Servidor", gtin: null, unidade: "UN", tipoItem: "00", ncm: "84715010", cest: null },
  { codigo: "BRITA", descricao: "Brita 3/4", gtin: null, unidade: "M3", tipoItem: "00", ncm: "25171000", cest: null }
];

function item(codigo: string, cfop: string, valor: number, icms: number): SpedDocumentoItem {
  return {
    numeroItem: 1,
    codigoItem: codigo,
    descricaoComplementar: null,
    quantidade: 1,
    unidade: "UN",
    valorItem: valor,
    valorDesconto: 0,
    movimentaEstoque: true,
    cfop,
    cstIcms: "000",
    baseIcms: valor,
    aliquotaIcms: valor > 0 ? (icms / valor) * 100 : 0,
    valorIcms: icms,
    baseIcmsSt: 0,
    aliquotaIcmsSt: 0,
    valorIcmsSt: 0,
    valorReducaoBc: 0,
    cstIpi: null,
    baseIpi: 0,
    aliquotaIpi: 0,
    valorIpi: 0,
    cstPis: null,
    basePis: 0,
    aliquotaPis: 0,
    valorPis: 0,
    cstCofins: null,
    baseCofins: 0,
    aliquotaCofins: 0,
    valorCofins: 0,
    antecipacaoParcial: 0
  };
}

function doc(tipo: "SAIDA" | "ENTRADA", numero: string, itens: SpedDocumentoItem[]): SpedDocumento {
  const total = itens.reduce((s, i) => s + i.valorItem, 0);
  return {
    tipo,
    modelo: "55",
    cancelado: false,
    codigoParticipante: "P1",
    serie: "1",
    numero,
    chaveAcesso: null,
    dataEmissao: new Date(2026, 9, 15),
    dataEntradaSaida: new Date(2026, 9, 15),
    aPrazo: false,
    valorDocumento: total,
    valorDesconto: 0,
    valorMercadorias: total,
    valorFrete: 0,
    valorSeguro: 0,
    outrasDespesas: 0,
    ufDestino: "BA",
    itens,
    rotulo: `NF-e ${numero}`
  };
}

function montarInput(creditoPresumido: SpedInput["config"]["creditoPresumido"]): SpedInput {
  return {
    periodo: { ano: 2026, mes: 10, inicio: new Date(2026, 9, 1), fim: new Date(2026, 9, 31) },
    empresa: {
      razaoSocial: "EMPRESA TESTE LTDA",
      cnpj: "15130181000148",
      inscricaoEstadual: "100063019",
      inscricaoMunicipal: null,
      uf: "BA",
      codigoMunicipioIbge: "2919553",
      nomeFantasia: null,
      cep: "47800000",
      logradouro: "Rua Teste",
      numero: "1",
      complemento: null,
      bairro: "Centro",
      telefone: null,
      email: null,
      regimeTributario: "LUCRO_PRESUMIDO"
    },
    config: {
      perfilArquivo: "B",
      indAtividade: "1",
      finalidade: "ORIGINAL",
      contador: {
        nome: "Contador Teste",
        cpf: "00000000000",
        crc: "BA000000",
        cnpj: null,
        cep: "47800000",
        endereco: "Rua Teste",
        numero: "2",
        complemento: null,
        bairro: "Centro",
        telefone: null,
        email: null,
        codigoMunicipioIbge: "2919553"
      },
      codigoReceitaIcms: "046-2",
      diaVencimentoIcms: 9,
      saldoCredorAnterior: 115.72,
      saldoCredorAnteriorIpi: 0,
      antecipacaoParcialAtiva: false,
      codAjusteDebitoAntecipacao: null,
      codAjusteCreditoAntecipacao: null,
      codigoReceitaAntecipacao: null,
      diaVencimentoAntecipacao: 25,
      codAjusteCreditoCiap: null,
      gerarBlocoK: false,
      creditoPresumido
    },
    versaoLeiaute: "020",
    participantes: [
      {
        codigo: "P1",
        nome: "CLIENTE TESTE LTDA",
        cnpj: "11222333000181",
        cpf: null,
        inscricaoEstadual: null,
        codigoMunicipioIbge: "2919553",
        logradouro: "Rua A",
        numero: "10",
        complemento: null,
        bairro: "Centro",
        uf: "BA"
      }
    ],
    itensCatalogo: catalogo,
    documentos: [
      doc("SAIDA", "1", [item("SRV", "5102", 126364.98, 25904.83)]),
      doc("ENTRADA", "900", [item("BRITA", "1102", 1904.0, 390.43)])
    ],
    inventario: null,
    ciapBens: [],
    estoqueFinal: null,
    avisos: []
  };
}

const REGRA = {
  percentual: 61.11,
  ncms: ["84715010"],
  cfops: [],
  codAjusteCredito: "BA020999",
  codAjusteEstorno: "BA010999",
  codIncentivo: "BA000999"
};

// --- sem o benefício: a apuração de outubro como foi entregue ----------------
const semBeneficio = gerarSpedFiscal(montarInput(null));
const linhasSem = linhasDe(semBeneficio.conteudo);
const e110Sem = linhasSem.find((l) => l.startsWith("|E110|"))!;
conferir(
  "sem benefício, E110 mantém a apuração original",
  e110Sem,
  "|E110|25904,83|0,00|0,00|0,00|390,43|0,00|0,00|0,00|115,72|25398,68|0,00|25398,68|0,00|0,00|"
);
conferir("sem benefício, nenhum E111 é gerado", linhasSem.filter((l) => l.startsWith("|E111|")).length, 0);
conferir("sem benefício, nenhum E115 é gerado", linhasSem.filter((l) => l.startsWith("|E115|")).length, 0);

// --- com o benefício ---------------------------------------------------------
const comBeneficio = gerarSpedFiscal(montarInput(REGRA));
const linhas = linhasDe(comBeneficio.conteudo);
const e110 = linhas.find((l) => l.startsWith("|E110|"))!;
const campos = e110.split("|");

// Campo 08 (VL_TOT_AJ_CREDITOS) é onde entram os ajustes declarados em E111 — NÃO o campo 07,
// que é reservado a ajustes vindos de documento fiscal (C197/D197).
conferir("crédito presumido vai no campo 08 do E110", campos[8], "15830,44");
conferir("campo 07 (ajuste por documento) fica zerado", campos[7], "0,00");
conferir("campo 05 (estornos de crédito) fica zerado — nenhuma entrada do anexo", campos[5], "0,00");
conferir("campo 02 (débitos) não muda com o benefício", campos[2], "25904,83");
conferir("campo 06 (créditos pelas entradas) não muda", campos[6], "390,43");
conferir("ICMS a recolher cai para 9.568,24", campos[13], "9568,24");

const e111s = linhas.filter((l) => l.startsWith("|E111|"));
conferir("um E111 para o crédito presumido", e111s.length, 1);
conferir("E111 traz o código de ajuste cadastrado", e111s[0].split("|")[2], "BA020999");
conferir("E111 traz o valor do crédito presumido", e111s[0].split("|")[4], "15830,44");
conferir("E111 descreve o percentual aplicado", e111s[0].includes("61,11%"), true);

const e115s = linhas.filter((l) => l.startsWith("|E115|"));
conferir("E115 declara a operação incentivada", e115s.length, 1);
conferir("E115 usa o código do incentivo cadastrado", e115s[0].split("|")[2], "BA000999");
conferir("E115 traz o valor das saídas contempladas", e115s[0].split("|")[3], "126364,98");

// O E116 tem de acompanhar o novo valor a recolher, com o vencimento no dia 9.
const e116 = linhas.find((l) => l.startsWith("|E116|"))!;
conferir("E116 recolhe o valor já reduzido", e116.split("|")[3], "9568,24");
conferir("E116 vence em 09/11/2026", e116.split("|")[4], "09112026");

// O bloco 9 tem de contar os registros novos, senão o validador rejeita o arquivo.
const total9999 = linhas.find((l) => l.startsWith("|9999|"))!.split("|")[2];
conferir("9999 bate com o total de linhas do arquivo", Number(total9999), linhas.length);
const conta9900 = (reg: string) => {
  const l = linhas.find((x) => x.startsWith(`|9900|${reg}|`));
  return l ? Number(l.split("|")[3]) : 0;
};
conferir("9900 conta o E111", conta9900("E111"), 1);
conferir("9900 conta o E115", conta9900("E115"), 1);

// --- benefício ligado sem o código de ajuste: não escritura, mas avisa --------
const semCodigo = gerarSpedFiscal(montarInput({ ...REGRA, codAjusteCredito: null }));
const e110SemCodigo = linhasDe(semCodigo.conteudo).find((l) => l.startsWith("|E110|"))!;
conferir("sem código de ajuste, o crédito NÃO entra na apuração", e110SemCodigo.split("|")[8], "0,00");
conferir(
  "sem código de ajuste, o usuário é avisado",
  semCodigo.avisos.some((a) => a.includes("código de ajuste") && a.includes("15830,44")),
  true
);

// --- com estorno: a contrapartida do benefício -------------------------------
const comEstorno = montarInput(REGRA);
comEstorno.documentos.push(doc("ENTRADA", "901", [item("SRV", "1102", 10000, 1200)]));
const geradoEstorno = gerarSpedFiscal(comEstorno);
const camposEstorno = linhasDe(geradoEstorno.conteudo).find((l) => l.startsWith("|E110|"))!.split("|");
conferir("estorno vai no campo 05 do E110", camposEstorno[5], "733,32"); // 1200 × 61,11%
conferir("crédito da entrada do anexo soma nos créditos normais", camposEstorno[6], "1590,43");
const e111Estorno = linhasDe(geradoEstorno.conteudo).filter((l) => l.startsWith("|E111|"));
conferir("dois E111: crédito presumido e estorno", e111Estorno.length, 2);
conferir("o segundo E111 é o do estorno", e111Estorno[1].split("|")[2], "BA010999");

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) com falha.`);
process.exit(falhas === 0 ? 0 : 1);
