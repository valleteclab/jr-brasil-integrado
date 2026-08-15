"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";

/** MDF-e: emitir manifesto de carga própria, encerrar na chegada, cancelar (24h). */

type Manifesto = {
  id: string; numero: number; chave: string | null; status: string; motivo: string | null;
  ufInicio: string; ufFim: string; destino: string; placa: string; condutor: string;
  qtdNotas: number; valorCarga: number; criadoEm: string; encerradoEm: string | null;
};
type NotaOpcao = { id: string; numero: string; chave: string; total: number; cliente: string | null; emitidaEm: string };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const RODADOS = [["01","Truck"],["02","Toco"],["03","Cavalo mecânico"],["04","Van"],["05","Utilitário"],["06","Outros"]];
const CARROCERIAS = [["00","Não aplicável"],["01","Aberta"],["02","Fechada/baú"],["03","Granelera"],["04","Porta-container"],["05","Sider"]];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const tone = (s: string) => (s === "AUTORIZADO" ? "info" : s === "ENCERRADO" ? "success" : s === "CANCELADO" ? "warn" : "danger");

export function MdfeManager() {
  const [manifestos, setManifestos] = useState<Manifesto[]>([]);
  const [notas, setNotas] = useState<NotaOpcao[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [formAberto, setFormAberto] = useState(false);

  const [chavesSel, setChavesSel] = useState<string[]>([]);
  const [ufInicio, setUfInicio] = useState("BA");
  const [ufFim, setUfFim] = useState("BA");
  const [destinoNome, setDestinoNome] = useState("");
  const [destinoIbge, setDestinoIbge] = useState("");
  const [placa, setPlaca] = useState("");
  const [tara, setTara] = useState("3500");
  const [tipoRodado, setTipoRodado] = useState("06");
  const [tipoCarroceria, setTipoCarroceria] = useState("02");
  const [condutorNome, setCondutorNome] = useState("");
  const [condutorCpf, setCondutorCpf] = useState("");
  const [pesoKg, setPesoKg] = useState("");

  async function carregar() {
    try {
      const res = await fetch("/api/erp/mdfe");
      const data = (await res.json()) as { manifestos?: Manifesto[]; notas?: NotaOpcao[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setManifestos(data.manifestos ?? []);
      setNotas(data.notas ?? []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }
  useEffect(() => { void carregar(); }, []);

  const valorCarga = notas.filter((n) => chavesSel.includes(n.chave)).reduce((s, n) => s + n.total, 0);

  async function emitir() {
    setBusy(true); setErro(""); setOk("");
    try {
      const res = await fetch("/api/erp/mdfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ufInicio, ufFim,
          municipioDescarga: { codigoIbge: destinoIbge, nome: destinoNome },
          veiculo: { placa, tara: Number(tara) || 0, tipoRodado, tipoCarroceria },
          condutor: { nome: condutorNome, cpf: condutorCpf },
          chavesNfe: chavesSel,
          valorCarga,
          pesoBrutoKg: Number(pesoKg.replace(",", ".")) || 0
        })
      });
      const data = (await res.json()) as { autorizado?: boolean; cStat?: string; xMotivo?: string; numero?: number; error?: string };
      if (!res.ok && !data.cStat) throw new Error(data.error || "Falha ao emitir.");
      if (data.autorizado) {
        setOk(`✅ MDF-e nº ${data.numero} AUTORIZADO! Imprima/anote a chave e boa viagem. Lembre de ENCERRAR na chegada.`);
        setFormAberto(false); setChavesSel([]);
      } else {
        setErro(`Rejeitado — ${data.cStat}: ${data.xMotivo}`);
      }
      void carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao emitir."); }
    finally { setBusy(false); }
  }

  async function acao(id: string, tipo: "encerrar" | "cancelar") {
    const justificativa = tipo === "cancelar" ? window.prompt("Justificativa do cancelamento (mín. 15 caracteres):") ?? "" : undefined;
    if (tipo === "cancelar" && (justificativa ?? "").length < 15) return;
    setBusy(true); setErro(""); setOk("");
    try {
      const res = await fetch(`/api/erp/mdfe/${id}/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tipo === "cancelar" ? { justificativa } : {})
      });
      const data = (await res.json()) as { ok?: boolean; cStat?: string; xMotivo?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `${data.cStat}: ${data.xMotivo}`);
      setOk(tipo === "encerrar" ? "✅ Manifesto encerrado." : "✅ Manifesto cancelado.");
      void carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha na ação."); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="erp-toolbar">
        <div className="toolbar-grow" />
        <button type="button" className="btn-erp primary" onClick={() => setFormAberto((v) => !v)}>
          {formAberto ? "Fechar" : "+ Novo MDF-e"}
        </button>
      </div>

      {erro && <div className="alert danger"><strong>Erro</strong><span>{erro}</span></div>}
      {ok && <div className="alert" style={{ borderColor: "#16a34a" }}><strong>OK</strong><span>{ok}</span></div>}

      {formAberto && (
        <div className="erp-card" style={{ marginBottom: 18 }}>
          <div className="erp-card-head"><h3>Novo manifesto (carga própria)</h3></div>
          <div className="erp-form">
            <p className="form-sec">Notas transportadas</p>
            <div className="full" style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--erp-line)", borderRadius: 8, padding: 8 }}>
              {notas.length === 0 && <span className="block-muted">Nenhuma NF-e autorizada disponível.</span>}
              {notas.map((n) => (
                <label key={n.chave} className="check-row" style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={chavesSel.includes(n.chave)}
                    onChange={(e) => setChavesSel((cur) => (e.target.checked ? [...cur, n.chave] : cur.filter((c) => c !== n.chave)))}
                  />
                  <span className="mono">NF-e {n.numero}</span> · {n.cliente ?? "—"} · {brl(n.total)}
                </label>
              ))}
            </div>
            <div className="calc-box"><span className="calc-label">Valor da carga (soma das notas)</span><span className="calc-value">{brl(valorCarga)}</span></div>
            <label>Peso bruto (kg)<input inputMode="decimal" value={pesoKg} onChange={(e) => setPesoKg(e.target.value.replace(/[^\d.,]/g, ""))} /></label>

            <p className="form-sec">Trajeto</p>
            <label>UF de início<select value={ufInicio} onChange={(e) => setUfInicio(e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label>UF de fim<select value={ufFim} onChange={(e) => setUfFim(e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label>Município de descarga<input placeholder="Nome (ex.: Barreiras)" value={destinoNome} onChange={(e) => setDestinoNome(e.target.value)} /></label>
            <label>Código IBGE da descarga<input inputMode="numeric" placeholder="7 dígitos" value={destinoIbge} onChange={(e) => setDestinoIbge(e.target.value.replace(/\D/g, "").slice(0, 7))} /></label>

            <p className="form-sec">Veículo e condutor</p>
            <label>Placa<input placeholder="ABC1D23" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} /></label>
            <label>Tara (kg)<input inputMode="numeric" value={tara} onChange={(e) => setTara(e.target.value.replace(/\D/g, ""))} /></label>
            <label>Tipo de rodado<select value={tipoRodado} onChange={(e) => setTipoRodado(e.target.value)}>{RODADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Tipo de carroceria<select value={tipoCarroceria} onChange={(e) => setTipoCarroceria(e.target.value)}>{CARROCERIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Nome do condutor<input value={condutorNome} onChange={(e) => setCondutorNome(e.target.value)} /></label>
            <label>CPF do condutor<input inputMode="numeric" value={condutorCpf} onChange={(e) => setCondutorCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} /></label>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <button type="button" className="btn-erp primary" disabled={busy || !chavesSel.length} onClick={() => void emitir()}>
              {busy ? "Transmitindo…" : "Emitir MDF-e"}
            </button>
          </div>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead><tr><th>Nº</th><th>Trajeto</th><th>Veículo / condutor</th><th>Notas</th><th className="num">Carga</th><th>Situação</th><th className="actions">Ações</th></tr></thead>
          <tbody>
            {manifestos.map((m) => (
              <tr key={m.id}>
                <td><span className="mono bold">{m.numero}</span><small className="block-muted">{new Date(m.criadoEm).toLocaleString("pt-BR")}</small></td>
                <td>{m.ufInicio} → {m.destino}/{m.ufFim}</td>
                <td><span className="mono">{m.placa}</span><small className="block-muted">{m.condutor}</small></td>
                <td>{m.qtdNotas}</td>
                <td className="num">{brl(m.valorCarga)}</td>
                <td>
                  <StatusBadge tone={tone(m.status) as never}>{m.status}</StatusBadge>
                  {m.motivo && <small className="block-muted" title={m.motivo}>{m.motivo.slice(0, 60)}…</small>}
                </td>
                <td className="actions">
                  {m.status === "AUTORIZADO" && (
                    <>
                      <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => void acao(m.id, "encerrar")}>🏁 Encerrar</button>
                      <button type="button" className="danger-link" disabled={busy} onClick={() => void acao(m.id, "cancelar")}>Cancelar</button>
                    </>
                  )}
                  {m.chave && (
                    <a className="btn-erp ghost xs" href={`/api/erp/mdfe/${m.id}/damdfe`} target="_blank" rel="noreferrer" title="Imprimir o DAMDFE (documento que viaja com o motorista)">
                      🖨 DAMDFE
                    </a>
                  )}
                  {m.chave && (
                    <a className="btn-erp ghost xs" href={`https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${m.chave}&tpAmb=1`} target="_blank" rel="noreferrer" title="Consulta pública / DAMDFE">
                      🔍 Consultar
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {!manifestos.length && (
              <tr><td colSpan={7}><div className="empty-st">Nenhum MDF-e emitido ainda.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
