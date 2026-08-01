import { prisma } from "@/lib/db/prisma";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * IMPORTAÇÃO DE CLIENTES da migração (CSV extraído do sistema anterior — CIEvolution/JR).
 * Colunas (;): codigo;tipo;nome;documento;ie;telefone;email;cep;cidade;uf;bairro;logradouro
 *
 * Regras:
 *  - `codigoExterno` é a CHAVE do De/Para (a importação de vendas casa por ele) — idempotente:
 *    re-rodar atualiza em vez de duplicar.
 *  - Cliente que já existir com o MESMO documento (cadastrado à mão antes da migração) recebe o
 *    codigoExterno e é atualizado — nunca duplicado.
 *  - Endereço PADRÃO e contato principal são criados apenas se o cliente ainda não tiver.
 *  - Clientes migrados entram ATIVOS (já eram clientes da casa).
 */

export type ClienteImportRow = {
  codigo: string;
  tipo: string;
  nome: string;
  documento: string;
  ie: string;
  telefone: string;
  email: string;
  cep: string;
  cidade: string;
  uf: string;
  bairro: string;
  logradouro: string;
};

export function parseClientesCsv(csv: string): { linhas: ClienteImportRow[]; invalidas: number } {
  const linhas: ClienteImportRow[] = [];
  let invalidas = 0;
  const rows = csv.split(/\r?\n/).filter((l) => l.trim());
  const header = rows.shift()?.split(";").map((h) => h.trim().toLowerCase()) ?? [];
  const idx = (nome: string) => header.indexOf(nome);
  const iCod = idx("codigo");
  for (const raw of rows) {
    const c = raw.split(";");
    const get = (nome: string) => (idx(nome) >= 0 ? (c[idx(nome)] ?? "").trim() : "");
    const codigo = (c[iCod] ?? "").trim();
    const nome = get("nome");
    if (!codigo || !nome) { invalidas++; continue; }
    linhas.push({
      codigo,
      tipo: get("tipo"),
      nome,
      documento: normalizeDocumento(get("documento")),
      ie: get("ie"),
      telefone: get("telefone"),
      email: get("email").toLowerCase(),
      cep: get("cep").replace(/\D/g, ""),
      cidade: get("cidade"),
      uf: get("uf").toUpperCase().slice(0, 2),
      bairro: get("bairro"),
      logradouro: get("logradouro")
    });
  }
  return { linhas, invalidas };
}

/** Separa "R B3, 1408" em logradouro + número (última vírgula quando o resto é número/SN). */
function splitLogradouro(completo: string): { logradouro: string; numero: string | null } {
  const m = /^(.*),\s*([\dA-Za-z\/\- ]{1,10})$/.exec(completo);
  if (m && (/\d/.test(m[2]) || /^s\/?n$/i.test(m[2].trim()))) {
    return { logradouro: m[1].trim(), numero: m[2].trim() };
  }
  return { logradouro: completo, numero: null };
}

export type ClientesImportResult = {
  total: number;
  criados: number;
  atualizados: number;
  enderecos: number;
  contatos: number;
  erros: string[];
};

export async function importarClientes(
  scope: { tenantId: string; empresaId: string },
  linhas: ClienteImportRow[]
): Promise<ClientesImportResult> {
  const r: ClientesImportResult = { total: linhas.length, criados: 0, atualizados: 0, enderecos: 0, contatos: 0, erros: [] };

  for (const linha of linhas) {
    try {
      const dados = {
        razaoSocial: linha.nome,
        documento: linha.documento,
        inscricaoEstadual: linha.ie || null,
        codigoExterno: linha.codigo,
        status: "ATIVO" as const
      };

      // 1) já importado (codigoExterno) → atualiza; 2) mesmo documento → adota; 3) cria.
      let cliente = await prisma.cliente.findFirst({
        where: { tenantId: scope.tenantId, empresaId: scope.empresaId, codigoExterno: linha.codigo }
      });
      if (!cliente && linha.documento) {
        cliente = await prisma.cliente.findFirst({
          where: { tenantId: scope.tenantId, empresaId: scope.empresaId, documento: linha.documento }
        });
      }
      if (cliente) {
        await prisma.cliente.update({ where: { id: cliente.id }, data: dados });
        r.atualizados++;
      } else {
        cliente = await prisma.cliente.create({
          data: { tenantId: scope.tenantId, empresaId: scope.empresaId, ...dados }
        });
        r.criados++;
      }

      // Endereço PADRÃO (só se ainda não tem nenhum).
      if (linha.cep && linha.cidade && linha.uf) {
        const temEndereco = await prisma.clienteEndereco.count({ where: { clienteId: cliente.id } });
        if (!temEndereco) {
          const { logradouro, numero } = splitLogradouro(linha.logradouro || "-");
          await prisma.clienteEndereco.create({
            data: {
              tenantId: scope.tenantId,
              empresaId: scope.empresaId,
              clienteId: cliente.id,
              apelido: "PADRÃO",
              cep: linha.cep,
              logradouro,
              numero,
              bairro: linha.bairro || null,
              cidade: linha.cidade,
              uf: linha.uf,
              padrao: true
            }
          });
          r.enderecos++;
        }
      }

      // Contato principal (só se ainda não tem nenhum).
      if (linha.telefone || linha.email) {
        const temContato = await prisma.clienteContato.count({ where: { clienteId: cliente.id } });
        if (!temContato) {
          const foneDigits = linha.telefone.replace(/\D/g, "");
          await prisma.clienteContato.create({
            data: {
              tenantId: scope.tenantId,
              empresaId: scope.empresaId,
              clienteId: cliente.id,
              nome: linha.nome,
              telefone: linha.telefone || null,
              whatsapp: foneDigits.length >= 10 ? foneDigits : null,
              email: linha.email || null,
              principal: true
            }
          });
          r.contatos++;
        }
      }
    } catch (e) {
      r.erros.push(`${linha.codigo} ${linha.nome.slice(0, 30)}: ${e instanceof Error ? e.message : "erro"}`);
      if (r.erros.length >= 30) { r.erros.push("(interrompido: erros demais)"); break; }
    }
  }
  return r;
}
