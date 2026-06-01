"use client";

import type { ClienteOption } from "@/lib/services/platform-admin";

type ValoresAtuais = {
  status?: string;
  modelo?: string;
  tenantId?: string;
  busca?: string;
};

type Props = { clientes: ClienteOption[]; valoresAtuais: ValoresAtuais };

const STATUS_OPCOES = [
  { value: "", label: "Todos os status" },
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "PROCESSANDO", label: "Processando" },
  { value: "AUTORIZADA", label: "Autorizada" },
  { value: "CANCELADA", label: "Cancelada" },
  { value: "REJEITADA", label: "Rejeitada" },
  { value: "DENEGADA", label: "Denegada" },
  { value: "ERRO", label: "Erro" }
];

const MODELO_OPCOES = [
  { value: "", label: "Todos os modelos" },
  { value: "NFE", label: "NF-e" },
  { value: "NFCE", label: "NFC-e" },
  { value: "NFSE", label: "NFS-e" }
];

export function EmissoesFiltro({ clientes, valoresAtuais }: Props) {
  return (
    <form method="get" action="/admin/emissoes" className="erp-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
      <select name="status" className="btn-erp ghost sm" defaultValue={valoresAtuais.status ?? ""}>
        {STATUS_OPCOES.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select name="modelo" className="btn-erp ghost sm" defaultValue={valoresAtuais.modelo ?? ""}>
        {MODELO_OPCOES.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select name="tenantId" className="btn-erp ghost sm" defaultValue={valoresAtuais.tenantId ?? ""}>
        <option value="">Todos os clientes</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>
      <div className="toolbar-search">
        <span className="ic-sr" aria-hidden="true">⌕</span>
        <input
          className="search"
          name="busca"
          placeholder="Buscar por número, chave, destinatário…"
          defaultValue={valoresAtuais.busca ?? ""}
        />
      </div>
      <div className="grow" />
      <button type="submit" className="btn-erp primary sm">Filtrar</button>
    </form>
  );
}
