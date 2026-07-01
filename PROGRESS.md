# PROGRESS — Veriterra

État vivant du projet. Mis à jour à chaque tranche/story.

## Où on en est

**Tranche 0 — Socle : FAITE, mergée (PR #1-3) et DÉPLOYÉE en prod** via Arcane sur `veriterra.lukas-houille.com` (image GHCR, Caddy TLS, `migrate` one-shot exit 0). Couvre US-0.1 (auth OIDC Pocket ID), US-0.2 (multi-tenant + RLS + test d'isolation), US-0.3 (stack déployable).

**Tranche design system — `@veriterra/ui` : FAITE et mergée (PR #4).** CI verte (dont e2e OIDC), revue en contexte neuf GO.

Bibliothèque de composants du design system Veriterra, construite comme **package syncable vers claude.ai/design** (le run `/design-sync` viendra ensuite). 11 composants (core + signature), tokens déplacés dans le package (source de vérité unique), polices vendorisées en `@font-face`. Voir la section dédiée plus bas.

**Rebranding fait : la marque est Veriterra** (renommage complet, code compris : packages `@veriterra/*`, rôle DB `veriterra_app`, DB `veriterra`, image, repo, docs). Design system : `docs/design-system.md` (spec), et désormais son **implémentation réelle** dans `packages/ui` (indigo `#2F3B6E` primaire, accent soleil `#DB9B2C`, polices Archivo + Spline Sans Mono).

**Tranche 2 — Évaluer (enrichissement sourcé) : EN COURS.** Slice 1 livrée (`feat/enrichissement-georisques`) : le job `enrichTerrain` n'est plus un stub, il récupère les **risques Géorisques** (argile, inondation, radon, sismicité) et écrit un bloc `EnrichmentBlock` sourcé, via un nouveau package partagé `@veriterra/enrichment` (client + cache Redis). Table + enums + migration RLS (ENABLE/FORCE, garde M3, isolation par-table). Fiabilité BullMQ (essais/backoff, jobId idempotent). La fiche affiche les blocs pilotés par le modèle (provenance/date/confiance, `AlertChip` par sévérité, préchargement non bloquant US-1.4, squelette PENDING, bouton Actualiser + polling borné). Distinction **panne transitoire** (bloc ERROR réessayable, non mis en cache) vs **absence légitime** (UNAVAILABLE terminal, règle 3). Revue adversariale multi-agents : 9 findings corrigés (le principal : ne plus figer une panne de source en faux « aucun risque »).

**Tranche 1 — Projet et exploration : LIVRÉE et déployée.** Landing publique (PR #10), onboarding court + modèle `Projet` (RLS, flag de consentement de partage) (PR #9), écrans recalés sur les maquettes designées (PR #11), création de terrain de bout en bout (adresse BAN → cadastre → clic parcelle → fiche persistée → dashboard carte, PR #7-8). Puis, sur `feat/explorer-surface-fond-carte` : **recherche par surface approchée ±X m² (US-1.6)**, **fond de carte modernisé** (plan vectoriel « Positron Veriterra » recoloré à chaud depuis le plan IGN + bascule Plan/Satellite, cadastre en calque, base 3D-ready), et **pins colorés par statut cliquables** sur le dashboard (visibles même dézoomés). Revue adversariale multi-angles passée : 10 findings corrigés, dont la course `setStyle`/diff asynchrone de MapLibre (bascule de fond qui effaçait les calques), un faux négatif quand la zone est tronquée, et l'exclusion des parcelles sans contenance connue (règle 3).

### Vérifié de bout en bout
- `pnpm lint`, `pnpm typecheck`, `pnpm build` : verts.
- `pnpm test` : 9/9 — isolation RLS 6/6 (dont fail-closed + contrôle négatif `admin`), bootstrap orga 2/2, pipeline ping 1/1.
- `pnpm --filter @veriterra/app test:e2e` (local) : accès protégé → redirection `/sign-in` au vert. Flux OIDC complet via mock : câblé en CI (`E2E_OIDC=1`).
- `docker compose up` : `db`, `redis`, `app`, `worker` **healthy** ; `migrate` exit 0 ; `GET /api/health` → 200 `{"status":"ok","checks":{"db":true,"redis":true}}` ; `/` sans session → 307 `/sign-in`.
- En base : `veriterra_app` sans `rolsuper`/`rolbypassrls`, RLS **ENABLE+FORCE** sur `Organisation` et `Membership`, policies `tenant_isolation` présentes, PostGIS OK.

## Tranche design system — `@veriterra/ui`

Nouveau package workspace `packages/ui` (`@veriterra/ui`), pensé pour être **syncable vers claude.ai/design** (package-shape de `/design-sync`).

- **11 composants** (fidèles à `docs/design-system.md`, chacun avec son type `*Props` exporté et ses tests) :
  - Primitives (§6) : `Button` (CVA + variantes default/secondary/ghost/destructive, tailles sm/default/lg, `asChild` via Radix Slot), `Card` (+ Header/Title/Description/Content/Footer), `Badge` (5 statuts), `Input`, `Tabs` (Radix).
  - Signature (§7) : `ConfidenceDots`, `DataBlock` (bloc « donnée sourcée », bascule `unavailable` → `UnavailableState`), `UnavailableState`, `ScoreGauge` (anneau SVG), `AlertChip`, `StatusPin`.
- **Tokens = source de vérité unique** : déplacés de `app/globals.css` vers `packages/ui/src/styles/theme.css` (`--vt-*`, variables shadcn light/dark, mapping `@theme inline`, `.font-data`). L'app les `@import` + `@source` vers `packages/ui/src`.
- **Polices vendorisées** : `@fontsource-variable/{archivo,spline-sans-mono}` copiées en woff2 sous `packages/ui/src/styles/fonts/`, servies par `@font-face` dans le thème. L'app **abandonne `next/font`** (parité exacte app/bundle design-sync, plus de dépendance Google Fonts au build).
- **Build** : `tsc` (émet `dist/**` ESM + `.d.ts`) + `@tailwindcss/cli` (compile `dist/veriterra.css` = tokens + `@font-face` + utilitaires des composants) + copie `dist/fonts`. Exactement ce que `/design-sync` (package-shape) consomme.
- **Consommation par l'app** : en **source** via `transpilePackages` (comme `@veriterra/shared`) ; imports relatifs internes **extensionless** (obligatoire pour Turbopack, cf. écart ci-dessous). `dist/` gitignoré, uniquement pour design-sync.
- **Vérifié** : `pnpm --filter @veriterra/ui build/test/typecheck` (59 tests), `pnpm lint`, `pnpm --filter @veriterra/app build` (Next, thème du package + composants), suite complète `pnpm test` (db 8 · ui 59 · app 2 · worker 1). Sélecteurs e2e préservés (texte des boutons inchangé) → e2e validé par la CI (mock OIDC).
- **Revue en contexte neuf : GO** (re-vérifiée empiriquement : package + app buildent/testent au vert). Corrigés au passage : `input.tsx` `ring-ring` → `focus-visible:ring-ring`, `lucide-react` retiré (inutilisé, reviendra avec les icônes), `app` dep en `workspace:*`.
- **Suivis non bloquants** : (a) cible tactile mobile du `Button` `default` à 40px (§9 demande ≥44px en mobile, à arbitrer, ex. `min-h-11 md:h-10`) ; (b) `AlertChip` utilise les hex exacts de §7 (cohérent avec la spec mais pas les classes token comme `Badge`) ; (c) `RadarScore` et la variante prix/score de `StatusPin` (§7) restent en 2e vague.

## Décisions structurantes (validées avec le porteur)

1. **Un user = une organisation**, créée en silence à la 1re connexion (`bootstrapUserOrganisation`). Aucune notion d'orga visible dans le front (pas d'invitation/partage). Le modèle orga + RLS est en place dès maintenant, donc le partage futur n'exigera pas de migration de données.
2. **UI : en attente du design system** (Claude Design, en //). Tranche 0 = socle backend/infra. Pages présentes = placeholders nus jetables (`/sign-in`, `/` protégée, `/api/health`), à remplacer quand les tokens arrivent.
3. **OIDC** : vrai Pocket ID branché par env en dev/prod ; la CI utilise un **mock OIDC** (`navikt/mock-oauth2-server`, `interactiveLogin:false`) pour un e2e auth sans IdP live.
4. **GitHub** : repo à créer ; le push CI→GHCR utilise le `GITHUB_TOKEN` intégré.

## Stack effective (versions épinglées)

Next 16.2.9 (App Router, Turbopack) · React 19.2 · Auth.js `next-auth@5.0.0-beta.31` (JWT, provider OIDC générique) · Prisma 7.8 (client Rust-free wasm + `@prisma/adapter-pg`) · Postgres 17 + PostGIS 3.5 (`imresamu/postgis`, multi-arch) · Redis 7 · BullMQ 5.79 + ioredis 5.11 · Tailwind 4 · TypeScript 5.9.3 · Vitest 4 · Playwright 1.61 · ESLint 10 (typescript-eslint, flat config) · pnpm 9.13 workspaces · Node 22.

Design system (`@veriterra/ui`) : class-variance-authority · clsx · tailwind-merge 3 · lucide-react · @radix-ui/react-{slot,tabs} · @fontsource-variable/{archivo,spline-sans-mono} (vendorisées) · @tailwindcss/cli 4 · @testing-library/react + jsdom (Vitest).

## Architecture d'isolation (le cœur)

- **Deux clients DB** (`packages/db/src/client.ts`) : `prisma` = rôle restreint `veriterra_app` via `DATABASE_URL` (RLS le contraint) ; `admin` = rôle privilégié via `DIRECT_URL` (bypass RLS), réservé au bootstrap auth / seeds / migrations / contrôle négatif des tests.
- **`forOrg(orgId)`** (`packages/db/src/rls.ts`) : extension Prisma `$extends` qui enveloppe chaque opération dans une transaction posant `set_config('app.current_org_id', orgId, true)` (LOCAL, sûr en pooling) avant la requête. Tout accès aux données tenant passe par là.
- **Policies** (`migrations/.../rls`) : `ENABLE`+`FORCE RLS` sur `Organisation`/`Membership`, `USING`/`WITH CHECK` sur `NULLIF(current_setting('app.current_org_id', true), '')::uuid` (fail-closed propre).
- **Worker** : sans session, scope par `job.data.organizationId` via `forOrg`.

## Écarts/notes par rapport au plan (à savoir)

- **Prisma 7** : l'URL de connexion n'est plus dans `schema.prisma` mais dans `prisma.config.ts` ; le client reçoit l'`adapter` (`@prisma/adapter-pg`). Pas de `directUrl` côté schéma.
- **`@veriterra/db` compilé en `dist` + marqué externe dans Next** : le client Prisma 7 (wasm + requires dynamiques) ne se bundle pas. Le client généré est émis en frère de `src`/`dist` (`packages/db/generated`) et importé via `../generated/prisma/index.js` (un seul chemin valable depuis la source ET le build).
- **Worker en `tsx`** (pas de bundling) pour éviter le même écueil Prisma. Le `dev` et le `test` racine buildent `@veriterra/db` d'abord.
- **Next 16** : `middleware` renommé en `proxy` (`app/src/proxy.ts`).
- **Imports relatifs de `@veriterra/ui` : extensionless** (`./button`, `../lib/cn`), PAS `.js`. Turbopack (qui transpile la source du package) ne résout pas `.js` → `.tsx` ; `tsc` et Vitest le font, mais pas le build Next. Convention alignée sur `@veriterra/shared`. Le `dist/` (esbuild de design-sync) résout aussi l'extensionless.
- **Warning Next « multiple lockfiles »** : un `~/package-lock.json` traîne dans le home et Next le choisit comme racine. Sans effet sur le build (vert), à nettoyer côté poste (ou fixer `turbopack.root`).
- **Image Docker unique « grasse »** (toutes deps) ; `app`/`worker`/`migrate` la lancent avec des `command` différentes. Slimming en images séparées (standalone) = à suivre.
- **`pnpm --filter X deploy`** entre en collision avec la commande intégrée pnpm → toujours `run deploy`.
- **Mot de passe `veriterra_app`** par défaut dans la migration RLS (dev). En prod : pré-provisionner le rôle avec un secret fort avant la migration (le `IF NOT EXISTS` ne le recrée alors pas). À durcir.
- **`prisma migrate reset`/`migrate dev`** : Prisma 7 exige le consentement explicite de l'utilisateur (garde anti-IA) et `--schema`. En CI/compose on utilise `migrate deploy` (pas concerné).

## Boucle de travail locale

1. `cp .env.example .env` (déjà fait localement, `.env` gitignoré).
2. `docker compose up -d db redis` (ou tout : `docker compose up`).
3. `pnpm db:deploy` puis `pnpm db:seed` (charge le `.env` via dotenv).
4. `pnpm dev` (app + worker), app sur http://localhost:3000.
5. `pnpm test`, `pnpm test:e2e`, `pnpm lint && pnpm typecheck`.

## Revue de sécurité (sous-agent, contexte neuf)

Verdict : **l'invariant d'isolation tenant tient, aucune fuite ni bypass actif.** Corrigés avant le commit initial :
- **H1** — `User` n'avait pas de RLS alors que le rôle restreint a des droits dessus (fuite PII latente) → policy `User` ajoutée (visible uniquement si membre de l'org courante, via `Membership`) + test.
- **H2** — mot de passe `veriterra_app` codé en dur + variable `VERITERRA_APP_PASSWORD` au commentaire trompeur → variable supprimée, mot de passe dev figé, doc corrigée (prod = pré-provisionner le rôle).
- **M1** — `release.yml` ne dépendait pas de la CI → déclenché par `workflow_run` sur succès de `ci` uniquement.
- **M2** — `admin` retombait en silence sur le rôle restreint si `DIRECT_URL` manquait → plus de fallback (échec franc).
- **M3** — garde de test : échoue si une future table à `organisationId` n'a pas RLS *enabled+forced*.

Suivis tracés (non bloquants) : M5 secrets app avec défauts `change-me` (fail-fast au boot à ajouter) · L1 documenter `withOrg()` pour le raw SQL tenant · L2 `loadServerEnv` mort (à câbler au démarrage) · L3 image single-arch · L4/L4bis vérifier le déclenchement Arcane (label image vs service) · L5 rate-limit `/api/health` au reverse-proxy · L6 traiter Redis comme frontière de confiance (provenance `organizationId`) · L7 révocation rôle/membership vs TTL JWT 1h · L8 `CMD` placeholder. M4 (le proxy protège bien) **vérifié** par l'e2e.

## Prochaine étape

**Tranche 1 : LIVRÉE. Tranche 2 slice 1 (risques Géorisques) : LIVRÉE.** Suite de la Tranche 2 :
- **PR 2b — Prix DVF** (US-2.3) : estimation, écart au prix demandé, comparables, hors couverture (57/67/68/Mayotte), sur le socle du pipeline (nouveau type `PRIX_DVF` d'`EnrichmentBlock`, source DVF ajoutée à `@veriterra/enrichment`).
- Puis **pente/exposition + services** (US-2.4/2.5), **PLU + extraction IA** (US-2.1, `ANTHROPIC_API_KEY` côté worker), puis **documents attachés** (US-5.8, MinIO auto-hébergé).

Suivi de dette repéré par la revue (non bloquant) : point représentatif par moyenne des sommets (préférer `ST_PointOnSurface` pour les parcelles concaves/disjointes) ; bloc PENDING jamais résolu détecté seulement côté client (persistance d'un horodatage d'enfilement pour une détection serveur possible plus tard).

Autres chantiers (selon priorité) :
- **`/design-sync`** : le dépôt est syncable (`pkg: @veriterra/ui`, `cssEntry: dist/veriterra.css`). Opération lourde (budget frais recommandé).
- **Durcissement prod** (service public) : `AUTH_SECRET` fort (signature JWT, prioritaire), `POSTGRES_PASSWORD` fort, rotation du rôle `veriterra_app` ; puis image Docker slim, headers de sécurité, rate limiting, fail-fast sur `AUTH_SECRET` placeholder.
- **Features cadrées au backlog** : documents attachés + partage externe (US-5.8 / US-8.4, stockage objet à décider), collaboration à plusieurs sur le projet (US-0.4, modèle `Membership` + RLS déjà posé).
