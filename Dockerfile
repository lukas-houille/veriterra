# Veriterra — image monorepo (Tranche 0).
# Une seule image construit l'ensemble (db + app + worker) ; chaque service du
# docker-compose la lance avec sa propre `command`. Base Debian-slim pour la compat du
# moteur de migration Prisma (libssl). Slimming en images séparées : à suivre.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# --- build : install (devDeps inclus) + génère le client Prisma + compile db + build Next ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

# --- runtime : image unique, command surchargée par service dans compose ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["node", "--version"]
