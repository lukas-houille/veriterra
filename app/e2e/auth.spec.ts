import { expect, test } from '@playwright/test';

// US-0.1: no protected page is reachable without a session.
test('unauthenticated access to a protected route redirects to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: /Pocket ID/i })).toBeVisible();
});

// Full OIDC round-trip. Runs only when a mock OIDC provider is wired (E2E_OIDC=1),
// configured with non-interactive login so the authorize step redirects straight back.
test('sign in via OIDC, reach the protected home, then sign out', async ({ page }) => {
  test.skip(!process.env.E2E_OIDC, 'requires a mock OIDC provider (E2E_OIDC=1)');

  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Pocket ID/i }).click();

  await expect(page).toHaveURL(/\/$/);
  // La home protégée est désormais le dashboard des terrains (Tranche 1).
  await expect(page.getByRole('heading', { name: /Terrains suivis/i })).toBeVisible();

  await page.getByRole('button', { name: /déconnecter/i }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});
