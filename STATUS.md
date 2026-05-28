# Status do Desenvolvimento JR Brasil Integrado

Este documento acompanha a execução do plano ERP + ecommerce B2B integrado e deve ser atualizado a cada commit/push relevante.

## Repositório

- GitHub: https://github.com/valleteclab/jr-brasil-integrado
- Branch principal: `main`
- Projeto local: `jr-brasil-integrado`

## Convenção de status

- `Concluído`: entregue e commitado.
- `Em andamento`: iniciado, ainda sujeito a alterações.
- `Pendente`: ainda não iniciado.
- `Bloqueado`: depende de decisão, credencial, serviço externo ou infraestrutura.

## Fase 0 — Preparação da base

| Tarefa | Status | Observações |
| --- | --- | --- |
| Criar projeto Next.js + TypeScript | Concluído | Base criada manualmente com App Router. |
| Configurar scripts e dependências iniciais | Concluído | `next`, `react`, `typescript`, `prisma`, `tsx`. |
| Criar configuração Prisma/PostgreSQL | Concluído | `prisma/schema.prisma` criado com datasource PostgreSQL. |
| Modelar entidades centrais ERP + ecommerce | Concluído | Schema refatorado para multiempresa com `Tenant`, `Empresa`, vínculos, RBAC, auditoria e entidades em PT-BR. |
| Criar seed inicial | Concluído | Tenant, empresa, admin, perfil, permissões, categoria, marca, produto, depósito, estoque e cliente B2B. |
| Criar telas iniciais `/`, `/loja`, `/erp` | Concluído | Shell inicial para validar direção visual e rotas. |
| Criar guia de design system para devs | Concluído | `DESIGN_SYSTEM.md` criado com tokens, padrões ERP/loja e regras de implementação. |
| Padronizar tokens CSS globais | Concluído | `globals.css` atualizado com tokens `--jr-*` e aliases `--erp-*`. |
| Versionar MVP ERP standalone como referência | Concluído | Arquivo copiado para `mvp/JR Brasil ERP - Standalone.html`. |
| Criar `.env.example`, `.gitignore` e README | Concluído | Documentação inicial incluída. |
| Inicializar Git local e subir GitHub | Concluído | Repositório privado criado em `valleteclab/jr-brasil-integrado`. |
| Instalar dependências e validar build local | Concluído | `npm install`, `npm run prisma:generate`, `npm run lint` e `npm run build` executados em 2026-05-26. |
| Criar migration inicial do banco | Pendente | Depende de PostgreSQL configurado em `.env`. |

## Fase 1 — Núcleo comercial integrado

| Tarefa | Status | Observações |
| --- | --- | --- |
| Criar camada Prisma client/API base | Concluído | Criado Prisma Client centralizado, escopo temporário de desenvolvimento por `tenantId`/`empresaId` e services iniciais de produtos/clientes. |
| Criar seed operacional completo | Pendente | Popular dados reais de referência, sem fallback em runtime. |
| Implementar listagem real de produtos na loja | Em andamento | `/loja` consome service de produtos com Prisma; se o banco falhar, exibe erro e não usa dados falsos. |
| Implementar cadastro/listagem de clientes no ERP | Em andamento | Criada rota `/erp/clientes` com listagem via service escopado; se o banco falhar, exibe erro e não usa dados falsos. |
| Implementar CRUD de produtos no ERP | Em andamento | `/erp/produtos` cria, edita, inativa e processa XML via APIs reais com Prisma/PostgreSQL. |
| Implementar estoque real com saldos e reservas | Pendente | Base já modelada no schema. |
| Implementar pedido ecommerce entrando no ERP | Pendente | Conectar checkout a `PedidoVenda`. |
| Implementar status de pedido e baixa/reserva de estoque | Pendente | Definir regra final de venda sem saldo. |

## Fase 2 — Orçamentos e atendimento

| Tarefa | Status | Observações |
| --- | --- | --- |
| Migrar fluxo de orçamento do protótipo | Pendente | Base: `Orcamento` e `OrcamentoItem`. |
| Criar aprovação de orçamento no portal B2B | Pendente | Converter orçamento aprovado em pedido. |
| Criar atendimento unificado ERP | Pendente | Venda balcão, pedido, OS e orçamento. |
| Histórico de interações e notificações | Pendente | Depende de módulo de auditoria/notificação. |

