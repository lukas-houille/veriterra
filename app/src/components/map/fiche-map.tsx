'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { SelectedParcelle } from './selection-map';
import type { GeoJsonGeometry } from '@/lib/geo/types';

// Carte focalisée de la fiche terrain (onglet Ensoleillement) : réutilise EXACTEMENT le moteur de
// l'explorer (fond plan/satellite, relief, cadastre, analyse d'ensoleillement en place), en LECTURE
// SEULE et centrée sur les parcelles du terrain. Le bouton « agrandir » ouvre l'explorer plein écran
// focalisé sur ce terrain (avec retour à la fiche). La carte MapLibre est chargée côté client uniquement.

const SelectionMap = dynamic(() => import('./selection-map').then((m) => m.SelectionMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500">
      Chargement de la carte...
    </div>
  ),
});

export interface FicheParcelle {
  idu: string;
  geojson: GeoJsonGeometry;
  surfaceM2: number;
  commune: string;
  section: string;
  numero: string;
}

export function FicheMap({ terrainId, parcelles }: { terrainId: string; parcelles: FicheParcelle[] }) {
  const router = useRouter();
  const initialSelection: SelectedParcelle[] = parcelles.map((p) => ({
    idu: p.idu,
    geojson: p.geojson,
    surfaceM2: p.surfaceM2,
    commune: p.commune,
    section: p.section,
    numero: p.numero,
  }));

  return (
    <div className="relative h-[520px] max-h-[70vh] w-full overflow-hidden rounded-xl border border-border">
      <SelectionMap
        initialSelection={initialSelection}
        readOnly
        onExpand={() => router.push(`/terrains/nouveau?terrain=${terrainId}`)}
      />
    </div>
  );
}

export default FicheMap;
