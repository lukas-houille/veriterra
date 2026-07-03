import type { Map as MaplibreMap, StyleSpecification } from 'maplibre-gl';

// Fonds de carte Veriterra, via la Géoplateforme IGN (data.geopf.fr, ouvert sans clé).
//
// Deux fonds au choix de l'utilisateur (basemap toggle) :
//  - « plan » : style vectoriel « gris » du Plan IGN, forké à chaud et recoloré à la palette
//    Veriterra (applyVeriterraPlanTint). Son cadastre intégré est MASQUÉ (PLAN_CADASTRE_HIDDEN) au
//    profit de la surcouche unique ci-dessous.
//  - « satellite » : orthophoto IGN (raster) seule, pour juger le terrain réel.
// Le CADASTRE est une SURCOUCHE UNIQUE (ensureCadastreOverlay) posée par-dessus les deux fonds :
// tuiles vectorielles PCI IGN stylées par paliers (départements -> communes -> parcelles + numéros),
// calquées sur le viewer cadastre officiel. Basculer plan/satellite ne change ainsi que l'image de
// fond, le cadastre reste identique par-dessus.

const GEOPF_WMTS = 'https://data.geopf.fr/wmts';

// Style vectoriel « gris » publié par l'IGN (schéma PLAN.IGN). Source vectorielle nommée
// `plan_ign` (tuiles + glyphs IGN). On le recolore à chaud plutôt que de réécrire ses 400+
// couches, ce qui préserve la cartographie IGN (hiérarchie des routes, libellés) et suit
// automatiquement ses mises à jour.
const PLAN_IGN_GRIS_STYLE =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/gris.json';

