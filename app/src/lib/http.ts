// Lecture bornée d'un corps de requête. Garde anti-DoS : `req.formData()` bufferise tout le
// corps en mémoire, et la borne sur l'en-tête Content-Length est contournable (requête chunked
// ou HTTP/2 sans longueur déclarée). On lit donc le flux nous-mêmes en comptant les octets et en
// abandonnant dès le dépassement, avant tout parsing multipart.

/**
 * Lit entièrement `req.body` en mémoire, mais abandonne (renvoie null) dès que la taille dépasse
 * `cap` octets. Renvoie un tableau vide si le corps est absent.
 */
export async function readCappedBody(
  req: { body: ReadableStream<Uint8Array> | null },
  cap: number,
): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > cap) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