## Fase 3 — Estoque e compras avançados

| Tarefa | Status | Observações |
| --- | --- | --- |
| Movimentações completas de estoque | Pendente | Entrada, saída, ajuste, transferência e reserva. |
| Inventário físico | Pendente | Modelagem complementar pode ser necessária. |
| Pedido de compra completo | Pendente | Base: `PedidoCompra` e `PedidoCompraItem`. |
| Recebimento e atualização de custo médio | Pendente | Depende de regra fiscal/entrada. |
| Sugestão de compra por estoque mínimo/giro | Pendente | Depende de histórico de vendas. |

## Fase 4 — Oficina / OS

| Tarefa | Status | Observações |
| --- | --- | --- |
| OS com serviços e peças aplicadas | Pendente | Base modelada. |
| Agenda de técnicos | Pendente | Requer tabela específica de agenda/apontamentos. |
| Apontamento de horas | Pendente | Expandir `OrdemServicoMaoObra`. |
| OS aguardando peça vinculada a compras | Pendente | Criar vínculo entre OS e compras. |
| Faturamento de OS | Pendente | Integrar contas a receber e fiscal. |

## Fase 5 — Financeiro e fiscal

| Tarefa | Status | Observações |
| --- | --- | --- |
| Contas a pagar/receber reais | Pendente | Base modelada. |
| Baixas financeiras | Pendente | Criar APIs e telas. |
| Conciliação bancária/OFX | Pendente | Integração futura. |
| NF-e fiscal | Pendente | Depende de provedor/certificado. |
| Boletos, Pix e cartão | Pendente | Depende de gateway. |

## Fase 6 — BI, automações e escala

| Tarefa | Status | Observações |
| --- | --- | --- |
| Dashboards reais por perfil | Pendente | Depende dos módulos transacionais. |
| Relatórios operacionais e DRE | Pendente | Depende de dados financeiros. |
| Notificações WhatsApp/email | Pendente | Depende de provedor definido. |
| Integrações contábeis/transportadoras | Pendente | Futuro. |
| Performance, cache e busca avançada | Pendente | Futuro. |

## Histórico de commits/pushes

