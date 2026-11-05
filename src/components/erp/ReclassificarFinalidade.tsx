"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Reclassificar a finalidade de itens de uma entrada JÁ PROCESSADA.
 *
 * Antes era preciso estornar, excluir a nota, voltar na distribuição, dar ciência de novo e
 * reimportar o XML. Aqui a troca é feita item a item, mostrando ANTES de confirmar o que vai
 * acontecer com o estoque e se o período já foi declarado no SPED.
 */

type ItemDraft = {
  id: string;
  supplierCode?: string;
  storeTitle?: string;
  finalidade?: string;
  movimentaEstoque?: boolean;
  quantity?: number;
};

type Impacto = {
  efeitoEstoque: "NENHUM" | "REMOVER" | "INCLUIR";
  quantidade: number;
  exigeRetificacaoSped: boolean;
  competenciaSped: string | null;
};

const FINALIDADES: Array<{ value: string; label: string }> = [
  { value: "REVENDA", label: "Revenda" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" },
  { value: "DEVOLUCAO_VENDA", label: "Devolução de venda" },
  { value: "TRANSFERENCIA", label: "Transferência (filiais)" },
  { value: "RETORNO_INDUSTRIALIZACAO", label: "Retorno de industrialização" },
  { value: "BONIFICACAO", label: "Bonificação / brinde" },
  { value: "MATERIAL_SERVICO_ICMS", label: "Material p/ serviço c/ ICMS" },
  { value: "MATERIAL_SERVICO_ISS", label: "Material p/ serviço c/ ISS" },
  { value: "COMBUSTIVEL_LUBRIFICANTE", label: "Combustível / lubrificante" }
];

const rotulo = (v?: string) => FINALIDADES.find((f) => f.value === v)?.label ?? v ?? "—";

export function ReclassificarFinalidade({ entradaId, onClose }: { entradaId: string; onClose: () => void }) {
  const router = useRouter();
  const [itens, setItens] = useState<ItemDraft[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<ItemDraft | null>(null);
  const [nova, setNova] = useState("");
  const [motivo, setMotivo] = useState("");
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/erp/entradas-fiscais/${entradaId}`);
        const d = (await r.json()) as { items?: ItemDraft[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Não foi possível carregar os itens.");
        setItens(d.items ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar os itens.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [entradaId]);

  // Trocar a finalidade escolhida pede a prévia de novo: o impacto depende do par (atual → nova).
  useEffect(() => {
    if (!selecionado || !nova) {
      setImpacto(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/erp/entradas-fiscais/itens/${selecionado.id}/reclassificar?finalidade=${nova}`);
        const d = (await r.json()) as { impacto?: Impacto; error?: string };
        if (!cancelado && r.ok && d.impacto) setImpacto(d.impacto);
      } catch {
        // Sem prévia a tela segue funcionando: o backend valida de novo na hora de aplicar.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [selecionado, nova]);

  async function aplicar() {
    if (!selecionado || !nova) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch(`/api/erp/entradas-fiscais/itens/${selecionado.id}/reclassificar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade: nova, motivo: motivo.trim() || null })
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "Não foi possível reclassificar.");
      setItens((cur) => cur.map((i) => (i.id === selecionado.id ? { ...i, finalidade: nova } : i)));
      setSelecionado(null);
      setNova("");
      setMotivo("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reclassificar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true">
      <div className="drawer" style={{ maxWidth: 720 }}>
        <header className="drawer-head">
          <h2>Reclassificar finalidade</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>

        <div className="drawer-body">
          <div className="alert info" style={{ marginBottom: 12 }}>
            <span className="lead">Sem estornar a nota.</span>
            <span>
              A troca refaz o CFOP de entrada, o crédito dos impostos e, quando necessário, o estoque —
              tudo registrado na auditoria.
            </span>
          </div>

          {erro && (
            <div className="alert danger">
              <span className="lead">Erro:</span>
              <span>{erro}</span>
            </div>
          )}

          {carregando ? (
            <p className="field-hint">Carregando itens…</p>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Finalidade atual</th>
                  <th>Estoque</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.supplierCode}</strong>
                      <span className="sublabel">{i.storeTitle}</span>
                    </td>
                    <td>{rotulo(i.finalidade)}</td>
                    <td>{i.movimentaEstoque ? "Movimenta" : "Não movimenta"}</td>
                    <td className="acoes">
                      <button
                        type="button"
                        className="btn-erp ghost xs"
                        onClick={() => {
                          setSelecionado(i);
                          setNova("");
                          setImpacto(null);
                        }}
                      >
                        Trocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selecionado && (
            <div className="erp-form" style={{ marginTop: 14 }}>
              <label className="full">
                Nova finalidade de <strong>{selecionado.supplierCode}</strong>
                <select value={nova} onChange={(e) => setNova(e.target.value)}>
                  <option value="">Selecione…</option>
                  {FINALIDADES.filter((f) => f.value !== selecionado.finalidade).map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>

              {impacto && (
                <div className={`alert ${impacto.exigeRetificacaoSped ? "warning" : "info"} full`} style={{ margin: 0 }}>
                  <span className="lead">O que vai acontecer:</span>
                  <span>
                    {impacto.efeitoEstoque === "NENHUM"
                      ? "Nenhuma mudança no estoque — só CFOP e crédito dos impostos."
                      : impacto.efeitoEstoque === "REMOVER"
                        ? `O item SAI do estoque (${impacto.quantidade} un.), com o custo médio refeito.`
                        : `O item ENTRA no estoque (${impacto.quantidade} un.), com o custo médio refeito.`}
                    {impacto.exigeRetificacaoSped && (
                      <>
                        <br />
                        <strong>Atenção:</strong> o SPED de {impacto.competenciaSped} já foi gerado. Mudar CFOP e
                        crédito agora exige enviar uma declaração retificadora — combine com o contador.
                      </>
                    )}
                  </span>
                </div>
              )}

              <label className="full">
                Motivo (vai para a auditoria)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: classificado como revenda por engano" />
              </label>
            </div>
          )}
        </div>

        <footer className="drawer-foot">
          <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={salvando}>Fechar</button>
          <button type="button" className="btn-erp primary sm" onClick={() => void aplicar()} disabled={!selecionado || !nova || salvando}>
            {salvando ? "Aplicando…" : "Aplicar reclassificação"}
          </button>
        </footer>
      </div>
    </div>
  );
}
