import { expect, test } from '@playwright/test';

// Pipeline de statuts (US-5.1). Le changement de statut passe par `PATCH /api/terrains/[id]`, protégé :
// sans session, la requête est interceptée (proxy default-deny) et n'aboutit pas. Le changement EFFECTIF
// (validation des 7 états + isolation tenant RLS + réinitialisation à A_CONTACTER) est couvert par les
// tests d'intégration `terrains-service.test.ts` sur base réelle ; l'UI (StatusChanger) est un simple
// appel PATCH + router.refresh().
test("le changement de statut est derrière l'auth", async ({ request }) => {
  const res = await request.patch('/api/terrains/00000000-0000-0000-0000-000000000000', {
    data: { status: 'A_VISITER' },
    maxRedirects: 0,
  });
  // 302 (redirection vers /sign-in) ou 401 : dans tous les cas, pas de succès sans session.
  expect(res.ok()).toBeFalsy();
});

// La fiche terrain (qui porte le StatusChanger dans son en-tête) reste default-deny.
test("la fiche (changeur de statut) est derrière l'auth", async ({ page }) => {
  await page.goto('/terrains/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/sign-in/);
});
