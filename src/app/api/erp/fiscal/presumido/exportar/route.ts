import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { NextResponse } from "next/server";
import { PresumidoError, apuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { apuracaoPisCofins } from "@/domains/fiscal/presumido/pis-cofins-use-cases";
import { PRESUNCOES } from "@/domains/fiscal/presumido/tabelas-presuncao";

export const dynamic = "force-dynamic";

/**
 * Exportação da apuração para o contador, em CSV para Excel pt-BR (UTF-8 com BOM, separador ;) —
 * a mesma convenção dos outros exports do sistema. Traz a memória de cálculo E a lista de notas
 * com a classificação de cada uma, que é o que permite conferir linha a linha.
 * Query: ?tipo=IRPJ_CSLL|PIS_COFINS&ano=&periodo=
 */

const esc = (v: string | null | undefined) => {
  const s = v ?? "";
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v: number) => v.toFixed(2).replace(".", ",");
const pct = (v: number) => (v * 100).toFixed(2).replace(".", ",") + "%";
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const tipo = q.get("tipo") === "PIS_COFINS" ? "PIS_COFINS" : "IRPJ_CSLL";
    const ano = Number(q.get("ano")) || new Date().getFullYear();
    const periodo = Number(q.get("periodo"));
    if (!periodo) throw new PresumidoError("Informe o período (trimestre ou mês).");

    const linhas: string[] = [];
    let nomeArquivo = "";

    if (tipo === "IRPJ_CSLL") {
      const a = await apuracaoPresumido(scope, { ano, trimestre: periodo });
      nomeArquivo = `apuracao-irpj-csll-${periodo}T${ano}.csv`;
      linhas.push(esc(`${a.empresa.razaoSocial} - CNPJ ${a.empresa.cnpj}`));
      linhas.push(esc(`Apuracao do IRPJ e da CSLL - ${a.periodo.rotulo} - ${a.regimeReceita === "CAIXA" ? "regime de caixa" : "regime de competencia"}`));
      linhas.push(esc(`Vencimento da quota unica: ${dia(a.periodo.vencimento)} - DARF ${a.darf.irpj} (IRPJ) e ${a.darf.csll} (CSLL)`));
      if (a.fechamento) {
        linhas.push(esc(`Periodo FECHADO em ${dia(a.fechamento.fechadoEm)} com total de R$ ${num(a.fechamento.totalRecolher)}` +
          (a.fechamento.divergencia !== 0 ? ` - divergencia apos o fechamento: R$ ${num(a.fechamento.divergencia)}` : "")));
      }
      linhas.push("");
      linhas.push(["Tipo de receita", "Notas", "Receita", "Presuncao IRPJ", "Base IRPJ", "Presuncao CSLL", "Base CSLL", "Base legal"].join(";"));
      for (const g of a.grupos) {
        linhas.push([esc(g.rotulo), g.notas, num(g.receita), pct(g.presuncaoIrpj), num(g.baseIrpj), pct(g.presuncaoCsll), num(g.baseCsll), esc(g.baseLegal)].join(";"));
      }
      linhas.push(["TOTAL", "", num(a.totais.receita), "", num(a.totais.baseIrpj), "", num(a.totais.baseCsll), ""].join(";"));
      linhas.push("");
      linhas.push(["Apuracao", "Valor"].join(";"));
      linhas.push(["IRPJ 15% sobre a base", num(a.totais.irpjNormal)].join(";"));
      linhas.push([esc(`Adicional 10% sobre o que excede R$ ${num(a.totais.limiteAdicional)}`), num(a.totais.irpjAdicional)].join(";"));
      linhas.push(["IRPJ bruto", num(a.totais.irpjBruto)].join(";"));
      linhas.push(["(-) IRRF retido", num(a.totais.irrfRetido)].join(";"));
      linhas.push([esc(`IRPJ a recolher (DARF ${a.darf.irpj})`), num(a.totais.irpjRecolher)].join(";"));
      linhas.push(["CSLL 9% sobre a base", num(a.totais.csllDevida)].join(";"));
      linhas.push(["(-) CSLL retida", num(a.totais.csllRetida)].join(";"));
      linhas.push([esc(`CSLL a recolher (DARF ${a.darf.csll})`), num(a.totais.csllRecolher)].join(";"));
      linhas.push(["TOTAL A RECOLHER", num(a.totais.totalRecolher)].join(";"));
      linhas.push("");
      linhas.push(["Modelo", "Numero", "Serie", "Data", "Tomador", "Receita", "IRRF", "IRRF %", "Classificacao", "Presuncao IRPJ", "Base IRPJ", "Presuncao CSLL", "Base CSLL", "Contrato de obra", "Motivo", "Avisos"].join(";"));
      for (const l of a.linhas) {
        linhas.push([
          l.modelo, esc(l.numero), esc(l.serie), dia(l.data), esc(l.destinatario), num(l.valor), num(l.irrf), pct(l.irrfPercentual),
          esc(l.rotulo), pct(l.presuncaoIrpj), num(l.baseIrpj), pct(l.presuncaoCsll), num(l.baseCsll),
          esc(l.obraContrato), esc(l.motivo), esc(l.avisos.join(" | "))
        ].join(";"));
      }
      if (a.outrasReceitas.length) {
        linhas.push("");
        linhas.push(["Outras receitas (fora de nota)", "Tipo", "Data", "Valor", "Observacao"].join(";"));
        for (const r of a.outrasReceitas) {
          linhas.push([esc(r.descricao), r.tipo, dia(r.competencia), num(r.valor), esc(r.observacao)].join(";"));
        }
        linhas.push(esc(`Observacao: receitas fora de nota entram integralmente na base - ${PRESUNCOES.OUTRAS_RECEITAS.base}`));
      }
      linhas.push("");
      for (const aviso of a.avisos) linhas.push(esc(`Aviso: ${aviso}`));
    } else {
      const a = await apuracaoPisCofins(scope, { ano, mes: periodo });
      nomeArquivo = `apuracao-pis-cofins-${String(periodo).padStart(2, "0")}-${ano}.csv`;
      linhas.push(esc(`${a.empresa.razaoSocial}`));
      linhas.push(esc(`Apuracao do PIS/COFINS - ${a.periodo.rotulo} - ${a.aliquotas.rotulo} - ${a.regimeReceita === "CAIXA" ? "regime de caixa" : "regime de competencia"}`));
      linhas.push(esc(`Vencimento: ${dia(a.periodo.vencimento)} - DARF ${a.darf.pis} (PIS) e ${a.darf.cofins} (COFINS) - ${a.aliquotas.base}`));
      if (a.fechamento) {
        linhas.push(esc(`Periodo FECHADO em ${dia(a.fechamento.fechadoEm)} com total de R$ ${num(a.fechamento.totalRecolher)}` +
          (a.fechamento.divergencia !== 0 ? ` - divergencia apos o fechamento: R$ ${num(a.fechamento.divergencia)}` : "")));
      }
      linhas.push("");
      linhas.push(["Apuracao", `PIS ${pct(a.aliquotas.pis)}`, `COFINS ${pct(a.aliquotas.cofins)}`].join(";"));
      linhas.push(["Receita bruta", num(a.totais.receitaBruta), ""].join(";"));
      linhas.push(["(-) Exclusoes da base", num(a.totais.exclusoes), ""].join(";"));
      if (a.icmsExcluido > 0) linhas.push(["(-) ICMS destacado (STF, RE 574.706)", num(a.icmsExcluido), ""].join(";"));
      linhas.push(["Base de calculo", num(a.totais.baseCalculo), ""].join(";"));
      linhas.push(["Debito", num(a.totais.pisDebito), num(a.totais.cofinsDebito)].join(";"));
      if (a.receitaFinanceira) {
        linhas.push([esc(`Receita financeira (${num(a.receitaFinanceira.valor)}) - 0,65% e 4%`), num(a.receitaFinanceira.pis), num(a.receitaFinanceira.cofins)].join(";"));
      }
      linhas.push(["(-) Creditos das entradas", num(a.totais.pisCredito), num(a.totais.cofinsCredito)].join(";"));
      linhas.push(["(-) Retido na fonte", num(a.totais.pisRetido), num(a.totais.cofinsRetido)].join(";"));
      linhas.push(["A RECOLHER", num(a.totais.pisRecolher), num(a.totais.cofinsRecolher)].join(";"));
      linhas.push(["TOTAL A RECOLHER", num(a.totais.totalRecolher), ""].join(";"));
      linhas.push("");
      linhas.push(["Modelo", "Numero", "Data", "Destinatario", "Na base", "Excluido", "Motivo da exclusao"].join(";"));
      for (const l of a.linhas) {
        linhas.push([l.modelo, esc(l.numero), dia(l.data), esc(l.descricao), num(l.receita), num(l.excluida), esc(l.motivoExclusao)].join(";"));
      }
      if (a.outrasReceitas.length) {
        linhas.push("");
        linhas.push(["Outras receitas (fora de nota)", "Tipo", "Data", "Valor"].join(";"));
        for (const r of a.outrasReceitas) linhas.push([esc(r.descricao), r.tipo, dia(r.competencia), num(r.valor)].join(";"));
      }
      linhas.push("");
      for (const aviso of a.avisos) linhas.push(esc(`Aviso: ${aviso}`));
    }

    const csv = "﻿" + linhas.join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao exportar a apuração.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}
