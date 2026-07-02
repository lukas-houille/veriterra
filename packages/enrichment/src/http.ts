// Délai maximal d'un appel de source : au-delà, on abandonne (transitoire, réessayable). Sans
// cela, une source lente (Overpass) peut pendre indéfiniment et affamer les enrichissements suivants.
const DEFAULT_TIMEOUT_MS = 12_000;

// Récupération HTTP partagée par les clients de sources. Distingue "source atteinte mais sans
// donnée" (transient=false, ex. 404, à traiter comme une absence légitime) de "source
// injoignable" (transient=true : erreur réseau, 5xx, 429 rate-limit, ou délai dépassé, à réessayer
// et ne pas mettre en cache). Ne throw jamais. `headers` optionnel (certaines API, comme Overpass
// OSM, exigent un User-Agent).
export async function safeGet(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<{ value: unknown | null; transient: boolean }> {
  try {
    const init: RequestInit = {};
    const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    init.signal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    if (headers) init.headers = headers;
    const res = await fetch(url, init);
    // 5xx (serveur) et 429 (rate-limit) sont transitoires : réessayer, ne pas cacher.
    if (res.status >= 500 || res.status === 429) return { value: null, transient: true };
    if (!res.ok) return { value: null, transient: false };
    return { value: (await res.json()) as unknown, transient: false };
  } catch {
    return { value: null, transient: true };
  }
}
