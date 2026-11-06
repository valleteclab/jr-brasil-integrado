"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FINALIDADE_OPCOES } from "@/domains/fiscal/finalidade-entrada";
import { competenciaRelativa } from "@/lib/periodo";

/**
 * Correção em lote de lançamentos de entrada de um mês.
 *
 * Nasceu de dois erros reais que só a contabilidade pegou, meses depois:
 *   1. uma nota de 21 itens de material elétrico com TODOS os itens apontando para o produto
 *      "CIMENTO 50 KG" — o SPED saiu com o mesmo código de item em tudo;
 *   2. o mês inteiro lançado como material de serviço COM ICMS (CFOP 1126) quando a atividade
 *      era serviço com ISS (1128), creditando ICMS indevidamente.
 *
 * Os dois são erro de lançamento repetido, não erro pontual — por isso a correção é por
 * período e em lote, e não item a item.
 */

type Divergencia = {
  itemId: string;
  notaNumero: string | null;
  itemNumero: number;
  descricaoFornecedor: string;
  ncmNota: string | null;
  valorTotal: number;
  produtoId: string | null;
  produtoNome: string | null;
  produtoSku: string | null;
  ncmProduto: string | null;
  finalidade: string | null;
  cfopDerivado: string | null;
  pontuacao: number;
  motivos: string[];
  nomeSugerido: string;
  precisaRevisar: boolean;
};
type LinhaFinalidade = { finalidade: string | null; cfopDerivado: string | null; itens: number; valor: number };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const rotuloFinalidade = (v: string | null) =>
  (v && FINALIDADE_OPCOES.find((o) => o.value === v)?.label) || v || "sem finalidade";

