"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";

type Fornecedor = { id: string; documento: string | null; uf: string; label: string };
type Produto = {
  id: string;
  sku: string;
  nome: string;
  unidade: string;
  unidadeCompra: string;
  fatorConversaoCompra: number;
  precoVenda: number;
  ultimoCusto: number;
};

type Props = {
  fornecedores: Fornecedor[];
  produtos: Produto[];
  formasPagamento: string[];
};

type Finalidade = "REVENDA" | "USO_CONSUMO" | "IMOBILIZADO" | "INDUSTRIALIZACAO";
const FINALIDADES: Array<{ value: Finalidade; label: string }> = [
  { value: "REVENDA", label: "Revenda" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" }
];

type Tributo = "ICMS" | "IPI" | "PIS" | "COFINS";
const TRIBUTOS: Tributo[] = ["ICMS", "IPI", "PIS", "COFINS"];

type ImpostoLinha = { cst: string; csosn: string; base: string; aliquota: string; valor: string };
function emptyImposto(): ImpostoLinha {
  return { cst: "", csosn: "", base: "", aliquota: "", valor: "" };
}

type ItemLinha = {
  key: number;
  produtoId: string;
  criarNovoSku: boolean;
  codigoFornecedor: string;
  descricao: string;
  gtin: string;
  ncm: string;
  cest: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorDesconto: string;
  fatorConversao: string;
  unidadeVenda: string;
  finalidade: Finalidade;
  precoVenda: string;
  precoMinimo: string;
  marca: string;
  mostrarImpostos: boolean;
  impostos: Record<Tributo, ImpostoLinha>;
};

type ParcelaLinha = { key: number; numero: string; vencimento: string; valor: string; formaPagamento: string };

let itemSeq = 1;
let parcelaSeq = 1;

function novoItem(): ItemLinha {
  return {
    key: itemSeq++,
    produtoId: "",
    criarNovoSku: true,
    codigoFornecedor: "",
    descricao: "",
    gtin: "",
    ncm: "",
    cest: "",
    cfop: "",
    unidade: "UN",
    quantidade: "1",
    valorUnitario: "",
    valorDesconto: "",
    fatorConversao: "1",
    unidadeVenda: "UN",
    finalidade: "REVENDA",
    precoVenda: "",
    precoMinimo: "",
    marca: "",
    mostrarImpostos: false,
    impostos: { ICMS: emptyImposto(), IPI: emptyImposto(), PIS: emptyImposto(), COFINS: emptyImposto() }
  };
}

function novaParcela(valor = "", formaPagamento = ""): ParcelaLinha {
  return { key: parcelaSeq++, numero: "", vencimento: hojeMais(30), valor, formaPagamento };
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}
function hojeMais(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function num(v: string) {
  return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
}
function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function qtd(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(v);
}

export function ManualFiscalEntryForm({ fornecedores, produtos, formasPagamento }: Props) {
  const router = useRouter();

  const [fornMode, setFornMode] = useState<"existente" | "novo">(fornecedores.length ? "existente" : "novo");
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornDocumento, setFornDocumento] = useState("");
  const [fornRazao, setFornRazao] = useState("");
  const [fornUf, setFornUf] = useState("");

  const [numero, setNumero] = useState("");
  const [serie, setSerie] = useState("");
  const [modelo, setModelo] = useState("55");
  const [chaveAcesso, setChaveAcesso] = useState("");
  const [cfopPrincipal, setCfopPrincipal] = useState("");
  const [emitidaEm, setEmitidaEm] = useState(hoje());
  const [recebidaEm, setRecebidaEm] = useState(hoje());

  const [frete, setFrete] = useState("0");
  const [seguro, setSeguro] = useState("0");
  const [descontoNota, setDescontoNota] = useState("0");
  const [outras, setOutras] = useState("0");

  const [itens, setItens] = useState<ItemLinha[]>([novoItem()]);
  const [parcelas, setParcelas] = useState<ParcelaLinha[]>([novaParcela()]);

  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const produtosById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const totalProdutos = useMemo(
    () => itens.reduce((s, i) => s + Math.max(0, num(i.quantidade) * num(i.valorUnitario) - num(i.valorDesconto)), 0),
    [itens]
  );
  const totalNota = Math.max(0, totalProdutos + num(frete) + num(seguro) + num(outras) - num(descontoNota));
  const totalParcelas = parcelas.reduce((s, p) => s + num(p.valor), 0);

  function updateItem(key: number, patch: Partial<ItemLinha>) {
    setItens((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function updateImposto(key: number, tributo: Tributo, patch: Partial<ImpostoLinha>) {
    setItens((cur) =>
      cur.map((i) => (i.key === key ? { ...i, impostos: { ...i.impostos, [tributo]: { ...i.impostos[tributo], ...patch } } } : i))
    );
  }
  function selecionarProduto(key: number, produtoId: string) {
    const p = produtosById.get(produtoId);
    updateItem(key, {
      produtoId,
      criarNovoSku: false,
      ...(p
        ? {
            unidadeVenda: p.unidade,
            unidade: p.unidadeCompra || "UN",
            fatorConversao: String(p.fatorConversaoCompra > 0 ? p.fatorConversaoCompra : 1).replace(".", ","),
            valorUnitario: p.ultimoCusto > 0 ? String(p.ultimoCusto).replace(".", ",") : "",
            descricao: p.nome,
            codigoFornecedor: p.sku
          }
        : {})
    });
  }

  function gerarParcelaUnica() {
    setParcelas([{ key: parcelaSeq++, numero: "1", vencimento: hojeMais(30), valor: String(totalNota.toFixed(2)).replace(".", ","), formaPagamento: parcelas[0]?.formaPagamento || "" }]);
  }

  async function lancar() {
    setErro("");
    if (fornMode === "existente" && !fornecedorId) {
      setErro("Selecione o fornecedor (ou cadastre um novo informando o CNPJ).");
      return;
    }
    if (fornMode === "novo" && !fornDocumento.trim() && !fornRazao.trim()) {
      setErro("Informe ao menos o CNPJ/CPF ou a razão social do fornecedor.");
      return;
    }
    const itensValidos = itens.filter((i) => i.codigoFornecedor.trim() && i.descricao.trim());
    if (!itensValidos.length) {
      setErro("Adicione ao menos um item com código e descrição.");
      return;
    }
    for (const i of itensValidos) {
      if (num(i.quantidade) <= 0) {
        setErro(`Quantidade inválida no item "${i.descricao || i.codigoFornecedor}".`);
        return;
      }
      const movimenta = i.finalidade === "REVENDA" || i.finalidade === "INDUSTRIALIZACAO";
      const vinculado = !i.criarNovoSku && i.produtoId;
      if (movimenta && !vinculado && num(i.precoVenda) <= 0) {
        setErro(`No item "${i.descricao || i.codigoFornecedor}": vincule a um produto ou informe o preço de venda do novo SKU.`);
        return;
      }
    }

    const payload = {
      fornecedor:
        fornMode === "existente"
          ? { id: fornecedorId }
          : { documento: fornDocumento.trim() || undefined, razaoSocial: fornRazao.trim() || undefined, uf: fornUf.trim() || undefined },
      numero: numero.trim() || undefined,
      serie: serie.trim() || undefined,
      modelo: modelo.trim() || "55",
      chaveAcesso: chaveAcesso.trim() || undefined,
      cfopPrincipal: cfopPrincipal.trim() || undefined,
      emitidaEm: emitidaEm || undefined,
      recebidaEm: recebidaEm || undefined,
      valorFrete: num(frete),
      valorSeguro: num(seguro),
      valorDesconto: num(descontoNota),
      outrasDespesas: num(outras),
      itens: itensValidos.map((i) => ({
        codigoFornecedor: i.codigoFornecedor.trim(),
        descricao: i.descricao.trim(),
        gtin: i.gtin.trim() || undefined,
        ncm: i.ncm.trim() || undefined,
        cest: i.cest.trim() || undefined,
        cfop: i.cfop.trim() || undefined,
        unidade: i.unidade.trim() || "UN",
        quantidade: num(i.quantidade),
        valorUnitario: num(i.valorUnitario),
        valorDesconto: num(i.valorDesconto),
        fatorConversao: num(i.fatorConversao) > 0 ? num(i.fatorConversao) : 1,
        unidadeVenda: i.unidadeVenda.trim() || undefined,
        finalidade: i.finalidade,
        produtoId: !i.criarNovoSku && i.produtoId ? i.produtoId : undefined,
        criarNovoSku: i.criarNovoSku || !i.produtoId,
        precoVenda: num(i.precoVenda) > 0 ? num(i.precoVenda) : undefined,
        precoMinimo: num(i.precoMinimo) > 0 ? num(i.precoMinimo) : undefined,
        marca: i.marca.trim() || undefined,
        impostos: TRIBUTOS.map((t) => ({
          tributo: t,
          cst: i.impostos[t].cst.trim() || undefined,
          csosn: i.impostos[t].csosn.trim() || undefined,
          base: num(i.impostos[t].base) || undefined,
          aliquota: num(i.impostos[t].aliquota) || undefined,
          valor: num(i.impostos[t].valor) || undefined
        })).filter((imp) => imp.cst || imp.csosn || imp.base || imp.aliquota || imp.valor)
      })),
      parcelas: parcelas
        .filter((p) => num(p.valor) > 0)
        .map((p) => ({
          numero: p.numero.trim() || undefined,
          vencimento: p.vencimento || undefined,
          valor: num(p.valor),
          formaPagamento: p.formaPagamento.trim() || undefined
        }))
    };

    setSalvando(true);
    try {
      const res = await fetch("/api/erp/entradas-fiscais/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Não foi possível lançar a nota.");
      // Vai para o mesmo wizard da entrada por XML para revisar e processar (estoque + contas a pagar).
      router.push(`/erp/entradas-fiscais/nova?id=${data.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível lançar a nota.");
      setSalvando(false);
    }
  }

  return (
    <>
      {erro && <div className="alert danger" style={{ marginBottom: 12 }}><span>{erro}</span></div>}

      {/* Fornecedor */}
      <section className="erp-card">
        <div className="erp-card-head"><h3>Fornecedor</h3></div>
        <div className="erp-form">
          <label className="full">
            <span style={{ display: "flex", gap: 16 }}>
              <span><input type="radio" checked={fornMode === "existente"} onChange={() => setFornMode("existente")} /> Cadastrado</span>
              <span><input type="radio" checked={fornMode === "novo"} onChange={() => setFornMode("novo")} /> Novo / informar CNPJ</span>
            </span>
          </label>
          {fornMode === "existente" ? (
            <label className="full">
              Fornecedor
              <select value={fornecedorId} onChange={(e) => { const f = fornecedores.find((x) => x.id === e.target.value); setFornecedorId(e.target.value); if (f) setFornUf(f.uf); }}>
                <option value="">Selecione…</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label>CNPJ/CPF<input value={fornDocumento} onChange={(e) => setFornDocumento(e.target.value)} placeholder="Somente números" /></label>
              <label>Razão social<input value={fornRazao} onChange={(e) => setFornRazao(e.target.value)} /></label>
              <label>UF<input value={fornUf} maxLength={2} onChange={(e) => setFornUf(e.target.value.toUpperCase())} placeholder="Ex.: SP" /></label>
            </>
          )}
        </div>
      </section>

      {/* Cabeçalho da nota */}
      <section className="erp-card">
        <div className="erp-card-head"><h3>Dados da nota</h3></div>
        <div className="erp-form">
          <label>Número<input value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
          <label>Série<input value={serie} onChange={(e) => setSerie(e.target.value)} /></label>
          <label>Modelo<input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="55" /></label>
          <label>Emissão<input type="date" value={emitidaEm} onChange={(e) => setEmitidaEm(e.target.value)} /></label>
          <label>Recebimento<input type="date" value={recebidaEm} onChange={(e) => setRecebidaEm(e.target.value)} /></label>
          <label>CFOP principal<input value={cfopPrincipal} maxLength={4} inputMode="numeric" onChange={(e) => setCfopPrincipal(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" /></label>
          <label className="full">Chave de acesso (opcional)<input value={chaveAcesso} onChange={(e) => setChaveAcesso(e.target.value.replace(/\D/g, "").slice(0, 44))} placeholder="44 dígitos" /></label>
        </div>
        <div className="erp-form">
          <label>Frete (R$)<input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></label>
          <label>Seguro (R$)<input inputMode="decimal" value={seguro} onChange={(e) => setSeguro(e.target.value)} /></label>
          <label>Desconto (R$)<input inputMode="decimal" value={descontoNota} onChange={(e) => setDescontoNota(e.target.value)} /></label>
          <label>Outras despesas (R$)<input inputMode="decimal" value={outras} onChange={(e) => setOutras(e.target.value)} /></label>
        </div>
      </section>

      {/* Itens */}
      <section className="erp-card">
        <div className="erp-card-head">
          <h3>Itens da nota ({itens.length})</h3>
          <Button type="button" variant="light" onClick={() => setItens((c) => [...c, novoItem()])}>+ Adicionar item</Button>
        </div>
        <p className="block-muted" style={{ padding: "0 16px" }}>
          Compra em fardo/caixa e vende unitário? Informe a <strong>unidade de compra</strong> (ex.: CX), a quantidade e o custo
          dessa unidade, e o <strong>fator de conversão</strong> (caixa de 12 ⇒ 12). O estoque entra na unidade de venda.
        </p>

        {itens.map((item, idx) => {
          const fator = num(item.fatorConversao) > 0 ? num(item.fatorConversao) : 1;
          const q = num(item.quantidade);
          const custo = num(item.valorUnitario);
          const movimenta = item.finalidade === "REVENDA" || item.finalidade === "INDUSTRIALIZACAO";
          const vinculado = !item.criarNovoSku && item.produtoId;
          return (
            <div key={item.key} className="erp-card" style={{ margin: "8px 16px", background: "var(--erp-surface,#fafbfc)" }}>
              <div className="erp-card-head" style={{ paddingBottom: 0 }}>
                <strong>Item {idx + 1}</strong>
                {itens.length > 1 && <button type="button" className="btn-erp danger xs" onClick={() => setItens((c) => c.filter((x) => x.key !== item.key))}>remover</button>}
              </div>

              <div className="erp-form">
                <label className="full">
                  Vincular a produto cadastrado
                  <select
                    value={item.criarNovoSku ? "" : item.produtoId}
                    onChange={(e) => (e.target.value ? selecionarProduto(item.key, e.target.value) : updateItem(item.key, { produtoId: "", criarNovoSku: true }))}
                  >
                    <option value="">— Criar novo SKU —</option>
                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nome}</option>)}
                  </select>
                </label>
                <label>Código do fornecedor<input value={item.codigoFornecedor} onChange={(e) => updateItem(item.key, { codigoFornecedor: e.target.value })} /></label>
                <label className="full">Descrição<input value={item.descricao} onChange={(e) => updateItem(item.key, { descricao: e.target.value })} /></label>
                <label>GTIN/EAN<input value={item.gtin} onChange={(e) => updateItem(item.key, { gtin: e.target.value })} /></label>
                <label>NCM<input value={item.ncm} inputMode="numeric" onChange={(e) => updateItem(item.key, { ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })} /></label>
                <label>CEST<input value={item.cest} inputMode="numeric" onChange={(e) => updateItem(item.key, { cest: e.target.value.replace(/\D/g, "").slice(0, 7) })} /></label>
                <label>CFOP (nota)<input value={item.cfop} maxLength={4} inputMode="numeric" onChange={(e) => updateItem(item.key, { cfop: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
                <label>Finalidade
                  <select value={item.finalidade} onChange={(e) => updateItem(item.key, { finalidade: e.target.value as Finalidade })}>
                    {FINALIDADES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="erp-form">
                <label>Unidade de compra<input value={item.unidade} onChange={(e) => updateItem(item.key, { unidade: e.target.value.toUpperCase().slice(0, 6) })} /></label>
                <label>Quantidade (compra)<input inputMode="decimal" value={item.quantidade} onChange={(e) => updateItem(item.key, { quantidade: e.target.value })} /></label>
                <label>Custo unit. (R$)<input inputMode="decimal" value={item.valorUnitario} onChange={(e) => updateItem(item.key, { valorUnitario: e.target.value })} /></label>
                <label>Desconto do item (R$)<input inputMode="decimal" value={item.valorDesconto} onChange={(e) => updateItem(item.key, { valorDesconto: e.target.value })} /></label>
                <label>Fator de conversão<input inputMode="decimal" value={item.fatorConversao} onChange={(e) => updateItem(item.key, { fatorConversao: e.target.value })} /></label>
                <label>Unidade de venda<input value={item.unidadeVenda} onChange={(e) => updateItem(item.key, { unidadeVenda: e.target.value.toUpperCase().slice(0, 6) })} /></label>
              </div>

              <p className="block-muted" style={{ padding: "0 16px" }}>
                {fator > 1
                  ? `Estoque: entra ${qtd(q * fator)} ${item.unidadeVenda || "UN"}${custo > 0 ? ` a ${brl(custo / fator)}/${item.unidadeVenda || "UN"}` : ""} · Total do item: ${brl(Math.max(0, q * custo - num(item.valorDesconto)))}`
                  : `Total do item: ${brl(Math.max(0, q * custo - num(item.valorDesconto)))} (sem conversão)`}
              </p>

              {!vinculado && (
                <div className="erp-form">
                  <label>Preço de venda (novo SKU){movimenta ? " *" : ""}<input inputMode="decimal" value={item.precoVenda} onChange={(e) => updateItem(item.key, { precoVenda: e.target.value })} /></label>
                  <label>Preço mínimo<input inputMode="decimal" value={item.precoMinimo} onChange={(e) => updateItem(item.key, { precoMinimo: e.target.value })} /></label>
                  <label>Marca<input value={item.marca} onChange={(e) => updateItem(item.key, { marca: e.target.value })} /></label>
                </div>
              )}

              <div style={{ padding: "0 16px 12px" }}>
                <button type="button" className="btn-erp ghost xs" onClick={() => updateItem(item.key, { mostrarImpostos: !item.mostrarImpostos })}>
                  {item.mostrarImpostos ? "▾" : "▸"} Impostos (opcional)
                </button>
                {item.mostrarImpostos && (
                  <div className="erp-table-wrap" style={{ marginTop: 8 }}>
                    <table className="erp-table">
                      <thead><tr><th>Tributo</th><th>CST</th><th>CSOSN</th><th className="num">Base</th><th className="num">Alíq. %</th><th className="num">Valor</th></tr></thead>
                      <tbody>
                        {TRIBUTOS.map((t) => (
                          <tr key={t}>
                            <td><strong>{t}</strong></td>
                            <td><input style={{ width: 60 }} value={item.impostos[t].cst} onChange={(e) => updateImposto(item.key, t, { cst: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></td>
                            <td><input style={{ width: 60 }} value={item.impostos[t].csosn} onChange={(e) => updateImposto(item.key, t, { csosn: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></td>
                            <td className="num"><input style={{ width: 90 }} inputMode="decimal" value={item.impostos[t].base} onChange={(e) => updateImposto(item.key, t, { base: e.target.value })} /></td>
                            <td className="num"><input style={{ width: 70 }} inputMode="decimal" value={item.impostos[t].aliquota} onChange={(e) => updateImposto(item.key, t, { aliquota: e.target.value })} /></td>
                            <td className="num"><input style={{ width: 90 }} inputMode="decimal" value={item.impostos[t].valor} onChange={(e) => updateImposto(item.key, t, { valor: e.target.value })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="erp-table-foot" style={{ margin: "0 16px" }}>
          <span>Produtos: {brl(totalProdutos)} · Frete {brl(num(frete))} · Seguro {brl(num(seguro))} · Outras {brl(num(outras))} · Desc. {brl(num(descontoNota))}</span>
          <strong>Total da nota: {brl(totalNota)}</strong>
        </div>
      </section>

      {/* Parcelas */}
      <section className="erp-card">
        <div className="erp-card-head">
          <h3>Parcelas / financeiro</h3>
          <span style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="light" onClick={gerarParcelaUnica}>Parcela única (total)</Button>
            <Button type="button" variant="light" onClick={() => setParcelas((c) => [...c, novaParcela()])}>+ Parcela</Button>
          </span>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Nº</th><th>Vencimento</th><th className="num">Valor (R$)</th><th>Forma de pagamento</th><th></th></tr></thead>
            <tbody>
              {parcelas.map((p, i) => (
                <tr key={p.key}>
                  <td><input style={{ width: 50 }} value={p.numero} placeholder={String(i + 1)} onChange={(e) => setParcelas((c) => c.map((x) => x.key === p.key ? { ...x, numero: e.target.value } : x))} /></td>
                  <td><input type="date" value={p.vencimento} onChange={(e) => setParcelas((c) => c.map((x) => x.key === p.key ? { ...x, vencimento: e.target.value } : x))} /></td>
                  <td className="num"><input style={{ width: 110, textAlign: "right" }} inputMode="decimal" value={p.valor} onChange={(e) => setParcelas((c) => c.map((x) => x.key === p.key ? { ...x, valor: e.target.value } : x))} /></td>
                  <td>
                    <input list="formas-pgto-manual" value={p.formaPagamento} placeholder="Ex.: Boleto" onChange={(e) => setParcelas((c) => c.map((x) => x.key === p.key ? { ...x, formaPagamento: e.target.value } : x))} />
                  </td>
                  <td>{parcelas.length > 1 && <button type="button" className="btn-erp danger xs" onClick={() => setParcelas((c) => c.filter((x) => x.key !== p.key))}>remover</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="formas-pgto-manual">{formasPagamento.map((f) => <option key={f} value={f} />)}</datalist>
        <div className="erp-table-foot">
          <span>Soma das parcelas: {brl(totalParcelas)}{Math.abs(totalParcelas - totalNota) > 0.01 ? ` ⚠️ difere do total (${brl(totalNota)})` : ""}</span>
        </div>
      </section>

      <div className="detalhe-acoes" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="light" href="/erp/entradas-fiscais">Cancelar</Button>
        <Button type="button" onClick={lancar} disabled={salvando}>{salvando ? "Lançando…" : "Lançar e revisar"}</Button>
      </div>
    </>
  );
}
