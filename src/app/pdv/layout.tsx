import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Layout próprio do PDV: tela cheia, SEM o menu lateral do ERP (ErpShell). Protegido pela
// sessão server-side (além do middleware), redirecionando ao login quando não autenticado.
export default async function PdvLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <div className="pdv-root">{children}</div>;
}
