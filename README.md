# Veriterra

CRM de prospection foncière auto-hébergé. À partir d'une adresse, l'outil localise la parcelle, génère une synthèse sourcée (cadastre, PLU, risques, prix), permet d'explorer en 3D les ombres portées du relief et des bâtiments sur plusieurs périodes de l'année, et assure le suivi, la notation et la comparaison des terrains.

**Veriterra** est la marque du produit ; son identité et son design system sont définis par Claude Design (voir `docs/design-system.md`). « Veritas » (la vérité, la donnée sourcée) + « terra » (la terre).

## Documentation
- `CLAUDE.md` : contrat de fonctionnement pour Claude Code (règles, Definition of Done, escalade, workflow).
- `PLAN.md` : séquençage des tranches de développement.
- `docs/cahier-des-charges.md` : besoin fonctionnel complet.
- `docs/backlog.md` : user stories avec critères d'acceptation.
- `docs/architecture.md` : architecture, moteur d'ombres, CI/CD, déploiement.
- `docs/risques.md` : registre des risques et plans de limitation.
- `docs/design-system.md` : marque, tokens et composants (produit par Claude Design).
- `docs/deploiement.md` : déploiement prod pas à pas (Arcane V2, GHCR, Caddy, env, durcissement).
- `PROGRESS.md` : état vivant du projet (créé et mis à jour par Claude Code).

## Administration depuis ton PC

Prérequis : Docker Desktop, Node.js et pnpm, git, et Claude Code (app desktop ou CLI).

Boucle de travail :
1. Ouvrir le dossier du projet dans Claude Code.
2. Lancer la stack locale : `docker compose up` (Postgres+PostGIS, Redis, app, worker).
3. Démarrer le dev : `pnpm dev`, puis ouvrir l'app sur `http://localhost:3000`.
4. Demander à Claude Code de prendre la prochaine story de `PLAN.md` : il passe en plan mode, propose, implémente, teste, fait relire le diff par un sous-agent, ouvre une PR.
5. La CI doit être verte, tu approuves et tu merges.
6. Le merge sur `main` déclenche le build de l'image, son push sur GHCR, et Arcane redéploie automatiquement en production.

Reprise après coupure : l'état durable est sur le disque (git, docs, `PROGRESS.md`). Une nouvelle session relit `CLAUDE.md`, `PLAN.md`, `PROGRESS.md` et l'historique git et repart où on en était. `claude --continue` reprend la dernière session, `claude --resume` ouvre le sélecteur. Les checkpoints (Échap deux fois ou /rewind) permettent de revenir en arrière, et git reste le filet pour les changements externes (migrations).

## Administration de la production

Guide pas à pas : **`docs/deploiement.md`** (déployer dans Arcane V2, image GHCR, env, Caddy, auto-update, durcissement).

- Image construite par la CI et poussée sur GHCR ; déployer la compose **prod** `docker-compose.prod.yml` (à base d'`image:`), jamais `docker-compose.yml` (dev, `build:`).
- Conteneurs et déploiements : Arcane (Image Polling + Auto Update sur les services labellisés `app`/`worker`).
- Comptes, organisations et monitoring : la section `/admin` de l'app (rôle admin requis, sous-domaine dédié).
- TLS et domaines : Caddy (`app` exposé sur `127.0.0.1:3000`, reverse proxy par Caddy).

## Stack
Next.js, TypeScript, Tailwind, shadcn/ui, MapLibre GL, deck.gl, Turf.js, SunCalc, PostgreSQL+PostGIS, Prisma, Redis, Auth.js (OIDC), PWA, Docker, Caddy. Détails dans `docs/architecture.md`.
