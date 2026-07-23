"use client";

import { useState } from "react";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Cadastro self-service do Emissor de Notas em 2 PASSOS:
 *  1) CNPJ → busca automática na Receita (BrasilAPI) e mostra a empresa encontrada;
 *  2) dados de acesso (nome, e-mail, senha) → cria a conta já com endereço/regime preenchidos.
 * Se a consulta falhar (API fora/limite), cai no preenchimento manual do nome da empresa.
 */

type LookupDados = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  inscricaoEstadual: string | null;
  email: string | null;
  telefone: string | null;
  regimeDetectado: "MEI" | "SIMPLES_NACIONAL" | null;
  endereco: {
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    uf: string | null;
    codigoMunicipioIbge: string | null;
  };
};

const formatCnpj = (v: string) => {
  const d = normalizeDocumento(v).slice(0, 14);
  return d
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/\.(.{3})(.)/, ".$1/$2")
    .replace(/(.{4})(.)/, "$1-$2");
};

const campo = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, marginBottom: 10 };
const input = { height: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 10px" };
const btnPrimario = { width: "100%", height: 42, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" } as const;

export function CadastroEmissorForm({ plano = "EMISSOR" }: { plano?: "EMISSOR" | "CHAT" }) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [cnpj, setCnpj] = useState("");
  const [dados, setDados] = useState<LookupDados | null>(null);
  const [manual, setManual] = useState(false); // lookup falhou → digita o nome da empresa
  const [empresa, setEmpresa] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [site, setSite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pronto, setPronto] = useState(false);

  async function buscarCnpj(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/public/cadastro-emissor/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj, site })
      });
      const d = (await res.json().catch(() => ({}))) as { jaCadastrado?: boolean; dados?: LookupDados; error?: string };
      if (d.jaCadastrado) {
        setErro("Este CNPJ já tem conta — faça login ou fale com o suporte.");
        return;
      }
      if (!res.ok || !d.dados) {
        // Consulta indisponível: segue manual (não trava o cadastro por causa da API pública).
        setManual(true);
        setDados(null);
        setAviso(d.error || "Não conseguimos consultar o CNPJ agora — preencha o nome da empresa abaixo.");
        setPasso(2);
        return;
      }
      setDados(d.dados);
      setManual(false);
      setEmpresa(d.dados.razaoSocial ?? "");
      if (d.dados.email && !email) setEmail(d.dados.email.toLowerCase());
      setPasso(2);
    } catch {
      setManual(true);
      setAviso("Não conseguimos consultar o CNPJ agora — preencha o nome da empresa abaixo.");
      setPasso(2);
    } finally {
      setBusy(false);
    }
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/public/cadastro-emissor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa,
          cnpj,
          nome,
          email,
          senha,
          site,
          plano,
          empresaDados: dados
            ? {
                nomeFantasia: dados.nomeFantasia,
                inscricaoEstadual: dados.inscricaoEstadual,
                regimeTributario: dados.regimeDetectado,
                telefone: dados.telefone,
                email: dados.email,
                enderecoLogradouro: dados.endereco.logradouro,
                enderecoNumero: dados.endereco.numero,
                enderecoComplemento: dados.endereco.complemento,
                enderecoBairro: dados.endereco.bairro,
                enderecoCidade: dados.endereco.cidade,
                enderecoUf: dados.endereco.uf,
                enderecoCep: dados.endereco.cep,
                codigoMunicipioIbge: dados.endereco.codigoMunicipioIbge
              }
            : undefined
        })
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
          Entre com o e-mail <strong>{email}</strong> e a senha que você escolheu.
          {dados
            ? " Os dados da sua empresa já foram preenchidos — falta só enviar o certificado A1 para começar a emitir."
            : " Primeiro passo lá dentro: completar os dados da empresa e enviar o certificado A1."}
        </p>
        <a href="/login" style={{ display: "inline-block", marginTop: 10, background: "#16a34a", color: "#fff", padding: "10px 24px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>
          Fazer login →
        </a>
      </div>
    );
  }

  // ── Passo 1: só o CNPJ ──
  if (passo === 1) {
    return (
      <form onSubmit={buscarCnpj}>
        {erro && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        <label style={campo}>CNPJ da sua empresa
          <input
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
            required
            inputMode="text"
            autoCapitalize="characters"
            autoFocus
            placeholder="00.000.000/0000-00"
            style={{ ...input, fontSize: 16, height: 44, textAlign: "center", letterSpacing: "0.03em" }}
          />
        </label>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
          Buscamos os dados na Receita e preenchemos o cadastro para você.
        </p>
        {/* honeypot — escondido de humanos */}
        <input value={site} onChange={(e) => setSite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden="true" />
        <button type="submit" disabled={busy || !isValidCnpj(cnpj)} style={{ ...btnPrimario, opacity: isValidCnpj(cnpj) ? 1 : 0.6 }}>
          {busy ? "Buscando na Receita…" : "Buscar minha empresa →"}
        </button>
      </form>
    );
  }

  // ── Passo 2: empresa encontrada + dados de acesso ──
  return (
    <form onSubmit={cadastrar}>
      {erro && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
      {aviso && <div style={{ background: "#fffbeb", color: "#92400e", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 10 }}>{aviso}</div>}

      {dados ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong style={{ color: "#166534" }}>✓ Empresa encontrada</strong>
            <button type="button" onClick={() => { setPasso(1); setDados(null); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              trocar CNPJ
            </button>
          </div>
          <div style={{ marginTop: 4, color: "#14532d" }}>
            {dados.razaoSocial}
            {dados.endereco.cidade && <> · {dados.endereco.cidade}/{dados.endereco.uf}</>}
            {dados.regimeDetectado && (
              <span style={{ display: "inline-block", marginLeft: 6, background: "#dcfce7", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                {dados.regimeDetectado === "MEI" ? "MEI" : "Simples Nacional"}
              </span>
            )}
          </div>
        </div>
      ) : (
        <label style={campo}>Nome da empresa
          <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} required style={input} />
        </label>
      )}

      <label style={campo}>Seu nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus style={input} />
      </label>
      <label style={campo}>E-mail (será seu login)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
      </label>
      <label style={campo}>Senha (mín. 8 caracteres)
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} style={input} />
      </label>
      {/* honeypot — escondido de humanos */}
      <input value={site} onChange={(e) => setSite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, top: -9999 }} aria-hidden="true" />
      <button type="submit" disabled={busy} style={btnPrimario}>
        {busy ? "Criando conta…" : "Começar teste grátis →"}
      </button>
    </form>
  );
}
