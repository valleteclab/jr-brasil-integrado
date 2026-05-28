# Auditoria tecnica do modulo de produtos

Data: 2026-05-26

Escopo: modulo de produtos do ERP JR Brasil, incluindo UI atual, servico de leitura, schema Prisma, estoque, fiscal, importacao XML, multiempresa, seguranca, performance, observabilidade, Reforma Tributaria e preparacao para IA.

## Resumo executivo

O modulo de produtos ja tem uma boa direcao visual para ERP: tabela densa, filtros, drawer de cadastro, abas de informacao geral, fiscal, precos, estoque, compras e loja B2B. A base tambem ja considera `tenantId` e `empresaId` no schema, o que e correto para SaaS multiempresa.

Porem, do ponto de vista enterprise, o modulo ainda esta em nivel inicial. A tela concentra regras de dominio, parsing de XML, persistencia temporaria em `localStorage`, regras fiscais simplificadas e calculos de estoque. Para um ERP real, isso precisa evoluir para uma arquitetura com dominio, casos de uso, repositorios, validacoes, transacoes, auditoria, trilha de estoque e tabelas fiscais versionadas.

Classificacao geral atual: **alta criticidade tecnica** antes de ir para producao com banco real.

## Arquitetura atual mapeada

### Frontend e apresentacao

- `src/app/erp/produtos/page.tsx`
  - Busca resumo de produtos.
  - Calcula totais de custo/venda de forma simplificada.
  - Renderiza `PageHeader` e `ProductCrud`.

- `src/components/erp/ProductCrud.tsx`
  - Componente client-side principal.
  - Mantem lista de produtos em estado local e `localStorage`.
  - Contem formulario, filtros, tabela, drawer, importacao XML e regras de transformacao.
  - Concentra responsabilidades demais para um modulo critico.

- `src/components/erp/ErpShell.tsx`
  - Layout do ERP alinhado ao prototipo standalone.

### Servicos

- `src/lib/services/products.ts`
  - Lista produtos para ERP e loja.
  - Usa Prisma e exige `DATABASE_URL`.
  - Se o banco nao estiver configurado ou disponivel, deve gerar erro visivel. Dados mock/fallback sao proibidos.
  - Usa escopo de desenvolvimento via `getDevelopmentTenantScope`.

### Multiempresa e sessao

- `src/lib/auth/dev-session.ts`
  - Resolve tenant/empresa fixos por slug `jr-brasil`.
  - Serve para desenvolvimento, mas nao pode ser usado como padrao de producao.

### Banco atual

- `prisma/schema.prisma`
  - Possui entidades de tenant, empresa, usuarios, clientes, fornecedores, produtos, estoque, vendas, compras, financeiro e fiscal.
  - Produto tem `tenantId`, `empresaId`, SKU, nome, categoria, marca, NCM, CEST, CFOP, origem, custo, venda e flags.
  - Estoque tem saldo e movimento basicos.
  - Nota fiscal ainda e minimalista.

## Problemas por criticidade

### Critica

1. **Sem camada de dominio/casos de uso para produtos**
   - Problema: regras de produto, estoque, fiscal e XML estao dentro de componente React.
   - Impacto: dificil testar, auditar, reutilizar em API, proteger com RBAC e evoluir para banco real.
   - Solucao: criar modulo `domains/products` com entidades, DTOs, validadores, casos de uso e repositorios.

2. **Importacao XML nao gera entrada fiscal real**
   - Problema: o XML cria/atualiza produtos diretamente e soma estoque.
   - Impacto: perde rastreabilidade fiscal, custo, duplicidade de nota, fornecedor, CFOP, impostos por item e auditoria.
   - Solucao: XML deve criar `XmlImportacao`, `EntradaFiscal`, `EntradaFiscalItem`, vinculos de produto e movimentos de estoque em transacao.

3. **Estoque sem ledger imutavel e sem protecao contra concorrencia**
   - Problema: saldo pode ser alterado sem trilha robusta; movimento nao registra saldo antes/depois nem idempotencia.
   - Impacto: divergencia de estoque, falhas em separacao, recebimento, reserva e faturamento.
   - Solucao: tratar estoque por eventos/movimentos imutaveis, com transacao, bloqueio otimista/pessimista e chave idempotente.

