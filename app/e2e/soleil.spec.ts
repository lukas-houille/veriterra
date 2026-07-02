import { expect, test } from '@playwright/test';

// La route des bâtiments (onglet Soleil) est protégée : sans session, le proxy redirige vers la
// connexion. Le calcul d'ombres et la classification sans-hauteur sont couverts par les tests
// unitaires (shadows.test.ts) ; le rendu WebGL 3D n'est pas testé en e2e.
test('buildings API is behind auth (no session redirects to sign-in)', async ({ page }) => {
  await page.goto('/api/terrains/00000000-0000-0000-0000-000000000000/buildings');
  await expect(page).toHaveURL(/\/sign-in/);
});
