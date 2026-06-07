"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type CartItem = {
  id: string;
  sku: string;
  nome: string;
  preco: number;
  imageUrl?: string;
  qtd: number;
};

type CartContextValue = {
  itens: CartItem[];
  add: (item: Omit<CartItem, "qtd">, qtd?: number) => void;
  setQtd: (id: string, qtd: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: number;
  count: number;
  pronto: boolean;
  /** Slug da loja atual — para montar links e enviar a solicitação à empresa certa. */
  slug: string;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [itens, setItens] = useState<CartItem[]>([]);
  const [pronto, setPronto] = useState(false);
  // Carrinho separado por loja (multiloja): cada slug tem seu próprio carrinho.
  const storageKey = `loja-carrinho:${slug}`;

  // Carrega do localStorage no primeiro render (cliente).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setItens(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch {
      setItens([]);
    }
    setPronto(true);
  }, [storageKey]);

  // Persiste a cada mudança (após carregar).
  useEffect(() => {
    if (!pronto) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(itens));
    } catch {
      // storage indisponível — segue sem persistir
    }
  }, [itens, pronto, storageKey]);

  const add = useCallback((item: Omit<CartItem, "qtd">, qtd = 1) => {
    setItens((cur) => {
      const ex = cur.find((i) => i.id === item.id);
      if (ex) return cur.map((i) => (i.id === item.id ? { ...i, qtd: i.qtd + qtd } : i));
      return [...cur, { ...item, qtd }];
    });
  }, []);

  const setQtd = useCallback((id: string, qtd: number) => {
    setItens((cur) => (qtd <= 0 ? cur.filter((i) => i.id !== id) : cur.map((i) => (i.id === id ? { ...i, qtd } : i))));
  }, []);

  const remove = useCallback((id: string) => setItens((cur) => cur.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setItens([]), []);

  const total = useMemo(() => itens.reduce((s, i) => s + i.preco * i.qtd, 0), [itens]);
  const count = useMemo(() => itens.reduce((s, i) => s + i.qtd, 0), [itens]);

  const value = useMemo(
    () => ({ itens, add, setQtd, remove, clear, total, count, pronto, slug }),
    [itens, add, setQtd, remove, clear, total, count, pronto, slug]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de CartProvider.");
  return ctx;
}