4. **Fiscal acoplado ao cadastro do produto**
   - Problema: campos como CFOP, CST e aliquotas no produto sugerem regra fixa.
   - Impacto: regras fiscais variam por UF, regime, operacao, cliente, fornecedor, NCM, CST/CSOSN, vigencia e Reforma Tributaria.
   - Solucao: produto guarda classificacao fiscal basica; regra tributaria deve ficar em motor fiscal versionado.

5. **Multiempresa ainda depende de sessao fixa de desenvolvimento**
   - Problema: `getDevelopmentTenantScope` usa slug fixo.
   - Impacto: em producao, qualquer rota baseada nisso pode misturar empresa ou tenant.
   - Solucao: resolver escopo sempre pela sessao autenticada e validar permissao por acao.

### Alta

1. **Schema de produto insuficiente para ERP completo**
   - Falta tipo do item padronizado, GTIN, codigo original, codigo fabricante, controle de lote/serie/validade, produto substituto/equivalente, dados dimensionais, regras de compra e flags operacionais.

2. **Sem versionamento tributario**
   - Falta tabela de regra fiscal por vigencia, UF origem/destino, regime tributario, CFOP, CST/CSOSN, NCM, CEST e operacao.

3. **Sem preparacao adequada para CBS/IBS**
   - O schema atual foi modelado para impostos atuais em campos soltos.
   - CBS/IBS exigem modelo flexivel por tipo de tributo, classificacao tributaria, vigencia e regra aplicavel.

4. **Sem DTOs e validacao de entrada**
   - Quando APIs forem criadas, sem DTOs fortes havera risco de dados fiscais invalidos, SKU duplicado, NCM invalido e campos numericos inconsistentes.

5. **Sem auditoria de alteracao de produto**
   - Produto, preco, custo, fiscal e estoque exigem trilha de auditoria.

6. **Busca e listagem nao estao preparadas para milhoes de registros**
   - UI filtra em memoria.
   - API futura deve ter paginacao, indices compostos e busca textual.

7. **Custo medio simplificado**
   - Custo nao pode ser apenas campo editavel.
   - ERP real precisa custo medio ponderado, ultimo custo, custo fiscal, custo gerencial, frete, seguro, despesas, impostos recuperaveis e nao recuperaveis.

### Media

1. **Duplicacao de formatacao monetaria**
   - `formatBrl` e parsing de moeda aparecem em mais de um arquivo.
   - Solucao: centralizar em `src/lib/formatters`.

2. **Campos visuais e operacionais no mesmo estado**
   - Estado do formulario mistura ecommerce, fiscal, estoque, compras e produto.
   - Solucao: separar DTOs por aba e compor no caso de uso.

3. **Enums fiscais inexistentes**
   - Origem, tipo de produto, unidade, status e tipos fiscais ainda sao strings livres.
   - Solucao: criar enums ou tabelas de dominio parametrizaveis.

4. **Sem tratamento de anexos**
   - XML, DANFE, imagens e documentos precisam storage com checksum, tenant e controle de acesso.

### Baixa

1. **Texto e encoding**
   - Alguns arquivos aparecem com caracteres quebrados no terminal.
   - Impacto visual depende do encoding real do arquivo.
   - Solucao: manter arquivos em UTF-8 e padronizar textos em PT-BR.

2. **Nomes misturados PT/EN**
   - Schema esta em PT-BR, alguns tipos do front em ingles.
   - Nao e bloqueante, mas deve haver padrao por camada.

## Novo desenho arquitetural recomendado

Estrutura alvo:

