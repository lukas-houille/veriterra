import { expect, test } from '@playwright/test';

// Parcours « Ensoleillement » de la fiche terrain et son ouverture « en grand » dans l'explorer
// focalisé (?terrain=<id>). Comme tout le reste de l'app, ces écrans sont default-deny : sans
// session, le proxy (callback authorized) redirige vers la connexion. Le rendu carte MapLibre (WebGL)
// et le cadrage sur la parcelle ne sont pas testés en e2e (le cadrage, pur, l'est par bbox.test.ts).
test('la fiche terrain (onglet Ensoleillement) est derrière l\'auth', async ({ page }) => {
  await page.goto('/terrains/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('l\'explorer focalisé sur un terrain (?terrain) est derrière l\'auth', async ({ page }) => {
  await page.goto('/terrains/nouveau?terrain=00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/sign-in/);
});
