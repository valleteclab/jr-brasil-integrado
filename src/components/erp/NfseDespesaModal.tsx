"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";

/**
 * Modal de LANÇAMENTO DE DESPESA de uma NFS-e recebida (tomador): vencimento, forma de pagamento
 * do cadastro (que pré-seleciona a conta vinculada), conta/cartão e classificação financeira do
 * plano gerencial. Gera a ContaPagar via POST /api/erp/nfse-recebidas/{id}/importar.
 */

export type NfseDespesaAlvo = {
  id: string;
  nNFSe: string | null;
  emitenteNome: string | null;
  valor: number;
  dataEmissao: string | null;
};

export type FormaPagamentoOpt = { id: string; nome: string; tipo?: string; contaBancariaId?: string | null };
export type ContaFinanceiraOpt = { id: string; nome: string; tipo: string; banco?: string | null };
export type ClassificacaoOpt = { id: string; nome: string; grupo: string };

type Props = {
  doc: NfseDespesaAlvo;
  formasPagamento: FormaPagamentoOpt[];
  contas: ContaFinanceiraOpt[];
  classificacoes: ClassificacaoOpt[];
  onClose: () => void;
  onDone: (docId: string, contaPagarId: string) => void;
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(v);

export function NfseDespesaModal({ doc, formasPagamento, contas, classificacoes, onClose, onDone }: Props) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [descricao, setDescricao] = useState(`NFS-e ${doc.nNFSe ?? ""} - ${doc.emitenteNome ?? ""}`.trim());
  const [vencimento, setVencimento] = useState(doc.dataEmissao?.slice(0, 10) || hoje);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [classificacaoId, setClassificacaoId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const formaSelecionada = formasPagamento.find((f) => f.nome === formaPagamento) ?? null;
  const ehCartaoCredito = formaSelecionada?.tipo === "CARTAO_CREDITO";
  const contasDaForma = contas.filter((c) => (ehCartaoCredito ? c.tipo === "CARTAO" : c.tipo !== "CARTAO"));

  // Classificações de despesa agrupadas (plano gerencial) — Receitas ficam de fora.
  const grupos = useMemo(() => {
    const despesas = classificacoes.filter((c) => c.grupo !== "Receitas");
    const porGrupo = new Map<string, ClassificacaoOpt[]>();
    for (const c of despesas) {
      porGrupo.set(c.grupo, [...(porGrupo.get(c.grupo) ?? []), c]);
    }
    return Array.from(porGrupo.entries());
  }, [classificacoes]);

  async function lancar() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/nfse-recebidas/${doc.id}/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao,
          vencimento,
          formaPagamento: formaPagamento || null,
          contaBancariaId: contaBancariaId || null,
          classificacaoId: classificacaoId || null
        })
      });
      const data = (await res.json()) as { contaPagarId?: string; error?: string };
      if (!res.ok || !data.contaPagarId) throw new Error(data.error || "Não foi possível lançar a despesa.");
      onDone(doc.id, data.contaPagarId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível lançar a despesa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <h2>Lançar despesa da NFS-e</h2>
            <p className="erp-page-sub">
              {doc.emitenteNome || "Prestador não informado"} · <strong>{brl(doc.valor)}</strong>
            </p>
          </div>
          <button type="button" className="btn-erp ghost sm" onClick={onClose}>Fechar</button>
        </div>
        <div className="drawer-body">
          {error && <div className="alert danger" style={{ margin: "12px 16px 0" }}><span className="lead">Atenção:</span><span>{error}</span></div>}
          <div className="erp-form">
            <label className="full">Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
            <label>Vencimento<input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></label>
            <label>Forma de pagamento
              <select
                value={formaPagamento}
                onChange={(e) => {
                  const nome = e.target.value;
                  const forma = formasPagamento.find((f) => f.nome === nome) ?? null;
                  setFormaPagamento(nome);
                  setContaBancariaId(forma?.contaBancariaId ?? "");
                }}
              >
                <option value="">Informar depois</option>
                {formasPagamento.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </label>
            {formaPagamento && (
              <label>{ehCartaoCredito ? "Cartão de crédito" : "Conta"}
                {contasDaForma.length ? (
                  <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)}>
                    <option value="">{ehCartaoCredito ? "Qual cartão?" : "Qual conta?"}</option>
                    {contasDaForma.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ""}</option>)}
                  </select>
                ) : (
                  <small className="field-hint">
                    {ehCartaoCredito ? "Nenhum cartão cadastrado (Financeiro → Configurações → Contas, tipo Cartão)." : "Nenhuma conta cadastrada."}
                  </small>
                )}
              </label>
            )}
            <label className="full">Classificação da despesa (plano gerencial)
              <select value={classificacaoId} onChange={(e) => setClassificacaoId(e.target.value)}>
                <option value="">Sem classificação (classificar depois)</option>
                {grupos.map(([grupo, itens]) => (
                  <optgroup key={grupo} label={grupo}>
                    {itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </select>
              <small className="field-hint">Alimenta o fechamento mensal IDEAL × REAL por grupo/classe.</small>
            </label>
          </div>
        </div>
        <div className="drawer-foot">
          <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
          <Button type="button" onClick={lancar} disabled={saving}>{saving ? "Lançando..." : `Lançar despesa de ${brl(doc.valor)}`}</Button>
        </div>
      </aside>
    </>
  );
}
