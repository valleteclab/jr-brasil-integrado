# Auditoria atual do modulo de produtos

Data: 2026-05-26

## Veredito

O modulo de produtos esta com uma boa fundacao de banco para ERP real e a camada de aplicacao foi evoluida para use cases, validacao, auditoria, XML fiscal no servidor e movimento de estoque. Ainda faltam autenticacao/RBAC reais, motor tributario operacional e paginacao server-side para escala alta.

Classificacao geral: **base operacional forte, ainda pendente de seguranca enterprise e escala**.

## Pontos fortes atuais

- Schema Prisma com `tenantId` e `empresaId` nas principais entidades.
- Produto com campos de compra, venda, fiscal, lote, serie, validade e ecommerce.
- `ProdutoFiscal` separado da ficha comercial.
- `ProdutoFornecedor` para vincular codigo do fornecedor ao SKU interno.
- `XmlImportacao`, `EntradaFiscal`, `EntradaFiscalItem` e impostos por item modelados.
- `RegraTributaria` preparada para ICMS/IPI/PIS/COFINS e CBS/IBS/IS.
- Estoque com saldo, movimento, lote, serie e reserva.
- CRUD real de produto via API e PostgreSQL.
- Fallback mock removido de runtime.
- Produto usa use cases com validacao e transacao.
- Mutacoes de produto e entrada fiscal gravam auditoria.
- XML e processado no servidor e persiste `XmlImportacao`, `EntradaFiscal`, itens e impostos.
- Processamento de entrada fiscal cria/vincula produto, cria `ProdutoFornecedor`, atualiza saldo e gera `EstoqueMovimento`.

## Problemas criticos

### 1. Multiempresa ainda nao e real

Arquivo: `src/lib/auth/dev-session.ts`

O escopo vem de `getDevelopmentTenantScope()` usando slug fixo `jr-brasil`. Isso impede SaaS multi-tenant real e pode virar vazamento de dados quando houver mais empresas.

Impacto: usuario de uma empresa pode operar no tenant errado se a autenticacao real nao for implementada antes de expandir.

Solucao: criar sessao real, resolver `tenantId`/`empresaId` do usuario autenticado, validar empresa ativa e permissao por acao.

### 2. APIs sem autenticacao, RBAC e CSRF

Arquivos: `src/app/api/erp/produtos/route.ts`, `src/app/api/erp/produtos/[id]/route.ts`

As rotas aceitam escrita sem validar usuario, permissao, origem ou papel.

Impacto: qualquer chamada local/autorizada por rede pode criar, editar ou excluir produto.

Solucao: middleware de autenticacao, RBAC (`products:create`, `products:update`, `products:delete`, `products:import_xml`) e protecao de mutacao.

### 3. Motor tributario ainda nao esta operacional

`RegraTributaria` existe, mas nenhuma venda/entrada resolve impostos por contexto fiscal completo.

Impacto: CBS/IBS estao modelados, mas ainda nao calculados.

Solucao: criar `TaxRuleResolver` por data, UF, operacao, regime, NCM/CEST, CFOP e cliente/fornecedor.

## Problemas altos

### 1. Produto ainda mistura campos fiscais antigos e ficha fiscal

`Produto` mantem `ncm`, `cest`, `cfop`, `origem`, e tambem existe `ProdutoFiscal`.

Impacto: duplicidade e divergencia futura.

Solucao: manter no `Produto` apenas dados necessarios para busca/compatibilidade se for intencional, ou migrar classificacao fiscal principal para `ProdutoFiscal`.

### 2. Validacao ainda precisa crescer para fiscal completo

Produto ja valida SKU, NCM, CEST, GTIN e valores. Ainda faltam validacoes profundas de CFOP por operacao, origem, unidade tributavel, CST/CSOSN, `cClassTrib` e consistencia fornecedor/produto.

Impacto: dados fiscais podem estar estruturalmente validos, mas semanticamente errados.

Solucao: criar validadores fiscais por operacao e regime.

### 3. Importacao XML ainda precisa assinatura/schema/storage

O XML agora e parseado no servidor, mas ainda nao valida assinatura digital, schema oficial, autorizacao SEFAZ, antivirus/storage externo ou evento de manifestacao.

Impacto: nao ha controle de tamanho, checksum confiavel, assinatura, schema, storage, antivirus ou logging server-side.

Solucao: upload para API, parse e validacao no servidor.

### 4. Performance ainda e de tela pequena

Listagem busca todos os produtos ativos, inclui saldos e filtra no client.

Impacto: nao escala para milhoes de registros.

Solucao: paginacao server-side, filtros no banco, busca indexada por SKU/nome/GTIN/NCM e limite de pagina.

## Problemas medios

- Log de erro ainda retorna mensagem tecnica do Prisma para usuario/API.
- Falta teste automatizado para create/update/delete/import XML.
- Sem observabilidade estruturada (`correlationId`, `tenantId`, `empresaId`, `usuarioId`).

## Preparacao por criterio

| Criterio | Estado |
| --- | --- |
| ERP real | Bom para base de produto/entrada. Falta auth/RBAC, fiscal engine e testes. |
| Escala | Parcial baixo. Precisa paginacao, busca e indices extras. |
| Multiempresa | Parcial. Schema tem tenant/empresa; sessao real falta. |
| Estoque | Parcial alto. Entrada fiscal gera movimento; falta concorrencia robusta e reservas completas. |
| Fiscal | Parcial alto. Entrada fiscal persiste XML/itens/impostos; falta motor e assinatura/schema. |
| APIs fiscais | Parcial. XML server-side existe; falta storage, assinatura, provedor. |
| Auditoria | Parcial. Produto e entrada fiscal auditam; falta padronizar em todo dominio. |
| IA futura | Parcial. Tem campo de confianca/vinculo em entrada fiscal; falta historico de decisoes e embeddings. |
| Reforma Tributaria | Parcial. Schema contempla CBS/IBS/IS; falta motor fiscal. |
| Manutencao longo prazo | Parcial. Precisa separar dominio, aplicacao e infraestrutura. |

## Proxima sequencia recomendada

1. Criar autenticacao/escopo real antes de qualquer outro CRUD sensivel.
2. Implementar motor tributario inicial usando `RegraTributaria`.
3. Trocar listagem de produtos para paginacao server-side.
4. Criar testes automatizados para produto e entrada fiscal.
5. Adicionar assinatura/schema/storage para XML fiscal.
6. Padronizar erro operacional sem vazar detalhes do Prisma.
7. Criar observabilidade estruturada.
