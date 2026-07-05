-- Veriterra Tranche 3 (US-3.1) : overrides manuels de la note d'un critère de score.
-- Appliquée par le rôle privilégié (DIRECT_URL). Le rôle applicatif restreint veriterra_app hérite
-- des droits DML (ALTER DEFAULT PRIVILEGES de la migration RLS) ; les GRANT ci-dessous sont une
-- ceinture de sécurité idempotente.
--
-- Réversibilité : la STRUCTURE est réversible (DROP TABLE "TerrainScoreOverride"), mais les overrides
-- sont des données saisies par l'utilisateur : un rollback les perd (comportement assumé et documenté).

-- CreateTable
CREATE TABLE "TerrainScoreOverride" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "terrainId" UUID NOT NULL,
    "criterion" TEXT NOT NULL,
    "overrideScore" INTEGER NOT NULL,
    "originalScore" INTEGER,
    "originalBasis" TEXT,
    "note" TEXT,
    "overriddenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerrainScoreOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerrainScoreOverride_terrainId_criterion_key" ON "TerrainScoreOverride"("terrainId", "criterion");
CREATE INDEX "TerrainScoreOverride_organisationId_idx" ON "TerrainScoreOverride"("organisationId");
CREATE INDEX "TerrainScoreOverride_terrainId_idx" ON "TerrainScoreOverride"("terrainId");

-- AddForeignKey
ALTER TABLE "TerrainScoreOverride" ADD CONSTRAINT "TerrainScoreOverride_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TerrainScoreOverride" ADD CONSTRAINT "TerrainScoreOverride_terrainId_fkey" FOREIGN KEY ("terrainId") REFERENCES "Terrain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants explicites au rôle applicatif restreint (idempotents).
GRANT SELECT, INSERT, UPDATE, DELETE ON "TerrainScoreOverride" TO veriterra_app;

-- RLS (tenant isolation), ENABLE + FORCE, fail-closed comme les autres tables tenant.
ALTER TABLE "TerrainScoreOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerrainScoreOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TerrainScoreOverride"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
