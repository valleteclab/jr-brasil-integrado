"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { KpiCard } from "@/components/shared/KpiCard";
import type { OrdemServicoDetail as OsDetail } from "@/lib/services/service-order";
import type { OsFormData } from "@/lib/services/service-order";

type Props = {
  os: OsDetail;
  formData: OsFormData;
};

type StatusOrdemServico = "ABERTA" | "EM_ANDAMENTO" | "AGUARDANDO_PECAS" | "FINALIZADA_NAO_FATURADA";

const STATUS_OPTIONS: { value: StatusOrdemServico; label: string }[] = [
  { value: "ABERTA", label: "Aberta" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "AGUARDANDO_PECAS", label: "Aguardando peças" },
  { value: "FINALIZADA_NAO_FATURADA", label: "Finalizada (não faturada)" },
];

export function OrdemServicoDetail({ os: initialOs, formData }: Props) {
  const [os, setOs] = useState(initialOs);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Servico form
  const [descricaoServ, setDescricaoServ] = useState("");
  const [horas, setHoras] = useState(1);
  const [valorHora, setValorHora] = useState(0);

  // Peca form
  const [produtoId, setProdutoId] = useState("");
  const [quantidadePeca, setQuantidadePeca] = useState(1);
  const [precoPeca, setPrecoPeca] = useState(0);

  // Faturamento
  const [emitirNfse, setEmitirNfse] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");

  function formatBrl(v: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  }

  async function reload() {
    const res = await fetch(`/api/erp/os/${os.id}/detail`);
    // For now just reload the full page to reflect changes
    window.location.reload();
  }

  async function handleAddServico(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/os/${os.id}/servico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricaoServ, horas, valorHora }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar serviço.");
      setDescricaoServ("");
      setHoras(1);
      setValorHora(0);
      window.location.reload();
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
      window.location.reload();
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
      window.location.reload();
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
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover peça.");
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
      window.location.reload();
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
          formaPagamento: formaPagamento || undefined,
          condicaoPagamento: condicaoPagamento || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        notaFiscalId?: string;
        nfseError?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Erro ao faturar OS.");

      if (data.nfseError) {
        window.alert("OS faturada, mas houve falha na emissão da NFS-e. Emita manualmente em Fiscal.");
      } else if (data.notaFiscalId) {
        window.alert("OS faturada e NFS-e emitida com sucesso!");
      } else {
        window.alert("OS faturada com sucesso! Conta a receber criada.");
      }
      window.location.reload();
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
          <StatusBadge tone={os.statusTone}>{os.statusLabel}</StatusBadge>
        </div>
        <div className="kpi-row">
          <KpiCard label="Número" value={os.numero} />
          <KpiCard label="Cliente" value={os.cliente} />
          <KpiCard label="Equipamento" value={os.equipamento} />
          {os.placaOuSerial && <KpiCard label="Placa / Série" value={os.placaOuSerial} />}
          {os.previsaoEm && <KpiCard label="Previsão" value={os.previsaoEm} />}
        </div>
        {os.problemaRelatado && (
          <p>
            <strong>Problema relatado:</strong> {os.problemaRelatado}
          </p>
        )}
        {os.observacoes && (
          <p>
            <strong>Observações:</strong> {os.observacoes}
          </p>
        )}
      </div>

      {/* Mudança de status */}
      {editavel && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Alterar situação</h3></div>
          <div className="erp-toolbar">
            {STATUS_OPTIONS.filter((s) => s.value !== os.status).map((s) => (
              <Button
                key={s.value}
                variant="light"
                type="button"
                disabled={busy}
                onClick={() => handleChangeStatus(s.value)}
              >
                → {s.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Serviços */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Serviços (mão de obra)</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Descrição</th>
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
                  <td className="num">{s.horas}h</td>
                  <td className="num">{s.valorHora}</td>
                  <td className="num">
                    <strong>{s.total}</strong>
                  </td>
                  {editavel && (
                    <td className="actions">
                      <button
                        className="danger-link"
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
                  <td colSpan={editavel ? 5 : 4}>
                    <div className="empty-st">Nenhum serviço adicionado.</div>
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
            </div>
            <div className="erp-toolbar">
              <span>Total: {formatBrl(horas * valorHora)}</span>
              <div className="toolbar-grow" />
              <Button type="submit" variant="light" disabled={busy}>
                Adicionar
              </Button>
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
                    <small className="block-muted">{p.produtoSku}</small>
                  </td>
                  <td className="num">{p.quantidade}</td>
                  <td className="num">{p.precoUnitario}</td>
                  <td className="num">
                    <strong>{p.total}</strong>
                  </td>
                  {editavel && (
                    <td className="actions">
                      <button
                        className="danger-link"
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
                    <div className="empty-st">Nenhuma peça adicionada.</div>
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
              <div className="toolbar-grow" />
              <Button type="submit" variant="light" disabled={busy}>
                Adicionar
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Totais */}
      <div className="kpi-row">
        <KpiCard label="Serviços" value={os.totalServicos} />
        <KpiCard label="Peças" value={os.totalPecas} />
        <KpiCard label="Total" value={os.total} tone="success" />
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
                  Emitir NFS-e para os serviços
                </label>
              )}
            </div>
            <div className="erp-toolbar">
              <div className="toolbar-grow" />
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Faturando..." : "Confirmar faturamento"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {os.status === "FATURADA" && (
        <div className="alert success">
          <strong>OS Faturada</strong>
          <span>
            Faturada em {os.faturadoEm}. Acesse{" "}
            <a href="/erp/financeiro">Financeiro</a> para ver a conta a receber.
          </span>
        </div>
      )}
    </div>
  );
}