| Data | Commit | Status | Resumo |
| --- | --- | --- | --- |
| 2026-05-26 | `36ca124` | Enviado | Base inicial integrada: Next.js, Prisma, páginas iniciais, README e seed. |
| 2026-05-26 | `d844cac` | Enviado | Adição deste documento de status do desenvolvimento. |
| 2026-05-26 | `da59141` | Enviado | Atualização do histórico com hash real do commit de status. |
| 2026-05-26 | `ef9a4a5` | Enviado | Criação do design system e padronização inicial de tokens CSS. |
| 2026-05-26 | `042a00b` | Enviado | Extração dos primeiros componentes base compartilhados e refatoração inicial da home. |
| 2026-05-26 | `9dfca61` | Enviado | Atualização do status após commit de componentes compartilhados. |
| 2026-05-26 | `621c519` | Enviado | Criação do manual operacional para agentes de IA, templates e atualização do README. |
| 2026-05-26 | `b9d8134` | Enviado | Atualização do histórico após documentação de engenharia para IA. |
| 2026-05-26 | `3326612` | Enviado | Criação das regras de segurança, multiempresa e isolamento de dados. |
| 2026-05-26 | `28201b0` | Enviado | Atualização do README e STATUS com referências de segurança multiempresa. |
| 2026-05-26 | `7601655` | Enviado | Versionamento do MVP ERP standalone como referência do projeto integrado. |
| 2026-05-26 | `ad9eff3` | Enviado | Atualização do histórico após versionamento do MVP ERP standalone. |
| 2026-05-26 | `425b645` | Enviado | Refatoração do schema Prisma e seed para multiempresa com campos em PT-BR. |
| 2026-05-26 | A gerar | Em andamento | Atualização do histórico após refatoração multiempresa do schema Prisma. |
| 2026-05-26 | A gerar | Em andamento | Instalação de dependências, correção do BOM do schema Prisma, criação do Prisma Client centralizado, services iniciais e conexão da loja ao service de produtos. |
| 2026-05-26 | A gerar | Em andamento | Criação do shell compartilhado do ERP e das rotas `/erp/produtos` e `/erp/clientes` usando services com escopo multiempresa. |
| 2026-05-26 | A gerar | Em andamento | Implementação do CRUD temporário de produtos no ERP com persistência em `localStorage`, preparando troca futura para banco/API na VPS. |
| 2026-05-26 | A gerar | Em andamento | Revisão de textos visíveis para linguagem de produto em PT-BR, removendo termos internos de desenvolvimento das telas e adicionando regra de copy ao design system. |
| 2026-05-26 | A gerar | Em andamento | Realinhamento visual do ERP ao `JR Brasil ERP - Standalone.html`: sidebar/topbar densas e tela de produtos com toolbar, filtros, tabela operacional e ações no padrão do protótipo. |
| 2026-05-26 | A gerar | Em andamento | Evolução do cadastro de produto para ficha mestre em drawer com abas: Geral, Fiscal, Preços e custos, Estoque, Compras e Loja B2B. |
| 2026-05-26 | A gerar | Em andamento | Implementação de importação temporária de XML de NF-e no cadastro de produtos, lendo itens, fornecedor, custos, estoque e dados fiscais para criar/atualizar SKUs localmente. |
| 2026-05-26 | A gerar | Em andamento | Auditoria enterprise do módulo de produtos documentada em `docs/PRODUCT_MODULE_AUDIT.md` e extração inicial do parser de XML para `src/domains/products/xml`. |
| 2026-05-26 | A gerar | Em andamento | Evolução real do schema Prisma de produtos: ficha fiscal, vínculo fornecedor-produto, XML importado, entrada fiscal, impostos por item, regras tributárias CBS/IBS e estoque com lote/série/reserva/movimento rastreável. |
| 2026-05-26 | A gerar | Em andamento | Ajuste do fluxo visual de XML em produtos: importação agora abre entrada fiscal em conferência, tenta vincular itens aos produtos internos e só processa o cadastro/estoque após confirmação. |
| 2026-05-26 | A gerar | Em andamento | Banco PostgreSQL Railway configurado localmente em `.env`, migration inicial `20260526232023_init` aplicada e seed inicial executado com tenant, empresa, usuário admin, produto, saldo e cliente. |
| 2026-05-26 | A gerar | Em andamento | CRUD real de produtos conectado ao PostgreSQL: `POST /api/erp/produtos`, `PUT /api/erp/produtos/[id]` e `DELETE /api/erp/produtos/[id]`; tela deixou de usar `localStorage` para produtos. |
| 2026-05-26 | A gerar | Em andamento | Removidos fallbacks mock de produtos/clientes; banco não configurado ou indisponível agora gera erro visível, sem dados falsos. |
| 2026-05-26 | A gerar | Em andamento | Produto refatorado para use cases com validação, auditoria e movimento de estoque; XML agora é importado no servidor para `XmlImportacao` e `EntradaFiscal`, com processamento fiscal gerando `EstoqueMovimento`. |

## Próximos passos imediatos

1. Priorizar o módulo de produtos: separar DTOs, casos de uso, repositórios e APIs antes de ampliar outros CRUDs.
2. Trocar a importação XML visual para um fluxo real: `XmlImportacao` -> `EntradaFiscal` -> conferência -> movimento de estoque.
3. Criar API real de entrada fiscal usando `XmlImportacao`, `EntradaFiscal`, itens e impostos.
4. Criar validações de produto/fiscal/estoque antes de qualquer escrita no banco.
5. Implementar auditoria para alteração de produto, preço, fiscal, vínculo de fornecedor, XML e estoque.

## Regras de manutenção deste arquivo

- Atualizar antes de cada commit relevante.
- Registrar hash do commit depois do push, quando disponível.
- Manter tarefas em formato claro para onboarding de novos devs.
- Não registrar segredos, tokens, senhas ou dados sensíveis.

## Atualização operacional - 2026-05-27

