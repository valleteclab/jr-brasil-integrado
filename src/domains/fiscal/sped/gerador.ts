/**
 * Gerador do arquivo EFD ICMS/IPI (SPED Fiscal) — função pura, sem I/O.
 *
 * Leiaute: Ato COTEPE/ICMS 44/2018 + NT EFD ICMS IPI 2025.001 (leiaute 020, vigente a
 * partir de 01/01/2026 — Guia Prático 3.2.1). Pela NT 2025.001, os tributos da reforma
 * (CBS/IBS/IS) NÃO são escriturados nesta EFD e não integram os totais dos documentos.
 *
 * Estrutura gerada: blocos 0, B, C, D, E, G, H, K, 1 e 9, nesta ordem, cada um com
 * registro de abertura (x001) e encerramento (x990), e o bloco 9 com um 9900 por
 * registro presente + 9999 totalizador.
 */

import {
  SpedBuilder,
  campoData,
  campoDocumento,
  campoNumero,
  campoQuantidade,
  campoTexto
} from "./writer";
import type {
  SpedApuracaoIcms,
  SpedArquivoGerado,
  SpedDocumento,
  SpedInput,
  SpedLinhaCfop,
  SpedResumo
} from "./types";

/** COD_VER do registro 0000 por ano de competência (Ato COTEPE/ICMS 44/2018, anexo). */
const LEIAUTE_POR_ANO: Record<number, string> = {
  2023: "017",
  2024: "018",
  2025: "019",
  2026: "020"
};

/** Resolve o COD_VER para a competência; anos futuros usam o último leiaute conhecido. */
export function resolveVersaoLeiaute(ano: number): string {
  if (LEIAUTE_POR_ANO[ano]) return LEIAUTE_POR_ANO[ano];
  const anos = Object.keys(LEIAUTE_POR_ANO).map(Number).sort((a, b) => a - b);
  if (ano > anos[anos.length - 1]) return LEIAUTE_POR_ANO[anos[anos.length - 1]];
  return LEIAUTE_POR_ANO[anos[0]];
}

const COD_PAIS_BRASIL = "01058";

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

type ChaveAnalitica = string;

/** Agrega itens por CST_ICMS + CFOP + alíquota (registro analítico C190). */
function agregarAnalitico(documentos: SpedDocumento[]): Map<ChaveAnalitica, SpedLinhaCfop> {
  const mapa = new Map<ChaveAnalitica, SpedLinhaCfop>();
  for (const doc of documentos) {
    if (doc.cancelado) continue;
    for (const item of doc.itens) {
      const chave = `${item.cstIcms}|${item.cfop}|${campoNumero(item.aliquotaIcms)}`;
      const atual = mapa.get(chave) ?? {
        cfop: item.cfop,
        cstIcms: item.cstIcms,
        aliquota: item.aliquotaIcms,
        valorOperacao: 0,
        baseIcms: 0,
        valorIcms: 0,
        baseIcmsSt: 0,
        valorIcmsSt: 0,
        valorReducaoBc: 0,
        valorIpi: 0
      };
      // VL_OPR: valor da operação (item + ST + IPI quando não recuperável compõe o custo,
      // mas para o analítico usamos item líquido de desconto + ST + IPI, como no documento).
      atual.valorOperacao = round2(atual.valorOperacao + item.valorItem - item.valorDesconto + item.valorIcmsSt + item.valorIpi);
      atual.baseIcms = round2(atual.baseIcms + item.baseIcms);
      atual.valorIcms = round2(atual.valorIcms + item.valorIcms);
      atual.baseIcmsSt = round2(atual.baseIcmsSt + item.baseIcmsSt);
      atual.valorIcmsSt = round2(atual.valorIcmsSt + item.valorIcmsSt);
      atual.valorReducaoBc = round2(atual.valorReducaoBc + item.valorReducaoBc);
      atual.valorIpi = round2(atual.valorIpi + item.valorIpi);
      mapa.set(chave, atual);
    }
  }
  return mapa;
}

