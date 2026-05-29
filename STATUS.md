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
| Criar seed operacional completo | Concluído | Empresa fiscal, config fiscal, conta bancária, regras tributárias, fornecedor e catálogo com saldo. |
| Implementar listagem real de produtos na loja | Concluído | `/loja` consome service de produtos com Prisma; sem dados falsos. |
| Implementar cadastro/listagem de clientes no ERP | Concluído | `/erp/clientes` com CRUD completo (contatos, endereços, crédito, aprovação). |
| Implementar CRUD de produtos no ERP | Concluído | `/erp/produtos` cria, edita, inativa e processa XML via APIs reais. |
| Implementar estoque real com saldos e reservas | Concluído | Serviço de estoque transacional (saldo/reserva/baixa/custo médio) + `/erp/estoque`. |
| Implementar pedido de venda entrando no ERP | Concluído | `/erp/vendas`: criar pedido, reservar, confirmar, faturar (NF-e), cancelar. Checkout da loja é evolução futura. |
| Implementar status de pedido e baixa/reserva de estoque | Concluído | Reserva na criação, baixa na confirmação, estorno no cancelamento. |

## Fase 2 — Orçamentos e atendimento

| Tarefa | Status | Observações |
| --- | --- | --- |
| Migrar fluxo de orçamento do protótipo | Concluído | `/erp/orcamentos`: criar, precificar, aprovar, rejeitar. |
| Converter orçamento aprovado em pedido | Concluído | `convertQuoteToPedido` gera `PedidoVenda` e reserva estoque. Portal B2B de aprovação é evolução futura. |
| Criar atendimento unificado ERP | Concluído | `/erp/atendimento`: hub para venda, orçamento e OS. |
| Histórico de interações e notificações | Em andamento | Auditoria registrada em todas as operações; notificações dependem de provedor. |

## Fase 3 — Estoque e compras avançados

| Tarefa | Status | Observações |
| --- | --- | --- |
| Movimentações completas de estoque | Concluído | Entrada, saída, ajuste, transferência, reserva e estorno com idempotência. |
| Inventário físico | Concluído | `/erp/inventarios`: abrir, contar e finalizar gerando ajustes. |
| Pedido de compra completo | Concluído | `/erp/compras`: criar, enviar, receber, cancelar. |
| Recebimento e atualização de custo médio | Concluído | Recebimento aplica entrada de estoque com custo médio e gera conta a pagar. |
| Sugestão de compra por estoque mínimo/giro | Pendente | Depende de histórico de vendas. |

## Fase 4 — Oficina / OS

| Tarefa | Status | Observações |
| --- | --- | --- |
| OS com serviços e peças aplicadas | Concluído | `/erp/os`: lançar serviços (mão de obra) e peças com recálculo de totais. |
| Agenda de técnicos | Pendente | Requer tabela específica de agenda/apontamentos. |
| Apontamento de horas | Em andamento | Horas e valor/hora em `OrdemServicoMaoObra`. |
| OS aguardando peça vinculada a compras | Em andamento | Status `AGUARDANDO_PECAS` disponível; vínculo automático com compras é evolução. |
| Faturamento de OS | Concluído | Baixa de peças no estoque, contas a receber e emissão de NFS-e dos serviços. |

## Fase 5 — Financeiro e fiscal

| Tarefa | Status | Observações |
| --- | --- | --- |
| Contas a pagar/receber reais | Concluído | `/erp/financeiro`: lista, criação avulsa e baixa de contas a pagar/receber. |
| Baixas financeiras | Concluído | Baixa parcial/total com juros/multa/desconto, movimento financeiro e atualização de saldo bancário. |
| Conciliação bancária/OFX | Pendente | Integração futura. |
| NF-e / NFC-e / NFS-e fiscal | Concluído | Emissão funcional (motor tributário, numeração por série, provedor abstrato interno + adapter HTTP Focus/NFe.io/PlugNotas/Webmania), cancelamento e carta de correção. Pronto para plugar credenciais reais. |
| Fluxo de caixa | Concluído | `/erp/fluxo-caixa`: projeção 30/60/90 dias e realizado. |
| Boletos, Pix e cartão | Pendente | Depende de gateway. |

## Fase 6 — BI, automações e escala

