import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlatformAdmin } from '@/lib/platform-admin';

// Mocks hoistés pour tester le garde serveur sans charger le vrai module auth (NextAuth + Prisma).
const { authMock, redirectMock, notFoundMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: notFoundMock }));

// Import après les mocks (require-platform-admin importe @/auth et next/navigation).
const { requirePlatformAdmin } = await import('@/lib/require-platform-admin');

describe('isPlatformAdmin', () => {
  it("renvoie false si l'e-mail est absent", () => {
    expect(isPlatformAdmin(undefined, 'a@x.fr')).toBe(false);
    expect(isPlatformAdmin(null, 'a@x.fr')).toBe(false);
    expect(isPlatformAdmin('', 'a@x.fr')).toBe(false);
  });

  it("renvoie false si l'allowlist est vide (aucun admin par défaut)", () => {
    expect(isPlatformAdmin('a@x.fr', '')).toBe(false);
    expect(isPlatformAdmin('a@x.fr', '   ')).toBe(false);
  });

  it('est insensible à la casse et aux espaces', () => {
    expect(isPlatformAdmin('A@X.FR', ' a@x.fr ')).toBe(true);
    expect(isPlatformAdmin(' a@x.fr ', 'A@X.FR')).toBe(true);
  });

  it('gère les séparateurs virgule et espaces multiples', () => {
    const list = 'a@x.fr, b@y.fr  c@z.fr';
    expect(isPlatformAdmin('b@y.fr', list)).toBe(true);
    expect(isPlatformAdmin('c@z.fr', list)).toBe(true);
    expect(isPlatformAdmin('d@w.fr', list)).toBe(false);
  });
});

describe('requirePlatformAdmin', () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    notFoundMock.mockClear();
  });

  it('redirige un anonyme vers /sign-in', async () => {
    authMock.mockResolvedValue(null);
    await expect(requirePlatformAdmin()).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/sign-in');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('renvoie notFound pour un utilisateur non-admin-plateforme', async () => {
    authMock.mockResolvedValue({ user: { platformAdmin: false } });
    await expect(requirePlatformAdmin()).rejects.toThrow('NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('renvoie la session pour un admin plateforme', async () => {
    const session = { user: { id: 'u1', platformAdmin: true } };
    authMock.mockResolvedValue(session);
    await expect(requirePlatformAdmin()).resolves.toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
