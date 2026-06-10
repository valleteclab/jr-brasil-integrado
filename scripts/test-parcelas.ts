import { gerarParcelas, parseCondicaoDias } from "../src/lib/finance/condicao-pagamento";

const casos: Array<[string, number]> = [
  ["", 100],
  ["30", 100],
  ["30/60/90", 100],
  ["0/30", 99.99],
  ["à vista", 50],
  ["A VISTA", 50],
  ["entrada 0/30/60", 100.01],
  ["sem numero valido", 10]
];

for (const [cond, total] of casos) {
  const p = gerarParcelas(total, cond, { base: new Date("2026-06-10T12:00:00") });
  const soma = Math.round(p.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const ok = soma === Math.round(total * 100) / 100;
  console.log(
    `${ok ? "OK " : "ERRO"} cond="${cond}" total=${total} dias=[${parseCondicaoDias(cond).join(",")}] ` +
      p.map((x) => `${x.valor}@${x.vencimento.toISOString().slice(0, 10)}`).join(" · ") +
      ` soma=${soma}`
  );
  if (!ok) process.exitCode = 1;
}
