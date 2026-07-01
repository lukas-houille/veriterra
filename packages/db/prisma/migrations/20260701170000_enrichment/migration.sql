-- Veriterra Tranche 2 : blocs d'enrichissement sourcés (Géorisques d'abord, DVF/PLU/pente/services ensuite).
-- Appliquée par le rôle privilégié (DIRECT_URL). Le rôle applicatif restreint veriterra_app hérite
-- des droits DML (ALTER DEFAULT PRIVILEGES de la migration RLS) ; les GRANT ci-dessous sont une
-- ceinture de sécurité idempotente.

-- CreateEnum
CREATE TYPE "EnrichmentType" AS ENUM ('RISQUES', 'PRIX_DVF', 'PLU', 'PENTE', 'SERVICES');
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'OK', 'UNAVAILABLE', 'ERROR');
CREATE TYPE "ConfidenceLevel" AS ENUM ('ELEVEE', 'MOYENNE', 'FAIBLE');

-- CreateTable
CREATE TABLE "EnrichmentBlock" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "terrainId" UUID NOT NULL,
    "type" "EnrichmentType" NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "source" TEXT,
    "sourceUrl" TEXT,
    "confidence" "ConfidenceLevel",
    "fetchedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentBlock_terrainId_type_key" ON "EnrichmentBlock"("terrainId", "type");
CREATE INDEX "EnrichmentBlock_organisationId_idx" ON "EnrichmentBlock"("organisationId");
CREATE INDEX "EnrichmentBlock_terrainId_idx" ON "EnrichmentBlock"("terrainId");

-- AddForeignKey
ALTER TABLE "EnrichmentBlock" ADD CONSTRAINT "EnrichmentBlock_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrichmentBlock" ADD CONSTRAINT "EnrichmentBlock_terrainId_fkey" FOREIGN KEY ("terrainId") REFERENCES "Terrain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants explicites au rôle applicatif restreint (idempotents).
GRANT SELECT, INSERT, UPDATE, DELETE ON "EnrichmentBlock" TO veriterra_app;

-- RLS (tenant isolation), ENABLE + FORCE, fail-closed comme les autres tables tenant.
ALTER TABLE "EnrichmentBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnrichmentBlock" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EnrichmentBlock"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
