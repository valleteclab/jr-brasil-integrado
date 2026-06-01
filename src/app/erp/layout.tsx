import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp/ErpShell";
import { getErpShellContext } from "@/lib/services/erp-shell";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");

  const context = await getErpShellContext();
  return (
    <ErpShell context={context} modulos={session.modulos} plataformaAdmin={session.plataformaAdmin}>
      {children}
    </ErpShell>
  );
}
