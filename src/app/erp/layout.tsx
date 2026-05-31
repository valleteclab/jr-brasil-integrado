import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp/ErpShell";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <ErpShell session={{ nome: session.nome, perfilNome: session.perfilNome, modulos: session.modulos }}>
      {children}
    </ErpShell>
  );
}
