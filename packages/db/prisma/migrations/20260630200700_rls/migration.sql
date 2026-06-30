-- Veriterra — socle multi-tenant : extension PostGIS, rôle applicatif restreint et
-- Row-Level Security. Appliquée par le rôle privilégié (DIRECT_URL).

-- 1) PostGIS prêt pour la Tranche 1 (aucune colonne geometry encore).
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2) Rôle applicatif RESTREINT (par défaut NOSUPERUSER, NOBYPASSRLS), non-propriétaire.
--    Mot de passe par défaut pour le dev/local ; en prod, pré-provisionner ce rôle avec
--    un secret fort AVANT la migration (le bloc IF NOT EXISTS ne le recrée alors pas).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veriterra_app') THEN
    CREATE ROLE veriterra_app LOGIN PASSWORD 'veriterra_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO veriterra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO veriterra_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO veriterra_app;
-- Les futures tables/séquences (Tranche 1+) héritent automatiquement de ces droits.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO veriterra_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO veriterra_app;

-- 3) RLS sur les tables scopées au tenant. FORCE => s'applique même au propriétaire.
--    NULLIF(current_setting('app.current_org_id', true), '')::uuid => si le contexte
--    tenant est absent OU vide, la comparaison vaut NULL => fail-closed propre :
--    0 ligne en lecture, insert bloqué (sans erreur de cast d'une chaîne vide en uuid).

-- Organisation : visible uniquement quand elle EST le tenant courant.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Organisation"
  USING ("id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Membership : scopée par organisationId.
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Membership"
  USING ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- User : identité globale (pas de colonne organisationId). Le rôle applicatif a des
-- droits DML dessus, donc on protège quand même : un user n'est visible que s'il est
-- membre de l'organisation courante (jointure via Membership, elle-même sous RLS). Le
-- bootstrap auth écrit les users via le rôle privilégié (admin), qui contourne la RLS.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User"."id"
        AND m."organisationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    )
  );
