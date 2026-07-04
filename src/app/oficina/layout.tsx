import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Layout do PAINEL DA OFICINA: tela cheia, SEM o menu do ERP. Protegido pela sessão
// (a TV da oficina abre uma vez logada e permanece). Redireciona ao login se não autenticado.
export default async function OficinaLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <>{children}</>;
}
