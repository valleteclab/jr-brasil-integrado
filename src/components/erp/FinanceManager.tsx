"use client";

import { useMemo, useState } from "react";
import type { PayableSummary, ReceivableSummary, BankAccountSummary, ClienteOption, MaquinaCartaoOption } from "@/lib/services/finance";

type FormaPagamentoOption = { id: string; nome: string };

export type ClassificacaoOption = { id: string; nome: string; grupo: string; tipo: "DESPESA" | "RECEITA" };

type Props = {
  initialPayables: PayableSummary[];
  initialReceivables: ReceivableSummary[];
  bankAccounts: BankAccountSummary[];
  formasPagamento?: FormaPagamentoOption[];
  /** Clientes ativos para o seletor de conta a receber avulsa. */
  clientes?: ClienteOption[];
  /** Maquininhas/cartões para detalhar "como foi pago" no cartão (contas a pagar). */
  maquinas?: MaquinaCartaoOption[];
  /** Plano de classificação financeira (para categorizar as contas → fechamento mensal). */
  classificacoes?: ClassificacaoOption[];
  /** Contas bancárias com cobrança Sicoob habilitada (mostra "Gerar boleto" nos recebíveis). */
  contasCobranca?: Array<{ id: string; nome: string }>;
  /** Mostra a ação de EXCLUIR conta a pagar (apenas perfil admin). */
  isAdmin?: boolean;
};

type Aba = "pagar" | "receber";

const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OUTRA"];
// Detecta pagamento no cartão pelo nome da forma (cadastro livre): "cartão", "crédito", "débito".
const formaEhCartao = (f: string) => /cart|cr[eé]d|d[eé]b/i.test(f);
const formaEhCredito = (f: string) => /cr[eé]d/i.test(f);

// Lista fixa usada em contas a receber (recebimento) e como fallback quando não há cadastro.
const FORMAS_FIXAS = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão de Débito" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CHEQUE", label: "Cheque" }
];

/**
 * Opções de forma de pagamento. Em CONTAS A PAGAR usa o cadastro da empresa (Configurações →
 * Formas de pagamento), gravando o nome. Em contas a receber mantém a lista fixa — o cadastro é
 * do lado de pagamentos, não de recebimentos.
 */
