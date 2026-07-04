import type { Metadata } from "next";
import { ManualView } from "@/components/manual/ManualView";

export const metadata: Metadata = {
  title: "Manual do XERP — como usar o sistema",
  description: "Guia passo a passo do XERP: primeiros passos, PDV, emissão fiscal, ordem de serviço, estoque e financeiro."
};

// Página pública (fora do matcher do middleware) — manual de uso do sistema.
export default function ManualPage() {
  return <ManualView />;
}
