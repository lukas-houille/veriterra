-- Veriterra Tranche 1 : terrains + parcelles cadastrales (première géométrie PostGIS).
-- Appliquée par le rôle privilégié (DIRECT_URL). Le rôle applicatif restreint
-- veriterra_app hérite des droits DML (ALTER DEFAULT PRIVILEGES de la migration RLS) ;
-- les GRANT explicites ci-dessous sont une ceinture de sécurité idempotente.

-- CreateEnum
CREATE TYPE "TerrainStatus" AS ENUM ('A_ETUDIER', 'PROMETTEUR', 'RESERVE', 'ECARTE');

-- CreateTable
CREATE TABLE "Terrain" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "inseeCode" TEXT NOT NULL,
    "prixDemande" DECIMAL(12,2),
    "lienAnnonce" TEXT,
    "notes" TEXT,
    "status" "TerrainStatus" NOT NULL DEFAULT 'A_ETUDIER',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Terrain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerrainParcelle" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "terrainId" UUID NOT NULL,
    "idu" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "surfaceM2" INTEGER NOT NULL,
    "geojson" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerrainParcelle_pkey" PRIMARY KEY ("id")
);

-- Colonne géométrie PostGIS (Prisma Unsupported), SRID 4326.
ALTER TABLE "TerrainParcelle" ADD COLUMN "geom" geometry(MultiPolygon, 4326);

-- CreateIndex
CREATE INDEX "Terrain_organisationId_idx" ON "Terrain"("organisationId");
CREATE INDEX "TerrainParcelle_organisationId_idx" ON "TerrainParcelle"("organisationId");
CREATE INDEX "TerrainParcelle_terrainId_idx" ON "TerrainParcelle"("terrainId");
CREATE INDEX "TerrainParcelle_idu_idx" ON "TerrainParcelle"("idu");
CREATE INDEX "TerrainParcelle_geom_idx" ON "TerrainParcelle" USING GIST ("geom");

-- AddForeignKey
ALTER TABLE "Terrain" ADD CONSTRAINT "Terrain_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerrainParcelle" ADD CONSTRAINT "TerrainParcelle_terrainId_fkey" FOREIGN KEY ("terrainId") REFERENCES "Terrain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerrainParcelle" ADD CONSTRAINT "TerrainParcelle_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants explicites au rôle applicatif restreint (idempotents).
GRANT SELECT, INSERT, UPDATE, DELETE ON "Terrain" TO veriterra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TerrainParcelle" TO veriterra_app;

-- RLS (tenant isolation), ENABLE + FORCE, fail-closed comme les tables du socle.
ALTER TABLE "Terrain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Terrain" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Terrain"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "TerrainParcelle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerrainParcelle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerrainParcelle"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
