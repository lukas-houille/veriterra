# @veriterra/ui

Bibliothèque de composants du design system Veriterra (voir `docs/design-system.md`).
Source de vérité des tokens, des polices et des composants React, consommée par l'app
et conçue pour être synchronisable vers claude.ai/design (`/design-sync`).

## Composants (vague 1)

- **Primitives** (design-system §6) : `Button`, `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`), `Badge`, `Input`, `Tabs` (+ `TabsList`/`TabsTrigger`/`TabsContent`).
- **Signature** (design-system §7) : `ConfidenceDots`, `DataBlock`, `UnavailableState`, `ScoreGauge`, `AlertChip`, `StatusPin`.

Chaque composant exporte son type `<Nom>Props`. Vague 2 à venir : `Select`, `Dialog`, `Sheet`, `Tooltip`, `Table`, `RadarScore`.

## Tokens, thème et polices

- `src/styles/theme.css` : source de vérité (tokens de marque `--vt-*`, variables shadcn light/dark, mapping `@theme inline` Tailwind v4, `@font-face`). Importé par l'app (`app/src/app/globals.css`) et par le build CSS du package.
- Polices variables vendorisées sous `src/styles/fonts/` (Archivo, Spline Sans Mono), servies par `@font-face`.

## Consommation

- **Par l'app** : en **source** via `transpilePackages` (Next), plus `@import '@veriterra/ui/styles/theme.css'` et `@source` vers `packages/ui/src` dans le CSS de l'app. Imports relatifs internes **extensionless** (requis par Turbopack).
- **Par design-sync** : le build produit `dist/` (ESM + `.d.ts`) et `dist/veriterra.css` (tokens + `@font-face` + utilitaires), avec `dist/fonts/`.

## Scripts

```bash
pnpm --filter @veriterra/ui build       # tsc (dist ESM + .d.ts) + Tailwind CLI (dist/veriterra.css) + copie polices
pnpm --filter @veriterra/ui test        # Vitest + @testing-library/react (jsdom)
pnpm --filter @veriterra/ui typecheck
pnpm --filter @veriterra/ui lint
```

Le `dist/` est gitignoré (reconstruit à la demande) : l'app consomme la source, seul design-sync a besoin du build.
