/**
 * Teste do vencimento do ICMS no registro E116 — SEM REDE, SEM BANCO.
 *
 * O caso que motivou: a Valleteclab (BA, conta corrente fiscal) recolhe até o dia 9, e o
 * cadastro vinha com o padrão 10 — o arquivo saía com 10/11/2026. O dia é do cadastro; o
 * que o código garante é que ele não estoure o mês nem seja cortado em 28.
 */
import { vencimentoIcms } from "../src/domains/fiscal/sped/gerador";

let falhas = 0;
function conferir(titulo: string, obtido: Date, esperado: string) {
  const iso = `${String(obtido.getDate()).padStart(2, "0")}/${String(obtido.getMonth() + 1).padStart(2, "0")}/${obtido.getFullYear()}`;
  const ok = iso === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${esperado}\n      obtido   ${iso}`);
}

// O vencimento é sempre no mês SEGUINTE ao da competência.
conferir("outubro/2026 com dia 9 vence em 09/11/2026", vencimentoIcms(2026, 10, 9), "09/11/2026");
conferir("outubro/2026 com dia 10 vence em 10/11/2026", vencimentoIcms(2026, 10, 10), "10/11/2026");

// Virada de ano: dezembro vence em janeiro do ano seguinte.
conferir("dezembro/2026 vence em janeiro/2027", vencimentoIcms(2026, 12, 9), "09/01/2027");

// O dia 30 não pode mais ser cortado em 28 — era o comportamento antigo.
conferir("dia 30 em novembro é 30/11", vencimentoIcms(2026, 10, 30), "30/11/2026");
conferir("dia 31 em dezembro é 31/12", vencimentoIcms(2026, 11, 31), "31/12/2026");
conferir("dia 31 em novembro desce para 30/11", vencimentoIcms(2026, 10, 31), "30/11/2026");

// Fevereiro é o único mês em que o limite realmente aperta.
conferir("dia 30 em fevereiro comum desce para 28", vencimentoIcms(2026, 1, 30), "28/02/2026");
conferir("dia 30 em fevereiro bissexto desce para 29", vencimentoIcms(2027, 1, 30), "28/02/2027");
conferir("fevereiro de ano bissexto chega a 29", vencimentoIcms(2024, 1, 30), "29/02/2024");

// Dia inválido no cadastro não deve gerar data inválida no arquivo.
conferir("dia 0 cai para o dia 1", vencimentoIcms(2026, 10, 0), "01/11/2026");
conferir("dia negativo cai para o dia 1", vencimentoIcms(2026, 10, -5), "01/11/2026");

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) com falha.`);
process.exit(falhas === 0 ? 0 : 1);