| Tarefa | Status | Observações |
| --- | --- | --- |
| Dashboards reais por perfil | Concluído | `/erp` com KPIs reais (vendas, financeiro, fiscal, estoque crítico, OS abertas). |
| Relatórios operacionais e DRE | Concluído | `/erp/relatorios`: vendas, estoque, financeiro, fiscal e DRE simplificado. |
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

## Atualizacao operacional - 2026-05-29 - nucleo de emissao fiscal + fundacao operacional

- Schema Prisma expandido com modelos de emissao fiscal (`NotaFiscal` completa, `NotaFiscalItem`, `NotaFiscalEvento`, `ConfiguracaoFiscal`, `SequenciaFiscal`), financeiro (`ContaBancaria`, `MovimentoFinanceiro`, baixa parcial em contas), estoque/inventario (`Inventario`, `InventarioItem`, `Deposito.padrao`), compras (status enum, recebimento) e vendas/OS (deposito, totais, faturamento). Migration `20260529123723_fiscal_emission_and_operational_modules` aplicada.
- Servico de estoque transacional (`src/domains/stock`) com movimento idempotente, reserva, baixa, custo medio ponderado e deposito padrao.
- Nucleo fiscal (`src/domains/fiscal`): motor tributario por regra/regime, builders de documento (NF-e/NFC-e a partir de pedido, NFS-e a partir de OS), provedor abstrato com implementacao interna funcional (gera chave de 44 digitos valida + protocolo em homologacao) e adapter HTTP generico pronto para Focus NFe / NFe.io / PlugNotas / WebmaniaBR, alem de emissao, cancelamento e carta de correcao com auditoria.
- Telas: `/erp/fiscal` (lista, cancelar, carta de correcao) e `/erp/configuracoes/fiscal` (provedor, ambiente, regime, series, credenciais criptografadas). Menu do ERP atualizado.
- Seed ampliado: endereco/regime fiscal da empresa, configuracao fiscal ativa, conta bancaria, regras tributarias (ICMS/PIS/COFINS/ISS), fornecedor e catalogo de produtos com saldo.
- Validacao: `npx tsc --noEmit`, `npm run lint`, `npm run build` verdes; smoke test de emissao+cancelamento executado contra PostgreSQL.
- Registro de coordenacao entre agentes em `docs/HANDOFF_FISCAL_OPERACIONAL.md`.

## Atualizacao operacional - 2026-05-29 - modulos operacionais completos (validado)

- Entregues e validados os modulos operacionais que tornam a plataforma um produto utilizavel ponta a ponta, integrados ao nucleo fiscal:
  - Vendas (`/erp/vendas`): pedido com reserva de estoque, confirmacao com baixa e contas a receber, faturamento emitindo NF-e e cancelamento com estorno.
  - Estoque (`/erp/estoque`, `/erp/inventarios`): saldos, kardex, ajuste, transferencia e inventario com ajuste automatico.
  - Financeiro (`/erp/financeiro`, `/erp/fluxo-caixa`): baixa parcial/total de contas a pagar/receber com juros/multa/desconto, movimento financeiro, saldo bancario e fluxo de caixa.
  - Compras e fornecedores (`/erp/compras`, `/erp/fornecedores`): CRUD de fornecedor, pedido de compra, envio, recebimento (entrada de estoque + custo medio + conta a pagar).
  - Orcamentos e OS (`/erp/orcamentos`, `/erp/os`, `/erp/atendimento`): orcamento com conversao em pedido; OS com servicos/pecas e faturamento emitindo NFS-e.
  - Clientes (`/erp/clientes`) CRUD completo e Colaboradores (`/erp/colaboradores`) com perfis/permissoes (RBAC).
  - Dashboard (`/erp`) com KPIs reais e Relatorios (`/erp/relatorios`) de vendas, estoque, financeiro, fiscal e DRE simplificado.
- Coordenacao executada por subagentes em paralelo, registrada em `docs/HANDOFF_FISCAL_OPERACIONAL.md`.
- Validacao central: `npx tsc --noEmit` (0 erros), `npm run lint` (limpo), `npm run build` (todas as rotas), e smoke test de integracao contra PostgreSQL cobrindo Venda->NF-e, OS->NFS-e, Compra->estoque/conta a pagar, baixa financeira e orcamento->pedido.
