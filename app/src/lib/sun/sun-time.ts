// Conversion heure/saison <-> timestamp pour l'analyse d'ensoleillement : un epoch ms local dont on
// dérive la position du soleil (SunCalc) à la latitude/longitude de la vue. Pur et testable. Le
// curseur « saison » est un jour de l'année (0..364) mappé sur une date ; le curseur « heure » des
// minutes du jour (0..1439). On ignore le 29/02 pour un curseur d'année stable.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Epoch ms (heure locale) depuis une date AAAA-MM-JJ et des minutes du jour, d'où l'on dérive la position du soleil (SunCalc). */
export function timestampFor(dateStr: string, minutes: number): number {
  const hh = pad(Math.floor(minutes / 60));
  const mm = pad(minutes % 60);
  return new Date(`${dateStr}T${hh}:${mm}:00`).getTime();
}

/** Date AAAA-MM-JJ pour un jour de l'année (0..364) sur une année donnée. */
export function dateForDayOfYear(year: number, dayIndex: number): string {
  const clamped = Math.max(0, Math.min(364, Math.round(dayIndex)));
  const d = new Date(year, 0, 1 + clamped);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Index du jour de l'année (0..364) d'une date AAAA-MM-JJ, pour positionner le curseur saison. */
export function dayOfYear(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(y, 0, 1).getTime();
  const day = new Date(y, m - 1, d).getTime();
  return Math.max(0, Math.min(364, Math.round((day - start) / 86_400_000)));
}

/** Dates repères d'une année (hémisphère nord) pour sauter aux extrêmes du soleil. Approximation à
 * un jour près (les instants exacts varient), suffisante pour visualiser les cas limites. */
export interface SeasonMarks {
  printemps: string;
  ete: string;
  automne: string;
  hiver: string;
}
export function seasonMarks(year: number): SeasonMarks {
  return {
    printemps: `${year}-03-20`, // équinoxe de printemps
    ete: `${year}-06-21`, // solstice d'été (jour le plus long)
    automne: `${year}-09-22`, // équinoxe d'automne
    hiver: `${year}-12-21`, // solstice d'hiver (jour le plus court)
  };
}

/** Libellé de saison (hémisphère nord) d'une date, pour l'affichage du curseur. */
export function seasonLabel(dateStr: string): string {
  const m = Number(dateStr.split('-')[1] ?? '1');
  if (m === 12 || m <= 2) return 'Hiver';
  if (m <= 5) return 'Printemps';
  if (m <= 8) return 'Été';
  return 'Automne';
}
