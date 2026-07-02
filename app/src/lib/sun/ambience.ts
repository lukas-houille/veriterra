// Ambiance visuelle de la vue soleil pilotée par la SEULE hauteur du soleil (degrés). Pur et
// testable, aucune dépendance. On INTERPOLE en continu entre des ancres d'altitude pour que le
// crépuscule glisse doucement au curseur d'heure. IMPORTANT (règles 1 et 3) : ce n'est PAS de la
// donnée, seulement un voile visuel (ciel, teinte des façades et des ombres, nappe d'ambiance) ;
// aucune valeur affichée n'en dépend, la physique des ombres (longueur, direction) ne change pas.

export type OverlayBlend = 'soft-light' | 'multiply' | 'normal';

export interface Ambience {
  /** Spécification de ciel MapLibre (setSky). */
  sky: {
    'sky-color': string;
    'horizon-color': string;
    'sky-horizon-blend': number;
    'atmosphere-blend': number;
  };
  /** Teinte des façades (fill-extrusion-color). */
  buildingColor: string;
  /** Teinte des ombres au sol (fill-color). */
  shadowColor: string;
  /** Opacité des ombres au sol (fill-opacity). */
  shadowOpacity: number;
  /** Voile d'ambiance DOM au-dessus du canvas (réchauffe le jour/crépuscule, assombrit la nuit). */
  overlay: { color: string; opacity: number; blend: OverlayBlend };
}

interface Anchor {
  alt: number;
  skyColor: string;
  horizonColor: string;
  skyHorizonBlend: number;
  atmosphereBlend: number;
  buildingColor: string;
  shadowColor: string;
  shadowOpacity: number;
  overlayColor: string;
  overlayOpacity: number;
}

// Ancres du bas (nuit) vers le haut (plein jour). Valeurs de la conception (audit soleil).
const ANCHORS: Anchor[] = [
  { alt: -6, skyColor: '#0B1026', horizonColor: '#1B2547', skyHorizonBlend: 0.6, atmosphereBlend: 0.3, buildingColor: '#363E58', shadowColor: '#2A2C4A', shadowOpacity: 0.0, overlayColor: '#0B1026', overlayOpacity: 0.5 },
  { alt: 0, skyColor: '#24365E', horizonColor: '#E8763C', skyHorizonBlend: 0.8, atmosphereBlend: 0.5, buildingColor: '#7A6B78', shadowColor: '#2A2C4A', shadowOpacity: 0.18, overlayColor: '#E8763C', overlayOpacity: 0.22 },
  { alt: 6, skyColor: '#6E86B8', horizonColor: '#FFB86B', skyHorizonBlend: 0.8, atmosphereBlend: 0.55, buildingColor: '#E4C596', shadowColor: '#33314E', shadowOpacity: 0.2, overlayColor: '#F4A24C', overlayOpacity: 0.18 },
  { alt: 20, skyColor: '#9CC6F2', horizonColor: '#E4EFFA', skyHorizonBlend: 0.8, atmosphereBlend: 0.6, buildingColor: '#CDD2DE', shadowColor: '#1E243C', shadowOpacity: 0.28, overlayColor: '#E4EFFA', overlayOpacity: 0.03 },
  { alt: 60, skyColor: '#7FB8F2', horizonColor: '#EAF3FB', skyHorizonBlend: 0.8, atmosphereBlend: 0.6, buildingColor: '#C7CCDA', shadowColor: '#1A2036', shadowOpacity: 0.3, overlayColor: '#EAF3FB', overlayOpacity: 0.0 },
];

const FIRST: Anchor = ANCHORS[0]!;
const LAST: Anchor = ANCHORS[ANCHORS.length - 1]!;

interface Rgb {
  r: number;
  g: number;
  b: number;
}
function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function toHex2(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `#${toHex2(lerp(x.r, y.r, t))}${toHex2(lerp(x.g, y.g, t))}${toHex2(lerp(x.b, y.b, t))}`;
}

/** Mode de fusion du voile : multiply la nuit (extinction), soft-light au jour/crépuscule, sinon aucun. */
function overlayBlend(alt: number): OverlayBlend {
  if (alt < -3) return 'multiply';
  if (alt < 8) return 'soft-light';
  return 'normal';
}

/**
 * Ambiance visuelle pour une hauteur de soleil (degrés). Interpole entre les ancres ; borne aux
 * extrêmes (nuit profonde sous -6°, plein jour au-delà de 60°).
 */
export function ambienceForAltitude(altitudeDeg: number): Ambience {
  const alt = Math.min(LAST.alt, Math.max(FIRST.alt, altitudeDeg));

  // Ancres encadrant `alt`.
  let lo: Anchor = FIRST;
  let hi: Anchor = LAST;
  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const a = ANCHORS[i]!;
    const b = ANCHORS[i + 1]!;
    if (alt >= a.alt && alt <= b.alt) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.alt - lo.alt;
  const t = span === 0 ? 0 : (alt - lo.alt) / span;

  return {
    sky: {
      'sky-color': lerpHex(lo.skyColor, hi.skyColor, t),
      'horizon-color': lerpHex(lo.horizonColor, hi.horizonColor, t),
      'sky-horizon-blend': lerp(lo.skyHorizonBlend, hi.skyHorizonBlend, t),
      'atmosphere-blend': lerp(lo.atmosphereBlend, hi.atmosphereBlend, t),
    },
    buildingColor: lerpHex(lo.buildingColor, hi.buildingColor, t),
    shadowColor: lerpHex(lo.shadowColor, hi.shadowColor, t),
    shadowOpacity: lerp(lo.shadowOpacity, hi.shadowOpacity, t),
    overlay: {
      color: lerpHex(lo.overlayColor, hi.overlayColor, t),
      opacity: lerp(lo.overlayOpacity, hi.overlayOpacity, t),
      blend: overlayBlend(alt),
    },
  };
}
