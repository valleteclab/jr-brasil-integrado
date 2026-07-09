"use client";

import { useState } from "react";

/** Formulário do cadastro self-service do Emissor de Notas (rota pública, honeypot anti-bot). */
export function CadastroEmissorForm() {
  const [empresa, setEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [site, setSite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/public/cadastro-emissor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa, cnpj, nome, email, senha, site })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível concluir o cadastro.");
      setPronto(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  if (pronto) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>✅</div>
        <h2 style={{ fontSize: 16, margin: "8px 0" }}>Conta criada!</h2>
        <p style={{ fontSize: 13, color: "#475569" }}>
          Entre com o e-mail <strong>{email}</strong> e a senha que você escolheu. Primeiro passo lá
          dentro: enviar seu <strong>certificado A1</strong> em Configurações → Emissão fiscal.
        </p>
        <a href="/login" style={{ display: "inline-block", marginTop: 10, background: "#16a34a", color: "#fff", padding: "10px 24px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>
          Fazer login →
        </a>
      </div>
    );
  }

  const campo = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, marginBottom: 10 };
  const input = { height: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 10px" };

  return (
    <form onSubmit={cadastrar}>
      {erro && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      <label style={campo}>Nome da empresa
        <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} required style={input} />
      </label>
      <label style={campo}>CNPJ
        <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} required inputMode="numeric" placeholder="00.000.000/0000-00" style={input} />
      </label>
      <label style={campo}>Seu nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} required style={input} />
      </label>
      <label style={campo}>E-mail (será seu login)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
      </label>
      <label style={campo}>Senha (mín. 8 caracteres)
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} style={input} />
      </label>
      {/* honeypot — escondido de humanos */}
      <input value={site} onChange={(e) => setSite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden="true" />
      <button type="submit" disabled={busy} style={{ width: "100%", height: 42, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
        {busy ? "Criando conta…" : "Começar teste grátis →"}
      </button>
    </form>
  );
}
