import { expect, test } from '@playwright/test';

// Override manuel du score par critère (US-3.1). L'écriture passe par
// `PUT/DELETE /api/terrains/[id]/score-overrides`, protégé : sans session, la requête est interceptée
// (proxy default-deny) et n'aboutit pas. Le comportement EFFECTIF (capture de la valeur d'origine,
// re-renormalisation du global, isolation tenant RLS, validation du critère et des bornes 0-100) est
// couvert par `terrains-service.test.ts` et `isolation.test.ts` sur base réelle ; l'UI
// (ScoreCriteriaEditor) est un simple appel fetch + router.refresh().

test("poser un override est derrière l'auth", async ({ request }) => {
  const res = await request.put('/api/terrains/00000000-0000-0000-0000-000000000000/score-overrides', {
    data: { criterion: 'prix', score: 80 },
    maxRedirects: 0,
  });
  // 302 (redirection vers /sign-in) ou 401 : dans tous les cas, pas de succès sans session.
  expect(res.ok()).toBeFalsy();
});

test("retirer un override est derrière l'auth", async ({ request }) => {
  const res = await request.delete(
    '/api/terrains/00000000-0000-0000-0000-000000000000/score-overrides?criterion=prix',
    { maxRedirects: 0 },
  );
  expect(res.ok()).toBeFalsy();
});

// La fiche terrain (qui porte l'éditeur de score) reste default-deny.
test("la fiche (éditeur de score) est derrière l'auth", async ({ page }) => {
  await page.goto('/terrains/00000000-0000-0000-0000-000000000000');
  await expect(page).toHaveURL(/\/sign-in/);
});