```text
src/
  domains/
    products/
      domain/
        entities/
          Product.ts
          ProductFiscalProfile.ts
          ProductSupplierLink.ts
          ProductStockPolicy.ts
        value-objects/
          Sku.ts
          Ncm.ts
          Gtin.ts
          Money.ts
      application/
        dto/
          CreateProductDto.ts
          UpdateProductDto.ts
          ImportNfeXmlDto.ts
        use-cases/
          CreateProduct.ts
          UpdateProduct.ts
          ListProducts.ts
          ImportProductsFromNfeXml.ts
          LinkXmlItemToProduct.ts
        ports/
          ProductRepository.ts
          FiscalDocumentRepository.ts
          StockLedgerRepository.ts
      infrastructure/
        prisma/
          PrismaProductRepository.ts
        xml/
          NfeXmlParser.ts
      presentation/
        components/
          ProductCrud.tsx
        routes/
          route-handlers.ts
```

Regras:

- React exibe e coleta dados.
- Casos de uso validam regras de negocio.
- Repositorios isolam Prisma.
- XML vira infraestrutura de entrada, nao regra de UI.
- Estoque e fiscal sao dominios relacionados, mas nao devem ficar embutidos no componente.

## Evolucao aplicada no Prisma

O schema Prisma foi evoluido em 2026-05-26 para deixar a fundacao do modulo de produtos mais proxima de um ERP real antes da criacao do banco na VPS.

Entrou no schema:

- `TipoProduto`: produto, servico, kit e insumo.
- Campos mestres no produto: codigo original, codigo fabricante, GTIN, unidade de compra, fator de conversao, pesos, dimensoes, custo medio, ultimo custo, preco minimo, flags de lote, serie, validade, compra, venda e estoque.
- `ProdutoFiscal`: classificacao fiscal separada do cadastro comercial.
- `ProdutoFornecedor`: vinculo entre fornecedor, codigo do fornecedor, unidade de compra, conversao, lead time e custo de ultima compra.
- `XmlImportacao`: controle de XML recebido, checksum, chave de acesso, status e arquivo original.
- `EntradaFiscal`, `EntradaFiscalItem` e `EntradaFiscalItemImposto`: entrada fiscal a conferir, itens do XML e impostos por item.
- `RegraTributaria`: regra versionada por tributo, operacao, UF, NCM, CEST, CFOP, CST/CSOSN, `cClassTrib`, vigencia e campos preparados para CBS/IBS/IS.
- `EstoqueLote`, `EstoqueSerie` e `EstoqueReserva`.
- `EstoqueSaldo` com quantidade/reserva/minimo/maximo decimal e chave de controle.
- `EstoqueMovimento` com saldo antes/depois, custo total, documento de origem, usuario e chave idempotente.

Ainda falta implementar a camada de aplicacao para usar esse schema corretamente. Importante: a tela atual ainda usa persistencia local temporaria; o schema ja esta preparado para a proxima etapa de APIs e migrations.

### Evolucao aplicada no fluxo visual de XML

A tela de produtos foi ajustada para nao tratar mais o XML como atualizacao imediata do cadastro. Ao importar um XML, o sistema cria uma entrada fiscal em conferencia na interface, lista os itens da NF-e, tenta vincular cada item ao produto interno por SKU, GTIN/EAN ou codigo fornecedor/original e marca os itens inseguros para revisao.

No ambiente atual, sem banco ativo, o botao "Processar entrada" ainda aplica o resultado no cadastro local. Na versao com banco, esse mesmo fluxo deve gravar `XmlImportacao`, `EntradaFiscal`, `EntradaFiscalItem`, `EntradaFiscalItemImposto`, vinculos com `ProdutoFornecedor` e gerar `EstoqueMovimento` apenas depois da conferencia.

## Melhorias recomendadas no Prisma

### Produto

Adicionar ou separar:

- `tipo`: PRODUTO, SERVICO, KIT, INSUMO.
- `codigoOriginal`
- `codigoFabricante`
- `gtin`
- `unidadeComercial`
- `unidadeCompra`
- `fatorConversaoCompra`
- `pesoBruto`, `pesoLiquido`, `largura`, `altura`, `comprimento`
- `controlaLote`
- `controlaSerie`
- `controlaValidade`
- `permiteEstoqueNegativo`
- `permiteVendaSobEncomenda`
- `ativoCompra`
- `ativoVenda`
- `ativoEcommerce`

