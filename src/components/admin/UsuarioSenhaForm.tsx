"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";

type Props = { usuarioId: string };

export function UsuarioSenhaForm({ usuarioId }: Props) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);

  async function aplicar(novaSenha?: string) {
    setBusy(true);
    setErro("");
    setResultado(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}/resetar-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaSenha ? { novaSenha } : {})
      });
      const data = (await res.json().catch(() => ({}))) as { senhaInicial?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível alterar a senha.");
      setResultado(data.senhaInicial ?? novaSenha ?? "");
      setSenha("");
      setConfirmar("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
    } finally {
      setBusy(false);
    }
  }

  function definir(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      setErro("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setErro("As senhas não conferem.");
      return;
    }
    void aplicar(senha);
  }

  return (
    <form onSubmit={definir}>
      {erro && <div className="alert danger" style={{ marginBottom: 12 }}><span>{erro}</span></div>}
      {resultado && (
        <div className="alert success" style={{ marginBottom: 12 }}>
          <span>Senha atualizada: <code className="mark">{resultado}</code><br />Anote agora — não será exibida novamente.</span>
        </div>
      )}

      <div className="form-grid two">
        <label>
          Nova senha
          <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 8 caracteres" autoComplete="new-password" />
        </label>
        <label>
          Confirmar senha
          <input type="text" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" />
        </label>
      </div>

      <div className="erp-page-actions" style={{ marginTop: 16, gap: 8 }}>
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Definir senha"}</Button>
        <Button type="button" variant="light" disabled={busy} onClick={() => aplicar()}>Gerar senha temporária</Button>
      </div>
    </form>
  );
}
