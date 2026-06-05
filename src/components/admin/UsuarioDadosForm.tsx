"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";

type Props = {
  usuarioId: string;
  nome: string;
  email: string;
  status: "ATIVO" | "INATIVO";
  plataformaAdmin: boolean;
};

export function UsuarioDadosForm({ usuarioId, nome: nomeInicial, email: emailInicial, status: statusInicial, plataformaAdmin: paInicial }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeInicial);
  const [email, setEmail] = useState(emailInicial);
  const [status, setStatus] = useState<"ATIVO" | "INATIVO">(statusInicial);
  const [plataformaAdmin, setPlataformaAdmin] = useState(paInicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setOk(false);
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, status, plataformaAdmin })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setOk(true);
      router.refresh();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      {erro && <div className="alert danger" style={{ marginBottom: 12 }}><span>{erro}</span></div>}
      {ok && <div className="alert success" style={{ marginBottom: 12 }}><span>Dados atualizados.</span></div>}

      <div className="form-grid two">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as "ATIVO" | "INATIVO")}>
            <option value="ATIVO">ATIVO</option>
            <option value="INATIVO">INATIVO</option>
          </select>
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "end" }}>
          <input type="checkbox" checked={plataformaAdmin} onChange={(e) => setPlataformaAdmin(e.target.checked)} style={{ width: "auto" }} />
          Dono da plataforma
        </label>
      </div>

      <div className="erp-page-actions" style={{ marginTop: 16 }}>
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar dados"}</Button>
      </div>
    </form>
  );
}