export function CorrigirEntradasWorkspace() {
  const router = useRouter();
  const inicial = competenciaRelativa(-1);
  const [mes, setMes] = useState(inicial.mes);
  const [ano, setAno] = useState(inicial.ano);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [finalidades, setFinalidades] = useState<LinhaFinalidade[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const varrer = useCallback(async () => {
    setCarregando(true);
    setErro("");
    setAviso("");
    try {
      const r = await fetch(`/api/erp/entradas-fiscais/divergencias?ano=${ano}&mes=${mes}`);
      const d = (await r.json()) as { error?: string; divergencias?: Divergencia[]; finalidades?: LinhaFinalidade[] };
      if (!r.ok) throw new Error(d.error || "Não foi possível varrer o período.");
      setDivergencias(d.divergencias ?? []);
      setFinalidades(d.finalidades ?? []);
      // Já vem marcado o que passou do limite de revisão: é o caminho esperado, e quem
      // discordar desmarca. Deixar tudo desmarcado faria a pessoa clicar 26 vezes.
      setMarcados(new Set((d.divergencias ?? []).filter((x) => x.precisaRevisar).map((x) => x.itemId)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao varrer o período.");
    } finally {
      setCarregando(false);
    }
  }, [ano, mes]);

  useEffect(() => {
    void varrer();
  }, [varrer]);

  function alternar(itemId: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(itemId)) novo.delete(itemId);
      else novo.add(itemId);
      return novo;
    });
  }

  /** Cria um produto próprio, a partir da nota, para cada item marcado. */
  async function corrigirVinculos() {
    const alvo = divergencias.filter((d) => marcados.has(d.itemId));
    if (!alvo.length) return;
    const ok = window.confirm(
      `Corrigir ${alvo.length} item(ns) marcado(s), tirando cada um do produto errado?\n\n` +
        "Isto corrige o lado FISCAL: código do item no SPED, NCM, CFOP e crédito de imposto.\n" +
        "O saldo de estoque continua lançado no produto antigo e precisa ser acertado por inventário."
    );
    if (!ok) return;
    setAplicando(true);
    setErro("");
    try {
      const r = await fetch("/api/erp/entradas-fiscais/itens/vinculos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: alvo.map((d) => ({
            itemId: d.itemId,
            criarNovoSku: true,
            nome: d.nomeSugerido,
            // A finalidade atual vai junto: é ela que diz se o SKU novo é insumo (material de
            // serviço, industrialização) e portanto dispensa preço de venda. Sem mandá-la, o
            // gravador trata como item de revenda e exige preço que esta mercadoria não tem.
            finalidade: d.finalidade,
            correcaoFiscal: true
          })),
          // Os produtos que estavam recebendo tudo ficam com o NCM dos itens que sobraram neles.
          recalcularNcmDe: Array.from(new Set(alvo.map((d) => d.produtoId).filter(Boolean)))
        })
      });
      const d = (await r.json()) as {
        error?: string;
        updated?: number;
        ncmCorrigidos?: Array<{ sku: string | null; de: string | null; para: string }>;
      };
      if (!r.ok) throw new Error(d.error || "Não foi possível corrigir os vínculos.");
      const ncm = d.ncmCorrigidos ?? [];
      setAviso(
        `${d.updated ?? alvo.length} item(ns) corrigido(s).` +
          (ncm.length
            ? ` NCM reposto em ${ncm.length} produto(s): ${ncm.map((n) => `${n.sku ?? "?"} ${n.de ?? "—"}→${n.para}`).join(", ")}.`
            : "") +
          " Gere o SPED do mês de novo. O saldo de estoque NÃO foi mexido — acerte por inventário."
      );
      await varrer();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao corrigir os vínculos.");
    } finally {
      setAplicando(false);
    }
  }

  /** Troca a finalidade de TODOS os itens do mês que estão com a finalidade de origem. */
  async function trocarFinalidade() {
    if (!de || !para || de === para) return;
    const linha = finalidades.find((f) => f.finalidade === de);
    const ok = window.confirm(
      `Trocar a finalidade de ${linha?.itens ?? "todos os"} item(ns) de "${rotuloFinalidade(de)}" para "${rotuloFinalidade(para)}" em ${MESES[mes - 1]}/${ano}?\n\n` +
        "O CFOP de entrada e o crédito de cada imposto são recalculados. Isso muda a apuração do mês.\n" +
        "O saldo de estoque não é alterado."
    );
    if (!ok) return;
    setAplicando(true);
    setErro("");
    try {
      const rIds = await fetch(`/api/erp/entradas-fiscais/divergencias?ano=${ano}&mes=${mes}&finalidade=${de}`);
      const dIds = (await rIds.json()) as { error?: string; itens?: Array<{ itemId: string; produtoId: string | null }> };
      if (!rIds.ok) throw new Error(dIds.error || "Não foi possível listar os itens.");
      const itens = dIds.itens ?? [];
      if (!itens.length) throw new Error("Nenhum item com essa finalidade no período.");

      const r = await fetch("/api/erp/entradas-fiscais/itens/vinculos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // O produto atual vai junto: trocar a finalidade não é desvincular, e omitir o
          // produto faria o item perder o código que vai para o SPED.
          links: itens.map((i) => ({
            itemId: i.itemId,
            produtoId: i.produtoId,
            finalidade: para,
            correcaoFiscal: true
          }))
        })
      });
      const d = (await r.json()) as { error?: string; updated?: number };
      if (!r.ok) throw new Error(d.error || "Não foi possível trocar a finalidade.");
      setAviso(`${d.updated ?? itens.length} item(ns) passaram para "${rotuloFinalidade(para)}". Gere o SPED do mês de novo.`);
      await varrer();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao trocar a finalidade.");
    } finally {
      setAplicando(false);
    }
  }

  const anoAtual = new Date().getFullYear();

  return (
    <>
      <div className="erp-card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Mês</span>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} disabled={carregando || aplicando}>
              {MESES.map((nome, i) => (
                <option key={nome} value={i + 1}>{nome}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 110 }}>
            <span>Ano</span>
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))} disabled={carregando || aplicando}>
              {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-erp light" onClick={() => void varrer()} disabled={carregando || aplicando}>
            {carregando ? "Varrendo…" : "↻ Varrer de novo"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>
      )}
      {aviso && (
        <div className="alert info"><span className="lead">Pronto.</span><span>{aviso}</span></div>
      )}

      <section className="erp-card" style={{ padding: 14, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Finalidade dos itens do mês</h3>
        {finalidades.length === 0 ? (
          <p className="field-hint">Nenhum item de entrada neste período.</p>
        ) : (
          <table className="erp-table">
            <thead>
              <tr><th>Finalidade</th><th>CFOP</th><th style={{ textAlign: "right" }}>Itens</th><th style={{ textAlign: "right" }}>Valor</th></tr>
            </thead>
            <tbody>
              {finalidades.map((f) => (
                <tr key={`${f.finalidade}-${f.cfopDerivado}`}>
                  <td>{rotuloFinalidade(f.finalidade)}</td>
                  <td>{f.cfopDerivado ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{f.itens}</td>
                  <td style={{ textAlign: "right" }}>{brl(f.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
          <label className="field" style={{ minWidth: 230 }}>
            <span>Trocar de</span>
            <select value={de} onChange={(e) => setDe(e.target.value)} disabled={aplicando}>
              <option value="">escolha…</option>
              {finalidades.filter((f) => f.finalidade).map((f) => (
                <option key={f.finalidade} value={f.finalidade!}>
                  {rotuloFinalidade(f.finalidade)} ({f.itens})
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 230 }}>
            <span>Para</span>
            <select value={para} onChange={(e) => setPara(e.target.value)} disabled={aplicando}>
              <option value="">escolha…</option>
              {FINALIDADE_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-erp primary"
            onClick={() => void trocarFinalidade()}
            disabled={aplicando || !de || !para || de === para}
          >
            {aplicando ? "Aplicando…" : "Trocar no mês inteiro"}
          </button>
        </div>
        <p className="field-hint" style={{ margin: "8px 0 0" }}>
          A troca recalcula o CFOP de entrada e o crédito de cada imposto. Material para serviço com
          ISS (1.128) <strong>não credita ICMS</strong>; com ICMS (1.126), credita. O saldo de estoque
          não é alterado — esta correção é do lado fiscal. Se o SPED do mês já foi entregue, a
          correção exige arquivo retificador — confirme com a contabilidade.
        </p>
      </section>

      <section className="erp-card" style={{ padding: 14 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Itens que parecem vinculados ao produto errado</h3>
          {divergencias.length > 0 && (
            <button type="button" className="btn-erp primary sm" onClick={() => void corrigirVinculos()} disabled={aplicando || marcados.size === 0}>
              {aplicando ? "Corrigindo…" : `Criar produto próprio para ${marcados.size} item(ns)`}
            </button>
          )}
        </header>

        {carregando ? (
          <p className="field-hint">Varrendo o período…</p>
        ) : divergencias.length === 0 ? (
          <p className="field-hint">Nenhum vínculo suspeito neste período.</p>
        ) : (
          <table className="erp-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Nota / item</th>
                <th>Descrição na nota</th>
                <th>Está vinculado a</th>
                <th style={{ textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {divergencias.map((d) => (
                <tr key={d.itemId}>
                  <td>
                    <input type="checkbox" checked={marcados.has(d.itemId)} onChange={() => alternar(d.itemId)} disabled={aplicando} />
                  </td>
                  <td>
                    {d.notaNumero ?? "—"} / {d.itemNumero}
                    <span className="sublabel">NCM {d.ncmNota ?? "—"}</span>
                  </td>
                  <td>
                    {d.descricaoFornecedor}
                    <span className="sublabel">{d.motivos.join(" · ")}</span>
                  </td>
                  <td>
                    {d.produtoSku ? `${d.produtoSku} — ` : ""}{d.produtoNome ?? "—"}
                    <span className="sublabel">NCM {d.ncmProduto ?? "—"}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>{brl(d.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="field-hint" style={{ margin: "10px 0 0" }}>
          Vêm marcados os itens em que o NCM da nota é de outro tipo de mercadoria que o do produto
          vinculado. Corrigir tira o item do produto errado: quem entrou para revenda, insumo ou material
          de serviço ganha um produto próprio com a descrição e o NCM da nota; quem entrou como uso e
          consumo ou imobilizado fica sem produto, que é como o sistema trata esses casos. O produto
          antigo recupera o NCM dos itens que de fato são dele. O saldo de estoque continua onde está:
          acerte por inventário depois.
        </p>
      </section>
    </>
  );
}
