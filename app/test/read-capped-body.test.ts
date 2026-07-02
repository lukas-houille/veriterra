import { describe, expect, it } from 'vitest';
import { readCappedBody } from '@/lib/http';

// Flux découpé en petits morceaux pour simuler un corps de requête chunked.
function streamOf(bytes: Uint8Array, chunkSize = 4): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(i, i + chunkSize));
      i += chunkSize;
    },
  });
}

describe('readCappedBody', () => {
  it('lit un corps sous la borne à l\'identique', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const out = await readCappedBody({ body: streamOf(data, 3) }, 100);
    expect(out).not.toBeNull();
    expect(Array.from(out!)).toEqual(Array.from(data));
  });

  it('abandonne (null) dès que la taille dépasse la borne', async () => {
    const data = new Uint8Array(1000);
    const out = await readCappedBody({ body: streamOf(data, 64) }, 256);
    expect(out).toBeNull();
  });

  it('renvoie un tableau vide pour un corps absent', async () => {
    const out = await readCappedBody({ body: null }, 100);
    expect(out).toEqual(new Uint8Array(0));
  });
});
