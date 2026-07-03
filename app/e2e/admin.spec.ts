import { expect, test } from '@playwright/test';

// Section admin plateforme (US-8.1) : default-deny. Sans session, le proxy redirige vers la
// connexion. Le gate fin (non-admin connecté -> 404) et le rendu des tables sont couverts par les
// tests unitaires (platform-admin.test.ts) ; l'e2e vérifie la frontière d'authentification.
for (const path of ['/admin', '/admin/organisations', '/admin/comptes']) {
  test(`${path} est derrière l'authentification`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}
