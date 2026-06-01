import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/shared/Button";
import { UsuarioDadosForm } from "@/components/admin/UsuarioDadosForm";
import { UsuarioSenhaForm } from "@/components/admin/UsuarioSenhaForm";
import { UsuarioVinculosManager } from "@/components/admin/UsuarioVinculosManager";
import { getUsuarioDetail, listEstruturaClientes } from "@/lib/services/platform-admin";
import type { UsuarioDetail, EstruturaCliente } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

function formatarData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

export default async function AdminUsuarioDetalhePage({ params }: { params: { id: string } }) {
  let usuario: UsuarioDetail | null = null;
  let estrutura: EstruturaCliente[] = [];
  let loadError = "";

  try {
    [usuario, estrutura] = await Promise.all([getUsuarioDetail(params.id), listEstruturaClientes()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o usuário.";
  }

  if (loadError) {
    return (
      <>
        <PageHeader eyebrow="Plataforma" title="Usuário" />
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      </>
    );
  }

  if (!usuario) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Plataforma · Usuário"
        title={usuario.nome}
        action={<Button href="/admin/usuarios" variant="light">Voltar</Button>}
      >
        <p>
          <span className="mono">{usuario.email}</span> ·{" "}
          <StatusBadge tone={usuario.status === "ATIVO" ? "success" : "mute"}>{usuario.status}</StatusBadge>
          {usuario.plataformaAdmin && <> · <StatusBadge tone="violet">Dono da plataforma</StatusBadge></>}
          {" "}· Último acesso {formatarData(usuario.ultimoAcessoEm)}
        </p>
      </PageHeader>

      <Card>
        <div className="erp-card-head"><h3>Dados do usuário</h3></div>
        <UsuarioDadosForm
          usuarioId={usuario.id}
          nome={usuario.nome}
          email={usuario.email}
          status={usuario.status}
          plataformaAdmin={usuario.plataformaAdmin}
        />
      </Card>

      <Card>
        <div className="erp-card-head"><h3>Senha</h3></div>
        <UsuarioSenhaForm usuarioId={usuario.id} />
      </Card>

      <Card>
        <div className="erp-card-head"><h3>Vínculos (cliente · empresa · perfil)</h3></div>
        <UsuarioVinculosManager usuarioId={usuario.id} vinculos={usuario.vinculos} estrutura={estrutura} />
      </Card>
    </>
  );
}
