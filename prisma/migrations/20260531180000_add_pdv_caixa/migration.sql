-- PDV / Caixa: turno de caixa, movimentos (abertura/sangria/suprimento/venda) e
-- pagamentos da venda (múltiplas formas). Pré-venda permite cliente nulo (consumidor anônimo).

-- Enums
CREATE TYPE "StatusCaixa" AS ENUM ('ABERTO', 'FECHADO');
CREATE TYPE "TipoCaixaMovimento" AS ENUM ('ABERTURA', 'SUPRIMENTO', 'SANGRIA', 'VENDA', 'AJUSTE');

-- clienteId opcional no pedido (consumidor anônimo no balcão/NFC-e)
ALTER TABLE "PedidoVenda" ALTER COLUMN "clienteId" DROP NOT NULL;

-- Caixa (turno)
CREATE TABLE "Caixa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "operador" TEXT NOT NULL,
    "status" "StatusCaixa" NOT NULL DEFAULT 'ABERTO',
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldoFinalInformado" DECIMAL(14,2),
    "observacaoAbertura" TEXT,
    "observacaoFechamento" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Caixa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Caixa_tenantId_empresaId_status_idx" ON "Caixa"("tenantId", "empresaId", "status");

-- Movimentos de caixa
CREATE TABLE "CaixaMovimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "tipo" "TipoCaixaMovimento" NOT NULL,
    "formaPagamento" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "pedidoVendaId" TEXT,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaixaMovimento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CaixaMovimento_tenantId_empresaId_caixaId_idx" ON "CaixaMovimento"("tenantId", "empresaId", "caixaId");

-- Pagamentos da venda (múltiplas formas)
CREATE TABLE "PagamentoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "troco" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagamentoVenda_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PagamentoVenda_tenantId_empresaId_pedidoVendaId_idx" ON "PagamentoVenda"("tenantId", "empresaId", "pedidoVendaId");

-- FKs
ALTER TABLE "CaixaMovimento" ADD CONSTRAINT "CaixaMovimento_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "Caixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaixaMovimento" ADD CONSTRAINT "CaixaMovimento_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PagamentoVenda" ADD CONSTRAINT "PagamentoVenda_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
