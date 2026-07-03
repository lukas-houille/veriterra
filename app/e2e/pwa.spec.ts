import { expect, test } from '@playwright/test';

// PWA (US-6.1) : les ressources publiques (manifeste, service worker, page hors-ligne, icônes)
// doivent être servies SANS redirection d'authentification. C'est un garde de non-régression du
// périmètre du proxy : un 302 vers /sign-in casserait l'enregistrement du SW, `cache.addAll` et
// le chargement du manifeste. Ces ressources ne portent aucune donnée de tenant.

test('le manifeste est public et décrit une app installable', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as { name?: string; display?: string; icons?: unknown[] };
  expect(json.name).toBe('Veriterra');
  expect(json.display).toBe('standalone');
  expect(Array.isArray(json.icons) && json.icons.length).toBeTruthy();
});

test('le service worker est servi publiquement', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.ok()).toBeTruthy();
  expect(res.url()).not.toMatch(/\/sign-in/);
});

test('la page hors-ligne est publique (pas de redirection auth)', async ({ page }) => {
  await page.goto('/offline');
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByText('Vous êtes hors ligne')).toBeVisible();
});

test('la marque (utilisée sur la page de connexion) est servie publiquement', async ({ request }) => {
  const res = await request.get('/veriterra-mark.svg');
  expect(res.ok()).toBeTruthy();
  expect(res.url()).not.toMatch(/\/sign-in/);
  expect(res.headers()['content-type'] ?? '').toContain('svg');
});

// Non-régression du cœur de US-6.1 : hors-ligne, le service worker sert la coquille /offline
// pré-mise en cache (prouve la présence de la branche de repli de navigation ET la réussite de
// `cache.addAll` à l'installation). Le SW ne s'enregistre qu'en build de production, servi ici
// par `next start`.
test('hors-ligne, le service worker sert la coquille /offline', async ({ page, context }) => {
  await page.goto('/offline');
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 15_000,
  });

  await context.setOffline(true);
  await page.goto('/dashboard').catch(() => {
    // La navigation réseau échoue hors-ligne : c'est le SW qui doit répondre.
  });
  await expect(page.getByText('Vous êtes hors ligne')).toBeVisible();
  await context.setOffline(false);
});
