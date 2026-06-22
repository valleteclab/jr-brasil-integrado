-- AlterTable
ALTER TABLE "Caixa" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "CaixaMovimento" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "EntradaFiscal" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "MovimentoFinanceiro" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN     "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';
