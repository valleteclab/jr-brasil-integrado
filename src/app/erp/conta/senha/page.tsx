import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PageHeader } from "@/components/shared/PageHeader";

export const dynamic = "force-dynamic";

export default function TrocarSenhaPage() {
  return (
    <>
      <PageHeader eyebrow="Minha conta" title="Segurança">
        <p>Altere sua senha de acesso ao sistema.</p>
      </PageHeader>
      <ChangePasswordForm />
    </>
  );
}
