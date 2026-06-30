# PROGRESS — Veriterra

État vivant du projet. Mis à jour à chaque tranche/story.

## Où on en est

**Tranche 0 — Socle : FAITE (en attente de revue + merge).** Branche `feat/socle-tranche-0`.

Couvre US-0.1 (auth OIDC Pocket ID), US-0.2 (multi-tenant + RLS + test d'isolation), US-0.3 (stack déployable `docker compose up`).

**Rebranding fait : la marque est Veriterra** (renommage complet, code compris : packages `@veriterra/*`, rôle DB `veriterra_app`, DB `veriterra`, image, repo, docs). Design system Veriterra intégré : `docs/design-system.md`, tokens + thème Tailwind v4 (`globals.css`), polices Archivo + Spline Sans Mono (`next/font`), logo/favicon SVG, pages `/sign-in` et `/` habillées à la marque (indigo `#2F3B6E` primaire, accent soleil `#DB9B2C`). Les vrais écrans produit (avec les composants signature : DataBlock, ScoreGauge, etc.) arrivent en Tranche 1+.

### Vérifié de bout en bout
- `pnpm lint`, `pnpm typecheck`, `pnpm build` : verts.
- `pnpm test` : 9/9 — isolation RLS 6/6 (dont fail-closed + contrôle négatif `admin`), bootstrap orga 2/2, pipeline ping 1/1.
- `pnpm --filter @veriterra/app test:e2e` (local) : accès protégé → redirection `/sign-in` au vert. Flux OIDC complet via mock : câblé en CI (`E2E_OIDC=1`).
- `docker compose up` : `db`, `redis`, `app`, `worker` **healthy** ; `migrate` exit 0 ; `GET /api/health` → 200 `{"status":"ok","checks":{"db":true,"redis":true}}` ; `/` sans session → 307 `/sign-in`.
- En base : `veriterra_app` sans `rolsuper`/`rolbypassrls`, RLS **ENABLE+FORCE** sur `Organisation` et `Membership`, policies `tenant_isolation` présentes, PostGIS OK.

## Décisions structurantes (validées avec le porteur)

1. **Un user = une organisation**, créée en silence à la 1re connexion (`bootstrapUserOrganisation`). Aucune notion d'orga visible dans le front (pas d'invitation/partage). Le modèle orga + RLS est en place dès maintenant, donc le partage futur n'exigera pas de migration de données.
2. **UI : en attente du design system** (Claude Design, en //). Tranche 0 = socle backend/infra. Pages présentes = placeholders nus jetables (`/sign-in`, `/` protégée, `/api/health`), à remplacer quand les tokens arrivent.
3. **OIDC** : vrai Pocket ID branché par env en dev/prod ; la CI utilise un **mock OIDC** (`navikt/mock-oauth2-server`, `interactiveLogin:false`) pour un e2e auth sans IdP live.
4. **GitHub** : repo à créer ; le push CI→GHCR utilise le `GITHUB_TOKEN` intégré.

## Stack effective (versions épinglées)

Next 16.2.9 (App Router, Turbopack) · React 19.2 · Auth.js `next-auth@5.0.0-beta.31` (JWT, provider OIDC générique) · Prisma 7.8 (client Rust-free wasm + `@prisma/adapter-pg`) · Postgres 17 + PostGIS 3.5 (`imresamu/postgis`, multi-arch) · Redis 7 · BullMQ 5.79 + ioredis 5.11 · Tailwind 4 · TypeScript 5.9.3 · Vitest 4 · Playwright 1.61 · ESLint 10 (typescript-eslint, flat config) · pnpm 9.13 workspaces · Node 22.

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

- Pousser `feat/socle-tranche-0`, ouvrir la PR, CI verte, merge → `release.yml` pousse l'image sur GHCR (Arcane redéploie).
- Puis **Tranche 1** (créer un terrain de bout en bout : BAN, cadastre, clic parcelle, fiche, dashboard carte minimale). Premières colonnes geometry PostGIS (modèle déjà prêt) ; toute nouvelle table tenant DOIT activer RLS (la garde M3 le vérifie).
- Durcissements : secret/rôle `veriterra_app` en prod, image Docker slim (standalone), headers de sécurité, rate limiting, fail-fast sur `AUTH_SECRET`.
