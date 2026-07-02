import type { Map as MaplibreMap, StyleSpecification } from 'maplibre-gl';

// Fonds de carte Veriterra, via la Géoplateforme IGN (data.geopf.fr, ouvert sans clé).
//
// Deux fonds au choix de l'utilisateur (basemap toggle) :
//  - « plan » : style vectoriel « gris » du Plan IGN (déjà épuré, proche Positron), forké
//    à chaud et recoloré à la palette Veriterra (applyVeriterraPlanTint). Vectoriel = net à
//    tout zoom et bâtiments extrudables plus tard (base 3D-ready, Tranche 4).
//  - « satellite » : orthophoto IGN (raster) + cadastre, pour juger le terrain réel.
// Dans les deux cas, les parcelles cadastrales sont présentes en calque.

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

/** Fond satellite complet et autonome : orthophoto IGN + calque cadastre. */
export const veriterraSatelliteStyle: StyleSpecification = {
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
    // Cadastre raster allégé (0.85 encombrait l'ortho) : le liseré de sélection ambre ressort mieux.
    { id: 'cadastre', type: 'raster', source: 'cadastre', paint: { 'raster-opacity': 0.6 } },
  ],
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
// Liseré cadastral assombri (l'ancien #B7BFD3 très clair/fin était quasi invisible).
const PLAN_CADASTRE_LINE = '#8A93AD';
const PLAN_CADASTRE_LAYER = 'veriterra-plan-cadastre';
const PLAN_PARCELLE_LABEL_LAYER = 'veriterra-plan-parcelle-num';
/** Source vectorielle du style gris IGN (voir gris.json). */
const PLAN_IGN_SOURCE = 'plan_ign';

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

/**
 * Ajoute sur le plan : (1) un liseré cadastral vectoriel net (parcelles en calque, source-layer
 * `parcellaire_parcelle` qui ne porte QUE la géométrie), et (2) les NUMÉROS de parcelle, portés
 * par la source-layer `toponyme_parcellaire_parcelle` (champ `texte`) que le style gris IGN ne
 * rend pas, d'où leur absence auparavant. Idempotent (chaque calque n'est ajouté qu'une fois).
 */
function ensurePlanCadastre(map: MaplibreMap): void {
  if (!map.getSource(PLAN_IGN_SOURCE)) return;

  // (1) Liseré des parcelles. minzoom 13 (US-1.12) : découpage visible dès l'échelle quartier.
  // Trait assombri et un peu épaissi par rapport à l'ancien (quasi invisible sous z15).
  if (!map.getLayer(PLAN_CADASTRE_LAYER)) {
    map.addLayer({
      id: PLAN_CADASTRE_LAYER,
      type: 'line',
      source: PLAN_IGN_SOURCE,
      'source-layer': 'parcellaire_parcelle',
      minzoom: 13,
      paint: {
        'line-color': PLAN_CADASTRE_LINE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 15, 0.9, 18, 1.8],
      },
    });
  }

  // (2) Numéros de parcelle (dès z16 pour éviter la surdensité), halo blanc pour la lisibilité.
  if (!map.getLayer(PLAN_PARCELLE_LABEL_LAYER)) {
    const font = firstSymbolFont(map);
    map.addLayer({
      id: PLAN_PARCELLE_LABEL_LAYER,
      type: 'symbol',
      source: PLAN_IGN_SOURCE,
      'source-layer': 'toponyme_parcellaire_parcelle',
      minzoom: 16,
      layout: {
        'text-field': ['get', 'texte'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 18, 12, 19, 13],
        'symbol-placement': 'point',
        ...(font ? { 'text-font': font } : {}),
      },
      paint: {
        'text-color': '#2F3B6E',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.4,
      },
    });
  }
}

/**
 * Recolore à chaud le plan IGN gris à la palette Veriterra et ajoute le calque cadastre.
 * À appeler après chaque chargement de style (`load` / `styledata`) quand le fond « plan »
 * est actif. Idempotent et tolérant : un id de couche IGN qui changerait est simplement
 * ignoré (le fond garde alors le gris IGN d'origine).
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
  ensurePlanCadastre(map);
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