function PaymentMethodOptions({ tipo, formas }: { tipo: Aba; formas: FormaPagamentoOption[] }) {
  if (tipo === "pagar" && formas.length) {
    return <>{formas.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}</>;
  }
  return <>{FORMAS_FIXAS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</>;
}

/** Opções de classificação agrupadas por grupo (despesas p/ contas a pagar; receitas p/ receber). */
function ClassificacaoOptions({ tipo, classificacoes }: { tipo: Aba; classificacoes: ClassificacaoOption[] }) {
  const tipoAlvo = tipo === "pagar" ? "DESPESA" : "RECEITA";
  const relevantes = classificacoes.filter((c) => c.tipo === tipoAlvo);
  const grupos = [...new Set(relevantes.map((c) => c.grupo))];
  return (
    <>
      {grupos.map((g) => (
        <optgroup key={g} label={g}>
          {relevantes.filter((c) => c.grupo === g).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

// ─── Formulário de baixa ──────────────────────────────────────────────────────

type SettleFormProps = {
  tipo: Aba;
  id: string;
  descricao: string;
  saldoNumber: number;
  bankAccounts: BankAccountSummary[];
  formasPagamento: FormaPagamentoOption[];
  maquinas: MaquinaCartaoOption[];
  onSuccess: (id: string, novoStatus: string) => void;
  onClose: () => void;
};

function SettleForm({ tipo, id, descricao, saldoNumber, bankAccounts, formasPagamento, maquinas, onSuccess, onClose }: SettleFormProps) {
  const [valor, setValor] = useState(saldoNumber.toFixed(2));
  const [juros, setJuros] = useState("0.00");
  const [multa, setMulta] = useState("0.00");
  const [desconto, setDesconto] = useState("0.00");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState(bankAccounts[0]?.id ?? "");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().substring(0, 10));
  const [maquinaCartaoId, setMaquinaCartaoId] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // "Como foi pago" no cartão (só em contas a pagar): qual maquininha, bandeira e parcelas.
  const ehCartao = tipo === "pagar" && formaEhCartao(formaPagamento);
  const ehCredito = ehCartao && formaEhCredito(formaPagamento);

  const endpoint =
    tipo === "pagar"
      ? `/api/erp/financeiro/contas-pagar/${id}/baixar`
      : `/api/erp/financeiro/contas-receber/${id}/baixar`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: parseFloat(valor) || 0,
          juros: parseFloat(juros) || 0,
          multa: parseFloat(multa) || 0,
          descontoBaixa: parseFloat(desconto) || 0,
          formaPagamento: formaPagamento || undefined,
          contaBancariaId: contaBancariaId || undefined,
          dataPagamento,
          maquinaCartaoId: ehCartao ? maquinaCartaoId || null : null,
          bandeira: ehCartao ? bandeira || null : null,
          parcelas: ehCredito ? parcelas : ehCartao ? 1 : null
        })
      });
      const data = (await res.json()) as { id?: string; status?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao registrar baixa.");
      onSuccess(id, data.status ?? "PAGO");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>{tipo === "pagar" ? "Baixar conta a pagar" : "Baixar conta a receber"}</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="drawer-body">
            <div style={{ padding: "12px 20px", background: "var(--erp-bg)", borderBottom: "1px solid var(--erp-line)", fontSize: 12, color: "var(--erp-slate)" }}>
              {descricao}
            </div>
            {erro && (
              <div className="alert danger" style={{ margin: "12px 20px 0" }}>
                <span className="lead">Erro:</span>
                <span>{erro}</span>
              </div>
            )}
            <div className="erp-form">
              <label>
                Valor Pago (R$) <span className="required">*</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                />
              </label>
              <label>
                Data Pagamento <span className="required">*</span>
                <input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  required
                />
              </label>
              <label>
                Juros (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={juros}
                  onChange={(e) => setJuros(e.target.value)}
                />
              </label>
              <label>
                Multa (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={multa}
                  onChange={(e) => setMulta(e.target.value)}
                />
              </label>
              <label>
                Desconto (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                />
              </label>
              <label>
                Forma de Pagamento
                <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  <option value="">Selecione...</option>
                  <PaymentMethodOptions tipo={tipo} formas={formasPagamento} />
                </select>
              </label>
              {ehCartao && (
                <>
                  <label>
                    Cartão / Maquininha
                    <select value={maquinaCartaoId} onChange={(e) => setMaquinaCartaoId(e.target.value)}>
                      <option value="">{maquinas.length ? "Selecione..." : "(cadastre em Máquinas de cartão)"}</option>
                      {maquinas.map((m) => (
                        <option key={m.id} value={m.id}>{m.nome}{m.adquirente ? ` · ${m.adquirente}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bandeira
                    <select value={bandeira} onChange={(e) => setBandeira(e.target.value)}>
                      <option value="">Selecione...</option>
                      {BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  {ehCredito && (
                    <label>
                      Parcelas
                      <input type="number" min={1} max={24} value={parcelas} onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))} />
                      <span className="sublabel">{parcelas > 1 ? `Parcelado em ${parcelas}x` : "À vista"}</span>
                    </label>
                  )}
                </>
              )}
              {bankAccounts.length > 0 ? (
                <label>
                  Conta Bancária <span className="required">*</span>
                  <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} required>
                    <option value="">Selecione a conta...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome} ({b.saldoAtual})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="alert danger full" style={{ margin: "0" }}>
                  <span className="lead">Atenção:</span>
                  <span>Cadastre uma conta bancária para registrar baixas (a baixa precisa debitar/creditar o saldo).</span>
                </div>
              )}
            </div>
          </div>

          <footer className="drawer-foot">
            <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-erp primary sm" disabled={loading}>
              {loading ? "Registrando…" : "Confirmar baixa"}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Formulário nova conta ─────────────────────────────────────────────────────

type NewAccountFormProps = {
  tipo: Aba;
  formasPagamento: FormaPagamentoOption[];
  clientes: ClienteOption[];
  classificacoes: ClassificacaoOption[];
  onSuccess: (item: PayableSummary | ReceivableSummary) => void;
  onClose: () => void;
};

function NewAccountForm({ tipo, formasPagamento, clientes, classificacoes, onSuccess, onClose }: NewAccountFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(new Date().toISOString().substring(0, 10));
  const [formaPagamento, setFormaPagamento] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [classificacaoId, setClassificacaoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const endpoint =
    tipo === "pagar"
      ? "/api/erp/financeiro/contas-pagar"
      : "/api/erp/financeiro/contas-receber";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    // Conta a receber avulsa exige cliente cadastrado (evita FK quebrada com placeholder).
    if (tipo === "receber" && !clienteId) {
      setErro("Selecione o cliente.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao,
          valor: parseFloat(valor) || 0,
          vencimento,
          formaPagamento: formaPagamento || undefined,
          numeroDocumento: numeroDocumento || undefined,
          observacoes: observacoes || undefined,
          classificacaoId: classificacaoId || undefined,
          ...(tipo === "receber" ? { clienteId } : {})
        })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar conta.");

      // Cria um resumo local para atualizar a lista sem reload
      const novoItem: PayableSummary & ReceivableSummary = {
        id: data.id ?? "",
        descricao,
        parte: tipo === "receber"
          ? (clientes.find((c) => c.id === clienteId)?.nome ?? "—")
          : "—",
        numeroDocumento: numeroDocumento || "—",
        vencimento: new Date(vencimento + "T12:00:00").toLocaleDateString("pt-BR"),
        vencimentoRaw: vencimento,
        valor: `R$ ${parseFloat(valor).toFixed(2).replace(".", ",")}`,
        valorPago: "R$ 0,00",
        saldo: `R$ ${parseFloat(valor).toFixed(2).replace(".", ",")}`,
        saldoNumber: parseFloat(valor) || 0,
        statusLabel: "Aberto",
        statusTone: "info",
        formaPagamento: formaPagamento || "—",
        classificacaoId: classificacaoId || null,
        classificacaoNome: classificacaoId ? (classificacoes.find((c) => c.id === classificacaoId)?.nome ?? null) : null,
        canSettle: true,
        canDelete: true
      };
      onSuccess(novoItem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>{tipo === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="drawer-body">
            <div style={{ padding: "12px 20px", background: "var(--erp-bg)", borderBottom: "1px solid var(--erp-line)", fontSize: 12, color: "var(--erp-slate)" }}>
              Cadastre uma conta {tipo === "pagar" ? "a pagar" : "a receber"}.
            </div>
            {erro && (
              <div className="alert danger" style={{ margin: "12px 20px 0" }}>
                <span className="lead">Erro:</span>
                <span>{erro}</span>
              </div>
            )}
            <div className="erp-form">
              {tipo === "receber" && (
                <label className="full">
                  Cliente <span className="required">*</span>
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                    <option value="">Selecione o cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="full">
                Descrição <span className="required">*</span>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Aluguel maio/2026"
                  required
                />
              </label>
              <label>
                Valor (R$) <span className="required">*</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                />
              </label>
              <label>
                Vencimento <span className="required">*</span>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                />
              </label>
              <label>
                Nº Documento
                <input
                  type="text"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Forma de Pagamento
                <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  <option value="">Selecione...</option>
                  <PaymentMethodOptions tipo={tipo} formas={formasPagamento} />
                </select>
              </label>
              {classificacoes.length > 0 && (
                <label className="full">
                  Classificação financeira
                  <select value={classificacaoId} onChange={(e) => setClassificacaoId(e.target.value)}>
                    <option value="">Sem classificação</option>
                    <ClassificacaoOptions tipo={tipo} classificacoes={classificacoes} />
                  </select>
                  <span className="sublabel">Alimenta o fechamento mensal (relatórios por classificação).</span>
                </label>
              )}
              <label className="full">
                Observações
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                />
              </label>
            </div>
          </div>

          <footer className="drawer-foot">
            <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-erp primary sm" disabled={loading}>
              {loading ? "Salvando…" : "Salvar"}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FinanceManager({ initialPayables, initialReceivables, bankAccounts, formasPagamento = [], clientes = [], maquinas = [], classificacoes = [], contasCobranca = [], isAdmin = false }: Props) {
  const [aba, setAba] = useState<Aba>("pagar");
  const [payables, setPayables] = useState(initialPayables);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [query, setQuery] = useState("");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Boleto Sicoob: registra na API e mostra linha digitável/PDF; sincronizar baixa quando liquidado.
  async function gerarBoleto(id: string, descricao: string) {
    if (!contasCobranca.length) return;
    if (!window.confirm(`Emitir boleto Sicoob para "${descricao}" na conta ${contasCobranca[0].nome}?`)) return;
    setBusyId(id);
    setGlobalError("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-receber/${id}/boleto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contaBancariaId: contasCobranca[0].id })
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; linhaDigitavel?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível emitir o boleto.");
      setReceivables((prev) => prev.map((r) => (r.id === id
        ? { ...r, boletoStatus: data.status ?? "REGISTRADO", boletoLinhaDigitavel: data.linhaDigitavel ?? null, formaPagamento: "BOLETO" }
        : r)));
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao emitir o boleto.");
    } finally {
      setBusyId(null);
    }
  }

  async function sincronizarBoleto(id: string) {
    setBusyId(id);
    setGlobalError("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-receber/${id}/boleto/sincronizar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { status?: string; baixado?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar o boleto.");
      setReceivables((prev) => prev.map((r) => {
        if (r.id !== id) return r;
        const atualizado = { ...r, boletoStatus: data.status ?? r.boletoStatus };
        if (data.baixado) {
          return { ...atualizado, statusLabel: "Pago", statusTone: "success" as const, canSettle: false, valorPago: r.valor, saldo: "R$ 0,00", saldoNumber: 0, canEstornar: true };
        }
        return atualizado;
      }));
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao consultar o boleto.");
    } finally {
      setBusyId(null);
    }
  }

  // Classificação inline na listagem: PATCH e atualização otimista da linha.
  async function classificarConta(id: string, classificacaoId: string) {
    const endpoint =
      aba === "pagar"
        ? `/api/erp/financeiro/contas-pagar/${id}/classificacao`
        : `/api/erp/financeiro/contas-receber/${id}/classificacao`;
    setGlobalError("");
    const nome = classificacaoId ? (classificacoes.find((c) => c.id === classificacaoId)?.nome ?? null) : null;
    function aplicar<T extends PayableSummary | ReceivableSummary>(items: T[]): T[] {
      return items.map((r) => (r.id === id ? { ...r, classificacaoId: classificacaoId || null, classificacaoNome: nome } : r));
    }
    if (aba === "pagar") setPayables((prev) => aplicar(prev));
    else setReceivables((prev) => aplicar(prev));
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classificacaoId: classificacaoId || null })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível classificar a conta.");
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao classificar a conta.");
    }
  }

  async function excluirPagar(id: string, descricao: string) {
    if (!window.confirm(`Excluir a conta a pagar "${descricao}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    setGlobalError("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-pagar/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir a conta.");
      setPayables((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao excluir conta a pagar.");
    } finally {
      setBusyId(null);
    }
  }

  async function estornarBaixa(id: string, descricao: string) {
    if (!window.confirm(`Estornar a baixa de "${descricao}"? Isso desfaz o pagamento e ajusta o saldo bancário.`)) return;
    setBusyId(id);
    setGlobalError("");
    const endpoint =
      aba === "pagar"
        ? `/api/erp/financeiro/contas-pagar/${id}/estornar`
        : `/api/erp/financeiro/contas-receber/${id}/estornar`;
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível estornar a baixa.");
      // Volta a linha ao estado "em aberto" (sem pagamento): atualiza sem reload.
      function reverterRow<T extends PayableSummary | ReceivableSummary>(items: T[]): T[] {
        return items.map((r) => {
          if (r.id !== id) return r;
          const venc = new Date(r.vencimentoRaw);
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const vencido = venc < hoje;
          return {
            ...r,
            statusLabel: vencido ? "Vencido" : "Aberto",
            statusTone: vencido ? ("danger" as const) : ("info" as const),
            canSettle: true,
            canEstornar: false,
            valorPago: "R$ 0,00",
            saldo: r.valor,
            saldoNumber: Number(r.valor.replace(/[^\d,-]/g, "").replace(".", "").replace(",", ".")) || 0
          };
        });
      }
      if (aba === "pagar") setPayables((prev) => reverterRow(prev));
      else setReceivables((prev) => reverterRow(prev));
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao estornar baixa.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = aba === "pagar" ? payables : receivables;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.descricao, r.parte, r.numeroDocumento, r.statusLabel, r.vencimento].some((f) =>
        f.toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  const settlingItem = settlingId ? rows.find((r) => r.id === settlingId) : null;

  function handleSettleSuccess(id: string, novoStatus: string) {
    function updateRow<T extends PayableSummary | ReceivableSummary>(items: T[]): T[] {
      return items.map((r) => {
        if (r.id !== id) return r;
        const pago = novoStatus === "PAGO";
        return {
          ...r,
          statusLabel: pago ? "Pago" : "Parcial",
          statusTone: pago ? ("success" as const) : ("warn" as const),
          canSettle: !pago,
          valorPago: pago ? r.valor : r.valorPago,
          saldo: pago ? "R$ 0,00" : r.saldo,
          saldoNumber: pago ? 0 : r.saldoNumber
        };
      });
    }
    if (aba === "pagar") setPayables((prev) => updateRow(prev));
    else setReceivables((prev) => updateRow(prev));
    setSettlingId(null);
  }

  function handleNewSuccess(item: PayableSummary | ReceivableSummary) {
    if (aba === "pagar") setPayables((prev) => [item as PayableSummary, ...prev]);
    else setReceivables((prev) => [item as ReceivableSummary, ...prev]);
    setShowNewForm(false);
  }

  return (
    <>
      {/* Abas */}
      <nav className="tabs" style={{ padding: 0, background: "#fff", border: "1px solid var(--erp-line)", borderBottom: 0, borderRadius: "8px 8px 0 0" }}>
        <button
          className={aba === "pagar" ? "active" : ""}
          type="button"
          onClick={() => { setAba("pagar"); setQuery(""); }}
        >
          Contas a pagar <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>{payables.length}</span>
        </button>
        <button
          className={aba === "receber" ? "active" : ""}
          type="button"
          onClick={() => { setAba("receber"); setQuery(""); }}
        >
          Contas a receber <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>{receivables.length}</span>
        </button>
      </nav>

      {/* Toolbar */}
      <div className="erp-toolbar" style={{ borderTop: 0, borderRadius: 0 }}>
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por descrição, parte, nº documento…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
        <button
          type="button"
          className="btn-erp primary sm"
          onClick={() => { setGlobalError(""); setShowNewForm(true); }}
        >
          + Nova conta
        </button>
      </div>

      {globalError && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{globalError}</span>
        </div>
      )}

      {/* Tabela */}
      <div className="erp-table-wrap" style={{ borderRadius: "0 0 8px 8px", borderTop: 0 }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>{aba === "pagar" ? "Fornecedor" : "Cliente"}</th>
              <th>Nº Documento</th>
              <th>Vencimento</th>
              <th className="num">Valor</th>
              <th className="num">Pago</th>
              <th className="num">Saldo</th>
              <th>Situação</th>
              {classificacoes.length > 0 && <th>Classificação</th>}
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.descricao}</strong>
                  {(() => {
                    // Em contas a pagar quitadas, mostra "como foi pago" (forma + parcelas + cartão
                    // + conta); senão, a forma simples.
                    const detalhe = aba === "pagar" ? (r as PayableSummary).comoPago : null;
                    if (detalhe) return <span className="sublabel">💳 {detalhe}</span>;
                    return r.formaPagamento !== "—" ? <span className="sublabel">{r.formaPagamento}</span> : null;
                  })()}
                </td>
                <td>{r.parte}</td>
                <td><span className="mono">{r.numeroDocumento}</span></td>
                <td>{r.vencimento}</td>
                <td className="num">{r.valor}</td>
                <td className="num">{r.valorPago}</td>
                <td className="num">
                  <strong>{r.saldo}</strong>
                </td>
                <td>
                  <span className={`pill ${r.statusTone}`}>
                    <span className="dot" />
                    {r.statusLabel}
                  </span>
                </td>
                {classificacoes.length > 0 && (
                  <td>
                    <select
                      value={r.classificacaoId ?? ""}
                      onChange={(e) => classificarConta(r.id, e.target.value)}
                      style={{ maxWidth: 170, fontSize: 12, padding: "4px 6px", border: "1px solid var(--erp-line)", borderRadius: 6, background: r.classificacaoId ? "#fff" : "var(--erp-bg)" }}
                      title="Classificação financeira (fechamento mensal)"
                    >
                      <option value="">— classificar —</option>
                      <ClassificacaoOptions tipo={aba} classificacoes={classificacoes} />
                    </select>
                  </td>
                )}
                <td className="actions">
                  {r.canSettle && (
                    <button
                      type="button"
                      className="btn-erp primary xs"
                      onClick={() => { setGlobalError(""); setSettlingId(r.id); }}
                    >
                      Baixar
                    </button>
                  )}
                  {aba === "receber" && contasCobranca.length > 0 && r.canSettle && !(r as ReceivableSummary).boletoStatus && (
                    <button
                      type="button"
                      className="btn-erp ghost xs"
                      title="Registrar boleto Sicoob para este título"
                      disabled={busyId === r.id}
                      onClick={() => gerarBoleto(r.id, r.descricao)}
                    >
                      {busyId === r.id ? "..." : "Gerar boleto"}
                    </button>
                  )}
                  {aba === "receber" && (r as ReceivableSummary).boletoStatus && (
                    <>
                      <a
                        className="btn-erp ghost xs"
                        href={`/api/erp/financeiro/contas-receber/${r.id}/boleto/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title={(r as ReceivableSummary).boletoLinhaDigitavel ? `Linha digitável: ${(r as ReceivableSummary).boletoLinhaDigitavel}` : "2ª via do boleto"}
                      >
                        Boleto ({(r as ReceivableSummary).boletoStatus?.toLowerCase()})
                      </a>
                      {r.canSettle && (
                        <button
                          type="button"
                          className="btn-erp ghost xs"
                          title="Consultar no Sicoob — se liquidado, baixa o título automaticamente"
                          disabled={busyId === r.id}
                          onClick={() => sincronizarBoleto(r.id)}
                        >
                          {busyId === r.id ? "..." : "Consultar pgto"}
                        </button>
                      )}
                    </>
                  )}
                  {r.canEstornar && (
                    <button
                      type="button"
                      className="btn-erp ghost xs"
                      title="Estornar baixa (desfaz o pagamento)"
                      disabled={busyId === r.id}
                      onClick={() => estornarBaixa(r.id, r.descricao)}
                    >
                      {busyId === r.id ? "..." : "Estornar baixa"}
                    </button>
                  )}
                  {isAdmin && aba === "pagar" && (r as PayableSummary).canDelete && (
                    <button
                      type="button"
                      className="btn-erp danger xs"
                      title="Excluir conta a pagar (admin)"
                      disabled={busyId === r.id}
                      onClick={() => excluirPagar(r.id, r.descricao)}
                    >
                      {busyId === r.id ? "..." : "Excluir"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={classificacoes.length > 0 ? 10 : 9}>
                  <div className="empty-st">
                    <h4>{query ? "Nenhum resultado" : aba === "pagar" ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}</h4>
                    <p>
                      {query
                        ? "Nenhum resultado para a busca atual."
                        : aba === "pagar"
                        ? "Nenhuma conta a pagar cadastrada."
                        : "Nenhuma conta a receber cadastrada."}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="erp-table-foot">
            <span>{filtered.length} conta(s)</span>
            <div className="pagi">
              <button type="button" className="active">1</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de baixa */}
      {settlingId && settlingItem && (
        <SettleForm
          tipo={aba}
          id={settlingId}
          descricao={settlingItem.descricao}
          saldoNumber={settlingItem.saldoNumber}
          bankAccounts={bankAccounts}
          formasPagamento={formasPagamento}
          maquinas={maquinas}
          onSuccess={handleSettleSuccess}
          onClose={() => setSettlingId(null)}
        />
      )}

      {/* Modal nova conta */}
      {showNewForm && (
        <NewAccountForm
          tipo={aba}
          formasPagamento={formasPagamento}
          clientes={clientes}
          classificacoes={classificacoes}
          onSuccess={handleNewSuccess}
          onClose={() => setShowNewForm(false)}
        />
      )}
    </>
  );
}
