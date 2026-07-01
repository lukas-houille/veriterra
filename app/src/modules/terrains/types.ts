import type { GeoJsonGeometry } from '@/lib/geo/types';

/** Entrée de création d'un terrain (le client envoie les IDU choisis, pas la géométrie). */
export interface CreateTerrainInput {
  label?: string;
  address: string;
  inseeCode: string;
  idus: string[];
  prixDemande?: number | null;
  lienAnnonce?: string | null;
  notes?: string | null;
}

export interface TerrainParcelleSummary {
  id: string;
  idu: string;
  commune: string;
  section: string;
  numero: string;
  surfaceM2: number;
  geojson: GeoJsonGeometry;
}

/** Vue d'un terrain servie par l'API (données rapides + contours des parcelles). */
export interface TerrainSummary {
  id: string;
  label: string;
  address: string;
  inseeCode: string;
  status: string;
  prixDemande: number | null;
  lienAnnonce: string | null;
  notes: string | null;
  surfaceTotaleM2: number;
  createdAt: string;
  parcelles: TerrainParcelleSummary[];
}
