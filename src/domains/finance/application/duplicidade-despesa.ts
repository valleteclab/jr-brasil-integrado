/**
 * Detector de despesa lançada DUAS VEZES.
 *
 * O caso real: o pagamento da E R COSTA foi lançado pela conciliação do extrato (vira conta já
 * paga, sem fornecedor) e depois a NFS-e da mesma prestação foi importada como despesa. Dois
 * registros para um único gasto — e nada no sistema comparava os dois.
 *
 * É o resultado natural de ter vários caminhos para registrar a mesma coisa: extrato OFX, nota de
 * entrada, NFS-e recebida e lançamento manual. Nenhum deles é errado; faltava alguém olhar o
 * conjunto.
 *
 * A pontuação é propositalmente conservadora: um falso positivo irrita, um falso negativo deixa
 * a despesa dobrada no resultado do mês.
 */

export type CandidataDuplicidade = {
  id: string;
  descricao: string;
  valor: number;
  /** Data que importa para comparar: pagamento quando existe, senão vencimento. */
  data: Date;
  origem: string | null;
  fornecedorId: string | null;
  temNota: boolean;
};

export type AvaliacaoDuplicidade = {
  /** 0 a 100. Acima de 70 a tela trava e pede confirmação. */
  pontuacao: number;
  motivos: string[];
};

/** Diferença máxima de valor aceita como "mesmo valor" (centavos de arredondamento). */
const TOLERANCIA_VALOR = 0.02;
/** Janela de dias entre as duas datas para ainda ser o mesmo gasto. */
export const JANELA_DIAS = 15;
/** A partir daqui a tela exige confirmação explícita. */
export const LIMITE_SUSPEITA = 70;

const dias = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

/** Normaliza para comparar texto: sem acento, sem pontuação, minúsculo. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras em comum entre duas descrições, ignorando as curtas (de, da, ltda…). */
export function palavrasEmComum(a: string, b: string): number {
  const setA = new Set(normalizar(a).split(" ").filter((p) => p.length > 3));
  const setB = new Set(normalizar(b).split(" ").filter((p) => p.length > 3));
  let comuns = 0;
  for (const p of setA) if (setB.has(p)) comuns += 1;
  return comuns;
}

/**
 * Pontua o quanto uma conta existente parece ser a mesma despesa que está sendo lançada.
 *
 * Valor igual é condição necessária: sem isso não é a mesma despesa, por mais parecido que
 * esteja o resto. Daí somam-se proximidade de data, fornecedor e descrição.
 */
export function avaliarDuplicidade(
  nova: { valor: number; data: Date; descricao: string; fornecedorId?: string | null },
  existente: CandidataDuplicidade
): AvaliacaoDuplicidade {
  const motivos: string[] = [];

  if (Math.abs(nova.valor - existente.valor) > TOLERANCIA_VALOR) {
    return { pontuacao: 0, motivos: [] };
  }
  motivos.push(`mesmo valor (${existente.valor.toFixed(2)})`);
  let pontuacao = 50;

  const distancia = dias(nova.data, existente.data);
  if (distancia > JANELA_DIAS) {
    // Valor igual com datas distantes costuma ser mensalidade recorrente, não duplicata.
    return { pontuacao: 0, motivos: [] };
  }
  if (distancia <= 1) {
    pontuacao += 25;
    motivos.push("mesma data");
  } else if (distancia <= 5) {
    pontuacao += 15;
    motivos.push(`datas próximas (${Math.round(distancia)} dias)`);
  } else {
    pontuacao += 5;
    motivos.push(`datas na mesma quinzena (${Math.round(distancia)} dias)`);
  }

  if (nova.fornecedorId && existente.fornecedorId && nova.fornecedorId === existente.fornecedorId) {
    pontuacao += 20;
    motivos.push("mesmo fornecedor");
  }

  const comuns = palavrasEmComum(nova.descricao, existente.descricao);
  if (comuns >= 2) {
    pontuacao += 15;
    motivos.push(`descrição parecida (${comuns} palavras em comum)`);
  } else if (comuns === 1) {
    pontuacao += 8;
    motivos.push("descrição parecida (1 palavra em comum)");
  }

  // Conta vinda do extrato não tem nota: é a candidata clássica a ser a "metade sem documento"
  // do mesmo gasto que agora chega pela nota fiscal.
  if (existente.origem === "CONCILIACAO") {
    pontuacao += 10;
    motivos.push("lançada pela conciliação do extrato");
  }

  return { pontuacao: Math.min(100, pontuacao), motivos };
}
