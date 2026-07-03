import { expect, test } from '@playwright/test';

// Outils de mesure de la carte (US-1.5). Comme le reste de l'app, l'explorer est default-deny :
// sans session, le proxy redirige vers la connexion.
test("l'explorer (outils de mesure) est derrière l'auth", async ({ page }) => {
  await page.goto('/terrains/nouveau');
  await expect(page).toHaveURL(/\/sign-in/);
});

// Parcours authentifié : ouvrir « Mesurer », vérifier les 4 outils et l'état actif, puis fermer.
// Le panneau de mesure est rendu depuis l'état React (indépendant du canvas WebGL) : on ne teste
// donc PAS le clic de mesure sur la carte MapLibre (trop instable), seulement le câblage de l'UI.
// Ne tourne qu'avec le mock OIDC (E2E_OIDC=1).
test('outils de mesure : ouvrir, choisir un outil, fermer', async ({ page }) => {
  test.skip(!process.env.E2E_OIDC, 'requires a mock OIDC provider (E2E_OIDC=1)');

  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Pocket ID/i }).click();

  // Selon l'état du compte de test, on atterrit sur l'onboarding (nouveau) ou le tableau de bord.
  await page.waitForURL(/\/(onboarding|dashboard)/);
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: /Passer/i }).click();
    await page.waitForURL(/\/dashboard/);
  }

  await page.goto('/terrains/nouveau');
  // Rebond éventuel vers l'onboarding si l'explorer l'exige.
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: /Passer/i }).click();
    await page.goto('/terrains/nouveau');
  }

  const mesurer = page.getByRole('button', { name: 'Mesurer', exact: true });
  await expect(mesurer).toBeVisible({ timeout: 15_000 });
  await mesurer.click();

  // Les 4 outils sont proposés.
  for (const label of ['Distance', 'Surface', 'Dénivelé', 'Recul']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  // Sélectionner « Dénivelé » : bouton actif + consigne affichée.
  const deniv = page.getByRole('button', { name: 'Dénivelé', exact: true });
  await deniv.click();
  await expect(deniv).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Cliquez deux points/)).toBeVisible();

  // Fermer : le déclencheur « Mesurer » réapparaît.
  await page.getByRole('button', { name: /Fermer les outils de mesure/ }).click();
  await expect(mesurer).toBeVisible();
});
