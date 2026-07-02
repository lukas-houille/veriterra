// Récupération HTTP partagée par les clients de sources. Distingue "source atteinte mais sans
// donnée" (transient=false, ex. 404, à traiter comme une absence légitime) de "source
// injoignable" (transient=true : erreur réseau ou 5xx, à réessayer et ne pas mettre en cache).
// Ne throw jamais.
export async function safeGet(
  url: string,
  signal?: AbortSignal,
): Promise<{ value: unknown | null; transient: boolean }> {
  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (res.status >= 500) return { value: null, transient: true };
    if (!res.ok) return { value: null, transient: false };
    return { value: (await res.json()) as unknown, transient: false };
  } catch {
    return { value: null, transient: true };
  }
}
