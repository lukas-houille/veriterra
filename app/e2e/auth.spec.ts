import { expect, test } from '@playwright/test';

// US-0.1 : aucune page protégée n'est accessible sans session.
test('unauthenticated access to a protected route redirects to sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: /Pocket ID/i })).toBeVisible();
});

// La landing est publique (seule page accessible sans session).
test('landing page is public', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: /Acheter un terrain en confiance/i }),
  ).toBeVisible();
});

// Parcours OIDC complet. Ne tourne qu'avec un mock OIDC (E2E_OIDC=1), configuré en login
// non interactif pour que l'étape authorize redirige directement.
test('sign in via OIDC, onboarding, dashboard, then sign out', async ({ page }) => {
  test.skip(!process.env.E2E_OIDC, 'requires a mock OIDC provider (E2E_OIDC=1)');

  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Pocket ID/i }).click();

  // Un nouvel utilisateur n'a pas de projet : le tableau de bord renvoie vers l'onboarding.
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: /Votre projet/i })).toBeVisible();

  await page.getByRole('button', { name: /Passer/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Terrains du projet/i })).toBeVisible();

  await page.getByRole('button', { name: /déconnecter/i }).click();
  await expect(page).toHaveURL(/\/$/);
});
