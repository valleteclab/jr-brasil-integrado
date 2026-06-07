"use client";

import { useRef, useState } from "react";

type Props = { clienteId: string; empresaId: string };

type ResultadoTone = "info" | "danger";
type Resultado = { tone: ResultadoTone; texto: string } | null;

export function FiscalAdminAcoes({ clienteId, empresaId }: Props) {
  const base = `/api/admin/clientes/${clienteId}/empresas/${empresaId}/fiscal`;

  const fileRef = useRef<HTMLInputElement>(null);
  const [senha, setSenha] = useState("");

  const [carregando, setCarregando] = useState<"" | "certificado" | "testar" | "emissao">("");
  const [resCertificado, setResCertificado] = useState<Resultado>(null);
  const [resTestar, setResTestar] = useState<Resultado>(null);
  const [resEmissao, setResEmissao] = useState<Resultado>(null);

  async function enviarCertificado() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setResCertificado({ tone: "danger", texto: "Selecione um arquivo .pfx ou .p12." });
      return;
    }
    setCarregando("certificado");
    setResCertificado(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("senha", senha);
      const res = await fetch(`${base}/certificado`, { method: "POST", body: formData });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Não foi possível enviar o certificado.");
      }
      setResCertificado({ tone: "info", texto: "Certificado enviado com sucesso." });
      if (fileRef.current) fileRef.current.value = "";
      setSenha("");
    } catch (e) {
      setResCertificado({ tone: "danger", texto: e instanceof Error ? e.message : "Falha no envio do certificado." });
    } finally {
      setCarregando("");
    }
  }

  async function testarConexao() {
    setCarregando("testar");
    setResTestar(null);
    try {
      const res = await fetch(`${base}/testar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        [key: string]: unknown;
      };
      if (data.error) {
        setResTestar({ tone: "danger", texto: data.error });
        return;
      }
      const ok = data.ok !== false && res.ok;
      const mensagem =
        typeof data.message === "string" && data.message
          ? data.message
          : JSON.stringify(data, null, 2);
      setResTestar({ tone: ok ? "info" : "danger", texto: mensagem });
    } catch (e) {
      setResTestar({ tone: "danger", texto: e instanceof Error ? e.message : "Falha ao testar a conexão." });
    } finally {
      setCarregando("");
    }
  }

  async function emitirTeste() {
    setCarregando("emissao");
    setResEmissao(null);
    try {
      const res = await fetch(`${base}/emissao-teste`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        numero?: string | number;
        motivo?: string;
        error?: string;
      };
      if (data.error) {
        setResEmissao({ tone: "danger", texto: data.error });
        return;
      }
      const status = data.status || "—";
      const partes: string[] = [status];
      if (data.numero != null) partes.push(`NF-e ${data.numero}`);
      if (data.motivo) partes.push(data.motivo);
      const texto = partes.join(" · ");
      const autorizada = /AUTORIZAD/i.test(status);
      setResEmissao({ tone: autorizada ? "info" : "danger", texto });
    } catch (e) {
      setResEmissao({ tone: "danger", texto: e instanceof Error ? e.message : "Falha na emissão de teste." });
    } finally {
      setCarregando("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Upload de certificado A1 */}
      <div>
        <h4 style={{ margin: "0 0 8px" }}>Certificado digital A1</h4>
        <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>
            Arquivo (.pfx / .p12)
            <input ref={fileRef} type="file" accept=".pfx,.p12" />
          </label>
          <label>
            Senha do certificado
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="full" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className="btn-erp primary sm" onClick={enviarCertificado} disabled={carregando === "certificado"}>
              {carregando === "certificado" ? "Enviando…" : "Enviar certificado"}
            </button>
            <small className="field-hint">O arquivo é enviado de forma segura ao backend e não fica armazenado no navegador.</small>
          </div>
        </div>
        {resCertificado && (
          <div className={`alert ${resCertificado.tone}`} style={{ marginTop: 12 }}>
            <span>{resCertificado.texto}</span>
          </div>
        )}
      </div>

      {/* Testar conexão */}
      <div>
        <h4 style={{ margin: "0 0 8px" }}>Testar conexão</h4>
        <button type="button" className="btn-erp ghost sm" onClick={testarConexao} disabled={carregando === "testar"}>
          {carregando === "testar" ? "Testando…" : "Testar conexão"}
        </button>
        {resTestar && (
          <div className={`alert ${resTestar.tone}`} style={{ marginTop: 12 }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{resTestar.texto}</pre>
          </div>
        )}
      </div>

      {/* Emitir NF-e de teste */}
      <div>
        <h4 style={{ margin: "0 0 8px" }}>Emitir NF-e de teste (homologação)</h4>
        <button type="button" className="btn-erp ghost sm" onClick={emitirTeste} disabled={carregando === "emissao"}>
          {carregando === "emissao" ? "Emitindo…" : "Emitir NF-e de teste"}
        </button>
        <small className="field-hint" style={{ display: "block", marginTop: 6 }}>
          Emite um documento fictício no ambiente de homologação para validar a configuração.
        </small>
        {resEmissao && (
          <div className={`alert ${resEmissao.tone}`} style={{ marginTop: 12 }}>
            <span>{resEmissao.texto}</span>
          </div>
        )}
      </div>
    </div>
  );
}
