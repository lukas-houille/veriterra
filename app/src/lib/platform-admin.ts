// Désignation des admins PLATEFORME (US-8.1), distincte du rôle d'organisation (OWNER/ADMIN/MEMBER,
// qui est scopé à une organisation). Source de vérité : la variable d'environnement serveur
// ADMIN_EMAILS (liste d'e-mails séparés par des virgules ou espaces). Config serveur uniquement
// (règle 6, jamais exposée au navigateur) ; le signal `platformAdmin` est ensuite stampé côté
// serveur dans le JWT (non falsifiable côté client). L'éligibilité repose sur un e-mail VÉRIFIÉ
// par l'IdP (le callback jwt n'accepte que `email_verified`), pour empêcher l'usurpation d'une
// adresse de l'allowlist. Fonction PURE et testable, sans dépendance serveur (le garde
// `requirePlatformAdmin` vit dans un module séparé pour rester testable ici).

/** Analyse une allowlist « a@x.fr, b@y.fr » en un ensemble d'e-mails normalisés (minuscules, sans vides). */
function parseAllowlist(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/**
 * Vrai si `email` figure dans l'allowlist des admins plateforme. `allowlist` par défaut =
 * process.env.ADMIN_EMAILS. Renvoie false si l'e-mail est absent ou si l'allowlist est vide
 * (aucun admin par défaut). Comparaison insensible à la casse et aux espaces.
 */
export function isPlatformAdmin(
  email: string | null | undefined,
  allowlist: string | undefined | null = process.env.ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  const set = parseAllowlist(allowlist);
  if (set.size === 0) return false;
  return set.has(email.trim().toLowerCase());
}
