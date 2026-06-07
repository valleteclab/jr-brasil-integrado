"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CartView() {
  const { itens, setQtd, remove, total, pronto, slug } = useCart();

  if (!pronto) return <p className="store-voltar">Carregando carrinho…</p>;

  if (itens.length === 0) {
    return (
      <div className="empty-st">
        <h4>Seu carrinho está vazio</h4>
        <p>Adicione produtos do catálogo para montar seu pedido ou orçamento.</p>
        <Link className="button primary" href={`/loja/${slug}`}>Ver produtos</Link>
      </div>
    );
  }

  return (
    <div className="cart-wrap">
      <div className="cart-list">
        {itens.map((i) => (
          <div className="cart-row" key={i.id}>
            <div className="cart-thumb" style={i.imageUrl ? { backgroundImage: `url(${i.imageUrl})` } : undefined}>
              {!i.imageUrl && <span>{i.sku}</span>}
            </div>
            <div className="cart-info">
              <strong>{i.nome}</strong>
              <span className="sku">{i.sku}</span>
              <span>{brl(i.preco)}</span>
            </div>
            <div className="cart-qtd">
              <button type="button" onClick={() => setQtd(i.id, i.qtd - 1)} aria-label="Diminuir">−</button>
              <span>{i.qtd}</span>
              <button type="button" onClick={() => setQtd(i.id, i.qtd + 1)} aria-label="Aumentar">+</button>
            </div>
            <div className="cart-subtotal">{brl(i.preco * i.qtd)}</div>
            <button type="button" className="cart-remove" onClick={() => remove(i.id)} aria-label="Remover">×</button>
          </div>
        ))}
      </div>
      <div className="cart-footer">
        <div className="cart-total">Total: <strong>{brl(total)}</strong></div>
        <div className="cart-actions">
          <Link className="button light" href={`/loja/${slug}`}>Continuar comprando</Link>
          <Link className="button primary" href={`/loja/${slug}/checkout`}>Finalizar pedido / orçamento</Link>
        </div>
      </div>
    </div>
  );
}
