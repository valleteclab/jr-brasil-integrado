/**
 * Detector de item de entrada vinculado ao PRODUTO ERRADO — regras puras.
 *
 * O caso real: numa nota de 21 itens de material elétrico, quem lançou apontou todos para o
 * produto "CIMENTO 50 KG CP II". Passou despercebido até a contabilidade ver o SPED com o
 * mesmo código de item em abraçadeira, disjuntor e cabo de cobre.
 *
 * O estrago não é só o SPED: o produto recebe o NCM do último item lançado (o "CIMENTO" ficou
 * com NCM de conector elétrico), o custo médio vira média de coisas diferentes e o estoque
 * acumula quantidade de produtos que nunca entraram.
 *
 * Nenhuma regra aqui olha o nome do produto contra a descrição da nota por semelhança de
 * texto: fornecedor abrevia, troca ordem e usa código próprio, então isso geraria falso
 * positivo demais. Os sinais usados são estruturais e verificáveis.
 */

export type ItemParaAnalise = {
  id: string;
  /** Descrição como veio na nota do fornecedor. */
  descricaoFornecedor: string;
  /** NCM como veio na nota. */
  ncmNota: string | null;
  produtoId: string | null;
  produtoNome: string | null;
  /** NCM cadastrado no produto vinculado. */
  ncmProduto: string | null;
  notaId: string;
};

export type Divergencia = {
  itemId: string;
  /** 0 a 100. Acima de LIMITE_REVISAO a tela pede revisão. */
  pontuacao: number;
  motivos: string[];
};

/** A partir daqui a tela destaca o item como "precisa revisar". */
export const LIMITE_REVISAO = 60;

/** Só os dígitos: "8471.50.10" e "84715010" são o mesmo NCM. */
function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Dois NCM são do mesmo tipo de mercadoria?
 *
 * Compara os 4 primeiros dígitos (a POSIÇÃO), não os 8: fornecedores classificam o mesmo
 * produto em subitens diferentes da mesma posição o tempo todo, e isso não é erro de vínculo.
 * Já posição diferente significa capítulo/tipo de mercadoria diferente — cimento (2523) contra
 * conector elétrico (8535) não tem como ser o mesmo item.
 */
export function mesmaPosicaoNcm(a: string | null, b: string | null): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 4 || y.length < 4) return true; // sem NCM confiável, não acusa
  return x.slice(0, 4) === y.slice(0, 4);
}

/**
 * Avalia os itens de um lote (tipicamente os de um período) e devolve só os suspeitos.
 *
 * Os dois sinais:
 *   1. NCM da nota em posição diferente do NCM do produto vinculado.
 *   2. O mesmo produto recebendo descrições diferentes dentro da MESMA nota — uma nota não
 *      lista o mesmo produto em várias linhas com nomes diferentes; isso é clique repetido.
 */
export function detectarVinculosDivergentes(itens: ItemParaAnalise[]): Divergencia[] {
  // Quantas descrições distintas cada produto recebeu, por nota.
  const descricoesPorProdutoNota = new Map<string, Set<string>>();
  for (const item of itens) {
    if (!item.produtoId) continue;
    const chave = `${item.notaId}|${item.produtoId}`;
    const atual = descricoesPorProdutoNota.get(chave) ?? new Set<string>();
    atual.add(item.descricaoFornecedor.trim().toLowerCase());
    descricoesPorProdutoNota.set(chave, atual);
  }

  const resultado: Divergencia[] = [];
  for (const item of itens) {
    if (!item.produtoId) continue;
    const motivos: string[] = [];
    let pontuacao = 0;

    if (!mesmaPosicaoNcm(item.ncmNota, item.ncmProduto)) {
      pontuacao += 60;
      motivos.push(`NCM da nota (${digitos(item.ncmNota)}) é de outro tipo de mercadoria que o do produto (${digitos(item.ncmProduto)})`);
    }

    const repetidas = descricoesPorProdutoNota.get(`${item.notaId}|${item.produtoId}`)?.size ?? 0;
    if (repetidas > 1) {
      // Quanto mais descrições no mesmo produto, mais claro que foi clique repetido. O teto
      // existe para o sinal não sozinho estourar a escala numa nota grande.
      pontuacao += Math.min(40, 10 * repetidas);
      motivos.push(`o produto "${item.produtoNome ?? "—"}" recebeu ${repetidas} descrições diferentes nesta mesma nota`);
    }

    if (pontuacao > 0) {
      resultado.push({ itemId: item.id, pontuacao: Math.min(100, pontuacao), motivos });
    }
  }

  return resultado.sort((a, b) => b.pontuacao - a.pontuacao);
}

/**
 * Nome sugerido para o produto novo criado a partir do item.
 *
 * Usa a descrição do fornecedor, que é a melhor informação disponível sobre o que a mercadoria
 * realmente é. Só normaliza espaços e corta no limite do campo.
 */
export function nomeSugerido(descricaoFornecedor: string, limite = 120): string {
  const limpo = descricaoFornecedor.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? limpo.slice(0, limite).trimEnd() : limpo;
}
