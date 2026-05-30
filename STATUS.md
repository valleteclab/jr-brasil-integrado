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

## Atualizacao operacional - 2026-05-29 - dados do banco + automacao tributaria

- Remocao de dados mockados/hardcoded da interface, tudo passa a vir do banco:
  - `ErpShell` agora recebe contexto real (`src/lib/services/erp-shell.ts`): nome da empresa, usuario/perfil do vinculo, ambiente fiscal (Producao/Homologacao) e badges de navegacao calculados (vendas/orcamentos/OS/compras abertos, estoque critico, contas vencidas).
  - Loja: categorias do menu agora vem de `ProdutoCategoria` (`listStorefrontCategories`), sem lista fixa.
  - Cadastro de produto: deposito padrao vem de `listDepositos` (datalist), sem "Galpao LEM-1" fixo.
- Automacao tributaria — base nacional embutida + wizard de onboarding fiscal:
  - `src/domains/fiscal/national-tax-baseline.ts`: matriz ICMS interestadual (4/7/12), aliquota interna por UF, PIS/COFINS por regime; `applyNationalTaxBaseline` gera regras de venda idempotentes por regime/UF (prefixo "Base nacional ·").
  - `completeFiscalOnboarding`/`getFiscalOnboardingData` (use-cases) + API `POST /api/erp/configuracoes/fiscal/onboarding`.
  - Wizard `/erp/configuracoes/fiscal/onboarding` (4 etapas: empresa, endereco fiscal, emissao, revisao) que grava identidade fiscal, configuracao de emissao e gera a base nacional — empresa pronta para emitir sem cadastro manual de aliquota.
  - Motor tributario endurecido: Simples Nacional nunca destaca ICMS proprio (CSOSN 102, ICMS zero), ignorando regra de regime normal concorrente; regime normal destaca ICMS por CST/aliquota da regra.
- Validacao: `npx tsc --noEmit` (0), `npm run lint` (limpo), `npm run build` (rotas de onboarding incluidas) e smoke contra PostgreSQL: matriz interestadual (SP->BA 7%, BA->SP 12%, interna 18%), geracao idempotente (Lucro Presumido 29 regras, Simples 3) e regressao de emissao NF-e AUTORIZADA com tributacao coerente ao regime.

## Atualizacao operacional - 2026-05-29 - ICMS atualizado + CFOP automatico

- Aliquotas internas de ICMS por UF atualizadas para a referencia 2025/2026 em `national-tax-baseline.ts` (constante `ICMS_INTERNO_ATUALIZADO_EM`); mudancas refletidas: AL 20, BA 20,5, CE 20, DF 20, GO 19, MA 23, PA 19, PB 20, PR 19,5, PE 20,5, PI 22,5, RJ 20, RO 19,5, SE 19, TO 20. Adicionada tabela `FCP_INTERNO` por UF (mantida separada do ICMS; destaque do FCP virara com ICMS-ST).
- CFOP automatico (`src/domains/fiscal/cfop.ts`): `resolveCfopVenda` deriva 5102/6102 (revenda interna/interestadual), 5101/6101 (producao propria) e 5405/6404/5401/6401 (ST). CFOP definido manualmente no produto continua prevalecendo.
- Emissao passou a derivar o CFOP por item apos o calculo de tributos (consistente com ST) tanto no documento persistido quanto no enviado ao provedor; builder nao forca mais 5102.
- Auto-resolucao no produto: produto com NCM ja tem ICMS/PIS/COFINS resolvidos pelo motor e CFOP derivado na emissao, sem necessidade de vincular regra (aba fiscal e opcional).
- Validacao: `tsc` (0), `lint` (limpo), `build` (ok) e smoke contra PostgreSQL: BA->BA=5102, BA->SP=6102, ST inter=6404, emissoes AUTORIZADAS.

## Atualizacao operacional - 2026-05-29 - conformidade visual das telas ao design oficial

