import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ClienteBloqueioButton } from "@/components/admin/ClienteBloqueioButton";
import { LojaModuloToggle } from "@/components/admin/LojaModuloToggle";
import { IaModuloToggle } from "@/components/admin/IaModuloToggle";
import { EmpresaStatusActions } from "@/components/admin/EmpresaStatusActions";
import { ResetarSenhaButton } from "@/components/admin/ResetarSenhaButton";
import { ClientePerfisManager } from "@/components/admin/ClientePerfisManager";
import { ClienteEditForm } from "@/components/admin/ClienteEditForm";
import { getClienteDetail, listPerfisCliente } from "@/lib/services/platform-admin";
import type { ClienteDetail, PerfilClienteRow } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default async function AdminClienteDetalhePage({ params }: { params: { id: string } }) {
  let cliente: ClienteDetail | null = null;
  let perfis: PerfilClienteRow[] = [];
  let loadError = "";

  try {
    [cliente, perfis] = await Promise.all([getClienteDetail(params.id), listPerfisCliente(params.id)]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o cliente.";
  }

  if (loadError) {
    return (
      <>
        <PageHeader eyebrow="Plataforma" title="Cliente" />
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      </>
    );
  }

  if (!cliente) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Plataforma · Cliente"
        title={cliente.nome}
        action={<ClienteBloqueioButton clienteId={cliente.id} clienteNome={cliente.nome} ativo={cliente.ativo} />}
      >
        <p>
          Identificador <span className="mono">{cliente.slug}</span> ·{" "}
          <StatusBadge tone={cliente.ativo ? "success" : "danger"}>{cliente.ativo ? "Ativo" : "Bloqueado"}</StatusBadge>{" "}
          · Criado em {formatarData(cliente.criadoEm)}
        </p>
      </PageHeader>

      <Card>
        <div className="erp-card-head"><div><h3>Dados do cliente</h3><span>Nome e identificador (slug) do cliente.</span></div></div>
        <ClienteEditForm clienteId={cliente.id} nome={cliente.nome} slug={cliente.slug} />
      </Card>

      <Card>
        <div className="erp-card-head">
          <div>
            <h3>Módulos liberados</h3>
            <span>Recursos do SaaS que este cliente pode usar.</span>
          </div>
        </div>
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <LojaModuloToggle clienteId={cliente.id} habilitada={cliente.lojaHabilitada} />
            <p className="block-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Quando habilitada, as empresas deste cliente podem publicar a loja virtual (vitrine pública
              em /loja/{"{slug}"}). Com a loja desabilitada, o endereço público fica indisponível.
            </p>
          </div>
          <div>
            <IaModuloToggle clienteId={cliente.id} habilitada={cliente.iaHabilitada} />
            <p className="block-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Quando habilitada, este cliente pode usar as funções de IA (sugestão de dados/categoria,
              assistente). Desabilitada, as chamadas de IA são bloqueadas para o cliente.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="erp-card-head"><h3>Empresas</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Razão social</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Status</th>
                <th>Matriz</th>
                <th className="actions">Alterar status</th>
              </tr>
            </thead>
            <tbody>
              {cliente.empresas.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhuma empresa cadastrada.</td>
                </tr>
              )}
              {cliente.empresas.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.razaoSocial}</strong>
                    {e.nomeFantasia && <span className="sublabel">{e.nomeFantasia}</span>}
                  </td>
                  <td className="mono">{e.cnpj}</td>
                  <td>{e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ""}` : "—"}</td>
                  <td><StatusBadge tone={e.statusTone}>{e.statusLabel}</StatusBadge></td>
                  <td>{e.matriz ? "Sim" : "—"}</td>
                  <td className="actions"><EmpresaStatusActions empresaId={e.id} status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="erp-card-head"><h3>Usuários</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfis</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {cliente.usuarios.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum usuário vinculado.</td>
                </tr>
              )}
              {cliente.usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.nome}</strong>
                    {u.plataformaAdmin && <span className="sublabel">Dono da plataforma</span>}
                  </td>
                  <td className="mono">{u.email}</td>
                  <td>{u.perfis.join(", ") || "—"}</td>
                  <td><StatusBadge tone={u.status === "ATIVO" ? "success" : "mute"}>{u.status}</StatusBadge></td>
                  <td>{formatarData(u.ultimoAcessoEm)}</td>
                  <td className="actions">
                    {u.plataformaAdmin ? <span className="sublabel">—</span> : <ResetarSenhaButton usuarioId={u.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="erp-card-head"><h3>Perfis e permissões</h3></div>
        <ClientePerfisManager tenantId={cliente.id} perfis={perfis} />
      </Card>
    </>
  );
}
