/**
 * Teste do custo médio ponderado usado na reclassificação de finalidade — SEM REDE, SEM BANCO.
 * Cobre entrada, saída, saldo zerado e os casos que fariam o custo virar lixo em silêncio.
 */
import { custoMedioApos } from "../src/domains/products/application/custo-medio";

let falhas = 0;
function conferir(titulo: string, obtido: number, esperado: number) {
  const ok = Math.abs(obtido - esperado) < 0.000001;
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${esperado}\n      obtido   ${obtido}`);
}

// ENTRADA: 10 un a R$ 10 + 10 un a R$ 20 = média 15.
conferir("entrada faz média ponderada", custoMedioApos({ saldoAnterior: 10, custoMedioAnterior: 10, quantidade: 10, custoUnitario: 20, remover: false }), 15);

// Entrada em estoque zerado assume o custo do que entrou.
conferir("entrada em estoque zerado", custoMedioApos({ saldoAnterior: 0, custoMedioAnterior: 0, quantidade: 5, custoUnitario: 7.5, remover: false }), 7.5);

// SAÍDA: tira exatamente o que aquele item tinha, e o restante mantém o custo original.
conferir("saída do mesmo custo não muda a média", custoMedioApos({ saldoAnterior: 20, custoMedioAnterior: 10, quantidade: 10, custoUnitario: 10, remover: true }), 10);

// Saída de item mais caro faz o custo médio do que sobra CAIR.
conferir("saída de item caro derruba a média", custoMedioApos({ saldoAnterior: 20, custoMedioAnterior: 15, quantidade: 10, custoUnitario: 20, remover: true }), 10);

// Saída de item mais barato faz a média SUBIR.
conferir("saída de item barato eleva a média", custoMedioApos({ saldoAnterior: 20, custoMedioAnterior: 15, quantidade: 10, custoUnitario: 10, remover: true }), 20);

// Zerar o estoque preserva o custo anterior (não pode virar 0 e inflar margem depois).
conferir("saída que zera mantém o custo", custoMedioApos({ saldoAnterior: 10, custoMedioAnterior: 12, quantidade: 10, custoUnitario: 12, remover: true }), 12);
conferir("saída maior que o saldo mantém o custo", custoMedioApos({ saldoAnterior: 5, custoMedioAnterior: 9, quantidade: 8, custoUnitario: 9, remover: true }), 9);

// Valor resultante negativo (dado inconsistente) não pode gravar custo negativo.
conferir("custo nunca fica negativo", custoMedioApos({ saldoAnterior: 10, custoMedioAnterior: 5, quantidade: 2, custoUnitario: 100, remover: true }), 5);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
