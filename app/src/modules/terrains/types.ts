import type { GeoJsonGeometry } from '@/lib/geo/types';
import type { PenteData, PrixDvfData, RisquesData, ServicesData } from '@veriterra/enrichment';

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

/**
 * Entrée de modification d'un terrain (US-1.9). Tous les champs sont optionnels : seuls ceux
 * présents sont mis à jour (mise à jour partielle). Les données parcellaires faisant autorité
 * (contour, surface, IDU) ne sont pas éditables ici.
 */
export interface UpdateTerrainInput {
  label?: string;
  address?: string;
  status?: string;
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

/** Statut d'un bloc d'enrichissement, aligné sur l'enum Prisma EnrichmentStatus. */
export type EnrichmentBlockStatus = 'PENDING' | 'OK' | 'UNAVAILABLE' | 'ERROR';

/** Un bloc d'enrichissement tel que consommé par la fiche (provenance + payload typé). */
export interface EnrichmentBlockView {
  type: string;
  status: EnrichmentBlockStatus;
  source: string | null;
  sourceUrl: string | null;
  confidence: 'ELEVEE' | 'MOYENNE' | 'FAIBLE' | null;
  fetchedAt: string | null; // ISO 8601
  /** Payload normalisé, selon le type de bloc (discriminé par `type`). */
  data: RisquesData | PrixDvfData | PenteData | ServicesData | null;
  error: string | null;
}

/** Vue d'enrichissement d'un terrain : blocs attendus (existants ou en attente). */
export interface EnrichmentView {
  blocks: EnrichmentBlockView[];
  /** true tant qu'un bloc attendu n'a pas de statut terminal (pilote le polling client). */
  anyPending: boolean;
}

/** Catégories métier d'un document, alignées sur l'enum Prisma `DocumentType`. */
export const DOCUMENT_TYPES = [
  'ETUDE_SOL',
  'BORNAGE',
  'CERTIFICAT_URBANISME',
  'DEVIS',
  'DIAGNOSTIC',
  'AUTRE',
] as const;
export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number];

/** Nature d'une pièce jointe (photo affichée en grille, document listé), enum Prisma `DocumentKind`. */
export type DocumentKindValue = 'PHOTO' | 'DOCUMENT';

/** Une pièce jointe telle que consommée par la fiche (métadonnées + provenance). */
export interface DocumentSummary {
  id: string;
  kind: DocumentKindValue;
  docType: DocumentTypeValue | null;
  label: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string; // ISO 8601
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