- Criada a configuração de IA por empresa usando OpenRouter, com chave criptografada em banco e tela administrativa em `/erp/configuracoes/ia`.
- Aplicadas as migrations `20260527012245_add_ai_configuration` e `20260527013015_add_ai_configuration_tenant_fk` no PostgreSQL e gerado Prisma Client atualizado.
- Adicionado `AI_CONFIG_SECRET` no `.env` local sem registrar o valor neste arquivo.
- Criada a rota `/erp/entradas-fiscais/nova` com assistente em 4 etapas: cabeçalho da NF-e, itens e vínculo ao estoque, financeiro/parcelas e conferência/lançamento.
- Entrada fiscal via XML continua sendo criada primeiro em `XmlImportacao`/`EntradaFiscal`; estoque só é movimentado na confirmação final.
- Adicionadas APIs para salvar vínculo de item de NF-e com produto existente ou marcar criação de novo SKU.
- Adicionada API de sugestão de vínculos com IA usando OpenRouter, respeitando a configuração da empresa.
- Validação executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Servidor local ativo em `http://127.0.0.1:3002`; rotas `/erp/configuracoes/ia` e `/erp/entradas-fiscais/nova` responderam HTTP 200.

## Atualizacao operacional - 2026-05-27 - entrada fiscal

- Adicionada persistencia real de parcelas da entrada fiscal em `EntradaFiscalParcela` e geracao de `ContaPagar` ao confirmar o lancamento.
- Confirmacao da entrada fiscal agora valida fechamento das parcelas com o total da NF-e, atualiza saldo, registra `EstoqueMovimento`, calcula custo medio ponderado e bloqueia relancamento.
- Aplicada a migration `20260527183000_add_fiscal_entry_financial_posting` no PostgreSQL e gerado Prisma Client atualizado.
- Validacao executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Servidor local ativo em `http://127.0.0.1:3002`; rotas `/erp/entradas-fiscais` e `/erp/entradas-fiscais/nova` responderam HTTP 200.

## Atualizacao operacional - 2026-05-27 - estorno de entrada fiscal

- Criado fluxo real de estorno para nota fiscal de entrada registrada.
- Adicionados status `ESTORNADA` para entrada fiscal e tipo de movimento `ESTORNO` para estoque.
- Estorno gera movimento inverso em `EstoqueMovimento`, atualiza saldo, recalcula custo medio, cancela contas a pagar abertas e bloqueia estorno quando ha conta paga.
- Listagem de notas de entrada agora exibe acao `Estornar` para notas registradas e mantem exclusao apenas para notas sem movimento de estoque.
- Aplicada a migration `20260527190000_add_fiscal_entry_reversal_status` no PostgreSQL e gerado Prisma Client atualizado.
- Validacao executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Atualizacao operacional - 2026-05-27 - ficha de produtos

- Tela de produtos passou a carregar NCM, CEST, CFOP, custos, fornecedor, deposito e parametros de estoque diretamente do PostgreSQL.
- Removido calculo visual de custo por percentual na tela de produtos; custo medio e ultimo custo agora vêm dos campos reais do produto.
- Processamento da entrada fiscal agora sincroniza `ProdutoFiscal` quando o item da NF-e traz NCM/CEST.
- Executado backfill de `ProdutoFiscal` para 10 produtos que ja tinham NCM no cadastro.
- Validacao executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`; `/erp/produtos` respondeu HTTP 200.

## Atualizacao operacional - 2026-05-27 - regra tributaria no produto

- Produto fiscal agora pode vincular uma `RegraTributaria` por meio de `ProdutoFiscal.regraTributariaId`.
- Aba Fiscal do cadastro de produto ganhou o campo `Regra tributaria para emissao`.
- API de cadastro/edicao de produto valida se a regra pertence ao tenant/empresa antes de salvar.
- Aplicada a migration `20260527193000_link_product_fiscal_tax_rule` no PostgreSQL e gerado Prisma Client atualizado.
- Validacao executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`; `/erp/produtos` respondeu HTTP 200.

## Atualizacao operacional - 2026-05-27 - CRUD de regras tributarias

- Criada a tela `/erp/regras-tributarias` com listagem, busca, cadastro, edicao e inativacao de regras tributarias.
- Criadas APIs `GET/POST /api/erp/regras-tributarias`, `PUT/DELETE /api/erp/regras-tributarias/[id]` e `POST /api/erp/regras-tributarias/assistente`.
- Assistente fiscal com OpenRouter sugere campos estruturados da regra tributaria para revisao humana.
- Menu do ERP atualizado com o item `Regras tributarias` em Financeiro & Fiscal.
- Validacao executada: `npm run lint`, `npx tsc --noEmit`, `npm run build`; `/erp/regras-tributarias` e `/erp/produtos` responderam HTTP 200.