function wmtsTiles(layer: string, format: string): string {
  return (
    `${GEOPF_WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
    `&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${encodeURIComponent(format)}` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
  );
}

/** Fond satellite : orthophoto IGN seule. Le cadastre est une surcouche partagée (ensureCadastreOverlay).
 *  Glyphs = endpoint IGN (le même que le plan) pour que les libellés de la surcouche cadastre
 *  s'affichent aussi sur le satellite (police Source Sans Pro servie par cet endpoint). */
export const veriterraSatelliteStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf',
  sources: {
    ortho: {
      type: 'raster',
      tiles: [wmtsTiles('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      tileSize: 256,
      attribution: 'IGN Géoplateforme',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'ortho', type: 'raster', source: 'ortho' }],
};

/** Identité de fond de carte choisie par l'utilisateur. */
export type BasemapId = 'plan' | 'satellite';

/** Fond par défaut : le plan Veriterra (moderne, sur-marque). */
export const DEFAULT_BASEMAP: BasemapId = 'plan';

/**
 * Style à passer à `map.setStyle` pour un fond donné : l'URL du plan vectoriel IGN (recoloré
 * ensuite par `applyVeriterraPlanTint`), ou l'objet satellite autonome.
 */
export function basemapStyle(id: BasemapId): string | StyleSpecification {
  return id === 'plan' ? PLAN_IGN_GRIS_STYLE : veriterraSatelliteStyle;
}

/** Compat : ancien export unique. Sert de fond initial neutre si besoin. */
export const veriterraMapStyle: StyleSpecification = veriterraSatelliteStyle;

// --- Recoloration « Positron Veriterra » du plan IGN gris -------------------------------

const PLAN_BG = '#F6F7FB';

// Source-layers du cadastre INTÉGRÉ au PLAN.IGN : masqués au profit de la surcouche PCI unique
// (sinon double cadastre). On GARDE toponyme_parcellaire_adresse_ponc (numéros de rue / adresses).
const PLAN_CADASTRE_HIDDEN = new Set([
  'parcellaire_parcelle',
  'parcellaire_section',
  'toponyme_parcellaire_parcelle',
  'toponyme_parcellaire_section',
]);

interface Tint {
  fill?: string;
  fillOutline?: string;
  line?: string;
  text?: string;
  halo?: string;
}

// Recolore les grands aplats et libellés du plan IGN vers des neutres teintés indigo, avec
// des routes blanches. Les couches non listées gardent le gris IGN (dégradé propre). Clé =
// `source-layer` du schéma PLAN.IGN.
const PLAN_TINT: Record<string, Tint> = {
  fond_opaque: { fill: PLAN_BG },
  oro_relief: { fill: '#ECEEF4' },
  ocs_vegetation_surf: { fill: '#E8EEEA', fillOutline: '#E8EEEA' },
  ocs_nature_sol_surf: { fill: '#EEF0F5' },
  hydro_surf: { fill: '#D4DDEF', fillOutline: '#D4DDEF' },
  hydro_reseau: { line: '#C2CEE5' },
  hydro_reseau_sou: { line: '#C2CEE5' },
  hydro_reseau_sup: { line: '#C2CEE5' },
  bati_zone_surf: { fill: '#EDEFF6' },
  bati_zai: { fill: '#E7E9F2', fillOutline: '#CDD3E4' },
  bati_surf: { fill: '#E6E9F2', fillOutline: '#CBD1E3' },
  bati_lin: { line: '#C8CDDE' },
  routier_route: { line: '#FFFFFF' },
  routier_route_sou: { line: '#EDEFF5' },
  routier_route_sup: { line: '#FFFFFF' },
  routier_surf: { fill: '#FFFFFF', fillOutline: '#E3E7F1' },
  routier_liaison: { line: '#FFFFFF' },
  routier_chemin: { line: '#E1E5F0' },
  routier_chemin_sou: { line: '#E7EAF2' },
  routier_chemin_sup: { line: '#E1E5F0' },
  ferre: { line: '#B6BCD0' },
  ferre_sou: { line: '#C4C9DA' },
  ferre_sup: { line: '#B6BCD0' },
  oro_courbe: { line: '#DBDFEB' },
  oro_lin: { line: '#DBDFEB' },
  limite_lin: { line: '#C4C9DA' },
  toponyme_localite_ponc: { text: '#2F3B6E', halo: '#FFFFFF' },
  toponyme_routier_odonyme_lin: { text: '#6C7488', halo: '#FFFFFF' },
  toponyme_routier_numero_lin: { text: '#7C86A2', halo: '#FFFFFF' },
  toponyme_routier_liaison_lin: { text: '#7C86A2', halo: '#FFFFFF' },
  // Contraste relevé (l'ancien #98A0B0 sur blanc était sous le seuil WCAG AA).
  toponyme_parcellaire_adresse_ponc: { text: '#6C7488', halo: '#FFFFFF' },
  toponyme_hydro_ponc: { text: '#7E8AA6', halo: '#FFFFFF' },
  toponyme_hydro_lin: { text: '#7E8AA6', halo: '#FFFFFF' },
  toponyme_bati_ponc: { text: '#5A6072', halo: '#FFFFFF' },
  toponyme_ocs_ponc: { text: '#5A6072', halo: '#FFFFFF' },
  toponyme_oro_ponc: { text: '#5A6072', halo: '#FFFFFF' },
  toponyme_oro_lin: { text: '#5A6072', halo: '#FFFFFF' },
  toponyme_limite_ponc: { text: '#4C5468', halo: '#FFFFFF' },
};

/** Police d'un calque symbole déjà présent (glyphs IGN), pour que nos libellés utilisent un jeu
 *  de caractères réellement servi par le style plan (sinon MapLibre ne rend rien). */
function firstSymbolFont(map: MaplibreMap): string[] | undefined {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    try {
      const font = map.getLayoutProperty(layer.id, 'text-font');
      // Uniquement un fontstack LITTÉRAL (tableau de noms de police) : une text-font data-driven
      // (expression par zoom/attribut) est aussi un Array mais pourrait référencer un champ absent
      // de notre source-layer et casser le rendu ; on la rejette.
      if (Array.isArray(font) && font.length > 0 && font.every((f) => typeof f === 'string')) {
        return font as string[];
      }
    } catch {
      // couche sans police explicite : on continue.
    }
  }
  return undefined;
}

// --- Surcouche cadastre UNIQUE (tuiles vectorielles PCI IGN) ------------------------------------
// Une seule source vectorielle PCI posée sur les DEUX fonds, stylée par paliers (comme le viewer
// cadastre officiel) : départements très dézoomé, communes (avec libellés), puis parcelles + numéros
// zoomé. Sans clé, CORS ouvert. Les numéros n'apparaissent qu'à z17 (limite des tuiles PCI). Les
// attributs (idu, numero, section, contenance) restent interrogeables pour la sélection.
const PCI_SOURCE = 'pci-cadastre';
const PCI_TILES = 'https://data.geopf.fr/tms/1.0.0/PCI/{z}/{x}/{y}.pbf';
const CADASTRE_LINE = '#8A93AD';
const CADASTRE_LABEL = '#2F3B6E';

/**
 * Installe (idempotent) la surcouche cadastre PCI sur le style courant, sur les deux fonds : d'abord
 * MASQUE le cadastre intégré du plan IGN s'il est présent (évite le doublon ; sans effet sur le
 * satellite), puis pose une source vectorielle et des calques filtrés par zoom (départements ->
 * communes + libellés -> parcelles -> numéros). À rappeler après chaque chargement de style (setStyle
 * remet tout à zéro). Les symboles reprennent une police réellement servie par le style courant
 * (firstSymbolFont) ou, en repli (satellite, sans calque symbole), Source Sans Pro Regular servie par
 * les glyphs IGN désormais configurés sur le style satellite.
 */
export function ensureCadastreOverlay(map: MaplibreMap): void {
  // Masque le cadastre INTÉGRÉ du plan IGN (parcelles/sections), remplacé par la surcouche PCI, pour
  // éviter le doublon. Les adresses (toponyme_parcellaire_adresse_ponc) ne sont PAS masquées. Sur le
  // satellite aucune de ces couches n'existe : la boucle est simplement sans effet.
  for (const layer of map.getStyle().layers ?? []) {
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
    if (sourceLayer && PLAN_CADASTRE_HIDDEN.has(sourceLayer)) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // couche absente ou renommée : on continue.
      }
    }
  }

  if (!map.getSource(PCI_SOURCE)) {
    map.addSource(PCI_SOURCE, {
      type: 'vector',
      tiles: [PCI_TILES],
      minzoom: 5,
      maxzoom: 19,
      attribution: 'Cadastre : IGN PCI (data.geopf.fr)',
    });
  }
  const font = firstSymbolFont(map) ?? ['Source Sans Pro Regular'];

  // Départements (très dézoomé) : contour discret.
  if (!map.getLayer('pci-departement')) {
    map.addLayer({
      id: 'pci-departement',
      type: 'line',
      source: PCI_SOURCE,
      'source-layer': 'departement',
      maxzoom: 11,
      paint: { 'line-color': CADASTRE_LINE, 'line-width': 0.8, 'line-opacity': 0.6 },
    });
  }
  // Communes : contour + libellé (nom_com).
  if (!map.getLayer('pci-commune')) {
    map.addLayer({
      id: 'pci-commune',
      type: 'line',
      source: PCI_SOURCE,
      'source-layer': 'commune',
      minzoom: 11,
      maxzoom: 16,
      paint: { 'line-color': CADASTRE_LINE, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.2] },
    });
  }
  if (!map.getLayer('pci-commune-label')) {
    map.addLayer({
      id: 'pci-commune-label',
      type: 'symbol',
      source: PCI_SOURCE,
      'source-layer': 'commune',
      minzoom: 11,
      maxzoom: 15,
      layout: {
        'text-field': ['get', 'nom_com'],
        'text-font': font,
        'text-size': 12,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.05,
      },
      paint: { 'text-color': CADASTRE_LABEL, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4 },
    });
  }
  // Parcelles (zoomé) : contour net.
  if (!map.getLayer('pci-parcelle')) {
    map.addLayer({
      id: 'pci-parcelle',
      type: 'line',
      source: PCI_SOURCE,
      'source-layer': 'parcelle',
      minzoom: 15,
      paint: { 'line-color': CADASTRE_LINE, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 18, 1.6] },
    });
  }
  // Numéros de parcelle (z17+, limite des tuiles PCI), portés par le point `localisant`.
  if (!map.getLayer('pci-numero')) {
    map.addLayer({
      id: 'pci-numero',
      type: 'symbol',
      source: PCI_SOURCE,
      'source-layer': 'localisant',
      minzoom: 17,
      layout: {
        'text-field': ['get', 'numero'],
        'text-font': font,
        'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 19, 13],
      },
      paint: { 'text-color': CADASTRE_LABEL, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4 },
    });
  }
}

/**
 * Recolore à chaud le plan IGN gris à la palette Veriterra (teinte seulement). À appeler après chaque
 * chargement de style (`load` / `styledata`) quand le fond « plan » est actif. Idempotent et tolérant :
 * un id de couche IGN qui changerait est simplement ignoré (le fond garde alors le gris IGN d'origine).
 * Le cadastre intégré du plan est masqué par `ensureCadastreOverlay` (couplé à la pose de la surcouche
 * PCI), PAS ici : un appelant qui ne pose pas la surcouche garde ainsi le cadastre natif du plan.
 */
export function applyVeriterraPlanTint(map: MaplibreMap): void {
  const layers = map.getStyle().layers ?? [];
  for (const layer of layers) {
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', PLAN_BG);
        continue;
      }
      const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
      if (!sourceLayer) continue;
      const tint = PLAN_TINT[sourceLayer];
      if (!tint) continue;
      if (layer.type === 'fill') {
        if (tint.fill) map.setPaintProperty(layer.id, 'fill-color', tint.fill);
        if (tint.fillOutline) map.setPaintProperty(layer.id, 'fill-outline-color', tint.fillOutline);
      } else if (layer.type === 'line') {
        if (tint.line) map.setPaintProperty(layer.id, 'line-color', tint.line);
      } else if (layer.type === 'symbol') {
        if (tint.text) map.setPaintProperty(layer.id, 'text-color', tint.text);
        if (tint.halo) map.setPaintProperty(layer.id, 'text-halo-color', tint.halo);
      } else if (layer.type === 'circle') {
        if (tint.fill) map.setPaintProperty(layer.id, 'circle-color', tint.fill);
      }
    } catch {
      // Couche IGN absente ou renommée : on continue, le rendu reste correct.
    }
  }
}

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
