-- CreateEnum
CREATE TYPE "ModeloFiscal" AS ENUM ('NFE', 'NFCE', 'NFSE');

-- CreateEnum
CREATE TYPE "AmbienteFiscal" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "ProvedorFiscal" AS ENUM ('INTERNO', 'FOCUS_NFE', 'NFEIO', 'PLUGNOTAS', 'WEBMANIA', 'MANUAL');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI');

-- CreateEnum
CREATE TYPE "FinalidadeNfe" AS ENUM ('NORMAL', 'COMPLEMENTAR', 'AJUSTE', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "TipoEventoFiscal" AS ENUM ('CANCELAMENTO', 'CARTA_CORRECAO', 'INUTILIZACAO');

-- CreateEnum
CREATE TYPE "StatusEventoFiscal" AS ENUM ('PENDENTE', 'PROCESSANDO', 'AUTORIZADO', 'REJEITADO', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoMovimentoFinanceiro" AS ENUM ('CREDITO', 'DEBITO');

-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('ABERTO', 'EM_CONTAGEM', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'PARCIAL', 'RECEBIDO', 'CANCELADO');

-- AlterEnum
ALTER TYPE "StatusFinanceiro" ADD VALUE 'PARCIAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusNotaFiscal" ADD VALUE 'PROCESSANDO';
ALTER TYPE "StatusNotaFiscal" ADD VALUE 'DENEGADA';
ALTER TYPE "StatusNotaFiscal" ADD VALUE 'ERRO';

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "contaBancariaId" TEXT,
ADD COLUMN     "descontoBaixa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "valorPago" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "contaBancariaId" TEXT,
ADD COLUMN     "descontoBaixa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "notaFiscalId" TEXT,
ADD COLUMN     "numeroDocumento" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "origem" TEXT,
ADD COLUMN     "valorPago" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Deposito" ADD COLUMN     "padrao" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "codigoMunicipioIbge" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "enderecoBairro" TEXT,
ADD COLUMN     "enderecoCep" TEXT,
ADD COLUMN     "enderecoCidade" TEXT,
ADD COLUMN     "enderecoComplemento" TEXT,
ADD COLUMN     "enderecoLogradouro" TEXT,
ADD COLUMN     "enderecoNumero" TEXT,
ADD COLUMN     "enderecoUf" TEXT,
ADD COLUMN     "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
ADD COLUMN     "telefone" TEXT;

-- AlterTable
ALTER TABLE "EntradaFiscal" ADD COLUMN     "pedidoCompraId" TEXT;

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN     "autorizadaEm" TIMESTAMP(3),
ADD COLUMN     "canceladaEm" TIMESTAMP(3),
ADD COLUMN     "condicaoPagamento" TEXT,
ADD COLUMN     "destinatarioDocumento" TEXT,
ADD COLUMN     "destinatarioEmail" TEXT,
ADD COLUMN     "destinatarioIe" TEXT,
ADD COLUMN     "destinatarioNome" TEXT,
ADD COLUMN     "finalidade" "FinalidadeNfe" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "informacoesComplementares" TEXT,
ADD COLUMN     "modelo" "ModeloFiscal" NOT NULL DEFAULT 'NFE',
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "naturezaOperacao" TEXT,
ADD COLUMN     "outrasDespesas" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "protocolo" TEXT,
ADD COLUMN     "provedor" "ProvedorFiscal" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "reciboLote" TEXT,
ADD COLUMN     "valorCofins" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorDesconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorIcms" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorIcmsSt" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorIpi" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorIss" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorPis" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorSeguro" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorTotalTributos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "xml" TEXT;

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "aprovadoEm" TIMESTAMP(3),
ADD COLUMN     "condicaoPagamento" TEXT,
ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "pedidoGeradoId" TEXT,
ADD COLUMN     "vendedor" TEXT;

-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "condicaoPagamento" TEXT,
ADD COLUMN     "depositoId" TEXT,
ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "faturadoEm" TIMESTAMP(3),
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "problemaRelatado" TEXT,
ADD COLUMN     "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPecas" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PedidoCompra" ADD COLUMN     "condicaoPagamento" TEXT,
ADD COLUMN     "depositoId" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO';

-- AlterTable
ALTER TABLE "PedidoCompraItem" ADD COLUMN     "quantidadeRecebida" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "confirmadoEm" TIMESTAMP(3),
ADD COLUMN     "depositoId" TEXT,
ADD COLUMN     "faturadoEm" TIMESTAMP(3),
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "naturezaOperacao" TEXT,
ADD COLUMN     "observacoesInternas" TEXT,
ADD COLUMN     "origemOrcamentoId" TEXT,
ADD COLUMN     "vendedor" TEXT;

-- AlterTable
ALTER TABLE "PedidoVendaItem" ADD COLUMN     "custoUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "NotaFiscalItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "numeroItem" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "quantidade" DECIMAL(14,4) NOT NULL,
    "valorUnitario" DECIMAL(14,6) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "origem" TEXT,
    "cstIcms" TEXT,
    "csosn" TEXT,
    "baseIcms" DECIMAL(14,2),
    "aliquotaIcms" DECIMAL(8,4),
    "valorIcms" DECIMAL(14,2),
    "cstIpi" TEXT,
    "aliquotaIpi" DECIMAL(8,4),
    "valorIpi" DECIMAL(14,2),
    "cstPis" TEXT,
    "aliquotaPis" DECIMAL(8,4),
    "valorPis" DECIMAL(14,2),
    "cstCofins" TEXT,
    "aliquotaCofins" DECIMAL(8,4),
    "valorCofins" DECIMAL(14,2),
    "itemListaServico" TEXT,
    "codigoTributacaoMunicipio" TEXT,
    "aliquotaIss" DECIMAL(8,4),
    "valorIss" DECIMAL(14,2),
    "cClassTrib" TEXT,
    "informacoesAdicionais" TEXT,

    CONSTRAINT "NotaFiscalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscalEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "tipo" "TipoEventoFiscal" NOT NULL,
    "status" "StatusEventoFiscal" NOT NULL DEFAULT 'PENDENTE',
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "justificativa" TEXT,
    "correcao" TEXT,
    "protocolo" TEXT,
    "mensagem" TEXT,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscalEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" "ProvedorFiscal" NOT NULL DEFAULT 'MANUAL',
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "baseUrl" TEXT,
    "tokenCriptografado" TEXT,
    "cscId" TEXT,
    "cscTokenCriptografado" TEXT,
    "serieNfe" TEXT NOT NULL DEFAULT '1',
    "serieNfce" TEXT NOT NULL DEFAULT '1',
    "serieNfse" TEXT NOT NULL DEFAULT '1',
    "emitirNfe" BOOLEAN NOT NULL DEFAULT true,
    "emitirNfce" BOOLEAN NOT NULL DEFAULT false,
    "emitirNfse" BOOLEAN NOT NULL DEFAULT false,
    "codigoMunicipioIbge" TEXT,
    "regimeEspecialTributacao" TEXT,
    "incentivadorCultural" BOOLEAN NOT NULL DEFAULT false,
    "certificadoInfo" TEXT,
    "certificadoValidade" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "testadoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenciaFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "modelo" "ModeloFiscal" NOT NULL,
    "serie" TEXT NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenciaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'CORRENTE',
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldoAtual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoFinanceiro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "contaBancariaId" TEXT,
    "contaPagarId" TEXT,
    "contaReceberId" TEXT,
    "tipo" "TipoMovimentoFinanceiro" NOT NULL,
    "origem" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamento" TEXT,
    "saldoAnterior" DECIMAL(14,2),
    "saldoPosterior" DECIMAL(14,2),
    "dataMovimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoFinanceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusInventario" NOT NULL DEFAULT 'ABERTO',
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "saldoSistema" DECIMAL(14,4) NOT NULL,
    "saldoContado" DECIMAL(14,4),
    "custoUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "contado" BOOLEAN NOT NULL DEFAULT false,
    "ajustado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotaFiscalItem_tenantId_empresaId_notaFiscalId_idx" ON "NotaFiscalItem"("tenantId", "empresaId", "notaFiscalId");

-- CreateIndex
CREATE INDEX "NotaFiscalItem_tenantId_empresaId_produtoId_idx" ON "NotaFiscalItem"("tenantId", "empresaId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscalItem_tenantId_empresaId_notaFiscalId_numeroItem_key" ON "NotaFiscalItem"("tenantId", "empresaId", "notaFiscalId", "numeroItem");

-- CreateIndex
CREATE INDEX "NotaFiscalEvento_tenantId_empresaId_notaFiscalId_idx" ON "NotaFiscalEvento"("tenantId", "empresaId", "notaFiscalId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoFiscal_empresaId_key" ON "ConfiguracaoFiscal"("empresaId");

-- CreateIndex
CREATE INDEX "ConfiguracaoFiscal_tenantId_empresaId_idx" ON "ConfiguracaoFiscal"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "SequenciaFiscal_tenantId_empresaId_idx" ON "SequenciaFiscal"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenciaFiscal_tenantId_empresaId_modelo_serie_key" ON "SequenciaFiscal"("tenantId", "empresaId", "modelo", "serie");

-- CreateIndex
CREATE INDEX "ContaBancaria_tenantId_empresaId_idx" ON "ContaBancaria"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_tenantId_empresaId_nome_key" ON "ContaBancaria"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE INDEX "MovimentoFinanceiro_tenantId_empresaId_dataMovimento_idx" ON "MovimentoFinanceiro"("tenantId", "empresaId", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoFinanceiro_tenantId_empresaId_contaBancariaId_idx" ON "MovimentoFinanceiro"("tenantId", "empresaId", "contaBancariaId");

-- CreateIndex
CREATE INDEX "MovimentoFinanceiro_tenantId_empresaId_origem_idx" ON "MovimentoFinanceiro"("tenantId", "empresaId", "origem");

-- CreateIndex
CREATE INDEX "Inventario_tenantId_empresaId_status_idx" ON "Inventario"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inventario_tenantId_empresaId_numero_key" ON "Inventario"("tenantId", "empresaId", "numero");

-- CreateIndex
CREATE INDEX "InventarioItem_tenantId_empresaId_inventarioId_idx" ON "InventarioItem"("tenantId", "empresaId", "inventarioId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_tenantId_empresaId_inventarioId_produtoId_key" ON "InventarioItem"("tenantId", "empresaId", "inventarioId", "produtoId");

-- CreateIndex
CREATE INDEX "ContaReceber_tenantId_empresaId_clienteId_vencimento_idx" ON "ContaReceber"("tenantId", "empresaId", "clienteId", "vencimento");

-- CreateIndex
CREATE INDEX "NotaFiscal_tenantId_empresaId_modelo_status_idx" ON "NotaFiscal"("tenantId", "empresaId", "modelo", "status");

-- CreateIndex
CREATE INDEX "NotaFiscal_tenantId_empresaId_clienteId_idx" ON "NotaFiscal"("tenantId", "empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_tenantId_empresaId_modelo_serie_numero_key" ON "NotaFiscal"("tenantId", "empresaId", "modelo", "serie", "numero");

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntradaFiscal" ADD CONSTRAINT "EntradaFiscal_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalEvento" ADD CONSTRAINT "NotaFiscalEvento_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoFiscal" ADD CONSTRAINT "ConfiguracaoFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenciaFiscal" ADD CONSTRAINT "SequenciaFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFinanceiro" ADD CONSTRAINT "MovimentoFinanceiro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFinanceiro" ADD CONSTRAINT "MovimentoFinanceiro_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFinanceiro" ADD CONSTRAINT "MovimentoFinanceiro_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFinanceiro" ADD CONSTRAINT "MovimentoFinanceiro_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

