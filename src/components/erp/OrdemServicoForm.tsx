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
    <form onSubmit={handleSubmit} className="op-form">
      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="op-form-grid">
        <div className="op-form-field">
          <label htmlFor="clienteId">Cliente *</label>
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
        </div>

        <div className="op-form-field">
          <label htmlFor="equipamento">Equipamento *</label>
          <input
            id="equipamento"
            type="text"
            placeholder="Ex: Notebook Dell Inspiron 15"
            value={equipamento}
            onChange={(e) => setEquipamento(e.target.value)}
            required
          />
        </div>

        <div className="op-form-field">
          <label htmlFor="placaOuSerial">Placa / Número de série</label>
          <input
            id="placaOuSerial"
            type="text"
            placeholder="Ex: ABC-1234 ou SN1234567"
            value={placaOuSerial}
            onChange={(e) => setPlacaOuSerial(e.target.value)}
          />
        </div>

        <div className="op-form-field">
          <label htmlFor="previsaoEm">Previsão de entrega</label>
          <input
            id="previsaoEm"
            type="date"
            value={previsaoEm}
            onChange={(e) => setPrevisaoEm(e.target.value)}
          />
        </div>
      </div>

      <div className="op-form-field">
        <label htmlFor="problemaRelatado">Problema relatado pelo cliente</label>
        <textarea
          id="problemaRelatado"
          rows={3}
          placeholder="Descreva o problema relatado pelo cliente..."
          value={problemaRelatado}
          onChange={(e) => setProblemaRelatado(e.target.value)}
        />
      </div>

      <div className="op-form-field">
        <label htmlFor="observacoes">Observações internas</label>
        <textarea
          id="observacoes"
          rows={2}
          placeholder="Observações internas da oficina..."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>

      <div className="op-form-actions">
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
