/**
 * Quando confiar no vínculo automático de um item da NF-e com um produto já cadastrado.
 *
 * O problema real que originou isto: um item "mini pc" foi vinculado a "brita" com 100% de
 * confiança e sem marcar revisão. A causa não foi semelhança de nome — foi o código do
 * fornecedor bater com o SKU interno de outro produto.
 *
 * Código de fornecedor NÃO é único no mundo: "7", "001" e "123" se repetem entre fornecedores.
 * Como produtos criados a partir de entradas nascem com o código do fornecedor virando SKU,
 * dois itens sem relação nenhuma acabam colidindo.
 *
 * O princípio aqui é: na dúvida, NÃO sugerir. Item sem vínculo aparece na conferência e alguém
 * resolve; vínculo errado com 100% de confiança passa batido e entra no estoque errado.
 */

/** Abaixo disso o código é genérico demais para casar sozinho ("7", "001", "12"). */
export const MIN_CARACTERES_CODIGO_CONFIAVEL = 4;

export type AvaliacaoMatch = {
  /** Aceita o vínculo automático? Quando false, o item fica sem produto e vai para conferência. */
  aceitar: boolean;
  confianca: number;
  /** Marca o item como "revisar" na tela, mesmo aceitando. */
  revisar: boolean;
  /** Explicação curta para a tela e para o log. */
  motivo: string;
};

/**
 * Avalia um casamento por SKU — o critério mais frágil, porque compara o código de UM fornecedor
 * com o código interno da empresa.
 */
export function avaliarMatchPorSku(args: {
  codigoFornecedor: string;
  /** O produto encontrado já está vinculado a algum fornecedor DIFERENTE do da nota. */
  vinculadoAOutroFornecedor: boolean;
}): AvaliacaoMatch {
  const codigo = args.codigoFornecedor.trim();

  if (codigo.length < MIN_CARACTERES_CODIGO_CONFIAVEL) {
    return {
      aceitar: false,
      confianca: 0,
      revisar: true,
      motivo: `Código "${codigo}" é curto demais para casar sozinho — códigos genéricos se repetem entre fornecedores.`
    };
  }

  if (args.vinculadoAOutroFornecedor) {
    return {
      aceitar: false,
      confianca: 0,
      revisar: true,
      motivo: "O produto com esse código já pertence a outro fornecedor — provável coincidência de código."
    };
  }

  return { aceitar: true, confianca: 100, revisar: false, motivo: "SKU idêntico ao código do fornecedor." };
}
