# CLAUDE.md — Veriterra

CRM de prospection foncière auto-hébergé : à partir d'une adresse, l'outil localise la parcelle, génère une synthèse façon Parcello (cadastre, PLU, risques, prix), permet d'explorer en 3D les ombres portées du relief et des bâtiments, et suit/compare les terrains visités.

## Stack
- App web et API : Next.js (App Router) + TypeScript
- UI : Tailwind CSS + shadcn/ui (tokens issus du design system, voir docs/design-system.md)
- Carte et 3D : MapLibre GL JS + deck.gl, Turf.js (mesures), SunCalc (soleil)
- Base : PostgreSQL + PostGIS, accès via Prisma
- Cache et file de jobs : Redis
- Worker de tâches de fond : process séparé (enrichissement, parsing PLU IA, précalcul ombres)
- Auth : Auth.js en OIDC générique (Pocket ID)
- Packaging : PWA, Docker Compose, façade Caddy (TLS)

## Commandes (à maintenir à jour)
- Dev : `docker compose up` (stack locale) puis `pnpm dev`
- Tests unitaires : `pnpm test`
- Tests fonctionnels : `pnpm test:e2e` (Playwright)
- Lint et types : `pnpm lint && pnpm typecheck`
- Migration base : `pnpm db:migrate`

## Règles inviolables
1. **Chiffres sourcés et traçables.** Toute valeur affichée (prix, emprise, hauteur, risque) porte sa source, sa date et un indice de confiance. L'IA synthétise et explique, elle n'invente jamais un chiffre. Pour l'extraction PLU, citer l'article du règlement d'origine.
2. **Isolation multi-tenant stricte.** Chaque donnée est rattachée à une organisation. Aucun accès inter-organisation possible. À imposer au niveau de la couche d'accès et via le Row-Level Security PostgreSQL. À tester explicitement.
3. **Pas de donnée comme cas de première classe.** Quand une source est indisponible (hors couverture DVF, commune au RNU, pas de LiDAR), l'afficher comme "donnée indisponible", jamais une valeur par défaut silencieuse.
4. **Unités métriques partout.** Mètres, m², km, etc.
5. **Textes français sans tiret cadratin.** Reformuler avec une virgule, des parenthèses ou en restructurant.
6. **Secrets hors du dépôt.** Clés d'API (Anthropic, IGN si besoin) uniquement côté serveur, jamais exposées au navigateur.

## Definition of Done (une story n'est "faite" que si tout est vrai)
- Code implémenté selon les critères d'acceptation de la story
- Tests unitaires écrits et au vert
- Test fonctionnel de bout en bout du parcours concerné au vert
- Documentation à jour (README, ADR si décision d'architecture, doc d'API)
- Lint et typecheck au vert
- Revue du diff passée (voir Workflow)

## Politique d'escalade
- **Décide seul** toute décision d'implémentation et technique de routine (nommage, structure de fichiers, choix d'une lib mineure équivalente, refactor local).
- **Arrête-toi et demande** dans deux cas : (a) ambiguïté **fonctionnelle ou produit**, (b) toute décision **d'architecture** (nouveau composant ou service, changement du modèle de données, nouvelle dépendance structurante, choix d'infrastructure, frontière entre modules). Ne devine jamais sur ces deux cas.

## Workflow (par story)
1. Prendre une seule story (tranche verticale de bout en bout). Voir PLAN.md pour l'ordre.
2. Passer en plan mode, proposer le plan, attendre validation si la story touche au produit ou à l'architecture.
3. Implémenter avec les tests.
4. Faire relire le diff par un sous-agent en contexte neuf, contre les critères d'acceptation de la story (et `/security-review` si sécurité).
5. Ouvrir une branche `feat/<slug>`, une PR, attendre la CI verte.
6. Commit conventionnel. Mettre à jour PROGRESS.md (où on en est, décisions, prochaine étape).
7. Story suivante.

## Tests
- Unitaires : Vitest. Fonctionnels : Playwright sur les parcours clés (création terrain, comparaison, vue soleil, mode visite). API : tests d'intégration.
- Seuil de couverture à tenir (cible 80% sur la logique métier).
- Toujours fournir un moyen de vérifier (test, capture). Si non vérifiable, ne pas livrer.

## CI/CD
- GitHub Actions sur PR : lint, typecheck, tests unitaires et fonctionnels, build.
- Sur merge vers main : build image Docker, push sur GHCR (image pré-construite, pas de build sur le serveur).
- Déploiement : Arcane détecte le nouveau digest (Image Polling + Auto Update, label `com.getarcaneapp.arcane.updater=true`) et redéploie.
- Garde les migrations réversibles, tague les images par SHA git, sauvegarde la base avant déploiement.

## Structure du dépôt
- `CLAUDE.md` (ce fichier), `PLAN.md` (séquençage), `PROGRESS.md` (état vivant)
- `docs/` : cahier des charges, architecture, backlog, risques, design system, ADR
- `.claude/agents/` : sous-agents (relecteur, vérificateur d'isolation multi-tenant)
- `app/`, `worker/`, `packages/` selon la structure retenue