- Telas operacionais alinhadas ao design de referencia (`mvp/JR Brasil ERP - Standalone.html`) usando o vocabulario canonico: `erp-toolbar`/`toolbar-search`, `erp-table`/`erp-table-wrap`, `drawer`/`drawer-head/body/foot`, `erp-card`/`erp-card-head`, `kpi-row`+`KpiCard`, `tabs`, `StatusBadge` e `Button`.
- Removido o vocabulario paralelo `op-*` (op-card/op-toolbar/op-table/op-modal/op-tabs/op-form/op-list/op-section-title/op-container/op-detail), alem de `panel`, `form-row/form-title/form-actions`, `link-btn` e cartoes `metric` avulsos (-> `KpiCard`). Grep central confirma zero ocorrencias em `src`.
- Coordenacao por 5 subagentes em paralelo por dominio (Vendas/Orcamentos, OS/Atendimento, Estoque/Compras, Financeiro/Fiscal, Dashboard/Relatorios/Clientes/Colaboradores), seguindo `docs/UI_CONFORMANCE_SPEC.md`.
- Corrigido tambem JSX desbalanceado em ReportsView (div faltante) e padronizado FiscalSettingsForm e wizard fiscal.
- Validacao: `tsc` (0), `lint` (limpo), `build` (ok) e checagem de runtime HTTP 200 em todas as rotas do ERP e da loja.

## Atualizacao operacional - 2026-05-29 - ICMS-ST, FCP e IBPT (transparencia)

- Limpeza: removido o CSS morto `op-*` de `globals.css` (telas ja usam vocabulario canonico).
- Schema estendido (migration `add_icms_st_fcp_ibpt`): `RegraTributaria` += `mva`, `aliquotaIcmsSt`, `fcp`; `NotaFiscalItem` += `percentualFcp`, `valorFcp`, `modalidadeBcSt`, `percentualMva`, `baseIcmsSt`, `aliquotaIcmsSt`, `valorIcmsSt`, `valorTributos`; `NotaFiscal` += `valorFcp`.
- Motor tributario: FCP destacado automaticamente em operacao interna (regime normal) a partir da tabela `FCP_INTERNO` por UF ou da regra; ICMS-ST por MVA quando a regra define `mva` (baseST = (base+IPI)*(1+MVA), ST = baseST*aliq interna - ICMS proprio), respeitando mercadoria ja substituida (CSOSN 500/CST 60). Totais agregam FCP e ICMS-ST; total da nota inclui ICMS-ST e IPI.
- IBPT / Lei 12.741: emissao anexa "Valor aproximado dos tributos" em informacoes complementares (a partir do total de tributos calculado).
- Regras tributarias: tela e API passam a aceitar MVA %, Aliquota ICMS-ST % e FCP %.
- Validacao: `tsc` (0), `lint` (limpo), `build` (ok) e smoke contra PostgreSQL: Lucro Presumido BA->BA destacou ICMS 18% + FCP 2%; regra com MVA 40% gerou baseST 1400 e ICMS-ST 72; texto IBPT presente na nota.

## Atualizacao operacional - 2026-05-29 - tela Novo atendimento fiel ao design

- Reconstruida a tela de atendimento conforme o Claude Design (capturas de referencia; o standalone empacota o app em chunks ofuscados, sem markup extraivel):
  - Componente `AtendimentoWorkspace` com cards de tipo de operacao (Venda balcao, Pedido faturado, Ordem de Servico, Orcamento), layout em 2 colunas e trilho direito.
  - Trilho: card Totais (itens, subtotal, desconto global %, total), card Validade & condicoes (validade, vendedor, condicao de pagamento, prazo de entrega, frete) e acao principal contextual.
  - Coluna principal: selecao de cliente, itens com adicionar/empty-state, observacoes; OS troca itens por equipamento/diagnostico.
  - Ligado as APIs existentes: Orcamento -> /api/erp/orcamentos; Venda balcao/Pedido faturado -> /api/erp/vendas; OS -> /api/erp/os; desconto global % convertido em R$ no envio.