function somar(linhas: Iterable<SpedLinhaCfop>, campo: keyof SpedLinhaCfop): number {
  let total = 0;
  for (const l of linhas) total += Number(l[campo]) || 0;
  return round2(total);
}

export function gerarSpedFiscal(input: SpedInput): SpedArquivoGerado {
  const { periodo, empresa, config } = input;
  const avisos = [...input.avisos];
  const b = new SpedBuilder();

  const saidas = input.documentos.filter((d) => d.tipo === "SAIDA");
  const entradas = input.documentos.filter((d) => d.tipo === "ENTRADA");
  const saidasValidas = saidas.filter((d) => !d.cancelado);

  // -------------------------------------------------------------------------
  // Bloco 0 — abertura, identificação e referências
  // -------------------------------------------------------------------------
  b.add([
    "0000",
    input.versaoLeiaute,
    config.finalidade === "RETIFICADORA" ? "1" : "0",
    campoData(periodo.inicio),
    campoData(periodo.fim),
    campoTexto(empresa.razaoSocial),
    campoDocumento(empresa.cnpj),
    "", // CPF (pessoa jurídica)
    campoTexto(empresa.uf),
    campoDocumento(empresa.inscricaoEstadual),
    campoDocumento(empresa.codigoMunicipioIbge),
    campoDocumento(empresa.inscricaoMunicipal),
    "", // SUFRAMA
    config.perfilArquivo,
    config.indAtividade
  ]);
  b.add(["0001", "0"]);
  b.add([
    "0005",
    campoTexto(empresa.nomeFantasia || empresa.razaoSocial),
    campoDocumento(empresa.cep),
    campoTexto(empresa.logradouro),
    campoTexto(empresa.numero),
    campoTexto(empresa.complemento),
    campoTexto(empresa.bairro),
    campoDocumento(empresa.telefone),
    "", // FAX
    campoTexto(empresa.email)
  ]);
  b.add([
    "0100",
    campoTexto(config.contador.nome),
    campoDocumento(config.contador.cpf),
    campoTexto(config.contador.crc),
    campoDocumento(config.contador.cnpj),
    campoDocumento(config.contador.cep),
    campoTexto(config.contador.endereco),
    campoTexto(config.contador.numero),
    campoTexto(config.contador.complemento),
    campoTexto(config.contador.bairro),
    campoDocumento(config.contador.telefone),
    "", // FAX
    campoTexto(config.contador.email),
    campoDocumento(config.contador.codigoMunicipioIbge || empresa.codigoMunicipioIbge)
  ]);

  for (const p of input.participantes) {
    b.add([
      "0150",
      campoTexto(p.codigo),
      campoTexto(p.nome),
      COD_PAIS_BRASIL,
      campoDocumento(p.cnpj),
      campoDocumento(p.cpf),
      campoDocumento(p.inscricaoEstadual),
      campoDocumento(p.codigoMunicipioIbge),
      "", // SUFRAMA
      campoTexto(p.logradouro),
      campoTexto(p.numero),
      campoTexto(p.complemento),
      campoTexto(p.bairro)
    ]);
  }

  const unidades = new Set<string>();
  for (const i of input.itensCatalogo) unidades.add(i.unidade);
  for (const d of input.documentos) for (const it of d.itens) unidades.add(it.unidade);
  if (input.inventario) for (const it of input.inventario.itens) unidades.add(it.unidade);
  for (const u of Array.from(unidades).sort()) {
    b.add(["0190", campoTexto(u), campoTexto(u)]);
  }

  for (const item of input.itensCatalogo) {
    b.add([
      "0200",
      campoTexto(item.codigo),
      campoTexto(item.descricao),
      campoDocumento(item.gtin),
      "", // COD_ANT_ITEM
      campoTexto(item.unidade),
      item.tipoItem,
      campoDocumento(item.ncm),
      "", // EX_IPI
      "", // COD_GEN
      "", // COD_LST
      "", // ALIQ_ICMS (alíquota interna — opcional)
      campoDocumento(item.cest)
    ]);
  }

  b.add(["0990", String(b.total + 1)]);

  // -------------------------------------------------------------------------
  // Bloco B — ISS (exigido apenas pelo Distrito Federal; demais UFs: sem dados)
  // -------------------------------------------------------------------------
  const inicioB = b.total;
  b.add(["B001", "1"]);
  if (empresa.uf === "DF") {
    avisos.push(
      "Empresa do DF: o bloco B (apuração do ISS) foi gerado sem movimento. A escrituração do ISS no SPED do DF deve ser validada com o contador."
    );
  }
  b.add(["B990", String(b.total - inicioB + 1)]);

  // -------------------------------------------------------------------------
  // Bloco C — documentos fiscais de mercadorias (NF-e/NFC-e, saídas e entradas)
  // -------------------------------------------------------------------------
  const inicioC = b.total;
  const temDocumentos = input.documentos.length > 0;
  b.add(["C001", temDocumentos ? "0" : "1"]);

  for (const doc of input.documentos) {
    const entrada = doc.tipo === "ENTRADA";
    const codSit = doc.cancelado ? "02" : "00";

    if (doc.cancelado) {
      // Documento cancelado: apenas identificação (Guia Prático, exceções do C100) —
      // sem participante, valores ou registros filhos. Para mod. 55/65, chave e data.
      b.add([
        "C100",
        entrada ? "0" : "1",
        entrada ? "1" : "0",
        "",
        doc.modelo,
        codSit,
        campoTexto(doc.serie),
        campoTexto(doc.numero),
        campoDocumento(doc.chaveAcesso),
        campoData(doc.dataEmissao),
        "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
      ]);
      continue;
    }

    const baseIcms = round2(doc.itens.reduce((s, i) => s + i.baseIcms, 0));
    const valorIcms = round2(doc.itens.reduce((s, i) => s + i.valorIcms, 0));
    const baseSt = round2(doc.itens.reduce((s, i) => s + i.baseIcmsSt, 0));
    const valorSt = round2(doc.itens.reduce((s, i) => s + i.valorIcmsSt, 0));
    const valorIpi = round2(doc.itens.reduce((s, i) => s + i.valorIpi, 0));
    const valorPis = round2(doc.itens.reduce((s, i) => s + i.valorPis, 0));
    const valorCofins = round2(doc.itens.reduce((s, i) => s + i.valorCofins, 0));

    b.add([
      "C100",
      entrada ? "0" : "1", // IND_OPER
      entrada ? "1" : "0", // IND_EMIT (terceiro emite a entrada; saída é emissão própria)
      campoTexto(doc.codigoParticipante),
      doc.modelo,
      codSit,
      campoTexto(doc.serie),
      campoTexto(doc.numero),
      campoDocumento(doc.chaveAcesso),
      campoData(doc.dataEmissao),
      campoData(doc.dataEntradaSaida),
      campoNumero(doc.valorDocumento),
      doc.aPrazo ? "1" : "0", // IND_PGTO
      campoNumero(doc.valorDesconto),
      "", // VL_ABAT_NT
      campoNumero(doc.valorMercadorias),
      doc.valorFrete > 0 ? "0" : "9", // IND_FRT
      campoNumero(doc.valorFrete),
      campoNumero(doc.valorSeguro),
      campoNumero(doc.outrasDespesas),
      campoNumero(baseIcms),
      campoNumero(valorIcms),
      campoNumero(baseSt),
      campoNumero(valorSt),
      campoNumero(valorIpi),
      campoNumero(valorPis),
      campoNumero(valorCofins),
      "", // VL_PIS_ST
      ""  // VL_COFINS_ST
    ]);

    // C170: somente para documentos de TERCEIROS (entradas). Para NF-e/NFC-e de emissão
    // própria o Guia Prático determina apresentar apenas C100 + C190.
    if (entrada) {
      for (const item of doc.itens) {
        b.add([
          "C170",
          String(item.numeroItem),
          campoTexto(item.codigoItem),
          campoTexto(item.descricaoComplementar),
          campoQuantidade(item.quantidade),
          campoTexto(item.unidade),
          campoNumero(item.valorItem),
          campoNumero(item.valorDesconto),
          item.movimentaEstoque ? "0" : "1", // IND_MOV
          item.cstIcms,
          item.cfop,
          "", // COD_NAT
          campoNumero(item.baseIcms),
          campoNumero(item.aliquotaIcms),
          campoNumero(item.valorIcms),
          campoNumero(item.baseIcmsSt),
          campoNumero(item.aliquotaIcmsSt),
          campoNumero(item.valorIcmsSt),
          "0", // IND_APUR (IPI mensal)
          campoTexto(item.cstIpi),
          "", // COD_ENQ
          campoNumero(item.baseIpi),
          campoNumero(item.aliquotaIpi),
          campoNumero(item.valorIpi),
          campoTexto(item.cstPis),
          campoNumero(item.basePis),
          campoNumero(item.aliquotaPis, 4),
          "", // QUANT_BC_PIS
          "", // ALIQ_PIS (R$)
          campoNumero(item.valorPis),
          campoTexto(item.cstCofins),
          campoNumero(item.baseCofins),
          campoNumero(item.aliquotaCofins, 4),
          "", // QUANT_BC_COFINS
          "", // ALIQ_COFINS (R$)
          campoNumero(item.valorCofins),
          "", // COD_CTA
          ""  // VL_ABAT_NT
        ]);
      }
    }

    // C190 — registro analítico do documento (CST × CFOP × alíquota).
    const analitico = agregarAnalitico([doc]);
    for (const linha of Array.from(analitico.values()).sort((a, c) => a.cfop.localeCompare(c.cfop))) {
      b.add([
        "C190",
        linha.cstIcms,
        linha.cfop,
        campoNumero(linha.aliquota),
        campoNumero(linha.valorOperacao),
        campoNumero(linha.baseIcms),
        campoNumero(linha.valorIcms),
        campoNumero(linha.baseIcmsSt),
        campoNumero(linha.valorIcmsSt),
        campoNumero(linha.valorReducaoBc),
        campoNumero(linha.valorIpi),
        "" // COD_OBS
      ]);
    }
  }

  b.add(["C990", String(b.total - inicioC + 1)]);

  // -------------------------------------------------------------------------
  // Bloco D — transporte/comunicação (sem movimento neste ERP)
  // -------------------------------------------------------------------------
  const inicioD = b.total;
  b.add(["D001", "1"]);
  b.add(["D990", String(b.total - inicioD + 1)]);

  // -------------------------------------------------------------------------
  // Bloco E — apuração do ICMS (e do IPI quando houver)
  // -------------------------------------------------------------------------
  const inicioE = b.total;
  b.add(["E001", "0"]);
  b.add(["E100", campoData(periodo.inicio), campoData(periodo.fim)]);

  const analiticoSaidas = agregarAnalitico(saidasValidas);
  const analiticoEntradas = agregarAnalitico(entradas);
  const debitosIcms = somar(analiticoSaidas.values(), "valorIcms");
  const creditosIcms = somar(analiticoEntradas.values(), "valorIcms");
  const saldoCredorAnterior = round2(config.saldoCredorAnterior);

  // ICMS Antecipação Parcial (ex.: BA): guia recolhida à parte (débito especial + E116) e,
  // no regime de conta-corrente, CREDITADA na apuração via ajuste E111. Os códigos de
  // ajuste/receita são da tabela da UF — para BA há padrão embutido; demais UFs configuram.
  const nomePorParticipante = new Map(input.participantes.map((p) => [p.codigo, p.nome]));
  const antecipacaoLinhas: Array<{ numero: string; fornecedor: string; base: number; valor: number }> = [];
  for (const doc of entradas) {
    if (doc.cancelado) continue;
    const valor = round2(doc.itens.reduce((s, i) => s + i.antecipacaoParcial, 0));
    if (valor <= 0) continue;
    const base = round2(
      doc.itens.filter((i) => i.antecipacaoParcial > 0).reduce((s, i) => s + i.valorItem - i.valorDesconto, 0)
    );
    antecipacaoLinhas.push({
      numero: doc.numero ?? "—",
      fornecedor: (doc.codigoParticipante && nomePorParticipante.get(doc.codigoParticipante)) || "—",
      base,
      valor
    });
  }
  const antecipacaoTotal = round2(antecipacaoLinhas.reduce((s, l) => s + l.valor, 0));
  const ehBahia = empresa.uf === "BA";
  const codAjusteDebitoAntecip = config.codAjusteDebitoAntecipacao || (ehBahia ? "BA050004" : null);
  const codAjusteCreditoAntecip = config.codAjusteCreditoAntecipacao || (ehBahia ? "BA020002" : null);
  const codReceitaAntecip = config.codigoReceitaAntecipacao || (ehBahia ? "2175" : null);
  const antecipacaoEscriturada =
    antecipacaoTotal > 0 && Boolean(codAjusteDebitoAntecip && codAjusteCreditoAntecip);
  if (antecipacaoTotal > 0 && !antecipacaoEscriturada) {
    avisos.push(
      `ICMS antecipação parcial calculada (R$ ${antecipacaoTotal.toFixed(2).replace(".", ",")}) mas NÃO escriturada: configure os códigos de ajuste da sua UF (tabela 5.1) em Configurações do SPED.`
    );
  }

  const ajustesCredito = antecipacaoEscriturada ? antecipacaoTotal : 0;
  const debitosEspeciais = antecipacaoEscriturada ? antecipacaoTotal : 0;
  const saldoBruto = round2(debitosIcms - creditosIcms - ajustesCredito - saldoCredorAnterior);
  const saldoApurado = Math.max(saldoBruto, 0);
  const icmsARecolher = saldoApurado;
  const saldoCredorTransportar = saldoBruto < 0 ? round2(-saldoBruto) : 0;

  const apuracaoIcms: SpedApuracaoIcms = {
    debitos: debitosIcms,
    ajustesDebito: 0,
    estornosCredito: 0,
    creditos: creditosIcms,
    ajustesCredito,
    estornosDebito: 0,
    saldoCredorAnterior,
    saldoApurado,
    deducoes: 0,
    icmsARecolher,
    saldoCredorTransportar
  };

  b.add([
    "E110",
    campoNumero(debitosIcms),
    campoNumero(0), // VL_AJ_DEBITOS
    campoNumero(0), // VL_TOT_AJ_DEBITOS
    campoNumero(0), // VL_ESTORNOS_CRED
    campoNumero(creditosIcms),
    campoNumero(ajustesCredito), // VL_AJ_CREDITOS (E111 da antecipação parcial)
    campoNumero(0), // VL_TOT_AJ_CREDITOS
    campoNumero(0), // VL_ESTORNOS_DEB
    campoNumero(saldoCredorAnterior),
    campoNumero(saldoApurado),
    campoNumero(0), // VL_TOT_DED
    campoNumero(icmsARecolher),
    campoNumero(saldoCredorTransportar),
    campoNumero(debitosEspeciais) // DEB_ESP (antecipação recolhida em guia própria)
  ]);

  if (antecipacaoEscriturada) {
    b.add([
      "E111",
      campoTexto(codAjusteCreditoAntecip),
      "Credito do ICMS antecipacao parcial recolhido nas entradas interestaduais",
      campoNumero(antecipacaoTotal)
    ]);
    b.add([
      "E111",
      campoTexto(codAjusteDebitoAntecip),
      "Debito especial - ICMS antecipacao parcial das entradas interestaduais",
      campoNumero(antecipacaoTotal)
    ]);
  }

  if (icmsARecolher > 0) {
    // E116 — obrigação do ICMS a recolher. Vencimento: dia configurado do mês seguinte.
    const vencimento = new Date(periodo.ano, periodo.mes, Math.min(Math.max(config.diaVencimentoIcms, 1), 28));
    const mesRef = `${String(periodo.mes).padStart(2, "0")}${periodo.ano}`;
    if (!config.codigoReceitaIcms) {
      avisos.push(
        "ICMS a recolher sem código de receita configurado (registro E116). Informe o código da guia estadual em Configurações do SPED."
      );
    }
    b.add([
      "E116",
      "000", // COD_OR (ICMS próprio)
      campoNumero(icmsARecolher),
      campoData(vencimento),
      campoTexto(config.codigoReceitaIcms),
      "", // NUM_PROC
      "", // IND_PROC
      "", // PROC
      "Apuracao do ICMS proprio do periodo",
      mesRef
    ]);
  }

  if (antecipacaoEscriturada) {
    // E116 da antecipação parcial (guia própria — BA: DAE 2175, vencimento dia 25 do mês seguinte).
    const vencAntecip = new Date(periodo.ano, periodo.mes, Math.min(Math.max(config.diaVencimentoAntecipacao, 1), 28));
    b.add([
      "E116",
      "005", // COD_OR (ICMS antecipação tributária)
      campoNumero(antecipacaoTotal),
      campoData(vencAntecip),
      campoTexto(codReceitaAntecip),
      "", // NUM_PROC
      "", // IND_PROC
      "", // PROC
      "ICMS antecipacao parcial das entradas interestaduais do periodo",
      `${String(periodo.mes).padStart(2, "0")}${periodo.ano}`
    ]);
  }

  // ICMS-ST (E200/E210) — somente quando a empresa é substituta e destacou ST nas saídas.
  const stPorUf = new Map<string, number>();
  for (const doc of saidasValidas) {
    const st = round2(doc.itens.reduce((s, i) => s + i.valorIcmsSt, 0));
    if (st > 0) {
      const uf = doc.ufDestino || empresa.uf || "";
      stPorUf.set(uf, round2((stPorUf.get(uf) ?? 0) + st));
    }
  }
  if (stPorUf.size > 0) {
    avisos.push(
      "Há ICMS-ST destacado nas saídas (empresa substituta). Os registros E200/E210 foram gerados com a retenção do período — valide com o contador as inscrições de substituto e as guias (E250) de cada UF."
    );
    for (const [uf, valor] of Array.from(stPorUf.entries()).sort()) {
      b.add(["E200", campoTexto(uf), campoData(periodo.inicio), campoData(periodo.fim)]);
      b.add([
        "E210",
        "1", // IND_MOV_ST (com operações de ST)
        campoNumero(0), // VL_SLD_CRED_ANT_ST
        campoNumero(0), // VL_DEVOL_ST
        campoNumero(0), // VL_RESSARC_ST
        campoNumero(0), // VL_OUT_CRED_ST
        campoNumero(0), // VL_AJ_CREDITOS_ST
        campoNumero(valor), // VL_RETENCAO_ST
        campoNumero(0), // VL_OUT_DEB_ST
        campoNumero(0), // VL_AJ_DEBITOS_ST
        campoNumero(0), // VL_SLD_DEV_ANT_ST
        campoNumero(0), // VL_DEDUCOES_ST
        campoNumero(valor), // VL_ICMS_RECOL_ST
        campoNumero(0), // VL_SLD_CRED_ST_TRANSPORTAR
        campoNumero(0) // DEB_ESP_ST
      ]);
    }
  }

  // IPI (E500/E510/E520) — para estabelecimento industrial/equiparado ou quando houver IPI.
  const debitosIpi = somar(analiticoSaidas.values(), "valorIpi");
  const creditosIpiTotal = round2(
    entradas.flatMap((d) => d.itens).reduce((s, i) => s + i.valorIpi, 0)
  );
  const temIpi = config.indAtividade === "0" || debitosIpi > 0 || creditosIpiTotal > 0;
  let apuracaoIpi: SpedResumo["apuracaoIpi"] = null;
  if (temIpi) {
    b.add(["E500", "0", campoData(periodo.inicio), campoData(periodo.fim)]);

    // E510 — consolidação por CFOP × CST_IPI (entradas e saídas não canceladas).
    const consolidaIpi = new Map<string, { cfop: string; cst: string; contabil: number; base: number; valor: number }>();
    for (const doc of input.documentos) {
      if (doc.cancelado) continue;
      for (const item of doc.itens) {
        const cst = item.cstIpi || (doc.tipo === "ENTRADA" ? "49" : "99");
        const chave = `${item.cfop}|${cst}`;
        const atual = consolidaIpi.get(chave) ?? { cfop: item.cfop, cst, contabil: 0, base: 0, valor: 0 };
        atual.contabil = round2(atual.contabil + item.valorItem - item.valorDesconto);
        atual.base = round2(atual.base + item.baseIpi);
        atual.valor = round2(atual.valor + item.valorIpi);
        consolidaIpi.set(chave, atual);
      }
    }
    for (const linha of Array.from(consolidaIpi.values()).sort((a, c) => a.cfop.localeCompare(c.cfop))) {
      b.add(["E510", linha.cfop, linha.cst, campoNumero(linha.contabil), campoNumero(linha.base), campoNumero(linha.valor)]);
    }

    const saldoAnteriorIpi = round2(config.saldoCredorAnteriorIpi);
    const saldoIpiBruto = round2(debitosIpi - creditosIpiTotal - saldoAnteriorIpi);
    const saldoDevedorIpi = Math.max(saldoIpiBruto, 0);
    const saldoCredorIpi = saldoIpiBruto < 0 ? round2(-saldoIpiBruto) : 0;
    b.add([
      "E520",
      campoNumero(saldoAnteriorIpi),
      campoNumero(debitosIpi),
      campoNumero(creditosIpiTotal),
      campoNumero(0), // VL_OD_IPI
      campoNumero(0), // VL_OC_IPI
      campoNumero(saldoCredorIpi),
      campoNumero(saldoDevedorIpi)
    ]);
    apuracaoIpi = {
      debitos: debitosIpi,
      creditos: creditosIpiTotal,
      saldoCredorAnterior: saldoAnteriorIpi,
      saldoDevedor: saldoDevedorIpi,
      saldoCredorTransportar: saldoCredorIpi
    };
  }

  b.add(["E990", String(b.total - inicioE + 1)]);

  // -------------------------------------------------------------------------
  // Bloco G — CIAP (crédito de ICMS do ativo imobilizado; sem movimento)
  // -------------------------------------------------------------------------
  const inicioG = b.total;
  b.add(["G001", "1"]);
  b.add(["G990", String(b.total - inicioG + 1)]);

  // -------------------------------------------------------------------------
  // Bloco H — inventário físico (quando houver inventário concluído no período)
  // -------------------------------------------------------------------------
  const inicioH = b.total;
  if (input.inventario && input.inventario.itens.length > 0) {
    b.add(["H001", "0"]);
    const totalInv = round2(
      input.inventario.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0)
    );
    b.add(["H005", campoData(input.inventario.data), campoNumero(totalInv), "01"]);
    for (const item of input.inventario.itens) {
      const valorItem = round2(item.quantidade * item.valorUnitario);
      b.add([
        "H010",
        campoTexto(item.codigoItem),
        campoTexto(item.unidade),
        campoQuantidade(item.quantidade, 3),
        campoNumero(item.valorUnitario, 6),
        campoNumero(valorItem),
        "0", // IND_PROP (do informante, em seu poder)
        "", // COD_PART
        "", // TXT_COMPL
        "", // COD_CTA
        "" // VL_ITEM_IR
      ]);
    }
  } else {
    b.add(["H001", "1"]);
  }
  b.add(["H990", String(b.total - inicioH + 1)]);

  // -------------------------------------------------------------------------
  // Bloco K — controle de produção e estoque (sem movimento para comércio)
  // -------------------------------------------------------------------------
  const inicioK = b.total;
  b.add(["K001", "1"]);
  if (config.indAtividade === "0") {
    avisos.push(
      "Empresa industrial/equiparada: o bloco K foi gerado sem movimento. Se a SEFAZ exigir K200/K230 do seu porte, a escrituração de produção/estoque precisa ser habilitada com o contador."
    );
  }
  b.add(["K990", String(b.total - inicioK + 1)]);

  // -------------------------------------------------------------------------
  // Bloco 1 — outras informações (indicadores obrigatórios do 1010)
  // -------------------------------------------------------------------------
  const inicio1 = b.total;
  b.add(["1001", "0"]);
  // 1010: 13 indicadores de obrigatoriedade de registros do bloco 1 — nenhum se aplica.
  b.add(["1010", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N"]);
  b.add(["1990", String(b.total - inicio1 + 1)]);

  // -------------------------------------------------------------------------
  // Bloco 9 — controle e encerramento
  // -------------------------------------------------------------------------
  const inicio9 = b.total;
  b.add(["9001", "0"]);
  const registrosAntesDo9900 = b.registros();
  // Um 9900 para cada registro existente + os do próprio encerramento (9900/9990/9999).
  const totais9900 = registrosAntesDo9900.length + 3;
  for (const r of registrosAntesDo9900) {
    b.add(["9900", r.registro, String(r.quantidade)]);
  }
  b.add(["9900", "9900", String(totais9900)]);
  b.add(["9900", "9990", "1"]);
  b.add(["9900", "9999", "1"]);
  b.add(["9990", String(b.total - inicio9 + 2)]); // + a própria 9990 e a 9999
  b.add(["9999", String(b.total + 1)]); // total geral de linhas, incluindo esta

  // -------------------------------------------------------------------------
  // Resumo estruturado (tela de apuração)
  // -------------------------------------------------------------------------
  const resumo: SpedResumo = {
    competencia: `${String(periodo.mes).padStart(2, "0")}/${periodo.ano}`,
    periodo: { inicio: periodo.inicio.toISOString(), fim: periodo.fim.toISOString() },
    versaoLeiaute: input.versaoLeiaute,
    perfilArquivo: config.perfilArquivo,
    finalidade: config.finalidade,
    regimeTributario: empresa.regimeTributario,
    documentos: {
      saidasNfe: saidasValidas.filter((d) => d.modelo === "55").length,
      saidasNfce: saidasValidas.filter((d) => d.modelo === "65").length,
      saidasCanceladas: saidas.filter((d) => d.cancelado).length,
      entradas: entradas.length,
      valorSaidas: round2(saidasValidas.reduce((s, d) => s + d.valorDocumento, 0)),
      valorEntradas: round2(entradas.reduce((s, d) => s + d.valorDocumento, 0))
    },
    apuracaoIcms,
    apuracaoIcmsSt: {
      total: round2(Array.from(stPorUf.values()).reduce((s, v) => s + v, 0)),
      porUf: Array.from(stPorUf.entries()).map(([uf, valor]) => ({ uf, valor }))
    },
    antecipacaoParcial: {
      total: antecipacaoTotal,
      escriturada: antecipacaoEscriturada,
      linhas: antecipacaoLinhas
    },
    apuracaoIpi,
    pisCofins: {
      debitosPis: round2(saidasValidas.flatMap((d) => d.itens).reduce((s, i) => s + i.valorPis, 0)),
      creditosPis: round2(entradas.flatMap((d) => d.itens).reduce((s, i) => s + i.valorPis, 0)),
      debitosCofins: round2(saidasValidas.flatMap((d) => d.itens).reduce((s, i) => s + i.valorCofins, 0)),
      creditosCofins: round2(entradas.flatMap((d) => d.itens).reduce((s, i) => s + i.valorCofins, 0))
    },
    reforma: {
      observacao:
        "Leiaute 020 (NT 2025.001): CBS, IBS e IS não são escriturados na EFD ICMS/IPI e não integram os totais dos documentos. Documentos exclusivamente dos novos tributos (sem fato gerador de ICMS/IPI) ficam fora do arquivo."
    },
    saidasPorCfop: Array.from(analiticoSaidas.values()).sort((a, c) => a.cfop.localeCompare(c.cfop)),
    entradasPorCfop: Array.from(analiticoEntradas.values()).sort((a, c) => a.cfop.localeCompare(c.cfop)),
    registros: b.registros(),
    totalLinhas: b.total
  };

  return { conteudo: b.conteudo(), totalLinhas: b.total, resumo, avisos };
}
