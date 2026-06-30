# Déploiement — Veriterra (Arcane + GHCR + Caddy)

Déploiement auto-hébergé : l'image est **construite par la CI GitHub** et poussée sur GHCR ; **Arcane** la déploie et la met à jour ; **Caddy** assure le TLS.

## 1. L'image (construite sur GitHub, pas dans Arcane)

- À chaque merge sur `main`, `ci.yml` valide puis `release.yml` **build + push** l'image sur GHCR :
  `ghcr.io/lukas-houille/veriterra` — tags `latest` et `<sha>`, label `com.getarcaneapp.arcane.updater=true`.
- Le repo est **public** → l'image se tire **sans identifiants** (sinon : PAT GitHub `read:packages` à ajouter dans Arcane comme registre).
- Architecture actuelle : **linux/amd64** uniquement. Si l'hôte Arcane est arm64, rendre l'image multi-arch (ajouter `platforms: linux/amd64,linux/arm64` à `release.yml`).
- `app`, `worker` et `migrate` partagent **la même image**, lancée avec des `command` différentes.

> **Ne jamais déployer `docker-compose.yml` (dev) en prod** : il contient des directives `build:` → Arcane affiche « Build & Deploy » et échoue (« no dockerfile »). **Utiliser `docker-compose.prod.yml`** (à base d'`image:`, zéro build).

## 2. Déployer dans Arcane V2

### 2.1 Créer le projet
**Sidebar → Projects → Create Project**
- **Name** : `veriterra`
- **Compose** : coller le contenu de `docker-compose.prod.yml`.
  - *Variante GitOps* : menu déroulant à côté de **Create Project → From Git Repo** → repo `lukas-houille/veriterra`, **Branch** `main`, **Compose File Path** : `docker-compose.prod.yml` (pas `docker-compose.yml`), **Auto Sync** optionnel.
- **Environment Configuration (.env)** : coller `.env.prod.example` et renseigner les vraies valeurs. Arcane l'enregistre en `.env` à côté de la compose (qui fait `env_file: .env`).
- **Create Project**.

### 2.2 Déployer
Projet → **Up**. Séquence : `migrate` (one-shot : extension PostGIS, rôle `veriterra_app`, RLS, tables) → puis `app` + `worker` (gate `service_completed_successfully`). Vérifier `app` **healthy** et `https://veriterra.lukas-houille.com/api/health` → `200 {"status":"ok",...}`.

### 2.3 Auto-update
**Environments → (ton environnement) → Job Schedules → Updates** : activer **Image Polling** (ex. toutes les 10 min) puis **Auto Update**. Arcane compare les **digests** ; `app`/`worker` portent déjà le label updater. À chaque release, il re-pull et redéploie (pull + up -d). Exclure un service : label `…updater=false`.

## 3. Variables d'environnement (`.env` Arcane)

Voir `.env.prod.example`. Points clés :
- Hôtes = noms de service compose : `db`, `redis` (réseau interne de la stack).
- `DATABASE_URL` = rôle restreint `veriterra_app` ; `DIRECT_URL` = superuser (migrations + bootstrap auth).
- `AUTH_URL=https://veriterra.lukas-houille.com`, `AUTH_TRUST_HOST=true` (derrière Caddy).
- Pocket ID : `AUTH_POCKET_ID_ISSUER/ID/SECRET`, et **redirect_uri** à enregistrer côté Pocket ID :
  `https://veriterra.lukas-houille.com/api/auth/callback/pocket-id`.

## 4. Réseaux & TLS (Caddy)

Deux réseaux (séparation db / front) :
- `internal` (bridge privé) : `db`, `redis`, `veriterra`, `worker`, `migrate`. **Aucun port publié** ; la base et Redis ne sont pas joignables depuis le proxy.
- `web` : ton réseau **Caddy existant** (`external: true`, nom par défaut `caddy`, override via `CADDY_NETWORK`). Seul `veriterra` y est attaché.

Caddy (conteneur sur ce réseau) atteint l'app par le nom de service, **sans port exposé sur l'hôte** :

```caddy
veriterra.lukas-houille.com {
    reverse_proxy veriterra:3000
}
```

Si ton réseau Caddy ne s'appelle pas `caddy`, mets `CADDY_NETWORK=<son-nom>` dans le `.env`. Plus tard : sous-domaine admin (`admin.veriterra.lukas-houille.com`).

## 5. Durcissement prod

- **Secrets forts dès le départ** : `POSTGRES_PASSWORD`, `AUTH_SECRET` (`openssl rand -base64 33`). Ne jamais laisser les `__CHANGER…__`.
- **Mot de passe du rôle applicatif** : la migration crée `veriterra_app` avec le mot de passe dev `veriterra_app` (IF NOT EXISTS). Après le 1er déploiement :
  ```sql
  ALTER ROLE veriterra_app PASSWORD '<fort>';
  ```
  puis mettre à jour `DATABASE_URL`. (Idéal : pré-provisionner le rôle avant la 1re migration.)
- **Sauvegardes** : `pg_dump` (format custom, PostGIS-aware) du volume `pgdata` avant chaque déploiement à risque.
- À suivre : headers de sécurité, rate limiting (au niveau Caddy), fail-fast si `AUTH_SECRET` est un placeholder.

## 6. Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| « Build & Deploy » / « no dockerfile » | compose **dev** (`build:`) utilisé | utiliser `docker-compose.prod.yml` (image) |
| `no matching manifest for linux/arm64` | hôte arm64, image amd64 | rendre l'image multi-arch dans `release.yml` |
| `app` jamais healthy | DB/Redis injoignables ou `migrate` échoué | vérifier `.env` (hôtes `db`/`redis`), logs `migrate` |
| Callback OIDC échoue | redirect_uri non enregistré / `AUTH_URL` faux | enregistrer le redirect_uri exact, `AUTH_TRUST_HOST=true` |
| Auth-all stale après changement de rôle | TTL JWT 1h | attendre l'expiration / réduire `session.maxAge` |
