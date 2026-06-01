import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Duas primeiras iniciais do nome, em maiúsculas. */
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const iniciais = partes.slice(0, 2).map((p) => p[0]).join("");
  return (iniciais || nome.slice(0, 2)).toUpperCase();
}

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.plataformaAdmin) redirect("/erp");

  const iniciais = iniciaisDoNome(session.nome);

  return (
    <AdminShell usuarioNome={session.nome} usuarioIniciais={iniciais}>
      {children}
    </AdminShell>
  );
}