- `/erp/atendimento` carrega clientes/produtos reais (`listSaleFormData`) e aceita `?tipo=`. As rotas `/erp/vendas/nova`, `/erp/orcamentos/novo` e `/erp/os/nova` passam a redirecionar para o atendimento unificado com o tipo pre-selecionado.
- CSS dedicado adicionado (`atend-*`) seguindo os tokens do design.
- Validacao: `tsc` (0), `lint` (limpo), `build` (ok) e runtime HTTP 200 em `/erp/atendimento` (e 307 nos redirects), com a tela renderizando os blocos do design.

## Atualizacao operacional - 2026-05-29 - paridade visual com o fonte do Claude Design

- Recebido o projeto-fonte do design (JSX + erp-styles.css). Base visual adotada no app:
  - Fontes do design carregadas (Barlow Condensed, Inter, JetBrains Mono) via layout raiz.
  - Sistema de botoes `btn-erp` (primary/dark/ghost/danger + sm/xs/lg/block/icon-only), `pill` (status), `prog/fill`, `sublabel`, `avatar-sm`, `erp-card-body` e `empty-st` com icone/titulo, alinhados ao `erp-styles.css`.
- Tela "Novo atendimento" reconstruida fiel ao fonte `erp-atendimento.jsx`:
  - Cards de tipo (venda balcao, pedido faturado, OS, orcamento), layout 2 colunas com trilho fixo.
  - Picker de cliente e picker de produto em drawer com busca; tabela de itens com qtd/preco/%desc/subtotal; OS com veiculo, servicos (mao de obra) e pecas.
  - Trilho: Totais (Barlow), desconto global %, frete, Pagamento (radios), Atribuicao/Validade & condicoes; acoes (finalizar/Imprimir/Salvar rascunho); modal de sucesso.
  - Ligado as APIs reais: vendas, orcamentos e OS (serviços/peças postados apos abrir a OS).
- Validacao: `tsc` (0), `lint` (apenas aviso de fonte), `build` (ok) e runtime HTTP 200 em `/erp/atendimento` com o sistema visual do design.

## Atualizacao operacional - 2026-05-29 - telas dos modulos fieis ao design

- Reconstrucao da apresentacao das telas dos modulos conforme os JSX de referencia do design (em .design-ref/, gitignored), coordenada por 5 subagentes em paralelo:
  - Produtos/Estoque (ProductCrud, StockManager, InventoryCount), Compras/Vendas (SalesList, PurchaseList, SuppliersCrud), OS/Financeiro (OrdensServicoList, OrdemServicoDetail, FinanceManager, CashFlowView, NotasFiscaisList), Cadastros (CustomersCrud, TeamManager, TaxRulesCrud) e Loja (page + ProductCard).
  - Todas usando o vocabulario do design: `erp-toolbar`/`toolbar-search`/`stat-pills`, `erp-table`/`erp-table-wrap`/`erp-table-foot`/`pagi`, `btn-erp` (+link), `pill`+`.dot`, `kpi`/`.l`/`.v`, `tabs`, `drawer`/`drawer-head`/`drawer-body`/`drawer-foot`, `erp-form`, `empty-st` h4/p, `prog`/`fill`.
- Corrigidos de passagem erros de compilacao pre-existentes (uso de Button/StatusBadge sem import em StockManager, FinanceManager, SuppliersCrud) ao migrar para as classes do design.
- Adicionados helpers de CSS faltantes (`.grow`, `.btn-erp.link`, `.stat-pill`).
- Validacao: `tsc` (0), `lint` (0, salvo aviso de fonte), `build` (ok) e runtime HTTP 200 em todas as 16 rotas do ERP e loja, renderizando o sistema visual do design.

## Atualizacao operacional - 2026-05-30 - integracao fiscal Spedy

