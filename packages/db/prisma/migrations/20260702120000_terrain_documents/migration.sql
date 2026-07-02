-- Veriterra : pièces jointes aux terrains (US-5.3 photos, US-5.8 documents). Le fichier vit dans
-- le stockage objet (MinIO/S3) ; cette table ne porte que métadonnées + provenance, scopées tenant.
-- Appliquée par le rôle privilégié (DIRECT_URL). Le rôle applicatif restreint veriterra_app hérite
-- des droits DML (ALTER DEFAULT PRIVILEGES de la migration RLS) ; les GRANT ci-dessous sont une
-- ceinture de sécurité idempotente.

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PHOTO', 'DOCUMENT');
CREATE TYPE "DocumentType" AS ENUM ('ETUDE_SOL', 'BORNAGE', 'CERTIFICAT_URBANISME', 'DEVIS', 'DIAGNOSTIC', 'AUTRE');

-- CreateTable
CREATE TABLE "TerrainDocument" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "terrainId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "docType" "DocumentType",
    "label" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerrainDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerrainDocument_storageKey_key" ON "TerrainDocument"("storageKey");
CREATE INDEX "TerrainDocument_organisationId_idx" ON "TerrainDocument"("organisationId");
CREATE INDEX "TerrainDocument_terrainId_idx" ON "TerrainDocument"("terrainId");

-- AddForeignKey
ALTER TABLE "TerrainDocument" ADD CONSTRAINT "TerrainDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerrainDocument" ADD CONSTRAINT "TerrainDocument_terrainId_fkey" FOREIGN KEY ("terrainId") REFERENCES "Terrain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants explicites au rôle applicatif restreint (idempotents).
GRANT SELECT, INSERT, UPDATE, DELETE ON "TerrainDocument" TO veriterra_app;

-- RLS (tenant isolation), ENABLE + FORCE, fail-closed comme les autres tables tenant.
ALTER TABLE "TerrainDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerrainDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerrainDocument"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
