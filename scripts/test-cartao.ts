/**
 * Teste da estimativa de taxa/prazo da maquininha — SEM REDE, SEM BANCO.
 * Mexe com dinheiro, então cobre arredondamento, parcelado × à vista, débito e virada de mês.
 */
import { estimarRecebimentoCartao, taxaAplicavel, type TaxasMaquina } from "../src/lib/cartao";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}

const maquina: TaxasMaquina = {
  taxaDebito: 1.99,
  taxaCredito: 3.49,
  taxaCreditoParcelado: 4.99,
  prazoDebitoDias: 1,
  prazoCreditoDias: 30
};

// A taxa muda conforme a modalidade e o parcelamento — é o erro clássico desse cálculo.
conferir("débito usa a taxa de débito", taxaAplicavel(maquina, "DEBITO", 1), 1.99);
conferir("crédito à vista usa a taxa de crédito", taxaAplicavel(maquina, "CREDITO", 1), 3.49);
conferir("crédito em 2x já é parcelado", taxaAplicavel(maquina, "CREDITO", 2), 4.99);
conferir("débito ignora parcelas", taxaAplicavel(maquina, "DEBITO", 6), 1.99);

const base = new Date(2026, 10, 5); // 05/11/2026

const credito = estimarRecebimentoCartao(1000, maquina, "CREDITO", 1, base);
conferir("crédito à vista: taxa e líquido", { taxa: credito.taxaValor, liquido: credito.liquido }, { taxa: 34.9, liquido: 965.1 });
conferir("crédito à vista: crédito em 30 dias", credito.previsao.toISOString().slice(0, 10), "2026-12-05");

const debito = estimarRecebimentoCartao(1000, maquina, "DEBITO", 1, base);
conferir("débito: taxa e líquido", { taxa: debito.taxaValor, liquido: debito.liquido }, { taxa: 19.9, liquido: 980.1 });
conferir("débito: crédito no dia seguinte", debito.previsao.toISOString().slice(0, 10), "2026-11-06");

const parcelado = estimarRecebimentoCartao(1000, maquina, "CREDITO", 3, base);
conferir("parcelado cobra mais caro", { taxa: parcelado.taxaValor, liquido: parcelado.liquido }, { taxa: 49.9, liquido: 950.1 });

// Arredondamento: 0,1% de 333,33 = 0,33333 — tem que fechar em centavos, sem sobra.
const quebrado = estimarRecebimentoCartao(333.33, { ...maquina, taxaCredito: 0.1 }, "CREDITO", 1, base);
conferir("arredonda em centavos", { taxa: quebrado.taxaValor, liquido: quebrado.liquido }, { taxa: 0.33, liquido: 333 });

// Prazo que atravessa o mês e o ano.
const fimDeAno = estimarRecebimentoCartao(100, maquina, "CREDITO", 1, new Date(2026, 11, 20));
conferir("prazo atravessa o ano", fimDeAno.previsao.toISOString().slice(0, 10), "2027-01-19");

// Entradas inválidas não podem gerar número inventado.
const zero = estimarRecebimentoCartao(0, maquina, "CREDITO", 1, base);
conferir("valor zero zera a estimativa", { taxa: zero.taxaValor, liquido: zero.liquido }, { taxa: 0, liquido: 0 });
const negativo = estimarRecebimentoCartao(-50, maquina, "CREDITO", 1, base);
conferir("valor negativo não vira crédito", { taxa: negativo.taxaValor, liquido: negativo.liquido }, { taxa: 0, liquido: 0 });

// Maquininha sem taxa cadastrada: líquido = bruto, sem NaN.
const semTaxa = estimarRecebimentoCartao(500, { ...maquina, taxaCredito: 0 }, "CREDITO", 1, base);
conferir("taxa zero mantém o bruto", { taxa: semTaxa.taxaValor, liquido: semTaxa.liquido }, { taxa: 0, liquido: 500 });

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
