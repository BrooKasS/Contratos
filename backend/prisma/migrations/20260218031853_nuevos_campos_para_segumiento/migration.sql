-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN     "abogadoResponsable" TEXT,
ADD COLUMN     "estadoContrato" TEXT,
ADD COLUMN     "fechaNovedad" TIMESTAMP(3),
ADD COLUMN     "novedad" TEXT,
ADD COLUMN     "sistema" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
