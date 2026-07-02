/** Géométrie GeoJSON (Polygon ou MultiPolygon) en WGS84 (SRID 4326). */
export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

/** Candidat d'autocomplétion d'adresse (Base Adresse Nationale). */
export interface BanFeature {
  label: string;
  citycode: string; // code INSEE de la commune
  city: string;
  postcode: string;
  /** Granularité du résultat BAN : housenumber, street, locality ou municipality (défaut ''). */
  type: string;
  lon: number;
  lat: number;
  score: number;
}

/** Données parcellaires cadastrales normalisées, faisant autorité (IGN API Carto). */
export interface ParcelleData {
  idu: string;
  commune: string;
  section: string;
  numero: string;
  surfaceM2: number;
  geojson: GeoJsonGeometry;
  source: string;
  fetchedAt: string; // ISO 8601
}
