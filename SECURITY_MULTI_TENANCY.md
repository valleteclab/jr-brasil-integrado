# Segurança e Multiempresa

Este documento define regras obrigatórias para transformar o sistema em uma plataforma multiempresa segura, com isolamento de dados, auditoria, prevenção de invasões e proteção contra perda de dados.

## 1. Princípio principal

Nenhuma funcionalidade nova deve assumir empresa única.

Todo dado operacional deve pertencer a uma empresa/tenant, e toda consulta deve respeitar o escopo da empresa autenticada.

## 2. Conceitos

- **Tenant:** unidade lógica de isolamento do sistema. Pode representar uma empresa contratante, grupo econômico ou ambiente operacional.
- **Company:** empresa operacional dentro de um tenant, com CNPJ, filial, estoque, financeiro e fiscal próprios.
- **User:** pessoa autenticada.
- **Membership:** vínculo entre usuário, tenant, company e papéis/permissões.
- **RBAC:** controle de acesso por papéis e permissões.
- **Audit log:** registro de ações sensíveis e alterações de dados.

## 3. Regra de isolamento de dados

Toda entidade de negócio deve ter pelo menos um destes campos:

- `tenantId` para isolamento global.
- `companyId` quando o dado pertence a uma empresa operacional específica.

Exemplos de entidades que devem ser escopadas:

- Clientes
- Fornecedores
- Produtos
- Estoque
- Pedidos
- Orçamentos
- OS
- Compras
- Contas a pagar/receber
- NF-e
- Usuários internos e permissões
- Auditoria

## 4. Regra obrigatória para queries

Toda query operacional deve filtrar por `tenantId` e, quando aplicável, por `companyId`.

Exemplo conceitual:

```ts
where: {
  tenantId: session.tenantId,
  companyId: session.companyId
}
```

Proibido:

```ts
where: { id }
```

Permitido somente se combinado com escopo:

```ts
where: {
  id,
  tenantId: session.tenantId
}
```

## 5. Segurança por padrão

- Todas as rotas privadas devem exigir sessão autenticada.
- Toda rota privada deve validar tenant ativo.
- Toda rota privada deve validar permissão por módulo/ação.
- IDs enviados pelo cliente nunca garantem acesso por si só.
- Toda operação de escrita deve validar propriedade do recurso.
- Erros não devem vazar stack trace, SQL, tokens ou detalhes internos.

## 6. RBAC obrigatório

Perfis iniciais sugeridos:

- `SUPER_ADMIN`: administra a plataforma inteira.
- `TENANT_ADMIN`: administra um tenant.
- `COMPANY_ADMIN`: administra uma empresa/filial.
- `SALES`: vendas, atendimento e orçamentos.
- `STOCK`: estoque, separação e inventário.
- `PURCHASE`: compras e fornecedores.
- `WORKSHOP`: OS/oficina.
- `FINANCE`: contas, fluxo e conciliação.
- `FISCAL`: NF-e/NFS-e e regras fiscais.
- `B2B_CUSTOMER`: portal do cliente.

Permissões devem ser por módulo e ação, por exemplo:

- `products:read`
- `products:create`
- `orders:update_status`
- `finance:write`
- `fiscal:issue_invoice`

## 7. Autenticação e sessões

Requisitos mínimos:

- Senhas com hash forte, nunca texto puro.
- Sessões com expiração.
- Cookies `httpOnly`, `secure` em produção e `sameSite` adequado.
- Proteção contra brute force no login.
- Recuperação de senha por token temporário.
- MFA planejado para perfis administrativos.
- Encerramento de sessão ao trocar senha ou revogar acesso.

## 8. Proteção contra invasão

- Validação de entrada em todas as APIs.
- Rate limiting para login, checkout, orçamento, APIs públicas e webhooks.
- CSRF quando usar cookies em mutações.
- Headers de segurança: CSP, HSTS, X-Frame-Options/Frame-Ancestors, X-Content-Type-Options.
- Sanitização de campos exibidos como HTML.
- Uploads com validação de extensão, MIME, tamanho e antivírus quando aplicável.
- Logs de tentativas suspeitas.

## 9. Auditoria obrigatória

Registrar em `AuditLog`:

- Login/logout administrativo.
- Criação, edição e exclusão de usuários.
- Alteração de permissões.
- Criação/cancelamento de pedido.
- Alteração de preço, desconto ou limite de crédito.
- Baixas e estornos financeiros.
- Emissão, cancelamento ou rejeição fiscal.
- Ajustes de estoque.
- Exportações sensíveis.

Cada evento deve registrar:

- `tenantId`
- `companyId` quando aplicável
- `userId`
- entidade
- ID da entidade
- ação
- payload antes/depois quando seguro
- IP/user-agent quando disponível
- data/hora

## 10. Prevenção de perda de dados

- Backups automáticos do banco.
- Teste periódico de restore.
- Retenção mínima definida por ambiente.
- Soft delete para entidades críticas quando aplicável.
- Auditoria de deleções.
- Controle de migrations em produção.
- Nenhuma migration destrutiva sem plano de rollback.
- Exportação regular de XML/DANFE e documentos fiscais.

## 11. Ambientes

Ambientes recomendados:

- `development`
- `staging`
- `production`

Regras:

- Produção nunca deve usar dados mock.
- Staging pode usar dados anonimizados.
- Tokens e segredos devem ficar em variáveis de ambiente.
- Cada ambiente deve ter banco separado.
- Backups de produção não devem ser baixados em máquinas locais sem autorização.

## 12. Banco de dados multiempresa

Modelos estruturais recomendados:

- `Tenant`
- `Company`
- `CompanyBranch` opcional
- `UserMembership`
- `Role`
- `Permission`
- `AuditLog`

Regras de schema:

- Adicionar índices compostos com `tenantId` e campos de busca frequente.
- Unicidade deve considerar tenant/company quando necessário.
- Exemplo: CNPJ de cliente pode ser único por tenant, não global, se houver múltiplos tenants.
- Produtos podem ser globais ou por tenant, mas a decisão deve ser explícita.

## 13. Decisões pendentes

- Definir se `Tenant` e `Company` serão entidades separadas desde a primeira migration.
- Definir se produtos serão globais da plataforma ou por tenant.
- Definir se usuários podem participar de múltiplas empresas.
- Definir estratégia de RLS no PostgreSQL ou isolamento apenas na camada de aplicação.
- Definir provedor de autenticação.
- Definir política de backup e retenção.

## 14. Regra para agentes

Antes de criar ou alterar qualquer API, model ou tela que leia/grave dados operacionais, o agente deve responder mentalmente:

1. Qual é o `tenantId` desta operação?
2. Qual é o `companyId` desta operação?
3. Quem é o usuário autenticado?
4. Ele tem permissão para esta ação?
5. A query está isolada por tenant/company?
6. Esta ação precisa de auditoria?
7. Há risco de perda de dados ou vazamento entre empresas?

Se qualquer resposta estiver indefinida, a tarefa deve ser tratada como incompleta ou bloqueada.
