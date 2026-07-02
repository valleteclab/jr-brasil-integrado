/**
 * NCMs com PIS/COFINS MONOFÁSICO (tributação concentrada no fabricante/importador — a REVENDA sai
 * com alíquota ZERO e, no Simples, a receita é SEGREGADA no PGDAS-D, reduzindo o DAS).
 *
 * Referência de LEI (igual para todas as empresas — não é configuração):
 *  - Lei 10.485/2002 (Anexos I e II): AUTOPEÇAS e pneus/câmaras — o filão de quem vende autopeça.
 *  - Lei 10.147/2000: medicamentos, perfumaria e higiene pessoal (farmácias/mercados).
 *  - Lei 13.097/2015: "bebidas frias" — água, refrigerante, cerveja, energético (mercados).
 *  - Lei 9.718/98 art. 4º-5º e 10.560/02: combustíveis e derivados.
 *
 * A lista usa PREFIXOS de NCM (posição/subposição). É uma SUGESTÃO para marcação em massa —
 * a flag final fica no cadastro fiscal do produto e deve ser validada com o contador (exceções
 * existem dentro de algumas posições).
 */

type GrupoMonofasico = { lei: string; descricao: string; prefixos: string[] };

export const GRUPOS_MONOFASICOS: GrupoMonofasico[] = [
  {
    lei: "Lei 10.485/2002 (Anexos I/II)",
    descricao: "Autopeças, pneus e câmaras de ar",
    prefixos: [
      // Pneus novos e câmaras de ar (art. 5º)
      "4011", "4013",
      // Anexos I/II — principais posições de autopeças
      "40161010", "40169990", // borracha (juntas, coxins)
      "6813", // guarnições de fricção (pastilhas/lonas de freio)
      "700711", "700721", // vidros temperados/laminados p/ veículos
      "700910", // espelhos retrovisores
      "7320", // molas
      "830120", // fechaduras p/ veículos
      "830230", // guarnições/ferragens p/ veículos
      "8407.3", "840790", // motores de pistão p/ veículos (posições 8407.31-34)
      "8408.2", "840890", // motores diesel p/ veículos
      "8409", // partes de motores
      "841330", // bombas de combustível/óleo/refrigeração
      "841459", "84148011", "841490", // ventiladores/compressores veiculares
      "84212300", "84213100", // filtros de óleo/combustível e de ar
      "8483", // virabrequins, engrenagens, embreagens (árvores de transmissão)
      "8482", // rolamentos
      "8505.20", // embreagens eletromagnéticas
      "850710", // baterias (acumuladores de chumbo p/ motores de pistão)
      "8511", // equipamentos de ignição (velas, bobinas, alternadores, motores de arranque)
      "8512.20", "851230", "851240", "851290", // faróis, buzinas, limpadores, partes
      "852721", "852729", // auto-rádios
      "8536.50.90", // interruptores
      "8544.30", // jogos de fios (chicotes)
      "870600", // chassis com motor
      "8707", // carrocerias e cabines
      "8708", // PARTES E ACESSÓRIOS de veículos (a grande posição das autopeças)
      "940120" // assentos p/ veículos
    ]
  },
  {
    lei: "Lei 10.147/2000",
    descricao: "Medicamentos, perfumaria e higiene pessoal",
    prefixos: [
      "3001", "3002", "3003", "3004", "300510", "300590", "300610", "300630", "300660", // fármacos/medicamentos
      "3303", "3304", "3305", "3306", "3307", // perfumes, maquiagem, capilares, bucal, barbear/desodorantes
      "34011190", "34012010", "96032100" // sabonetes, escovas de dente
    ]
  },
  {
    lei: "Lei 13.097/2015",
    descricao: "Bebidas frias (água, refrigerante, cerveja, energético)",
    prefixos: [
      "22011000", // água mineral/gaseificada
      "2202", // refrigerantes, isotônicos, energéticos
      "2203", // cerveja de malte
      "21069010" // preparações p/ refrigerantes (xarope/concentrado)
    ]
  },
  {
    lei: "Lei 9.718/98 e 10.560/02",
    descricao: "Combustíveis e derivados",
    prefixos: [
      "2710", // gasolina, diesel, óleos, querosene
      "2711", // GLP e gás natural
      "220710", "22072019", "22089000", // álcool (etanol hidratado/anidro)
      "271112", "271113", "271119"
    ]
  }
];

/** O NCM (8 dígitos, com ou sem pontos) casa com algum grupo monofásico? Devolve o grupo ou null. */
export function grupoMonofasicoDoNcm(ncm: string | null | undefined): GrupoMonofasico | null {
  const limpo = (ncm ?? "").replace(/\D+/g, "");
  if (limpo.length < 4) return null;
  for (const grupo of GRUPOS_MONOFASICOS) {
    for (const prefixo of grupo.prefixos) {
      const p = prefixo.replace(/\D+/g, "");
      if (limpo.startsWith(p)) return grupo;
    }
  }
  return null;
}
