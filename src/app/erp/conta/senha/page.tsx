import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage() {
  const session = await getSession();
  const usuario = session
    ? await prisma.usuario.findUnique({
        where: { id: session.usuarioId },
        select: { senhaAtualizadaEm: true, ultimoAcessoEm: true }
      })
    : null;

  const fmt = (d: Date | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR") : null);
  const senhaEm = fmt(usuario?.senhaAtualizadaEm);
  const acessoEm = fmt(usuario?.ultimoAcessoEm);

  return (
    <>
      <PageHeader eyebrow="Minha conta" title="Segurança">
        <p>Altere sua senha de acesso ao sistema.</p>
      </PageHeader>
      {(senhaEm || acessoEm) && (
        <div className="alert info" style={{ maxWidth: 520, marginBottom: 12 }}>
          <span>
            {senhaEm ? <>Última troca de senha: <strong>{senhaEm}</strong>.</> : <>Você ainda não trocou a senha por aqui.</>}
            {acessoEm ? <> · Último acesso: <strong>{acessoEm}</strong>.</> : null}
          </span>
        </div>
      )}
      <ChangePasswordForm />
    </>
  );
}
