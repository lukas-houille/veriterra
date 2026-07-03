// Formateurs partagés de la section admin (dates FR, tailles en octets métriques).
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

/** Taille lisible en octets (o, Ko, Mo, Go, To), base 1024. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / 1024 ** i;
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
