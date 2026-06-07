import type { ReactNode } from "react";
import { CartProvider } from "@/components/storefront/CartProvider";

// Loja pública multiloja: o carrinho é escopado pelo slug da empresa.
export default function LojaSlugLayout({ children, params }: { children: ReactNode; params: { slug: string } }) {
  return <CartProvider slug={params.slug}>{children}</CartProvider>;
}
