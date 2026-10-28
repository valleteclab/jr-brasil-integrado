import type { ModeloFiscal } from "@prisma/client";
import { IRRF_ESPERADO, PRESUNCOES, type TipoReceita } from "./tabelas-presuncao";

/**
 * CLASSIFICAÇÃO DA RECEITA para o lucro presumido: decide qual percentual de presunção cada nota
 * usa. A regra é a NATUREZA DA OPERAÇÃO, aplicada à receita bruta — nunca se fraciona a nota entre
 * material e mão de obra (erro comum: a separação de material existe para a base do ISS, LC
 * 116/03 art. 7º § 2º I, e para a alíquota do IRRF, IN RFB 1.234/12, não para a presunção).
 *
 * O que NÃO dá para inferir de campo nenhum é a MODALIDADE da empreitada: ela vem do contrato.
 * Por isso a obra só cai em 8%/12% quando a nota está vinculada a um contrato cadastrado como
 * empreitada TOTAL; sem vínculo, a nota de obra é classificada como serviço (32%) e o sistema
 * levanta um aviso, em vez de adivinhar a favor do contribuinte.
 */

/** Itens da LC 116 que são execução de obra (7.02 e 7.05). */
const LC116_OBRA = ["0702", "0705"];
/** Itens da LC 116 tipicamente hospitalares/saúde (4.xx) — exigem conferência dos requisitos. */
const LC116_SAUDE = "04";

export type ModalidadeObra = "TOTAL" | "PARCIAL" | "ADMINISTRACAO";

export type NotaParaClassificar = {
  modelo: ModeloFiscal;
  /** Código do item da LC 116 do primeiro serviço (com ou sem pontos). */
  itemListaServico?: string | null;
  /** Modalidade do contrato de obra vinculado à nota, quando houver. */
  modalidadeObra?: ModalidadeObra | null;
  valorServicos: number;
  valorProdutos: number;
  valorIrRetido: number;
};

export type ClassificacaoReceita = {
  tipo: TipoReceita;
  rotulo: string;
  /** Por que caiu neste tipo — vai para a memória de cálculo. */
  motivo: string;
  /** Pontos que precisam de conferência humana (não bloqueiam o cálculo). */
  avisos: string[];
};

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Receita da nota que entra na base (serviços + produtos). */
export function receitaDaNota(nota: Pick<NotaParaClassificar, "valorServicos" | "valorProdutos">): number {
  return Number(nota.valorServicos ?? 0) + Number(nota.valorProdutos ?? 0);
}

export function classificarReceita(nota: NotaParaClassificar): ClassificacaoReceita {
  const avisos: string[] = [];
  const lc116 = soDigitos(nota.itemListaServico).slice(0, 4);
  const ehObra = LC116_OBRA.includes(lc116);
  const ehSaude = soDigitos(nota.itemListaServico).slice(0, 2) === LC116_SAUDE;

  let tipo: TipoReceita;
  let motivo: string;

  if (nota.modelo === "NFE" || nota.modelo === "NFCE") {
    tipo = "MERCADORIA";
    motivo = "Nota de produto (modelo 55/65): venda de mercadoria.";
  } else if (ehObra && nota.modalidadeObra === "TOTAL") {
    tipo = "OBRA_EMPREITADA_TOTAL";
    motivo = `Item ${lc116.slice(0, 2)}.${lc116.slice(2)} da LC 116 (execução de obra) em contrato de empreitada TOTAL.`;
  } else if (ehObra) {
    tipo = "SERVICO_GERAL";
    motivo = `Item ${lc116.slice(0, 2)}.${lc116.slice(2)} da LC 116 (execução de obra) sem contrato de empreitada total vinculado.`;
    avisos.push(
      nota.modalidadeObra
        ? "Contrato vinculado está como empreitada parcial/administração — nessa modalidade a presunção é 32%, não 8%."
        : "Nota de obra sem contrato vinculado: se for empreitada TOTAL (material fornecido e incorporado à obra), vincule o contrato para cair em 8%/12%."
    );
  } else if (ehSaude) {
    tipo = "SERVICO_GERAL";
    motivo = "Serviço da área de saúde (item 4.xx da LC 116) — classificado como serviço em geral.";
    avisos.push(
      "Se a empresa for sociedade empresária com serviços hospitalares e atender aos requisitos da IN RFB 1.700/17 art. 33 § 4º, a presunção cai para 8%/12%."
    );
  } else {
    tipo = "SERVICO_GERAL";
    motivo = "Prestação de serviços em geral.";
  }

  // Conferência cruzada com a retenção do tomador (IN RFB 1.234/2012).
  const receita = receitaDaNota(nota);
  const irrf = Number(nota.valorIrRetido ?? 0);
  if (receita > 0 && irrf > 0) {
    const efetiva = irrf / receita;
    const esperada = IRRF_ESPERADO[tipo];
    const perto = (a: number, b: number) => Math.abs(a - b) <= 0.0015;
    if (esperada != null && !perto(efetiva, esperada)) {
      const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
      avisos.push(
        `O tomador reteve ${pct(efetiva)} de IRRF, e esta classificação costuma ser retida a ${pct(esperada)} ` +
          `(IN RFB 1.234/12). Confira se a classificação da nota está correta.`
      );
    }
  }

  return { tipo, rotulo: PRESUNCOES[tipo].rotulo, motivo, avisos };
}
