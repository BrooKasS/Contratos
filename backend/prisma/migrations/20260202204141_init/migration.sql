-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "numeroContrato" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipoContrato" TEXT,
    "fechaInforme" TIMESTAMP(3),
    "generalidades" JSONB NOT NULL,
    "principal" JSONB NOT NULL,
    "crp" JSONB NOT NULL,
    "polizas" JSONB NOT NULL,
    "otrosies" JSONB NOT NULL,
    "pagos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numeroContrato_key" ON "Contrato"("numeroContrato");
