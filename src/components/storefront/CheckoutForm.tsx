"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "./CartProvider";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const VAZIO = {
  nome: "", documento: "", email: "", telefone: "",
  cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: ""
};

export function CheckoutForm() {
  const router = useRouter();
  const { itens, total, clear, pronto, slug } = useCart();
  const [tipo, setTipo] = useState<"PEDIDO" | "ORCAMENTO">("PEDIDO");
  const [form, setForm] = useState({ ...VAZIO });
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  // Lookup de CEP direto no ViaCEP (público) — a API /api/erp/lookup é protegida e a loja é pública.
  async function buscarCep() {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const data = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((r) => r.json());
      if (!data?.erro) {
        setForm((cur) => ({
          ...cur,
          logradouro: data.logradouro || cur.logradouro,
          bairro: data.bairro || cur.bairro,
          cidade: data.localidade || cur.cidade,
          uf: data.uf || cur.uf
        }));
      }
    } catch {
      // segue sem preencher
    } finally {
      setBuscandoCep(false);
    }
  }

  async function enviar() {
    setError("");
    if (itens.length === 0) { setError("Seu carrinho está vazio."); return; }
    if (!form.nome.trim()) { setError("Informe seu nome."); return; }
    if (!form.documento.trim()) { setError("Informe seu CPF ou CNPJ."); return; }

    setEnviando(true);
    try {
      const response = await fetch("/api/loja/solicitacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          slug,
          cliente: {
            nome: form.nome,
            documento: form.documento,
            email: form.email,
            telefone: form.telefone,
            whatsapp: form.telefone,
            endereco: { cep: form.cep, logradouro: form.logradouro, numero: form.numero, bairro: form.bairro, cidade: form.cidade, uf: form.uf }
          },
          observacoes,
          itens: itens.map((i) => ({ produtoId: i.id, quantidade: i.qtd, precoUnitario: i.preco }))
        })
      });
      const data = await response.json() as { tipo?: string; numero?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar.");
      clear();
      router.push(`/loja/${slug}/enviado?tipo=${data.tipo}&numero=${encodeURIComponent(data.numero ?? "")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
      setEnviando(false);
    }
  }

  if (pronto && itens.length === 0) {
    return (
      <div className="empty-st">
        <h4>Seu carrinho está vazio</h4>
        <Link className="button primary" href={`/loja/${slug}`}>Ver produtos</Link>
      </div>
    );
  }

  return (
    <div className="checkout-grid">
      <div className="checkout-form">
        <div className="checkout-tipo">
          <button type="button" className={tipo === "PEDIDO" ? "active" : ""} onClick={() => setTipo("PEDIDO")}>Fazer pedido</button>
          <button type="button" className={tipo === "ORCAMENTO" ? "active" : ""} onClick={() => setTipo("ORCAMENTO")}>Solicitar orçamento</button>
        </div>
        <p className="checkout-hint">
          {tipo === "PEDIDO"
            ? "Seu pedido será enviado à loja, que confirma disponibilidade e combina pagamento e entrega."
            : "Você receberá um orçamento da loja com valores e condições para aprovar."}
        </p>

        <div className="store-form">
          <label className="full">Nome completo *<input value={form.nome} onChange={(e) => set("nome", e.target.value)} /></label>
          <label>CPF / CNPJ *<input value={form.documento} onChange={(e) => set("documento", e.target.value)} placeholder="Somente números" /></label>
          <label>E-mail<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label>WhatsApp / Telefone<input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} /></label>

          <label>CEP (opcional)
            <input value={form.cep} onChange={(e) => set("cep", e.target.value)} onBlur={buscarCep} placeholder={buscandoCep ? "Buscando..." : "00000-000"} />
          </label>
          <label className="full">Endereço<input value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></label>
          <label>Número<input value={form.numero} onChange={(e) => set("numero", e.target.value)} /></label>
          <label>Bairro<input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} /></label>
          <label>Cidade<input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} /></label>
          <label>UF<input value={form.uf} maxLength={2} onChange={(e) => set("uf", e.target.value.toUpperCase())} /></label>
          <label className="full">Observações<textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Ex.: ponto de referência, urgência, dúvidas…" /></label>
        </div>

        {error && <div className="alert danger" style={{ marginTop: 10 }}><span>{error}</span></div>}
      </div>

      <aside className="checkout-resumo">
        <h3>Resumo</h3>
        <ul>
          {itens.map((i) => (
            <li key={i.id}><span>{i.qtd}× {i.nome}</span><strong>{brl(i.preco * i.qtd)}</strong></li>
          ))}
        </ul>
        <div className="checkout-total">Total<strong>{brl(total)}</strong></div>
        <button type="button" className="button primary block" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando..." : tipo === "PEDIDO" ? "Enviar pedido" : "Solicitar orçamento"}
        </button>
        <Link className="button light block" href={`/loja/${slug}/carrinho`}>Voltar ao carrinho</Link>
      </aside>
    </div>
  );
}