- Adicionado o provedor fiscal SPEDY (https://api.spedy.com.br) como integracao real e completa, plugavel na camada de provedor abstrata existente.
- Enum `ProvedorFiscal` += `SPEDY` (migration `add_spedy_provider`).
- Contrato do provedor enriquecido para modo completo: `EmitInput` ganhou `integrationId` e `computed` (tributos por item); `ProviderEmitter` ganhou `regime`; `NormalizedFiscalDocument.destinatario` ganhou `endereco` (logradouro/numero/bairro/cep/cidade/UF/IBGE) preenchido a partir do endereco padrao do cliente. Emissao passa esses dados ao provedor.
- `src/domains/fiscal/providers/spedy-provider.ts`: cliente HTTP (X-Api-Key, base por ambiente producao/sandbox), emit NF-e/NFC-e/NFS-e no modo completo (icms.rate em %, pis/cofins/iss em fracao; Simples via CSOSN, Normal via CST + baseTaxModality 3; ICMS-ST; cidade por IBGE ou nome+UF; destination interna/interestadual; integrationId), polling assincrono ate status final, cancel, carta de correcao (so NF-e) e queryStatus. Mapeamento de status Spedy->StatusNotaFiscal. Registrado em `resolveFiscalProvider`.
- Recepcao e operacao: webhook `POST /api/webhooks/spedy` (localiza nota por providerRef, atualiza status/chave/numero/protocolo/datas, idempotente, sempre 200), sincronizacao manual `POST /api/erp/fiscal/[id]/sincronizar` (fallback de polling via queryStatus), e UI: SPEDY nas listas de provedor (config fiscal + onboarding) com orientacao de X-Api-Key/base automatica/webhook; `saveFiscalConfig` isenta SPEDY da exigencia de baseUrl (exige so o token).
- Documentacao de referencia em `docs/integrations/spedy-api.md`.
- Validacao: `tsc` (0), `lint` (0), `build` (rotas /api/webhooks/spedy e sincronizar incluidas) e smoke do provider com fetch stubado cobrindo NF-e (Lucro Presumido) AUTORIZADA, rejeitada, NFC-e Simples (CSOSN), NFS-e (issRate) e cancelamento — payloads e unidades de aliquota conferidos.

## Atualizacao operacional - 2026-05-30 - codigo de servico LC 116 na NFS-e

- Embutida a lista completa da LC 116/2003 (`src/domains/fiscal/lc116.ts`, ~199 itens, codigo+descricao) com validadores `isValidLc116`/`lc116Description`.
- Schema: `OrdemServicoMaoObra.codigoServicoLc116` (por servico) e `ConfiguracaoFiscal.codigoServicoLc116Padrao` (padrao da empresa). Migration `add_lc116_service_code`.
- Fluxo (a)+(b): cada servico da OS pode ter seu codigo LC 116; no faturamento da OS, a NFS-e usa `codigo do servico ?? padrao da empresa` como `federalServiceCode` (enviado ao provedor, ex.: Spedy).
- `addServico` aceita/valida/salva o codigo; `saveFiscalConfig`/`FiscalConfigSummary` ganharam `codigoServicoLc116Padrao`.
- UI: select de codigo LC 116 no lancamento de servico da OS (com opcao "usar padrao da empresa") e select de codigo padrao na configuracao fiscal.
- Validacao: `tsc` (0), `lint` (0), `build` (ok) e smoke OS->NFS-e: servico com `14.02` saiu como 14.02 e servico sem codigo herdou o padrao `14.01`; NFS-e AUTORIZADA.

## Atualizacao operacional - 2026-05-30 - emissao avulsa de notas (sem venda/OS)

- Para empresas que usam o sistema apenas para emitir notas: emissao avulsa de NF-e, NFC-e e NFS-e sem exigir pedido de venda ou ordem de servico.
- `standalone-emission-use-cases.ts`: `emitProductInvoiceAvulsa` (NF-e/NFC-e — destinatario cadastrado ou avulso; itens de catalogo ou avulsos com NCM/CFOP/origem; finalidade normal/complementar/ajuste/devolucao; baixa de estoque opcional para itens de catalogo) e `emitServiceInvoiceAvulsa` (NFS-e — LC 116 por servico com fallback no padrao da empresa). Reusa o motor `emitFiscalDocument` (tributos automaticos por NCM/regra).
- `document-builder` estendido com `finalidade`/`seguro`/`outrasDespesas`. Itens avulsos persistem `produtoId` nulo (corrigida violacao de FK).
- Rotas `POST /api/erp/fiscal/emitir/produto` e `/servico`; service `getEmissaoFormData` (clientes com endereco, produtos com ficha fiscal, lista LC 116).
- UI: `/erp/fiscal/emitir` (`EmissaoAvulsaWorkspace`) com cards de tipo (NF-e/NFC-e/NFS-e), destinatario cadastrado/avulso, construtor de itens (catalogo + avulso) e servicos (LC 116), opcoes fiscais, baixa de estoque, trilho de totais e modal de resultado; CTA "Emitir nota" em `/erp/fiscal`.
- Validacao: `tsc` (0), `lint` (0), `build` (rotas incluidas) e smoke contra PostgreSQL: NF-e (cliente+catalogo), NF-e (destinatario+item avulsos) e NFS-e (LC 116 17.01) todas AUTORIZADAS.

## Atualizacao operacional - 2026-05-30 - retencoes na NFS-e

- NFS-e passa a suportar retencoes na fonte: ISS retido pelo tomador + retencoes federais (IRRF, PIS, COFINS, CSLL, INSS) por aliquota.
- Contrato: `NormalizedFiscalDocument.retencoes` (tipos `RetencoesFiscais`/`RetencaoTributo`); builder `buildNfseFromOrdemServico` aceita `retencoes`; provider Spedy mapeia para `total` (issWithheld + *Rate/*Amount/*Withheld por tributo, aliquotas em fracao, netAmount).
- Schema `NotaFiscal` += `issRetido`, `valorIrRetido`, `valorPisRetido`, `valorCofinsRetido`, `valorCsllRetido`, `valorInssRetido`, `valorRetidoTotal`, `valorLiquido` (migration `add_nfse_retentions`); emissao persiste esses valores.
- Emissao avulsa de NFS-e (`emitServiceInvoiceAvulsa`) calcula as retencoes a partir da base e das aliquotas; UI `/erp/fiscal/emitir` ganhou card "Retencoes na fonte" (ISS retido + IRRF/INSS/PIS/COFINS/CSLL %) com total retido e liquido a receber.
- Validacao: `tsc` (0), `lint` (0), `build` (ok) e smoke: NFS-e R$10.000 com ISS retido + IRRF 1,5% + PIS 0,65% + COFINS 3% + CSLL 1% -> retido R$615, liquido R$9.385, AUTORIZADA.

## Atualizacao operacional - 2026-05-30 - NFS-e: ISS informado, deducoes, base e descricao maior

- Emissao de NFS-e melhorada: discriminacao do servico agora e textarea grande (ate 2000 caracteres, multilinha) com contador.
- ISS informavel na emissao: campo de aliquota de ISS (%) que sobrepoe a regra tributaria, deducoes (R$) e base de calculo do ISS (valor dos servicos - deducoes), com base e valor do ISS exibidos em tempo real. Motor (`computeItemTaxes`) passou a respeitar `aliquotaIssInformada`/`baseIssInformada` no item.
- Retencoes: base de calculo das retencoes federais informavel (sobrepoe o valor dos servicos); item carrega base/aliquota de ISS distribuidas proporcionalmente entre os servicos.
- Pesquisa de referencia (subagentes com busca web) sobre como NFE.io/Focus/eNotas/PlugNotas/Ambiente Nacional estruturam emissao de NFS-e/NF-e, para guiar a UX.
- Validacao: `tsc` (0), `lint` (0), `build` (ok) e smoke: NFS-e R$10.000 com deducoes R$2.000 e ISS 5% -> base 8.000, ISS 400; IRRF 1,5% sobre base de retencao 8.000 -> 120; AUTORIZADA.

## Atualizacao operacional - 2026-05-30 - NFS-e: natureza do ISS + retencoes/ISS no faturamento de OS

- Pesquisa de referencia (subagente web: NFE.io/Focus/PlugNotas/Bling/Conta Azul/Omie/Ambiente Nacional) confirmou o modelo: discriminacao 2000 chars; base ISS = servico - deducoes - desconto incondicionado; retencoes federais sobre o valor bruto; campos avancados colapsaveis.
- Natureza/exigibilidade do ISS: novo `taxationType` no documento NFS-e (tributado no/fora do municipio, isento, imune, exportacao, nao incidencia, exigibilidade suspensa) mapeado no provider Spedy (`total.taxationType`); seletor na emissao avulsa e no faturamento de OS.
- Helpers compartilhados `src/domains/fiscal/nfse-tax.ts` (`computeRetencoes`, `issPorServico`) reusados pela emissao avulsa e pelo faturamento de OS (sem duplicacao).
- Faturamento de OS (`faturarOrdemServico` + rota + `OrdemServicoDetail`) passou a aceitar alIquota de ISS, deducoes, base de calculo, natureza do ISS e retencoes (ISS retido + IRRF/INSS/PIS/COFINS/CSLL + base de retencao), exibidos quando "Emitir NFS-e" esta marcado.
- Validacao: `tsc` (0), `lint` (0), `build` (ok) e smoke: OS com servico R$5.000, ISS 5% -> R$250; ISS retido + IRRF 1,5% (75) + PIS 0,65% (32,5) -> liquido R$4.892,50, AUTORIZADA.

## Atualizacao operacional - 2026-05-30 - certificado A1 via ERP + teste real Spedy

- Implementado envio do certificado digital A1 (.pfx) pela plataforma ao provedor (Spedy): helper `uploadSpedyCertificate` (descobre o companyId pela chave, POST multipart `CertificateFile`/`Password`, idempotente quando "ja cadastrado"), use-case `uploadFiscalCertificate` (so persiste metadados: nome/validade; nunca o arquivo/senha), rota `POST /api/erp/configuracoes/fiscal/certificado` (multipart) e card "Certificado digital A1" no `FiscalSettingsForm` (somente Spedy).
- Teste real (sandbox) validou o fluxo fiscal ponta a ponta:
  - Payload da NFS-e corrigido (bloco do tomador) — passou na validacao de schema do Ambiente Nacional.
  - Com o certificado vinculado, a assinatura deixou de falhar (E0717 resolvido); o erro evoluiu para SPD005 ("servico de autorizacao indisponivel no ambiente de Homologacao para o municipio de Luis Eduardo Magalhaes") — limitacao da prefeitura emitente, nao do sistema.
  - Upload de certificado pela nossa rota retornou ok (idempotente: "ja cadastrado").
- Empresa de teste reconfigurada como Regime Normal (Lucro Presumido), conforme cadastro real.
- Validacao: `tsc` (0), `lint` (0), `build` (rota incluida).

## Atualizacao operacional - 2026-05-30 - NF-e AUTORIZADA (correcao de payload Spedy)

- Investigado o swagger oficial da Spedy (api.spedy.com.br/swagger/v1/swagger.json). O HTTP 500 (corpo vazio, nota nao aparecia no painel) era falha de desserializacao por payload de ICMS divergente do schema.
- Correcao no provider: aliquota de ICMS (`taxes.icms.rate`) passa a ser enviada em FRACAO (ex.: 0.18) como PIS/COFINS; removidos os campos `fcpRate`/`valorFcp` (inexistentes em `SefazInvoiceItemIcmsDto`).
- Resultado: NF-e emitida pelo fluxo completo retornou AUTORIZADA (numero 1, chave de acesso gerada) na SEFAZ-BA via Spedy (sandbox). NFC-e usa o mesmo builder.
- Validacao: tsc (0), lint (0), build (ok) e emissao real AUTORIZADA.
