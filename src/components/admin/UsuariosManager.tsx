"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type VinculoInfo = { clienteId: string; clienteNome: string; empresaNome: string | null; perfilNome: string; ativo: boolean };
type Usuario = {
  id: string;
  nome: string;
  email: string;
  status: "ATIVO" | "INATIVO";
  plataformaAdmin: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  vinculos: VinculoInfo[];
};
type EstruturaCliente = { id: string; nome: string; empresas: { id: string; nome: string }[]; perfis: { id: string; nome: string }[] };

type Props = { usuarios: Usuario[]; estrutura: EstruturaCliente[] };

function formatarData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

const novoVazio = {
  nome: "",
  email: "",
  senha: "",
  tipo: "CLIENTE" as "CLIENTE" | "PLATAFORMA",
  tenantId: "",
  empresaId: "",
  perfilId: ""
};

export function UsuariosManager({ usuarios, estrutura }: Props) {
  const router = useRouter();
  const [abrirNovo, setAbrirNovo] = useState(false);
  const [form, setForm] = useState(novoVazio);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [criado, setCriado] = useState<{ email: string; senha: string } | null>(null);

  const clienteSel = useMemo(() => estrutura.find((c) => c.id === form.tenantId), [estrutura, form.tenantId]);

  function set<K extends keyof typeof novoVazio>(campo: K, valor: string) {
    setForm((f) => {
      const next = { ...f, [campo]: valor };
      // Ao trocar de cliente, zera empresa/perfil dependentes.
      if (campo === "tenantId") {
        next.empresaId = "";
        next.perfilId = "";
      }
      return next;
    });
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    setCriado(null);
    try {
      const payload =
        form.tipo === "PLATAFORMA"
          ? { nome: form.nome, email: form.email, senha: form.senha || undefined, tipo: "PLATAFORMA" }
          : {
              nome: form.nome,
              email: form.email,
              senha: form.senha || undefined,
              tipo: "CLIENTE",
              tenantId: form.tenantId,
              empresaId: form.empresaId,
              perfilId: form.perfilId
            };
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({}))) as { email?: string; senha?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o usuário.");
      setCriado({ email: data.email ?? form.email, senha: data.senha ?? "" });
      setForm(novoVazio);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="erp-page-actions" style={{ marginBottom: 12 }}>
        <Button
          onClick={() => {
            setAbrirNovo((v) => !v);
            setCriado(null);
            setErro("");
          }}
        >
          {abrirNovo ? "Fechar" : "Novo usuário"}
        </Button>
      </div>

      {abrirNovo && (
        <Card>
          {criado ? (
            <div className="alert success">
              <strong>Usuário criado</strong>
              <span>
                E-mail <b>{criado.email}</b> · Senha inicial: <code className="mark">{criado.senha}</code>
                <br />Anote agora — não será exibida novamente.
              </span>
            </div>
          ) : (
            <form onSubmit={criar}>
              {erro && (
                <div className="alert danger" style={{ marginBottom: 12 }}>
                  <strong>Atenção</strong>
                  <span>{erro}</span>
                </div>
              )}

              <div className="form-grid two">
                <label>
                  Nome *
                  <input value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
                </label>
                <label>
                  E-mail *
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
                </label>
                <label>
                  Senha inicial
                  <input value={form.senha} onChange={(e) => set("senha", e.target.value)} placeholder="deixe vazio para gerar automaticamente" />
                </label>
                <label>
                  Tipo de usuário *
                  <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                    <option value="CLIENTE">Usuário de cliente</option>
                    <option value="PLATAFORMA">Dono da plataforma</option>
                  </select>
                </label>
              </div>

              {form.tipo === "CLIENTE" && (
                <div className="form-grid two" style={{ marginTop: 4 }}>
                  <label>
                    Cliente *
                    <select value={form.tenantId} onChange={(e) => set("tenantId", e.target.value)} required>
                      <option value="">Selecione…</option>
                      {estrutura.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Empresa *
                    <select value={form.empresaId} onChange={(e) => set("empresaId", e.target.value)} required disabled={!clienteSel}>
                      <option value="">Selecione…</option>
                      {clienteSel?.empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Perfil *
                    <select value={form.perfilId} onChange={(e) => set("perfilId", e.target.value)} required disabled={!clienteSel}>
                      <option value="">Selecione…</option>
                      {clienteSel?.perfis.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="erp-page-actions" style={{ marginTop: 16 }}>
                <Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar usuário"}</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Vínculos</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum usuário cadastrado.</td>
                </tr>
              )}
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/usuarios/${u.id}`} className="bold">{u.nome}</Link>
                    {u.plataformaAdmin && <span className="sublabel">Dono da plataforma</span>}
                  </td>
                  <td className="mono">{u.email}</td>
                  <td>{resumoVinculos(u)}</td>
                  <td><StatusBadge tone={u.status === "ATIVO" ? "success" : "mute"}>{u.status}</StatusBadge></td>
                  <td>{formatarData(u.ultimoAcessoEm)}</td>
                  <td className="actions">
                    <Link href={`/admin/usuarios/${u.id}`} className="btn-erp ghost sm">Gerenciar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function resumoVinculos(usuario: Usuario) {
  if (usuario.plataformaAdmin && usuario.vinculos.length === 0) return <span className="sublabel">Sem cliente (plataforma)</span>;
  if (usuario.vinculos.length === 0) return <span className="sublabel">—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {usuario.vinculos.map((v, i) => (
        <span key={i} style={{ fontSize: 12 }}>
          <b>{v.clienteNome}</b>
          {v.empresaNome ? ` · ${v.empresaNome}` : ""} · {v.perfilNome}
          {!v.ativo && <span className="sublabel"> (inativo)</span>}
        </span>
      ))}
    </div>
  );
}
