// Valide un identifiant de route UUID (colonnes @db.Uuid) avant qu'il n'atteigne Postgres :
// une valeur malformée y lèverait une erreur SQL (22P02) remontée en 500 au lieu d'un 404 propre.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
