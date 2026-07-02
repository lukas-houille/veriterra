import { expect, test } from '@playwright/test';

// La surface documents (upload/download/suppression) est protégée : sans session, la requête
// est interceptée par le proxy (authorized default-deny) et redirigée vers la connexion.
// Isolation tenant et round-trip complet sont couverts par les tests d'intégration.
test('documents API is behind auth (no session redirects to sign-in)', async ({ page }) => {
  await page.goto('/api/terrains/00000000-0000-0000-0000-000000000000/documents');
  await expect(page).toHaveURL(/\/sign-in/);
});
