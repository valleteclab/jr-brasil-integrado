"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import type { OsFormData } from "@/lib/services/service-order";

type Props = {
  formData: OsFormData;
};

export function OrdemServicoForm({ formData }: Props) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [placaOuSerial, setPlacaOuSerial] = useState("");
  const [problemaRelatado, setProblemaRelatado] = useState("");
  const [previsaoEm, setPrevisaoEm] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!clienteId) {
      setError("Selecione um cliente.");
      return;
    }
    if (!equipamento.trim()) {
      setError("Informe o equipamento.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/erp/os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          equipamento: equipamento.trim(),
          placaOuSerial: placaOuSerial.trim() || undefined,
          problemaRelatado: problemaRelatado.trim() || undefined,
          previsaoEm: previsaoEm || undefined,
          observacoes: observacoes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; numero?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar OS.");
      router.push(`/erp/os/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar OS.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Dados da ordem de serviço</h3></div>
        <div className="erp-form">
          <label htmlFor="clienteId">
            Cliente *
            <select
              id="clienteId"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">Selecione um cliente</option>
              {formData.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="equipamento">
            Equipamento *
            <input
              id="equipamento"
              type="text"
              placeholder="Ex: Notebook Dell Inspiron 15"
              value={equipamento}
              onChange={(e) => setEquipamento(e.target.value)}
              required
            />
          </label>

          <label htmlFor="placaOuSerial">
            Placa / Número de série
            <input
              id="placaOuSerial"
              type="text"
              placeholder="Ex: ABC-1234 ou SN1234567"
              value={placaOuSerial}
              onChange={(e) => setPlacaOuSerial(e.target.value)}
            />
          </label>

          <label htmlFor="previsaoEm">
            Previsão de entrega
            <input
              id="previsaoEm"
              type="date"
              value={previsaoEm}
              onChange={(e) => setPrevisaoEm(e.target.value)}
            />
          </label>

          <label className="full" htmlFor="problemaRelatado">
            Problema relatado pelo cliente
            <textarea
              id="problemaRelatado"
              rows={3}
              placeholder="Descreva o problema relatado pelo cliente..."
              value={problemaRelatado}
              onChange={(e) => setProblemaRelatado(e.target.value)}
            />
          </label>

          <label className="full" htmlFor="observacoes">
            Observações internas
            <textarea
              id="observacoes"
              rows={2}
              placeholder="Observações internas da oficina..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="erp-toolbar">
        <div className="toolbar-grow" />
        <Button type="button" variant="light" href="/erp/os">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Salvando..." : "Abrir OS"}
        </Button>
      </div>
    </form>
  );
}
