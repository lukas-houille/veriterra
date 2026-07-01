import type { StyleSpecification } from 'maplibre-gl';

// Style MapLibre Veriterra : fond orthophoto IGN + calque cadastral, via la Géoplateforme
// (data.geopf.fr, WMTS ouvert sans clé depuis 2024). Endpoints à re-vérifier à
// l'implémentation (noms de couches, formats). deck.gl arrivera en Tranche 4 (soleil/3D).

const GEOPF_WMTS = 'https://data.geopf.fr/wmts';

function wmtsTiles(layer: string, format: string): string {
  return (
    `${GEOPF_WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
    `&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${encodeURIComponent(format)}` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
  );
}

export const veriterraMapStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    ortho: {
      type: 'raster',
      tiles: [wmtsTiles('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      tileSize: 256,
      attribution: 'IGN Géoplateforme',
      maxzoom: 19,
    },
    cadastre: {
      type: 'raster',
      tiles: [wmtsTiles('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png')],
      tileSize: 256,
      attribution: 'IGN Cadastre',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'ortho', type: 'raster', source: 'ortho' },
    { id: 'cadastre', type: 'raster', source: 'cadastre', paint: { 'raster-opacity': 0.75 } },
  ],
};

/** Centre par défaut (France métropolitaine) et zoom initial. */
export const FRANCE_CENTER: [number, number] = [2.4, 46.6];
export const FRANCE_ZOOM = 5;

/** Couleurs de statut (alignées sur `StatusPin` de @veriterra/ui) pour les pins du dashboard. */
export const STATUS_COLORS: Record<string, string> = {
  A_ETUDIER: '#98a0b0',
  PROMETTEUR: '#2e7d5b',
  RESERVE: '#db9b2c',
  ECARTE: '#c0432e',
};
