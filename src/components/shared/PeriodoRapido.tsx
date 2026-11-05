"use client";

import { anoCorrente, mesRelativo, ultimosDias, type Faixa } from "@/lib/periodo";

/**
 * Atalhos de período para listas filtradas por data (contas a pagar/receber, extrato, relatórios).
 *
 * Nasceu de um pedido de cliente no financeiro: ninguém quer digitar duas datas para ver
 * "o mês passado". Os botões apenas preenchem o par (de, ate) que a tela já usava, então o
 * filtro manual continua valendo e dá para ajustar a data depois de clicar num atalho.
 * O cálculo das faixas mora em `@/lib/periodo`, onde é testado.
 */

export type AtalhoPeriodo = { rotulo: string; titulo: string; faixa: () => Faixa };

/** Ordem pensada para o financeiro: o mês corrente primeiro, depois o fechado, depois o que vem. */
export const ATALHOS_PERIODO: AtalhoPeriodo[] = [
  { rotulo: "Este mês", titulo: "Do dia 1º ao último dia do mês atual", faixa: () => mesRelativo(0) },
  { rotulo: "Mês anterior", titulo: "Mês fechado anterior", faixa: () => mesRelativo(-1) },
  { rotulo: "Próximo mês", titulo: "O que vence no mês que vem", faixa: () => mesRelativo(1) },
  { rotulo: "Hoje", titulo: "Somente a data de hoje", faixa: () => ultimosDias(1) },
  { rotulo: "Últimos 30 dias", titulo: "Os 30 dias terminando hoje", faixa: () => ultimosDias(30) },
  { rotulo: "Este ano", titulo: "De 1º de janeiro a 31 de dezembro do ano atual", faixa: () => anoCorrente() }
];

/**
 * Botões de período. `de`/`ate` continuam sendo o estado da tela — este componente só os escreve,
 * e marca como ativo o atalho cuja faixa bate exatamente com o que está selecionado. Clicar no
 * atalho ativo limpa o filtro, para o usuário voltar a ver tudo sem procurar outro botão.
 */
export function PeriodoRapido({
  de,
  ate,
  onChange,
  atalhos = ATALHOS_PERIODO
}: {
  de: string;
  ate: string;
  onChange: (de: string, ate: string) => void;
  atalhos?: AtalhoPeriodo[];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {atalhos.map((a) => {
        const faixa = a.faixa();
        const ativo = de === faixa.de && ate === faixa.ate;
        return (
          <button
            key={a.rotulo}
            type="button"
            className={`btn-erp ${ativo ? "" : "ghost"} xs`}
            title={a.titulo}
            aria-pressed={ativo}
            onClick={() => (ativo ? onChange("", "") : onChange(faixa.de, faixa.ate))}
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}