### Fiscal

Criar estruturas separadas:

```prisma
model ProdutoFiscal {
  id             String   @id @default(cuid())
  tenantId       String
  empresaId      String
  produtoId      String
  ncm            String
  cest           String?
  origem         String?
  exTipi         String?
  codigoBeneficioFiscal String?
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt

  @@unique([tenantId, empresaId, produtoId])
  @@index([tenantId, empresaId, ncm])
}
```

Criar motor tributario:

```prisma
model RegraTributaria {
  id             String   @id @default(cuid())
  tenantId       String
  empresaId      String?
  nome           String
  tributo        String   // ICMS, IPI, PIS, COFINS, CBS, IBS, IS
  operacao       String   // compra, venda, devolucao, transferencia
  ufOrigem       String?
  ufDestino      String?
  regimeEmpresa  String?
  ncm            String?
  cest           String?
  cfop           String?
  cst            String?
  cClassTrib     String?
  aliquota       Decimal? @db.Decimal(8, 4)
  reducaoBase    Decimal? @db.Decimal(8, 4)
  vigenciaInicio DateTime
  vigenciaFim    DateTime?
  ativo          Boolean  @default(true)
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt

  @@index([tenantId, empresaId, tributo, operacao])
  @@index([tenantId, empresaId, ncm, ufDestino])
}
```

Observacao: CBS/IBS nao devem ser campos fixos no produto. Devem entrar no motor de regras por tributo e vigencia.

### XML e entrada fiscal

Criar:

- `XmlImportacao`
- `EntradaFiscal`
- `EntradaFiscalItem`
- `EntradaFiscalItemImposto`
- `ProdutoVinculoFornecedor`
- `ProdutoVinculoXml`

Essas tabelas permitem:

- Evitar importar a mesma chave de acesso duas vezes.
- Guardar XML bruto/checksum.
- Relacionar item do fornecedor com SKU interno.
- Auditar quem importou e quando.
- Separar recebimento fiscal de cadastro de produto.

### Estoque

Adicionar:

- `EstoqueLote`
- `EstoqueSerie`
- `EstoqueReserva`
- `EstoqueMovimento` com `saldoAntes`, `saldoDepois`, `documentoTipo`, `documentoId`, `idempotencyKey`.
- Separar saldo fisico, reservado, disponivel calculado e possivelmente saldo fiscal.

Campos recomendados em movimento:

```prisma
model EstoqueMovimento {
  id             String   @id @default(cuid())
  tenantId       String
  empresaId      String
  produtoId      String
  depositoId     String
  loteId         String?
  serieId        String?
  tipo           String
  quantidade     Decimal  @db.Decimal(14, 4)
  saldoAntes     Decimal  @db.Decimal(14, 4)
  saldoDepois    Decimal  @db.Decimal(14, 4)
  custoUnitario  Decimal? @db.Decimal(14, 4)
  documentoTipo  String?
  documentoId    String?
  idempotencyKey String?
  usuarioId      String?
  criadoEm       DateTime @default(now())

  @@unique([tenantId, empresaId, idempotencyKey])
  @@index([tenantId, empresaId, produtoId, depositoId, criadoEm])
}
```

## Preparacao para Reforma Tributaria

O modulo deve ser desenhado para coexistencia:

- Legado: ICMS, IPI, PIS, COFINS, ISS quando aplicavel.
- Novo modelo: CBS, IBS e Imposto Seletivo.
- Vigencias paralelas.
- Regras por UF e destino.
- Classificacao tributaria por NCM/produto/operacao.
- Parametrizacao sem deploy.

Decisao arquitetural: produto nao calcula tributo. Produto informa classificacao. O motor fiscal calcula conforme contexto da operacao.

## Preparacao para IA futura

Casos de uso de IA previstos:

- Sugerir vinculo entre item do XML e produto interno.
- Detectar duplicidade de SKU por nome, marca, NCM, GTIN e codigo original.
- Sugerir NCM/CEST com confianca e justificativa.
- Normalizar descricoes de fornecedor.
- Classificar aplicacoes e compatibilidades.
- Apontar divergencias de custo, margem e estoque.

