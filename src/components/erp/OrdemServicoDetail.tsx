"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrdemServicoDetail as OsDetail } from "@/lib/services/service-order";
import type { OsFormData } from "@/lib/services/service-order";
import { CODIGO_SERVICO_OPTIONS } from "@/domains/fiscal/codigo-tributacao-nacional";

type Props = {
  os: OsDetail;
  formData: OsFormData;
  tecnicos: Array<{ id: string; nome: string }>;
  meuTecnico: { id: string; nome: string } | null;
};

type StatusOrdemServico = "ABERTA" | "EM_ANDAMENTO" | "AGUARDANDO_PECAS" | "FINALIZADA_NAO_FATURADA";

const STATUS_OPTIONS: { value: StatusOrdemServico; label: string }[] = [
  { value: "ABERTA", label: "Aberta" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "AGUARDANDO_PECAS", label: "Aguardando peças" },
  { value: "FINALIZADA_NAO_FATURADA", label: "Finalizada (não faturada)" },
];

export function OrdemServicoDetail({ os: initialOs, formData, tecnicos, meuTecnico }: Props) {
  const router = useRouter();
  const lastAutoRefreshRef = useRef(0);
  const [os, setOs] = useState(initialOs);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Servico form
  const [descricaoServ, setDescricaoServ] = useState("");
  const [horas, setHoras] = useState(1);
  const [valorHora, setValorHora] = useState(0);
  const [codigoServLc116, setCodigoServLc116] = useState("");
  const [tecnicoServ, setTecnicoServ] = useState("");

  // Editar cabeçalho
  const [editandoCab, setEditandoCab] = useState(false);
  const [cab, setCab] = useState({
    equipamento: initialOs.equipamento,
    placaOuSerial: initialOs.placaOuSerial ?? "",
    km: initialOs.km ?? "",
    problemaRelatado: initialOs.problemaRelatado ?? "",
    diagnostico: initialOs.diagnostico ?? "",
    observacoes: initialOs.observacoes ?? "",
    previsaoEm: initialOs.previsaoRaw ? initialOs.previsaoRaw.slice(0, 16) : "",
    tecnicoResponsavelId: initialOs.tecnicoResponsavelId ?? "",
    desconto: initialOs.descontoNum ? String(initialOs.descontoNum) : ""
  });

  // Apontamento (o técnico registra o que foi feito)
  const [apontDescricao, setApontDescricao] = useState("");
  const [apontHoras, setApontHoras] = useState("");
  const [apontTecnico, setApontTecnico] = useState(meuTecnico?.id ?? "");

  // Peca form
  const [produtoId, setProdutoId] = useState("");
  const [quantidadePeca, setQuantidadePeca] = useState(1);
  const [precoPeca, setPrecoPeca] = useState(0);

  // Faturamento
  const [emitirNfse, setEmitirNfse] = useState(false);
  const [emitirNfePecas, setEmitirNfePecas] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  // NFS-e: ISS informado + retenções
  const [taxationType, setTaxationType] = useState("taxationInMunicipality");
  const [aliquotaIss, setAliquotaIss] = useState(0);
  const [deducoes, setDeducoes] = useState(0);
  const [issRetido, setIssRetido] = useState(false);
  const [retIr, setRetIr] = useState(0);
  const [retPis, setRetPis] = useState(0);
  const [retCofins, setRetCofins] = useState(0);
  const [retCsll, setRetCsll] = useState(0);
  const [retInss, setRetInss] = useState(0);
  const [baseRetencao, setBaseRetencao] = useState(0);

  function formatBrl(v: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  }

  useEffect(() => {
    setOs(initialOs);
  }, [initialOs]);

  useEffect(() => {
    const refreshIfIdle = () => {
      if (busy || document.hidden) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 10000) return;
      lastAutoRefreshRef.current = now;
      router.refresh();
    };

    const intervalId = window.setInterval(refreshIfIdle, 10000);
    window.addEventListener("focus", refreshIfIdle);
    document.addEventListener("visibilitychange", refreshIfIdle);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfIdle);
      document.removeEventListener("visibilitychange", refreshIfIdle);
    };
  }, [busy, router]);

  function refreshOs() {
    lastAutoRefreshRef.current = Date.now();
    router.refresh();
  }

  async function handleAddServico(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/servico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricaoServ, horas, valorHora, codigoServicoLc116: codigoServLc116 || null, tecnicoId: tecnicoServ || null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar serviço.");
      setDescricaoServ("");
      setHoras(1);
      setValorHora(0);
      setCodigoServLc116("");
      setTecnicoServ("");
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar serviço.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveServico(servicoId: string) {
    if (!window.confirm("Remover este serviço?")) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/servico`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicoId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao remover serviço.");
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover serviço.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPeca(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const produto = formData.produtos.find((p) => p.id === produtoId);
      const preco = precoPeca > 0 ? precoPeca : (produto?.preco ?? 0);
      const res = await fetch(`/api/erp/os/${os.id}/peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, quantidade: quantidadePeca, precoUnitario: preco }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar peça.");
      setProdutoId("");
      setQuantidadePeca(1);
      setPrecoPeca(0);
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar peça.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePeca(pecaId: string) {
    if (!window.confirm("Remover esta peça?")) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/peca`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecaId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao remover peça.");
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover peça.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSalvarCabecalho(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipamento: cab.equipamento,
          placaOuSerial: cab.placaOuSerial || null,
          km: cab.km || null,
          problemaRelatado: cab.problemaRelatado || null,
          diagnostico: cab.diagnostico || null,
          observacoes: cab.observacoes || null,
          previsaoEm: cab.previsaoEm || null,
          tecnicoResponsavelId: cab.tecnicoResponsavelId || null,
          desconto: cab.desconto ? Number(cab.desconto.replace(",", ".")) : 0
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar.");
      setEditandoCab(false);
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddApontamento(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/apontamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: apontDescricao, horas: apontHoras ? Number(apontHoras.replace(",", ".")) : null, tecnicoId: apontTecnico || null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao registrar apontamento.");
      setApontDescricao("");
      setApontHoras("");
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar apontamento.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReemitir(tipo: "SERVICOS" | "PECAS") {
    if (!window.confirm(`Reemitir a ${tipo === "SERVICOS" ? "NFS-e (serviços)" : "NF-e (peças)"} desta OS?`)) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/reemitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao reemitir.");
      window.alert(data.status === "AUTORIZADA" ? "Nota autorizada!" : `Nota em ${data.status ?? "processamento"} — acompanhe em instantes.`);
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reemitir.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeStatus(newStatus: StatusOrdemServico) {
    if (!window.confirm(`Alterar status para "${newStatus}"?`)) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar status.");
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFaturar(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm("Confirmar faturamento desta OS?")) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/faturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emitirNfse,
          emitirNfePecas,
          formaPagamento: formaPagamento || undefined,
          condicaoPagamento: condicaoPagamento || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        notaFiscalId?: string;
        nfseError?: boolean;
        notaPecasId?: string;
        nfePecasError?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Erro ao faturar OS.");

      const avisos: string[] = ["OS faturada. Conta a receber criada."];
      if (emitirNfse) avisos.push(data.nfseError ? "⚠ Falha na NFS-e (serviços) — reemita em Fiscal." : data.notaFiscalId ? "✓ NFS-e (serviços) emitida." : "");
      if (emitirNfePecas) avisos.push(data.nfePecasError ? "⚠ Falha na NF-e (peças) — reemita em Fiscal." : data.notaPecasId ? "✓ NF-e (peças) emitida." : "");
      window.alert(avisos.filter(Boolean).join("\n"));
      refreshOs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao faturar OS.");
    } finally {
      setBusy(false);
    }
  }

  const editavel = !["FATURADA", "CANCELADA"].includes(os.status);

  return (
    <div>
      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      {/* Cabeçalho da OS */}
      <div className="erp-card">
        <div className="erp-card-head">
          <h3>OS {os.numero}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`pill ${os.statusTone}`}><span className="dot" />{os.statusLabel}</span>
            <a className="btn-erp ghost xs" href={`/api/erp/os/${os.id}/pdf`} target="_blank" rel="noopener noreferrer">🖨 Imprimir OS</a>
            {editavel && !editandoCab && <button type="button" className="btn-erp ghost xs" onClick={() => setEditandoCab(true)}>✏️ Editar</button>}
          </div>
        </div>

        {editandoCab ? (
          <form className="erp-form" style={{ padding: 16 }} onSubmit={handleSalvarCabecalho}>
            <label>Equipamento<input value={cab.equipamento} onChange={(e) => setCab((c) => ({ ...c, equipamento: e.target.value }))} required /></label>
            <label>Placa / Série<input value={cab.placaOuSerial} onChange={(e) => setCab((c) => ({ ...c, placaOuSerial: e.target.value }))} /></label>
            <label>KM / Horímetro<input value={cab.km} onChange={(e) => setCab((c) => ({ ...c, km: e.target.value }))} /></label>
            <label>Previsão de entrega<input type="datetime-local" value={cab.previsaoEm} onChange={(e) => setCab((c) => ({ ...c, previsaoEm: e.target.value }))} /></label>
            <label>Técnico responsável
              <select value={cab.tecnicoResponsavelId} onChange={(e) => setCab((c) => ({ ...c, tecnicoResponsavelId: e.target.value }))}>
                <option value="">— sem responsável —</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
            <label>Desconto (R$)<input inputMode="decimal" value={cab.desconto} onChange={(e) => setCab((c) => ({ ...c, desconto: e.target.value }))} /></label>
            <label className="full">Problema relatado<textarea value={cab.problemaRelatado} onChange={(e) => setCab((c) => ({ ...c, problemaRelatado: e.target.value }))} /></label>
            <label className="full">Diagnóstico (técnico)<textarea value={cab.diagnostico} onChange={(e) => setCab((c) => ({ ...c, diagnostico: e.target.value }))} /></label>
            <label className="full">Observações<textarea value={cab.observacoes} onChange={(e) => setCab((c) => ({ ...c, observacoes: e.target.value }))} /></label>
            <div className="full" style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn-erp primary sm" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
              <button type="button" className="btn-erp ghost sm" onClick={() => setEditandoCab(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <div className="kpi-row" style={{ marginBottom: 0, padding: 16 }}>
              <div className="kpi"><div className="l">Cliente</div><div className="v">{os.cliente}</div></div>
              <div className="kpi"><div className="l">Equipamento</div><div className="v">{os.equipamento}</div></div>
              {os.placaOuSerial && <div className="kpi"><div className="l">Placa / Série</div><div className="v">{os.placaOuSerial}</div></div>}
              {os.km && <div className="kpi"><div className="l">KM / Horímetro</div><div className="v">{os.km}</div></div>}
              <div className="kpi"><div className="l">Técnico responsável</div><div className="v">{os.tecnicoResponsavelNome ?? "—"}</div></div>
              {os.previsaoEm && <div className="kpi"><div className="l">Previsão</div><div className="v">{os.previsaoEm}</div></div>}
            </div>
            {(os.problemaRelatado || os.diagnostico || os.observacoes) && (
              <div className="erp-card-body" style={{ borderTop: "1px solid var(--erp-line)" }}>
                {os.problemaRelatado && <p style={{ margin: 0 }}><strong>Problema relatado:</strong> {os.problemaRelatado}</p>}
                {os.diagnostico && <p style={{ margin: os.problemaRelatado ? "8px 0 0" : 0 }}><strong>Diagnóstico:</strong> {os.diagnostico}</p>}
                {os.observacoes && <p style={{ margin: (os.problemaRelatado || os.diagnostico) ? "8px 0 0" : 0 }}><strong>Observações:</strong> {os.observacoes}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mudança de status */}
      {editavel && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Alterar situação</h3></div>
          <div className="erp-toolbar">
            {STATUS_OPTIONS.filter((s) => s.value !== os.status).map((s) => (
              <button
                key={s.value}
                type="button"
                className="btn-erp ghost sm"
                disabled={busy}
                onClick={() => handleChangeStatus(s.value)}
              >
                → {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Apontamentos — o técnico registra o que foi feito */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Execução — o que foi feito ({os.apontamentos.length})</h3></div>
        {editavel && (
          <form className="erp-form" style={{ padding: "12px 16px 0" }} onSubmit={handleAddApontamento}>
            <label className="full">O que foi feito
              <textarea placeholder="Ex.: Removido o cabeçote, trocada a junta e retificado o motor." value={apontDescricao} onChange={(e) => setApontDescricao(e.target.value)} required />
            </label>
            <label>Horas gastas (opcional)<input inputMode="decimal" placeholder="Ex.: 2,5" value={apontHoras} onChange={(e) => setApontHoras(e.target.value)} /></label>
            <label>Técnico
              <select value={apontTecnico} onChange={(e) => setApontTecnico(e.target.value)}>
                <option value="">{meuTecnico ? `${meuTecnico.nome} (você)` : "— selecione —"}</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              {!meuTecnico && !apontTecnico && <small className="field-hint">Vincule seu login a um técnico (cadastro de Técnicos) para registrar automaticamente como você.</small>}
            </label>
            <label style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="submit" className="btn-erp primary sm" disabled={busy}>{busy ? "Registrando…" : "Registrar"}</button>
            </label>
          </form>
        )}
        <div style={{ padding: 16 }}>
          {os.apontamentos.length === 0 ? (
            <div className="empty-st"><p>Nenhum registro de execução ainda.</p></div>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {os.apontamentos.map((a) => (
                <li key={a.id} style={{ borderLeft: "3px solid var(--erp-primary, #3b82f6)", paddingLeft: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--erp-slate, #64748b)" }}>
                    <strong style={{ color: "var(--erp-ink, #0f172a)" }}>{a.tecnicoNome}</strong>
                    {" · "}{new Date(a.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {a.horas && ` · ${a.horas}h`}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{a.descricao}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Serviços */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Serviços (mão de obra)</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Técnico</th>
                <th className="num">Horas</th>
                <th className="num">Valor/hora</th>
                <th className="num">Total</th>
                {editavel && <th className="actions" />}
              </tr>
            </thead>
            <tbody>
              {os.servicos.map((s) => (
                <tr key={s.id}>
                  <td>{s.descricao}</td>
                  <td>{s.tecnicoNome ?? "—"}</td>
                  <td className="num">{s.horas}h</td>
                  <td className="num">{s.valorHora}</td>
                  <td className="num">
                    <strong>{s.total}</strong>
                  </td>
                  {editavel && (
                    <td className="actions">
                      <button
                        className="btn-erp danger xs"
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveServico(s.id)}
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {os.servicos.length === 0 && (
                <tr>
                  <td colSpan={editavel ? 6 : 5}>
                    <div className="empty-st">
                      <h4>Sem serviços</h4>
                      <p>Nenhum serviço adicionado.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editavel && (
          <form onSubmit={handleAddServico}>
            <div className="erp-card-head"><h3>Adicionar serviço</h3></div>
            <div className="erp-form">
              <label className="full">
                Descrição
                <input
                  type="text"
                  placeholder="Ex: Diagnóstico e reparo"
                  value={descricaoServ}
                  onChange={(e) => setDescricaoServ(e.target.value)}
                  required
                />
              </label>
              <label>
                Horas
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={horas}
                  onChange={(e) => setHoras(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Valor/hora (R$)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={valorHora}
                  onChange={(e) => setValorHora(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Técnico que executou
                <select value={tecnicoServ} onChange={(e) => setTecnicoServ(e.target.value)}>
                  <option value="">— opcional —</option>
                  {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <label className="full">
                Código de Tributação Nacional — para NFS-e
                <select value={codigoServLc116} onChange={(e) => setCodigoServLc116(e.target.value)}>
                  <option value="">Usar padrão da empresa (config. fiscal)</option>
                  {CODIGO_SERVICO_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>{item.code} — {item.description}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="erp-toolbar">
              <span>Total: {formatBrl(horas * valorHora)}</span>
              <div className="grow" />
              <button type="submit" className="btn-erp primary sm" disabled={busy}>
                Adicionar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Peças */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Peças utilizadas</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Qtd.</th>
                <th className="num">Preço unit.</th>
                <th className="num">Total</th>
                {editavel && <th className="actions" />}
              </tr>
            </thead>
            <tbody>
              {os.pecas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.produtoNome}</strong>
                    <span className="sublabel">{p.produtoSku}</span>
                  </td>
                  <td className="num">{p.quantidade}</td>
                  <td className="num">{p.precoUnitario}</td>
                  <td className="num">
                    <strong>{p.total}</strong>
                  </td>
                  {editavel && (
                    <td className="actions">
                      <button
                        className="btn-erp danger xs"
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemovePeca(p.id)}
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {os.pecas.length === 0 && (
                <tr>
                  <td colSpan={editavel ? 5 : 4}>
                    <div className="empty-st">
                      <h4>Sem peças</h4>
                      <p>Nenhuma peça adicionada.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {editavel && (
          <form onSubmit={handleAddPeca}>
            <div className="erp-card-head"><h3>Adicionar peça</h3></div>
            <div className="erp-form">
              <label className="full">
                Produto
                <select
                  value={produtoId}
                  onChange={(e) => {
                    const p = formData.produtos.find((prod) => prod.id === e.target.value);
                    setProdutoId(e.target.value);
                    if (p) setPrecoPeca(p.preco);
                  }}
                  required
                >
                  <option value="">Selecione</option>
                  {formData.produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  min={1}
                  value={quantidadePeca}
                  onChange={(e) => setQuantidadePeca(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Preço unitário (R$)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={precoPeca}
                  onChange={(e) => setPrecoPeca(Number(e.target.value))}
                  required
                />
              </label>
            </div>
            <div className="erp-toolbar">
              <span>Total: {formatBrl(quantidadePeca * precoPeca)}</span>
              <div className="grow" />
              <button type="submit" className="btn-erp primary sm" disabled={busy}>
                Adicionar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Totais */}
      <div className="kpi-row">
        <div className="kpi"><div className="l">Serviços</div><div className="v">{os.totalServicos}</div></div>
        <div className="kpi"><div className="l">Peças</div><div className="v">{os.totalPecas}</div></div>
        <div className="kpi"><div className="l">Total</div><div className="v" style={{ color: "var(--erp-success)" }}>{os.total}</div></div>
      </div>

      {/* Faturamento */}
      {os.canFaturar && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Faturar OS</h3></div>
          <form onSubmit={handleFaturar}>
            <div className="erp-form">
              <label>
                Forma de pagamento
                <input
                  type="text"
                  placeholder="Ex: Boleto, PIX, Cartão"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                />
              </label>
              <label>
                Condição de pagamento
                <input
                  type="text"
                  placeholder="Ex: À vista, 30 dias"
                  value={condicaoPagamento}
                  onChange={(e) => setCondicaoPagamento(e.target.value)}
                />
              </label>
              {os.servicos.length > 0 && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={emitirNfse}
                    onChange={(e) => setEmitirNfse(e.target.checked)}
                  />
                  Emitir NFS-e para os serviços (mão de obra)
                </label>
              )}
              {os.pecas.length > 0 && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={emitirNfePecas}
                    onChange={(e) => setEmitirNfePecas(e.target.checked)}
                  />
                  Emitir NF-e (modelo 55) para as peças (mercadoria)
                </label>
              )}
            </div>
            <div className="erp-toolbar">
              <div className="grow" />
              <button type="submit" className="btn-erp primary sm" disabled={busy}>
                {busy ? "Faturando…" : "Confirmar faturamento"}
              </button>
            </div>
          </form>
        </div>
      )}

      {os.status === "FATURADA" && (
        <>
          <div className="alert success">
            <strong>OS Faturada</strong>
            <span>
              Faturada em {os.faturadoEm}. Acesse{" "}
              <a href="/erp/financeiro">Financeiro</a> para ver a conta a receber.
            </span>
          </div>

          {/* Notas fiscais da OS — status e reemissão */}
          <div className="erp-card">
            <div className="erp-card-head"><h3>Notas fiscais</h3></div>
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead><tr><th>Documento</th><th>Número</th><th>Situação</th><th className="actions" /></tr></thead>
                <tbody>
                  {os.notas.map((n) => {
                    const falhou = ["REJEITADA", "ERRO", "DENEGADA"].includes(n.status);
                    return (
                      <tr key={n.id}>
                        <td>{n.modelo === "NFSE" ? "NFS-e (serviços)" : "NF-e (peças)"}</td>
                        <td>{n.numero || "—"}</td>
                        <td>
                          <span className={`pill ${n.status === "AUTORIZADA" ? "success" : falhou ? "danger" : "warn"}`}><span className="dot" />{n.status}</span>
                          {n.motivo && falhou && <small className="block-muted">{n.motivo}</small>}
                        </td>
                        <td className="actions">
                          {n.status === "AUTORIZADA" && <a className="btn-erp ghost xs" href={`/api/erp/fiscal/${n.id}/pdf`} target="_blank" rel="noopener noreferrer">DANFE/PDF</a>}
                          {falhou && <button type="button" className="btn-erp primary xs" disabled={busy} onClick={() => handleReemitir(n.modelo === "NFSE" ? "SERVICOS" : "PECAS")}>↻ Reemitir</button>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Notas que ainda não existem mas podem ser emitidas */}
                  {os.servicos.length > 0 && !os.notas.some((n) => n.modelo === "NFSE") && (
                    <tr><td>NFS-e (serviços)</td><td>—</td><td><span className="pill mute"><span className="dot" />não emitida</span></td><td className="actions"><button type="button" className="btn-erp primary xs" disabled={busy} onClick={() => handleReemitir("SERVICOS")}>Emitir</button></td></tr>
                  )}
                  {os.pecas.length > 0 && !os.notas.some((n) => n.modelo === "NFE") && (
                    <tr><td>NF-e (peças)</td><td>—</td><td><span className="pill mute"><span className="dot" />não emitida</span></td><td className="actions"><button type="button" className="btn-erp primary xs" disabled={busy} onClick={() => handleReemitir("PECAS")}>Emitir</button></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
