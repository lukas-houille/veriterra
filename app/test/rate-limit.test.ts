import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock hoisté de la connexion Redis partagée : on contrôle ce que renvoie INCR par appel.
const { getRedisConnection, incrMock, expireMock } = vi.hoisted(() => {
  const incrMock = vi.fn();
  const expireMock = vi.fn();
  return {
    incrMock,
    expireMock,
    getRedisConnection: vi.fn(() => ({ incr: incrMock, expire: expireMock })),
  };
});
vi.mock('@veriterra/shared', () => ({ getRedisConnection }));

const { withinOrgRateLimit, DEFAULT_RATE_LIMIT } = await import('@/lib/rate-limit');

describe('withinOrgRateLimit', () => {
  afterEach(() => {
    incrMock.mockReset();
    expireMock.mockReset();
    getRedisConnection.mockClear();
  });

  it('vrai sous la limite, faux au-delà', async () => {
    incrMock.mockResolvedValueOnce(1).mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    expect(await withinOrgRateLimit('org', 'x', 3)).toBe(true); // n=1
    expect(await withinOrgRateLimit('org', 'x', 3)).toBe(true); // n=3 (== limite)
    expect(await withinOrgRateLimit('org', 'x', 3)).toBe(false); // n=4 (> limite)
  });

  it("pose l'expiration seulement à la première requête (n===1)", async () => {
    incrMock.mockResolvedValueOnce(1);
    await withinOrgRateLimit('org', 'x', 5);
    expect(expireMock).toHaveBeenCalledTimes(1);
  });

  it("n'expire pas aux requêtes suivantes (n>1)", async () => {
    incrMock.mockResolvedValueOnce(2);
    await withinOrgRateLimit('org', 'x', 5);
    expect(expireMock).not.toHaveBeenCalled();
  });

  it('applique la limite par défaut sans argument', async () => {
    incrMock.mockResolvedValueOnce(DEFAULT_RATE_LIMIT).mockResolvedValueOnce(DEFAULT_RATE_LIMIT + 1);
    expect(await withinOrgRateLimit('org', 'x')).toBe(true);
    expect(await withinOrgRateLimit('org', 'x')).toBe(false);
  });

  it('best-effort : Redis injoignable => vrai (ne bloque pas une action légitime)', async () => {
    incrMock.mockRejectedValueOnce(new Error('redis down'));
    expect(await withinOrgRateLimit('org', 'x', 1)).toBe(true);
  });

  it("clé isolée par action et par organisation", async () => {
    incrMock.mockResolvedValue(1);
    await withinOrgRateLimit('org-42', 'enrich', 10);
    expect(incrMock).toHaveBeenCalledWith('rl:enrich:org-42');
  });
});
