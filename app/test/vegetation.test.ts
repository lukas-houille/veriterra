import { describe, expect, it } from 'vitest';
import { parseCanopies } from '@/lib/geo/vegetation';

function way(tags: Record<string, string>, coords: number[][]) {
  return { type: 'way', id: 1, tags, geometry: coords.map(([lon, lat]) => ({ lat, lon })) };
}

describe('parseCanopies', () => {
  it('convertit une way boisée fermée en Polygon avec hauteur approximée par type', () => {
    const payload = { elements: [way({ natural: 'wood' }, [[4, 45], [4.001, 45], [4.001, 45.001], [4, 45]])] };
    const out = parseCanopies(payload);
    expect(out).toHaveLength(1);
    expect(out[0]!.geometry.type).toBe('Polygon');
    expect(out[0]!.hauteur).toBe(10); // canopée bois/forêt approximée (basse, pour ne pas sur-évaluer l'ombre)
  });

  it('ferme l\'anneau si nécessaire et attribue la hauteur des broussailles', () => {
    const payload = { elements: [way({ natural: 'scrub' }, [[4, 45], [4.001, 45], [4.001, 45.001]])] };
    const out = parseCanopies(payload);
    expect(out).toHaveLength(1);
    expect(out[0]!.hauteur).toBe(2);
    const ring = out[0]!.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]); // anneau fermé
  });

  it('ignore les ways non boisées ou trop courtes', () => {
    const payload = {
      elements: [
        way({ building: 'yes' }, [[4, 45], [4.001, 45], [4.001, 45.001], [4, 45]]),
        way({ natural: 'wood' }, [[4, 45], [4.001, 45]]),
      ],
    };
    expect(parseCanopies(payload)).toEqual([]);
  });

  it('renvoie [] pour un payload illisible', () => {
    expect(parseCanopies(null)).toEqual([]);
    expect(parseCanopies({ elements: 'nope' })).toEqual([]);
  });
});