Necessario guardar:

- Texto original do XML.
- Descricao normalizada.
- Codigo fornecedor.
- Historico de decisoes humanas.
- Score de confianca.
- Embeddings ou chaves semanticas por tenant.
- Auditoria de sugestoes aceitas/rejeitadas.

## Seguranca e multiempresa

Regras obrigatorias para proximas APIs:

- Toda query deve receber `tenantId` e `empresaId` da sessao, nunca do corpo da requisicao.
- Toda mutation de produto deve exigir permissao, por exemplo `products:create`, `products:update`, `products:import_xml`.
- Upload XML deve validar tamanho, MIME, extensao, estrutura, chave de acesso e assinatura quando aplicavel.
- Erros fiscais internos nao devem vazar stack trace para usuario.
- Exportacoes devem ser auditadas.

## Performance

Indices recomendados:

- `Produto`: `[tenantId, empresaId, sku]`, `[tenantId, empresaId, nome]`, `[tenantId, empresaId, gtin]`, `[tenantId, empresaId, ncm]`, `[tenantId, empresaId, categoriaId]`, `[tenantId, empresaId, marcaId]`.
- `EstoqueSaldo`: `[tenantId, empresaId, produtoId, depositoId]`.
- `EstoqueMovimento`: `[tenantId, empresaId, produtoId, criadoEm]`.
- `XmlImportacao`: `[tenantId, empresaId, chaveAcesso]`, checksum unico por empresa.
- Busca textual: considerar `pg_trgm` ou `tsvector` para SKU, nome, codigo original e marca.

Listagens devem usar paginacao server-side, filtros no banco e ordenacao indexavel.

## Observabilidade e logs

Registrar eventos estruturados:

- Produto criado/editado/inativado.
- Alteracao fiscal.
- Alteracao de preco/custo.
- XML recebido, validado, rejeitado ou importado.
- Vinculo automatico/manual de item XML.
- Movimento de estoque gerado.
- Falha de integracao fiscal.

Cada log deve conter `tenantId`, `empresaId`, `usuarioId`, `correlationId`, `entidade`, `entidadeId` e resultado.

## Refatoracoes imediatas recomendadas

1. Extrair parsing de XML para `domains/products/infrastructure/xml`.
2. Criar DTOs de produto e validadores.
3. Criar caso de uso `ImportProductsFromNfeXml` sem gravar estoque diretamente.
4. Criar API `POST /api/erp/products/import-nfe-xml`.
5. Criar entidades de entrada fiscal antes de persistir estoque.
6. Criar `ProductRepository` com escopo obrigatorio.
7. Substituir `localStorage` por chamadas de API quando o banco entrar.
8. Adicionar auditoria para escrita.
9. Evoluir schema fiscal para regra tributaria versionada.
10. Adicionar lote/serie/validade antes de qualquer recebimento real.

## Decisoes arquiteturais propostas

- Produto pertence a `tenantId` e `empresaId`.
- SKU e unico por empresa.
- GTIN pode se repetir em casos especificos, mas deve ter indice para busca.
- Cadastro fiscal do produto nao define imposto final.
- XML de compra nao deve criar estoque diretamente; deve criar uma entrada fiscal a conferir.
- Estoque fisico e contabil/fiscal devem ser conciliaveis, nao misturados sem origem.
- Toda alteracao critica deve gerar auditoria.
- IA sugere, usuario confirma; nenhuma classificacao fiscal automatica deve ser aplicada sem rastreio.

## Estado atual aprovado para continuar?

Pode continuar como prototipo funcional e base visual.

Nao esta aprovado para producao com dados reais antes das seguintes condicoes minimas:

- API com autenticacao e escopo real.
- DTOs e validacao.
- Repositorio escopado por tenant/empresa.
- Entrada fiscal separada da importacao XML.
- Movimento de estoque transacional.
- Auditoria de produto/preco/fiscal/estoque.
- Regra tributaria versionada.
