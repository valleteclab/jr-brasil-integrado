# Manual para Agentes de IA

Este projeto será desenvolvido majoritariamente por agentes de IA. Este documento é obrigatório para qualquer agente antes de modificar código.

## 1. Leitura obrigatória antes de qualquer tarefa

Antes de codar, o agente deve ler:

1. `README.md`
2. `STATUS.md`
3. `DESIGN_SYSTEM.md`
4. `AGENTS.md`
5. `SECURITY_MULTI_TENANCY.md`
6. Arquivos diretamente relacionados à tarefa

Se a tarefa envolver banco/modelos, ler também:

- `prisma/schema.prisma`
- `prisma/seed.ts`

## 2. Fonte da verdade

- **Status do projeto:** `STATUS.md`
- **Padrão visual:** `DESIGN_SYSTEM.md`
- **Regras para agentes:** `AGENTS.md`
- **Segurança e multiempresa:** `SECURITY_MULTI_TENANCY.md`
- **Modelo de dados:** `prisma/schema.prisma`
- **Comportamento esperado do app:** plano aprovado em `.windsurf/plans/plano-erp-ecommerce-jr-brasil-75bad0.md`

## 3. Fluxo obrigatório por tarefa

Todo agente deve seguir este ciclo:

1. Entender a tarefa e localizar arquivos relevantes.
2. Verificar `STATUS.md` para não duplicar trabalho.
3. Para features relevantes, preencher mentalmente ou materialmente `docs/FEATURE_TEMPLATE.md`.
4. Implementar a menor mudança coerente e completa.
5. Atualizar documentação quando a mudança alterar comportamento, arquitetura, status ou padrão.
6. Validar com comandos seguros quando possível.
7. Atualizar `STATUS.md` antes do commit.
8. Fazer commit com mensagem clara.
9. Fazer push para `origin/main`.
10. Se o hash real do commit anterior precisar ser registrado, fazer um commit adicional pequeno de status.

## 4. Regras de segurança

- Nunca commitar `.env`, tokens, senhas, certificados, dumps privados ou credenciais.
- Nunca apagar arquivos de protótipo sem tarefa explícita.
- Nunca executar comandos destrutivos sem necessidade clara.
- Não instalar dependências aleatórias sem justificar no README/STATUS.
- Não expor dados reais de clientes, fornecedores ou financeiro.
- Não colocar chave fiscal, certificado A1, gateway ou token em código.
- Nunca criar query operacional sem isolamento por `tenantId` e, quando aplicável, `companyId`.
- Nunca confiar apenas em ID enviado pelo cliente para autorizar acesso a um recurso.
- Toda operação sensível deve considerar auditoria, permissão e risco de vazamento entre empresas.

## 5. Regras de engenharia

- Preferir mudanças pequenas, coesas e commitáveis.
- Não misturar refatoração grande com feature de negócio no mesmo commit.
- Criar componentes reutilizáveis antes de duplicar UI.
- Manter lógica de negócio fora de componentes visuais.
- Tipar entradas/saídas de funções e APIs.
- Usar Prisma como camada principal de acesso ao banco.
- Não inventar campos fora do schema sem revisar impacto no domínio.
- Manter compatibilidade com Next.js App Router.
- Todo modelo operacional novo deve considerar multiempresa desde o início.
- Toda API privada deve validar sessão, tenant, empresa e permissão antes da operação.

## 6. Padrão de commits

Usar mensagens curtas e objetivas em inglês ou português consistente.

Exemplos:

- `Add product API endpoints`
- `Create customer approval flow`
- `Update status after product API commit`
- `Refactor storefront product cards`
- `Add ERP customer listing page`

Commits devem representar uma unidade clara de trabalho.

## 7. Padrão de atualização do STATUS.md

Antes do commit:

- Marcar tarefas concluídas/em andamento.
- Adicionar linha em `Histórico de commits/pushes` com `A gerar`.
- Descrever claramente o que está sendo entregue.

Depois do push:

- Se necessário, substituir `A gerar` pelo hash real em novo commit pequeno.

Evitar registrar hashes inexistentes.

## 8. Checklist antes de commit

- A alteração segue `DESIGN_SYSTEM.md`?
- O código compila conceitualmente com as dependências do `package.json`?
- Não há segredo em arquivos versionados?
- `STATUS.md` foi atualizado?
- O README precisa ser atualizado?
- O schema Prisma foi alterado? Se sim, mencionar migration pendente.
- Há impacto em outros módulos? Se sim, registrar observação.

## 9. Checklist para novas telas

- Usa componentes compartilhados quando possível.
- Usa tokens `--jr-*` e `--erp-*`.
- Tem layout responsivo mínimo.
- Tem estados previstos para vazio, erro e carregamento quando aplicável.
- Não usa dados mock escondidos sem documentação.
- Integra com domínio correto: ERP, loja, portal ou shared.

## 10. Checklist para APIs

- Validar entrada de dados.
- Retornar erros claros e consistentes.
- Não vazar detalhes internos sensíveis.
- Usar Prisma Client centralizado.
- Considerar permissões/RBAC quando a funcionalidade for protegida.
- Filtrar toda leitura/escrita por `tenantId` e `companyId` quando aplicável.
- Registrar auditoria para ações sensíveis.
- Registrar impacto no `STATUS.md`.

## 11. Checklist para banco de dados

- Alterações no schema devem ser intencionais.
- Nomear modelos e campos em inglês técnico consistente.
- Preservar relação com domínio brasileiro quando necessário: CNPJ, NF-e, NCM, CEST, CFOP.
- Evitar campos genéricos excessivos quando o domínio exigir rastreabilidade.
- Planejar migrations antes de produção.
- Modelos operacionais devem ter `tenantId` e/ou `companyId`.
- Unicidades devem ser revisadas para contexto multiempresa.
- Índices devem considerar filtros por tenant/company.

## 12. Handoff entre agentes

Ao encerrar uma sessão, o agente deve deixar claro:

- O que foi feito.
- O que foi commitado/pushado.
- O que ficou pendente.
- Quais comandos ainda precisam rodar.
- Quais arquivos foram alterados.
- Se há bloqueios de ambiente, credenciais ou decisões.

O `STATUS.md` deve permitir que outro agente continue sem depender do histórico da conversa.

Quando o trabalho for grande ou interrompido no meio, usar `docs/HANDOFF_TEMPLATE.md` como formato de handoff.

## 13. Bloqueios conhecidos atuais

- Dependências ainda podem não estar instaladas localmente (`npm install`).
- Banco PostgreSQL ainda precisa ser configurado em `.env`.
- Migration inicial ainda não foi criada/executada.
- Integrações fiscais, pagamento e WhatsApp ainda dependem de decisões externas.

## 14. Ordem recomendada antes de codar features reais

1. Instalar dependências.
2. Validar TypeScript/lint/build.
3. Criar Prisma Client centralizado.
4. Criar migration inicial.
5. Expandir seeds a partir dos mocks.
6. Criar APIs base de produtos e clientes.
7. Migrar telas para dados reais.
8. Implementar autenticação/RBAC.

## 15. Regra principal

Se houver dúvida entre velocidade e rastreabilidade, escolher rastreabilidade. O objetivo é que qualquer agente consiga entender o estado do projeto lendo os documentos versionados.
