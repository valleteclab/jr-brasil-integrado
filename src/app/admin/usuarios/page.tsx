import { PageHeader } from "@/components/shared/PageHeader";
import { UsuariosManager } from "@/components/admin/UsuariosManager";
import { listUsuarios, listEstruturaClientes } from "@/lib/services/platform-admin";
import type { UsuarioRow, EstruturaCliente } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  let usuarios: UsuarioRow[] = [];
  let estrutura: EstruturaCliente[] = [];
  let loadError = "";

  try {
    [usuarios, estrutura] = await Promise.all([listUsuarios(), listEstruturaClientes()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os usuários.";
  }

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Usuários">
        <p>{usuarios.length} usuários · Cadastre, edite e gerencie senhas de todos os clientes.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <UsuariosManager usuarios={usuarios} estrutura={estrutura} />}
    </>
  );
}
