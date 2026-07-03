/*
 * Service worker Veriterra, écrit à la main (pas de lib) pour garder un périmètre hors-ligne
 * EXPLICITE et BORNÉ (risque R12, règles 1 et 2).
 *
 * Politique volontairement conservatrice :
 *  - Même origine UNIQUEMENT. Les tuiles cartographiques (IGN, Terrarium, Overpass) sont
 *    cross-origin : jamais interceptées, jamais mises en cache (raster lourd exclu, R12).
 *  - `/api/*` n'est JAMAIS mis en cache : les données sont sourcées, datées et scopées par
 *    organisation (RLS). On ne sert jamais une donnée périmée ni potentiellement inter-tenant
 *    depuis un cache partagé par le profil de navigateur (règles 1 et 2).
 *  - Les NAVIGATIONS (pages HTML authentifiées, avec données de tenant) ne sont PAS mises en
 *    cache non plus : hors-ligne, on renvoie une page « hors ligne » neutre. La consultation
 *    hors-ligne des fiches déjà chargées demande une décision d'isolation (purge à la
 *    déconnexion ou cache par utilisateur) et sera un lot séparé.
 *  - Seuls les ASSETS STATIQUES sans donnée de tenant sont mis en cache (coquille applicative) :
 *    `/_next/static/*` (immuables, hachés) et quelques fichiers de marque.
 */

// Version dérivée du paramètre `?v=` d'enregistrement (identifiant de build injecté par le
// client). Elle change à chaque déploiement : le navigateur voit un nouveau scriptURL, réinstalle
// le SW (re-précache la coquille /offline fraîche) et `activate` purge l'ancien cache versionné.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const STATIC_CACHE = `veriterra-static-${VERSION}`;
const OFFLINE_URL = '/offline';

// Coquille pré-mise en cache : la page hors-ligne et l'icône. Volontairement minimal.
const PRECACHE = [OFFLINE_URL, '/icon.svg'];

// Assets statiques sans donnée de tenant, sûrs à mettre en cache (cache-first).
function isCacheableStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/apple-icon.png' ||
    url.pathname === '/manifest.webmanifest' ||
    /^\/(icon-\d+|icon-maskable-\d+|veriterra-mark(-dark)?)\.(png|svg)$/.test(url.pathname)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Même origine uniquement (les ressources cross-origin passent au réseau, non gérées).
  if (url.origin !== self.location.origin) return;

  // Les API ne sont jamais mises en cache (fraîcheur + isolation).
  if (url.pathname.startsWith('/api/')) return;

  // Navigations : réseau d'abord ; hors-ligne, page « hors ligne » neutre (pas de HTML tenant en cache).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  // Assets statiques : cache d'abord, complété au réseau (stale-while-revalidate léger).
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fromNetwork = fetch(request)
          .then((response) => {
            // `!response.redirected` : ne jamais mettre en cache le HTML d'une redirection auth
            // (302 vers /sign-in) sous l'URL d'un asset statique (empoisonnement de cache).
            if (response && response.status === 200 && response.type === 'basic' && !response.redirected) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fromNetwork;
      }),
    );
  }
  // Tout le reste (même origine, non-API, non-navigation, non-statique) : réseau par défaut.
});
