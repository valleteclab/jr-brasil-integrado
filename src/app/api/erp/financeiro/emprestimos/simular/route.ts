import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { EmprestimoError, calcularCronograma, type SistemaAmortizacao } from "@/domains/finance/application/emprestimo-use-cases";

/**
 * SIMULAÇÃO do cronograma (mesmo cálculo da criação — fonte única): a tela mostra as parcelas,
 * juros, amortização e saldo devedor ANTES de salvar o contrato.
 */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const body = (await request.json()) as {
      valorPrincipal: number;
      taxaJurosMensal?: number;
      sistemaAmortizacao: SistemaAmortizacao;
      totalParcelas: number;
      valorParcela?: number | null;
      primeiroVencimento: string;
      parcelasJaPagas?: number;
    };
    const cronograma = calcularCronograma({
      valorPrincipal: Number(body.valorPrincipal),
      taxaJurosMensal: Number(body.taxaJurosMensal ?? 0),
      sistemaAmortizacao: body.sistemaAmortizacao,
      totalParcelas: Number(body.totalParcelas),
      valorParcela: body.valorParcela != null && body.valorParcela !== 0 ? Number(body.valorParcela) : null,
      primeiroVencimento: new Date(`${body.primeiroVencimento}T12:00:00`)
    });
    const jaPagas = Math.max(0, Math.floor(Number(body.parcelasJaPagas ?? 0)));
    const round2 = (v: number) => Math.round(v * 100) / 100;
    return NextResponse.json({
      cronograma: cronograma.map((p) => ({ ...p, vencimento: p.vencimento.toISOString(), jaPaga: p.numero <= jaPagas })),
      resumo: {
        totalPagar: round2(cronograma.reduce((s, p) => s + p.valor, 0)),
        totalJuros: round2(cronograma.reduce((s, p) => s + p.juros, 0)),
        saldoDevedorAtual: jaPagas > 0 ? cronograma[Math.min(jaPagas, cronograma.length) - 1].saldoDevedorApos : round2(Number(body.valorPrincipal)),
        parcelasRestantes: cronograma.length - jaPagas
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao simular o cronograma.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof EmprestimoError ? 400 : 500) });
  }
}
