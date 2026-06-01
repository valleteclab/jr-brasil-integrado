import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  // Dono da plataforma (sem cliente) vai ao painel; demais ao ERP.
  if (session) redirect(session.scope ? "/erp" : "/admin");
  return <LoginForm />;
}
