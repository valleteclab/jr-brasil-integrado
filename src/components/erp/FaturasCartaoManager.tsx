"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Faturas dos cartões de crédito da empresa.
 *
 * A fatura ABERTA vai acumulando as compras do ciclo. Fechar transforma o total numa conta a
 * pagar com o vencimento do cartão — é essa conta que, ao ser paga, tira o dinheiro do banco.
 */

type Fatura = {
  id: string;
  cartao: string;
  competencia: string;
  rotulo: string;
  fechamento: string;
  vencimento: string;
  valorTotal: number;
  status: string;
  lancamentos: number;
  contaPagarId: string | null;
};

type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  parcela: number;
  totalParcelas: number;
  dataCompra: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const TOM: Record<string, string> = { ABERTA: "info", FECHADA: "warn", PAGA: "success" };
const ROTULO: Record<string, string> = { ABERTA: "Aberta", FECHADA: "Fechada", PAGA: "Paga" };

export function FaturasCartaoManager({
  faturas,
  lancamentosPorFatura
}: {
  faturas: Fatura[];
  lancamentosPorFatura: Record<string, Lancamento[]>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  async function acao(id: string, rota: "fechar" | "reabrir", confirmacao: string) {
    if (!window.confirm(confirmacao)) return;
    setBusyId(id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/faturas-cartao/${id}/${rota}`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível concluir a operação.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusyId(null);
    }
  }

  if (!faturas.length) {
    return (
      <div className="alert info">
        <span className="lead">Nenhuma fatura ainda.</span>
        <span>
          As faturas nascem sozinhas quando você paga uma conta com cartão de crédito. Antes disso, cadastre o
          cartão em Contas financeiras (tipo Cartão) com os dias de fechamento e vencimento.
        </span>
      </div>
    );
  }

  return (
    <>
      {erro && (
        <div className="alert danger">
          <span className="lead">Erro:</span>
          <span>{erro}</span>
        </div>
      )}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Cartão</th>
            <th>Fatura</th>
            <th>Fecha</th>
            <th>Vence</th>
            <th className="num">Total</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {faturas.map((f) => {
            const lancamentos = lancamentosPorFatura[f.id] ?? [];
            return (
              <>
                <tr key={f.id}>
                  <td>{f.cartao}</td>
                  <td>
                    <strong>{f.rotulo}</strong>
                    <span className="sublabel">
                      {f.lancamentos} {f.lancamentos === 1 ? "lançamento" : "lançamentos"}
                    </span>
                  </td>
                  <td>{data(f.fechamento)}</td>
                  <td>{data(f.vencimento)}</td>
                  <td className="num">
                    <strong>{brl(f.valorTotal)}</strong>
                  </td>
                  <td>
                    <span className={`pill ${TOM[f.status] ?? "mute"}`}>{ROTULO[f.status] ?? f.status}</span>
                  </td>
                  <td className="acoes">
                    <button
                      type="button"
                      className="btn-erp ghost xs"
                      onClick={() => setAberta(aberta === f.id ? null : f.id)}
                      disabled={!lancamentos.length}
                    >
                      {aberta === f.id ? "Ocultar" : "Ver compras"}
                    </button>
                    {f.status === "ABERTA" && (
                      <button
                        type="button"
                        className="btn-erp primary xs"
                        disabled={busyId === f.id || f.valorTotal <= 0}
                        onClick={() =>
                          acao(
                            f.id,
                            "fechar",
                            `Fechar a fatura ${f.rotulo} de ${brl(f.valorTotal)}? Isso cria a conta a pagar com vencimento em ${data(f.vencimento)}.`
                          )
                        }
                      >
                        {busyId === f.id ? "Fechando…" : "Fechar fatura"}
                      </button>
                    )}
                    {f.status === "FECHADA" && (
                      <button
                        type="button"
                        className="btn-erp ghost xs"
                        disabled={busyId === f.id}
                        onClick={() =>
                          acao(f.id, "reabrir", `Reabrir a fatura ${f.rotulo}? A conta a pagar gerada será removida.`)
                        }
                      >
                        Reabrir
                      </button>
                    )}
                  </td>
                </tr>
                {aberta === f.id && (
                  <tr key={`${f.id}-detalhe`}>
                    <td colSpan={7} style={{ background: "var(--erp-surface-2, #f8fafc)" }}>
                      <table className="erp-table">
                        <thead>
                          <tr>
                            <th>Compra</th>
                            <th>Descrição</th>
                            <th>Parcela</th>
                            <th className="num">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lancamentos.map((l) => (
                            <tr key={l.id}>
                              <td>{data(l.dataCompra)}</td>
                              <td>{l.descricao}</td>
                              <td>
                                {l.totalParcelas > 1 ? `${l.parcela}/${l.totalParcelas}` : "À vista"}
                              </td>
                              <td className="num">{brl(l.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
