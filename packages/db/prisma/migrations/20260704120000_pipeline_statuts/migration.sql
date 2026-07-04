-- US-5.1 : pipeline de statuts de terrain à 7 états (À contacter -> ... -> Vendu / Écarté).
--
-- Réversible en STRUCTURE (recréer l'ancien enum 'A_ETUDIER','PROMETTEUR','RESERVE','ECARTE' et
-- remapper) MAIS la réinitialisation des statuts est une opération À SENS UNIQUE (choix porteur :
-- tous les terrains existants repartent à 'A_CONTACTER', l'ancien statut est écrasé, non récupérable).
-- Pas de changement RLS : Terrain garde sa policy `tenant_isolation`. Une seule transaction
-- (aucun `ALTER TYPE ... ADD VALUE`, qui ne s'exécute pas en transaction).

CREATE TYPE "TerrainStatus_new" AS ENUM (
  'A_CONTACTER', 'A_VISITER', 'VISITE', 'DEMARCHES_EN_COURS', 'SOUS_COMPROMIS', 'VENDU', 'ECARTE'
);

ALTER TABLE "Terrain" ALTER COLUMN "status" DROP DEFAULT;

-- Réinitialisation assumée : tous les terrains existants -> 'A_CONTACTER' (nouveau départ du pipeline).
ALTER TABLE "Terrain"
  ALTER COLUMN "status" TYPE "TerrainStatus_new" USING 'A_CONTACTER'::"TerrainStatus_new";

ALTER TABLE "Terrain" ALTER COLUMN "status" SET DEFAULT 'A_CONTACTER';

DROP TYPE "TerrainStatus";
ALTER TYPE "TerrainStatus_new" RENAME TO "TerrainStatus";
