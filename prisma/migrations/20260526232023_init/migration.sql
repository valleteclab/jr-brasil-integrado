-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusEmpresa" AS ENUM ('ATIVA', 'INATIVA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('PENDENTE_APROVACAO', 'ATIVO', 'BLOQUEADO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('RASCUNHO', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_NOTA', 'SEPARACAO', 'ENVIADO', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'EM_ANALISE', 'AGUARDANDO_CLIENTE', 'APROVADO', 'EXPIRADO', 'REJEITADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "StatusOrdemServico" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_PECAS', 'FINALIZADA_NAO_FATURADA', 'FATURADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'RESERVA', 'LIBERACAO_RESERVA');

-- CreateEnum
CREATE TYPE "StatusFinanceiro" AS ENUM ('ABERTO', 'VENCIDO', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('RASCUNHO', 'AUTORIZADA', 'CANCELADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('PRODUTO', 'SERVICO', 'KIT', 'INSUMO');

-- CreateEnum
CREATE TYPE "StatusXmlImportacao" AS ENUM ('RECEBIDO', 'VALIDADO', 'PROCESSADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "StatusEntradaFiscal" AS ENUM ('RASCUNHO', 'AGUARDANDO_CONFERENCIA', 'CONFERIDA', 'ESTOQUE_PROCESSADO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoTributo" AS ENUM ('ICMS', 'IPI', 'PIS', 'COFINS', 'ISS', 'CBS', 'IBS', 'IS');

-- CreateEnum
CREATE TYPE "TipoOperacaoFiscal" AS ENUM ('COMPRA', 'VENDA', 'DEVOLUCAO_COMPRA', 'DEVOLUCAO_VENDA', 'TRANSFERENCIA', 'REMESSA', 'RETORNO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "status" "StatusEmpresa" NOT NULL DEFAULT 'ATIVA',
    "matriz" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioVinculo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsuarioVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perfil" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "payload" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "documento" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "status" "StatusCliente" NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "segmento" TEXT,
    "limiteCredito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditoUsado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "condicaoPagamento" TEXT,
    "tabelaPrecoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteContato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "cargo" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteEndereco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "apelido" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "referencia" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteEndereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPreco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabelaPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPrecoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tabelaPrecoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "preco" DECIMAL(14,2) NOT NULL,
    "quantidadeMinima" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TabelaPrecoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoCategoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoriaPaiId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoMarca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "descricaoComercial" TEXT,
    "tipo" "TipoProduto" NOT NULL DEFAULT 'PRODUTO',
    "codigoOriginal" TEXT,
    "codigoFabricante" TEXT,
    "gtin" TEXT,
    "categoriaId" TEXT NOT NULL,
    "marcaId" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "unidadeCompra" TEXT NOT NULL DEFAULT 'UN',
    "fatorConversaoCompra" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "pesoKg" DECIMAL(10,3),
    "pesoBrutoKg" DECIMAL(10,3),
    "alturaCm" DECIMAL(10,3),
    "larguraCm" DECIMAL(10,3),
    "comprimentoCm" DECIMAL(10,3),
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "origem" TEXT,
    "precoCusto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ultimoCusto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custoMedio" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "precoVenda" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "precoMinimo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "margemAlvoPercentual" DECIMAL(8,4),
    "quantidadeMinima" INTEGER NOT NULL DEFAULT 1,
    "controlaLote" BOOLEAN NOT NULL DEFAULT false,
    "controlaSerie" BOOLEAN NOT NULL DEFAULT false,
    "controlaValidade" BOOLEAN NOT NULL DEFAULT false,
    "permiteEstoqueNegativo" BOOLEAN NOT NULL DEFAULT false,
    "permiteVendaSobEncomenda" BOOLEAN NOT NULL DEFAULT false,
    "ativoCompra" BOOLEAN NOT NULL DEFAULT true,
    "ativoVenda" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "visivelEcommerce" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoImagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "textoAlt" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProdutoImagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoAplicacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "anoFaixa" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "ProdutoAplicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "cest" TEXT,
    "origem" TEXT,
    "exTipi" TEXT,
    "codigoBeneficioFiscal" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigoFornecedor" TEXT NOT NULL,
    "descricaoFornecedor" TEXT,
    "gtinFornecedor" TEXT,
    "unidadeCompra" TEXT NOT NULL DEFAULT 'UN',
    "fatorConversao" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "leadTimeDias" INTEGER,
    "compraMinima" DECIMAL(14,4),
    "custoUltimaCompra" DECIMAL(14,4),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueSaldo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "loteId" TEXT,
    "controleKey" TEXT NOT NULL DEFAULT 'SEM_CONTROLE',
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reservado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minimo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "maximo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueSaldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueMovimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "loteId" TEXT,
    "serieId" TEXT,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "saldoAntes" DECIMAL(14,4),
    "saldoDepois" DECIMAL(14,4),
    "custoUnitario" DECIMAL(14,4),
    "custoTotal" DECIMAL(14,4),
    "documentoTipo" TEXT,
    "documentoId" TEXT,
    "idempotencyKey" TEXT,
    "usuarioId" TEXT,
    "origem" TEXT,
    "origemId" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstoqueMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fabricadoEm" TIMESTAMP(3),
    "validadeEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueSerie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "loteId" TEXT,
    "numeroSerie" TEXT NOT NULL,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueSerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstoqueReserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "origemTipo" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstoqueReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'RASCUNHO',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "condicaoPagamento" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVendaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PedidoVendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'EM_ANALISE',
    "validoAte" TIMESTAMP(3),
    "observacaoVendedor" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "StatusOrdemServico" NOT NULL DEFAULT 'ABERTA',
    "equipamento" TEXT NOT NULL,
    "placaOuSerial" TEXT,
    "diagnostico" TEXT,
    "previsaoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoMaoObra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "horas" DECIMAL(8,2) NOT NULL,
    "valorHora" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrdemServicoMaoObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServicoPeca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrdemServicoPeca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "documento" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "condicaoPagamento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "previsaoEm" TIMESTAMP(3),
    "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompraItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoCompraId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XmlImportacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chaveAcesso" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "emitenteDocumento" TEXT,
    "emitenteNome" TEXT,
    "status" "StatusXmlImportacao" NOT NULL DEFAULT 'RECEBIDO',
    "checksum" TEXT NOT NULL,
    "arquivoUrl" TEXT,
    "xmlOriginal" TEXT,
    "mensagemErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XmlImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntradaFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "xmlImportacaoId" TEXT,
    "chaveAcesso" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "modelo" TEXT,
    "cfopPrincipal" TEXT,
    "status" "StatusEntradaFiscal" NOT NULL DEFAULT 'AGUARDANDO_CONFERENCIA',
    "emitidaEm" TIMESTAMP(3),
    "recebidaEm" TIMESTAMP(3),
    "totalProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNota" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorSeguro" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outrasDespesas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntradaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntradaFiscalItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entradaFiscalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "itemNumero" INTEGER NOT NULL,
    "codigoFornecedor" TEXT NOT NULL,
    "descricaoFornecedor" TEXT NOT NULL,
    "gtin" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "valorUnitario" DECIMAL(14,4) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "produtoVinculadoAutomaticamente" BOOLEAN NOT NULL DEFAULT false,
    "confiancaVinculo" DECIMAL(8,4),
    "revisarVinculo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntradaFiscalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntradaFiscalItemImposto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entradaFiscalItemId" TEXT NOT NULL,
    "tributo" "TipoTributo" NOT NULL,
    "cst" TEXT,
    "csosn" TEXT,
    "cClassTrib" TEXT,
    "baseCalculo" DECIMAL(14,2),
    "aliquota" DECIMAL(8,4),
    "valor" DECIMAL(14,2),
    "recuperavel" BOOLEAN NOT NULL DEFAULT false,
    "dadosOriginais" JSONB,

    CONSTRAINT "EntradaFiscalItemImposto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraTributaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT,
    "nome" TEXT NOT NULL,
    "tributo" "TipoTributo" NOT NULL,
    "operacao" "TipoOperacaoFiscal" NOT NULL,
    "ufOrigem" TEXT,
    "ufDestino" TEXT,
    "regimeEmpresa" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "cst" TEXT,
    "csosn" TEXT,
    "cClassTrib" TEXT,
    "codigoBeneficioFiscal" TEXT,
    "aliquota" DECIMAL(8,4),
    "reducaoBase" DECIMAL(8,4),
    "diferimento" DECIMAL(8,4),
    "creditoPresumido" DECIMAL(8,4),
    "formula" JSONB,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraTributaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "pedidoCompraId" TEXT,
    "descricao" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "StatusFinanceiro" NOT NULL DEFAULT 'ABERTO',
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaReceber" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoVendaId" TEXT,
    "ordemServicoId" TEXT,
    "descricao" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "StatusFinanceiro" NOT NULL DEFAULT 'ABERTO',
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT,
    "serie" TEXT,
    "chaveAcesso" TEXT,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'RASCUNHO',
    "clienteId" TEXT,
    "pedidoVendaId" TEXT,
    "ordemServicoId" TEXT,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "xmlUrl" TEXT,
    "danfeUrl" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Empresa_tenantId_idx" ON "Empresa"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_tenantId_cnpj_key" ON "Empresa"("tenantId", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "UsuarioVinculo_tenantId_empresaId_idx" ON "UsuarioVinculo"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "UsuarioVinculo_usuarioId_idx" ON "UsuarioVinculo"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioVinculo_tenantId_empresaId_usuarioId_perfilId_key" ON "UsuarioVinculo"("tenantId", "empresaId", "usuarioId", "perfilId");

-- CreateIndex
CREATE INDEX "Perfil_tenantId_idx" ON "Perfil"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_tenantId_nome_key" ON "Perfil"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Permissao_tenantId_idx" ON "Permissao"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Permissao_tenantId_modulo_acao_perfilId_key" ON "Permissao"("tenantId", "modulo", "acao", "perfilId");

-- CreateIndex
CREATE INDEX "Auditoria_tenantId_empresaId_idx" ON "Auditoria"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_empresaId_idx" ON "Cliente"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_tenantId_documento_key" ON "Cliente"("tenantId", "documento");

-- CreateIndex
CREATE INDEX "ClienteContato_tenantId_empresaId_idx" ON "ClienteContato"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "ClienteEndereco_tenantId_empresaId_idx" ON "ClienteEndereco"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "TabelaPreco_tenantId_empresaId_idx" ON "TabelaPreco"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TabelaPreco_tenantId_empresaId_nome_key" ON "TabelaPreco"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE INDEX "TabelaPrecoItem_tenantId_empresaId_idx" ON "TabelaPrecoItem"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TabelaPrecoItem_tenantId_tabelaPrecoId_produtoId_quantidade_key" ON "TabelaPrecoItem"("tenantId", "tabelaPrecoId", "produtoId", "quantidadeMinima");

-- CreateIndex
CREATE INDEX "ProdutoCategoria_tenantId_empresaId_idx" ON "ProdutoCategoria"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoCategoria_tenantId_empresaId_slug_key" ON "ProdutoCategoria"("tenantId", "empresaId", "slug");

-- CreateIndex
CREATE INDEX "ProdutoMarca_tenantId_empresaId_idx" ON "ProdutoMarca"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoMarca_tenantId_empresaId_nome_key" ON "ProdutoMarca"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_idx" ON "Produto"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_nome_idx" ON "Produto"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_gtin_idx" ON "Produto"("tenantId", "empresaId", "gtin");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_ncm_idx" ON "Produto"("tenantId", "empresaId", "ncm");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_categoriaId_idx" ON "Produto"("tenantId", "empresaId", "categoriaId");

-- CreateIndex
CREATE INDEX "Produto_tenantId_empresaId_marcaId_idx" ON "Produto"("tenantId", "empresaId", "marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_tenantId_empresaId_sku_key" ON "Produto"("tenantId", "empresaId", "sku");

-- CreateIndex
CREATE INDEX "ProdutoImagem_tenantId_empresaId_idx" ON "ProdutoImagem"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "ProdutoAplicacao_tenantId_empresaId_idx" ON "ProdutoAplicacao"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFiscal_produtoId_key" ON "ProdutoFiscal"("produtoId");

-- CreateIndex
CREATE INDEX "ProdutoFiscal_tenantId_empresaId_ncm_idx" ON "ProdutoFiscal"("tenantId", "empresaId", "ncm");

-- CreateIndex
CREATE INDEX "ProdutoFiscal_tenantId_empresaId_cest_idx" ON "ProdutoFiscal"("tenantId", "empresaId", "cest");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFiscal_tenantId_empresaId_produtoId_key" ON "ProdutoFiscal"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "ProdutoFornecedor_tenantId_empresaId_produtoId_idx" ON "ProdutoFornecedor"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "ProdutoFornecedor_tenantId_empresaId_fornecedorId_idx" ON "ProdutoFornecedor"("tenantId", "empresaId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedor_tenantId_empresaId_fornecedorId_codigoFor_key" ON "ProdutoFornecedor"("tenantId", "empresaId", "fornecedorId", "codigoFornecedor");

-- CreateIndex
CREATE INDEX "Deposito_tenantId_empresaId_idx" ON "Deposito"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposito_tenantId_empresaId_nome_key" ON "Deposito"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE INDEX "EstoqueSaldo_tenantId_empresaId_produtoId_idx" ON "EstoqueSaldo"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "EstoqueSaldo_tenantId_empresaId_depositoId_idx" ON "EstoqueSaldo"("tenantId", "empresaId", "depositoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueSaldo_tenantId_empresaId_produtoId_depositoId_contro_key" ON "EstoqueSaldo"("tenantId", "empresaId", "produtoId", "depositoId", "controleKey");

-- CreateIndex
CREATE INDEX "EstoqueMovimento_tenantId_empresaId_produtoId_depositoId_cr_idx" ON "EstoqueMovimento"("tenantId", "empresaId", "produtoId", "depositoId", "criadoEm");

-- CreateIndex
CREATE INDEX "EstoqueMovimento_tenantId_empresaId_documentoTipo_documento_idx" ON "EstoqueMovimento"("tenantId", "empresaId", "documentoTipo", "documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueMovimento_tenantId_empresaId_idempotencyKey_key" ON "EstoqueMovimento"("tenantId", "empresaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EstoqueLote_tenantId_empresaId_produtoId_idx" ON "EstoqueLote"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "EstoqueLote_tenantId_empresaId_validadeEm_idx" ON "EstoqueLote"("tenantId", "empresaId", "validadeEm");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueLote_tenantId_empresaId_produtoId_depositoId_numero_key" ON "EstoqueLote"("tenantId", "empresaId", "produtoId", "depositoId", "numero");

-- CreateIndex
CREATE INDEX "EstoqueSerie_tenantId_empresaId_depositoId_idx" ON "EstoqueSerie"("tenantId", "empresaId", "depositoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstoqueSerie_tenantId_empresaId_produtoId_numeroSerie_key" ON "EstoqueSerie"("tenantId", "empresaId", "produtoId", "numeroSerie");

-- CreateIndex
CREATE INDEX "EstoqueReserva_tenantId_empresaId_produtoId_depositoId_idx" ON "EstoqueReserva"("tenantId", "empresaId", "produtoId", "depositoId");

-- CreateIndex
CREATE INDEX "EstoqueReserva_tenantId_empresaId_origemTipo_origemId_idx" ON "EstoqueReserva"("tenantId", "empresaId", "origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "PedidoVenda_tenantId_empresaId_status_idx" ON "PedidoVenda"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoVenda_tenantId_empresaId_numero_key" ON "PedidoVenda"("tenantId", "empresaId", "numero");

-- CreateIndex
CREATE INDEX "PedidoVendaItem_tenantId_empresaId_idx" ON "PedidoVendaItem"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "Orcamento_tenantId_empresaId_status_idx" ON "Orcamento"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_tenantId_empresaId_numero_key" ON "Orcamento"("tenantId", "empresaId", "numero");

-- CreateIndex
CREATE INDEX "OrcamentoItem_tenantId_empresaId_idx" ON "OrcamentoItem"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "OrdemServico_tenantId_empresaId_status_idx" ON "OrdemServico"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_tenantId_empresaId_numero_key" ON "OrdemServico"("tenantId", "empresaId", "numero");

-- CreateIndex
CREATE INDEX "OrdemServicoMaoObra_tenantId_empresaId_idx" ON "OrdemServicoMaoObra"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "OrdemServicoPeca_tenantId_empresaId_idx" ON "OrdemServicoPeca"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "Fornecedor_tenantId_empresaId_idx" ON "Fornecedor"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_tenantId_empresaId_documento_key" ON "Fornecedor"("tenantId", "empresaId", "documento");

-- CreateIndex
CREATE INDEX "PedidoCompra_tenantId_empresaId_idx" ON "PedidoCompra"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_tenantId_empresaId_numero_key" ON "PedidoCompra"("tenantId", "empresaId", "numero");

-- CreateIndex
CREATE INDEX "PedidoCompraItem_tenantId_empresaId_idx" ON "PedidoCompraItem"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "XmlImportacao_tenantId_empresaId_status_idx" ON "XmlImportacao"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE INDEX "XmlImportacao_tenantId_empresaId_emitenteDocumento_idx" ON "XmlImportacao"("tenantId", "empresaId", "emitenteDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "XmlImportacao_tenantId_empresaId_checksum_key" ON "XmlImportacao"("tenantId", "empresaId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "XmlImportacao_tenantId_empresaId_chaveAcesso_key" ON "XmlImportacao"("tenantId", "empresaId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "EntradaFiscal_tenantId_empresaId_status_idx" ON "EntradaFiscal"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE INDEX "EntradaFiscal_tenantId_empresaId_fornecedorId_idx" ON "EntradaFiscal"("tenantId", "empresaId", "fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFiscal_tenantId_empresaId_chaveAcesso_key" ON "EntradaFiscal"("tenantId", "empresaId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "EntradaFiscalItem_tenantId_empresaId_produtoId_idx" ON "EntradaFiscalItem"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "EntradaFiscalItem_tenantId_empresaId_codigoFornecedor_idx" ON "EntradaFiscalItem"("tenantId", "empresaId", "codigoFornecedor");

-- CreateIndex
CREATE INDEX "EntradaFiscalItem_tenantId_empresaId_ncm_idx" ON "EntradaFiscalItem"("tenantId", "empresaId", "ncm");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFiscalItem_tenantId_empresaId_entradaFiscalId_itemNu_key" ON "EntradaFiscalItem"("tenantId", "empresaId", "entradaFiscalId", "itemNumero");

-- CreateIndex
CREATE INDEX "EntradaFiscalItemImposto_tenantId_empresaId_tributo_idx" ON "EntradaFiscalItemImposto"("tenantId", "empresaId", "tributo");

-- CreateIndex
CREATE INDEX "EntradaFiscalItemImposto_tenantId_empresaId_entradaFiscalIt_idx" ON "EntradaFiscalItemImposto"("tenantId", "empresaId", "entradaFiscalItemId");

-- CreateIndex
CREATE INDEX "RegraTributaria_tenantId_empresaId_tributo_operacao_idx" ON "RegraTributaria"("tenantId", "empresaId", "tributo", "operacao");

-- CreateIndex
CREATE INDEX "RegraTributaria_tenantId_empresaId_ncm_ufDestino_idx" ON "RegraTributaria"("tenantId", "empresaId", "ncm", "ufDestino");

-- CreateIndex
CREATE INDEX "RegraTributaria_tenantId_empresaId_vigenciaInicio_vigenciaF_idx" ON "RegraTributaria"("tenantId", "empresaId", "vigenciaInicio", "vigenciaFim");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_empresaId_status_idx" ON "ContaPagar"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE INDEX "ContaReceber_tenantId_empresaId_status_idx" ON "ContaReceber"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE INDEX "NotaFiscal_tenantId_empresaId_status_idx" ON "NotaFiscal"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_tenantId_empresaId_chaveAcesso_key" ON "NotaFiscal"("tenantId", "empresaId", "chaveAcesso");

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioVinculo" ADD CONSTRAINT "UsuarioVinculo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioVinculo" ADD CONSTRAINT "UsuarioVinculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioVinculo" ADD CONSTRAINT "UsuarioVinculo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioVinculo" ADD CONSTRAINT "UsuarioVinculo_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permissao" ADD CONSTRAINT "Permissao_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "TabelaPreco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteContato" ADD CONSTRAINT "ClienteContato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteEndereco" ADD CONSTRAINT "ClienteEndereco_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPreco" ADD CONSTRAINT "TabelaPreco_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "TabelaPreco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoCategoria" ADD CONSTRAINT "ProdutoCategoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoCategoria" ADD CONSTRAINT "ProdutoCategoria_categoriaPaiId_fkey" FOREIGN KEY ("categoriaPaiId") REFERENCES "ProdutoCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoMarca" ADD CONSTRAINT "ProdutoMarca_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "ProdutoCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "ProdutoMarca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoImagem" ADD CONSTRAINT "ProdutoImagem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoAplicacao" ADD CONSTRAINT "ProdutoAplicacao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFiscal" ADD CONSTRAINT "ProdutoFiscal_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposito" ADD CONSTRAINT "Deposito_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSaldo" ADD CONSTRAINT "EstoqueSaldo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSaldo" ADD CONSTRAINT "EstoqueSaldo_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSaldo" ADD CONSTRAINT "EstoqueSaldo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "EstoqueLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueMovimento" ADD CONSTRAINT "EstoqueMovimento_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueMovimento" ADD CONSTRAINT "EstoqueMovimento_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueMovimento" ADD CONSTRAINT "EstoqueMovimento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "EstoqueLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueMovimento" ADD CONSTRAINT "EstoqueMovimento_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "EstoqueSerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueLote" ADD CONSTRAINT "EstoqueLote_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueLote" ADD CONSTRAINT "EstoqueLote_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSerie" ADD CONSTRAINT "EstoqueSerie_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSerie" ADD CONSTRAINT "EstoqueSerie_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueSerie" ADD CONSTRAINT "EstoqueSerie_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "EstoqueLote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueReserva" ADD CONSTRAINT "EstoqueReserva_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstoqueReserva" ADD CONSTRAINT "EstoqueReserva_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoMaoObra" ADD CONSTRAINT "OrdemServicoMaoObra_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoPeca" ADD CONSTRAINT "OrdemServicoPeca_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServicoPeca" ADD CONSTRAINT "OrdemServicoPeca_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmlImportacao" ADD CONSTRAINT "XmlImportacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscal" ADD CONSTRAINT "EntradaFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscal" ADD CONSTRAINT "EntradaFiscal_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscal" ADD CONSTRAINT "EntradaFiscal_xmlImportacaoId_fkey" FOREIGN KEY ("xmlImportacaoId") REFERENCES "XmlImportacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscalItem" ADD CONSTRAINT "EntradaFiscalItem_entradaFiscalId_fkey" FOREIGN KEY ("entradaFiscalId") REFERENCES "EntradaFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscalItem" ADD CONSTRAINT "EntradaFiscalItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscalItemImposto" ADD CONSTRAINT "EntradaFiscalItemImposto_entradaFiscalItemId_fkey" FOREIGN KEY ("entradaFiscalItemId") REFERENCES "EntradaFiscalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraTributaria" ADD CONSTRAINT "RegraTributaria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
