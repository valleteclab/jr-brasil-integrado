/**
 * Teste do ciclo da fatura do cartão — SEM REDE, SEM BANCO.
 * Cobre o que erra calado: compra antes/depois do fechamento, fechamento dia 31 em mês curto,
 * virada de ano, vencimento no mês seguinte e a soma exata das parcelas.
 */
import { cicloDaCompra, dividirParcelas } from "../src/domains/finance/application/fatura-cartao-ciclo";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}
const resumo = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const ciclo = (c: ReturnType<typeof cicloDaCompra>) => ({ comp: c.competencia, fech: resumo(c.fechamento), venc: resumo(c.vencimento) });

// Cartão que fecha dia 28 e vence dia 5 do mês seguinte.
conferir("compra antes do fechamento entra na fatura do mês", ciclo(cicloDaCompra(new Date(2026, 10, 10), 28, 5)), {
  comp: "2026-12",
  fech: "28/11/2026",
  venc: "05/12/2026"
});
conferir("compra NO dia do fechamento já é a próxima", ciclo(cicloDaCompra(new Date(2026, 10, 28), 28, 5)), {
  comp: "2027-01",
  fech: "28/12/2026",
  venc: "05/01/2027"
});
conferir("compra depois do fechamento vai para a seguinte", ciclo(cicloDaCompra(new Date(2026, 10, 29), 28, 5)), {
  comp: "2027-01",
  fech: "28/12/2026",
  venc: "05/01/2027"
});

// Virada de ano pelo vencimento.
conferir("dezembro vence em janeiro", ciclo(cicloDaCompra(new Date(2026, 11, 2), 28, 5)), {
  comp: "2027-01",
  fech: "28/12/2026",
  venc: "05/01/2027"
});

// Fechamento dia 31: fevereiro e meses de 30 dias não podem estourar.
conferir("fechamento 31 em fevereiro cai no dia 28", ciclo(cicloDaCompra(new Date(2026, 1, 10), 31, 10)), {
  comp: "2026-03",
  fech: "28/02/2026",
  venc: "10/03/2026"
});
conferir("fechamento 31 em abril cai no dia 30", ciclo(cicloDaCompra(new Date(2026, 3, 10), 31, 10)), {
  comp: "2026-05",
  fech: "30/04/2026",
  venc: "10/05/2026"
});

// Vencimento DEPOIS do fechamento, no mesmo mês (fecha 5, vence 20).
conferir("vence no mesmo mês quando o dia é maior", ciclo(cicloDaCompra(new Date(2026, 10, 2), 5, 20)), {
  comp: "2026-11",
  fech: "05/11/2026",
  venc: "20/11/2026"
});

// Parcelado: cada parcela anda um ciclo.
const compra = new Date(2026, 10, 10);
conferir("1ª parcela", ciclo(cicloDaCompra(compra, 28, 5, 0)).comp, "2026-12");
conferir("2ª parcela", ciclo(cicloDaCompra(compra, 28, 5, 1)).comp, "2027-01");
conferir("3ª parcela", ciclo(cicloDaCompra(compra, 28, 5, 2)).comp, "2027-02");

// Divisão de parcelas: tem que somar o total exato, sem centavo sumindo.
conferir("300 em 3x", dividirParcelas(300, 3), [100, 100, 100]);
conferir("100 em 3x soma 100", dividirParcelas(100, 3), [33.34, 33.33, 33.33]);
conferir("soma das parcelas de 100/3", Number(dividirParcelas(100, 3).reduce((a, b) => a + b, 0).toFixed(2)), 100);
conferir("0,05 em 2x", dividirParcelas(0.05, 2), [0.03, 0.02]);
conferir("à vista devolve o total", dividirParcelas(1234.56, 1), [1234.56]);
conferir("parcelas inválidas viram 1", dividirParcelas(50, 0), [50]);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
