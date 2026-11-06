/**
 * Teste das faixas de período dos atalhos do financeiro — SEM REDE, SEM BANCO.
 * Cobre justamente onde esse cálculo costuma quebrar: virada de ano, fevereiro bissexto
 * e não bissexto, e meses de 31 dias indo para meses de 30.
 */
import { anoCorrente, competenciaRelativa, iso, mesRelativo, ultimosDias } from "../src/lib/periodo";

let falhas = 0;

function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}

// Data base: 15/03/2026 (mês de 31 dias, vindo de fevereiro de 28).
const marco = new Date(2026, 2, 15);
conferir("este mês (março)", mesRelativo(0, marco), { de: "2026-03-01", ate: "2026-03-31" });
conferir("mês anterior (fevereiro não bissexto)", mesRelativo(-1, marco), { de: "2026-02-01", ate: "2026-02-28" });
conferir("próximo mês (abril, 30 dias)", mesRelativo(1, marco), { de: "2026-04-01", ate: "2026-04-30" });

// Fevereiro bissexto: 2028.
conferir("fevereiro bissexto", mesRelativo(0, new Date(2028, 1, 10)), { de: "2028-02-01", ate: "2028-02-29" });

// Virada de ano nos dois sentidos.
conferir("mês anterior em janeiro cai em dezembro do ano passado", mesRelativo(-1, new Date(2026, 0, 5)), {
  de: "2025-12-01",
  ate: "2025-12-31"
});
conferir("próximo mês em dezembro cai em janeiro do ano seguinte", mesRelativo(1, new Date(2026, 11, 20)), {
  de: "2027-01-01",
  ate: "2027-01-31"
});

// Dia 31 como data base: o mês anterior não pode "transbordar" para março.
conferir("dia 31 não transborda ao voltar um mês", mesRelativo(-1, new Date(2026, 2, 31)), {
  de: "2026-02-01",
  ate: "2026-02-28"
});

// Janelas por dia.
conferir("hoje é um único dia", ultimosDias(1, marco), { de: "2026-03-15", ate: "2026-03-15" });
conferir("últimos 30 dias atravessa o mês", ultimosDias(30, marco), { de: "2026-02-14", ate: "2026-03-15" });
conferir("este ano", anoCorrente(marco), { de: "2026-01-01", ate: "2026-12-31" });

// O formato precisa ser o do <input type="date"> e seguir o fuso local, não UTC.
conferir("iso usa data local (23h não vira o dia)", iso(new Date(2026, 10, 5, 23, 30)), "2026-11-05");
conferir("iso zera à esquerda", iso(new Date(2026, 0, 2)), "2026-01-02");

// Competência em números (pacote de XML, SPED, guias): o mês vem 1-12 e a virada de ano
// precisa funcionar nos dois sentidos.
conferir("mês anterior dentro do ano", competenciaRelativa(-1, marco), { mes: 2, ano: 2026 });
conferir("mês anterior em janeiro volta para dezembro", competenciaRelativa(-1, new Date(2026, 0, 10)), {
  mes: 12,
  ano: 2025
});
conferir("mês corrente", competenciaRelativa(0, marco), { mes: 3, ano: 2026 });
conferir("mês seguinte em dezembro avança o ano", competenciaRelativa(1, new Date(2026, 11, 20)), {
  mes: 1,
  ano: 2027
});
// Dia 31 como base não pode transbordar ao voltar um mês.
conferir("dia 31 não transborda na competência", competenciaRelativa(-1, new Date(2026, 2, 31)), {
  mes: 2,
  ano: 2026
});

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
