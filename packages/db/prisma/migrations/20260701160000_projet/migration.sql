-- Veriterra Tranche 1 : Projet immobilier de l'acheteur (concept racine, cahier §5).
-- Appliquée par le rôle privilégié (DIRECT_URL). Grants hérités via ALTER DEFAULT
-- PRIVILEGES ; GRANT explicites en ceinture de sécurité.

-- CreateEnum
CREATE TYPE "TypeMaison" AS ENUM ('PLAIN_PIED', 'R1', 'R2', 'R3');

-- CreateTable
CREATE TABLE "Projet" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mon projet',
    "budgetMax" DECIMAL(12,2),
    "surfaceMinM2" INTEGER,
    "surfaceMaxM2" INTEGER,
    "typeMaison" "TypeMaison",
    "consentementPartage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projet_pkey" PRIMARY KEY ("id")
);

-- AlterTable : rattachement d'un terrain à un projet.
ALTER TABLE "Terrain" ADD COLUMN "projetId" UUID;

-- CreateIndex
CREATE INDEX "Projet_organisationId_idx" ON "Projet"("organisationId");
CREATE INDEX "Terrain_projetId_idx" ON "Terrain"("projetId");

-- AddForeignKey
ALTER TABLE "Projet" ADD CONSTRAINT "Projet_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Terrain" ADD CONSTRAINT "Terrain_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grants explicites au rôle applicatif restreint (idempotents).
GRANT SELECT, INSERT, UPDATE, DELETE ON "Projet" TO veriterra_app;

-- RLS (tenant isolation), ENABLE + FORCE, fail-closed.
ALTER TABLE "Projet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Projet" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Projet"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
