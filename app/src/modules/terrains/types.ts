import type { GeoJsonGeometry } from '@/lib/geo/types';

/**
 * Parcelle envoyée par le client à la création. La donnée provient de la requête
 * géométrique API Carto (au clic) qui fait autorité (IGN) et renvoie la géométrie, l'IDU,
 * la surface et la commune. Le serveur valide la géométrie avant de la persister.
 */
export interface ParcelleInput {
  idu: string;
  commune: string;
  section: string;
  numero: string;
  surfaceM2: number;
  geojson: GeoJsonGeometry;
}

/** Entrée de création d'un terrain. */
export interface CreateTerrainInput {
  label?: string;
  address: string;
  inseeCode: string;
  parcelles: ParcelleInput[];
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
