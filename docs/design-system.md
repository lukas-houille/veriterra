# Veriterra — Design System

Veriterra aide un particulier à acheter un terrain en confiance : toutes les données d'une parcelle (cadastre, PLU, risques, prix, ensoleillement), sourcées et datées, avec exploration 3D des ombres portées, suivi, notation et comparaison.

**Stack cible** : React + Tailwind CSS v4 + shadcn/ui, icônes Lucide. Polices Archivo (interface) et Spline Sans Mono (données). PWA responsive, mobile-first pour le mode visite.

Le thème prêt à l'emploi (variables CSS shadcn + `@theme` Tailwind v4) est dans `veriterra-theme.css`.

---

## 1. Principes

1. **Donnée sourcée** — chaque valeur affiche sa source, sa date et un indice de confiance. Jamais de chiffre orphelin.
2. **Progressive disclosure** — l'essentiel rassurant par défaut, le détail technique derrière des onglets. On gère proprement l'état « donnée indisponible ».
3. **Honnêteté** — les risques et les trous de données sont visibles, jamais masqués.
4. **Accessibilité** — contrastes AA minimum, cibles tactiles ≥ 44 px, focus visibles, libellés systématiques (une icône n'est jamais seule).
5. **Mobile-first** pour le mode visite, responsive PC pour le reste.

---

## 2. Couleurs

### Marque

| Token | Hex | Usage |
|---|---|---|
| `indigo-50` | `#EEF0F8` | fonds teintés, surbrillance légère |
| `indigo-100` | `#DADEF0` | bordures teintées, hovers discrets |
| `indigo-200` | `#B3BCDF` | séparateurs accentués |
| `indigo-300` | `#8E9CD8` | traits sur fond sombre |
| `indigo-400` | `#5A6BA8` | bordures sur fond sombre |
| `indigo-500` | `#2F3B6E` | **primaire** : actions, en-têtes, liens |
| `indigo-600` | `#222B52` | hover primaire, surface sombre |
| `indigo-700` | `#161A2E` | **encre** : titres, texte fort, fond sombre |

### Accent (Soleil)

| Token | Hex | Usage |
|---|---|---|
| `amber-50` | `#FBF2DD` | fond d'alerte « attention » |
| `amber-300` | `#E5B14A` | hover accent |
| `amber-500` | `#DB9B2C` | **accent** : ensoleillement, parcelle retenue, mise en avant |
| `amber-700` | `#8A5E10` | texte sur fond ambre clair |

À utiliser avec parcimonie : données soleil, statut « recommandé », parcelle sélectionnée.

### Neutres (gris froid, légèrement teinté indigo)

| Token | Hex | Usage |
|---|---|---|
| `neutral-0` | `#FFFFFF` | surface |
| `neutral-50` | `#F5F6FA` | fond de page |
| `neutral-100` | `#EAECF2` | surface alternée, lignes de tableau |
| `neutral-200` | `#DADEE8` | bordures |
| `neutral-300` | `#BFC5D2` | bordures fortes, désactivé |
| `neutral-400` | `#98A0B0` | icônes secondaires, statut neutre |
| `neutral-500` | `#6C7488` | texte secondaire |
| `neutral-600` | `#4C5468` | texte courant sur fond clair |
| `neutral-700` | `#343B4D` | titres secondaires |
| `neutral-900` | `#161A2E` | encre (= indigo-700) |

### Sémantiques

| Rôle | Couleur | Fond | Usage |
|---|---|---|---|
| `success` | `#2E7D5B` | `#E7F2EC` | prometteur, hausse, validé |
| `warning` | `#DB9B2C` | `#FBF2DD` | à vérifier, servitude |
| `danger` | `#C0432E` | `#F8E7E2` | risque, alerte, écarté |
| `info` | `#2F6E8F` | `#E6F0F5` | information neutre, repère de source |

### Statuts portefeuille (pins de carte)

| Statut | Couleur |
|---|---|
| À étudier | `neutral-400` `#98A0B0` |
| Prometteur | `success` `#2E7D5B` |
| Réservé | `amber-500` `#DB9B2C` |
| Écarté | `danger` `#C0432E` |

### Mode sombre

Fond `#161A2E`, surfaces `#222B52`, traits `#8E9CD8`/`#5A6BA8`, texte `#EAECF2`. L'ambre et les sémantiques restent identiques.

---

## 3. Typographie

- **Archivo** (`font-sans`) : toute l'interface, du titre au corps. Poids 400–800.
- **Spline Sans Mono** (`font-mono`) : données vérifiables (prix, surfaces, coordonnées, dates, confiance). Le monospace signale « donnée sourcée ».

| Rôle | Taille / interligne | Poids | Notes |
|---|---|---|---|
| Display | 56 / 1.0 | 800 | tracking -0.03em |
| H1 | 40 / 1.1 | 700 | -0.02em |
| H2 | 28 / 1.2 | 600 | |
| H3 | 20 / 1.3 | 600 | |
| Corps L | 17 / 1.6 | 400 | |
| Corps | 15 / 1.6 | 400 | défaut |
| Petit | 13 / 1.5 | 500 | légendes, aide |
| Label | 11–12 / 1.2 | 600 | capitales, tracking 0.08em |
| Données | 13–14 / 1.4 | 500 | Spline Sans Mono |

Minimum 24 px pour les titres d'écran, 15 px pour le corps. Jamais sous 12 px.

---

## 4. Espacement, rayons, ombres

**Espacement** (base 4 px) : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Rayons** : `sm` 6 · `md` 8 (défaut) · `lg` 12 · `xl` 16 · `full` 9999. Logo : carré à coins `rx 8`.

**Ombres** :
- `sm` `0 1px 2px rgba(22,26,46,.06)`
- `md` `0 4px 12px -2px rgba(22,26,46,.10)`
- `lg` `0 16px 36px -16px rgba(22,26,46,.20)`

---

## 5. Iconographie

Lucide, trait 1.5 px, angles arrondis (cohérent avec shadcn/ui). Une icône est toujours accompagnée d'un libellé. Repères utiles : `map-pin`, `sun`, `layers`, `shield-check`, `ruler`, `triangle-alert`, `file-text`, `info`.

---

## 6. Composants de base (shadcn/ui)

Mapper les variantes shadcn sur les tokens Veriterra.

### Button
- `default` (primaire) : fond `indigo-500`, texte blanc, hover `indigo-600`, rayon `md`, hauteur 40 (mobile 44), 600.
- `secondary` : fond blanc, bordure `neutral-200`, texte `indigo-700`, hover fond `neutral-50`.
- `ghost` : transparent, texte `indigo-500`, hover fond `indigo-50`.
- `destructive` : fond `#F8E7E2`, texte `danger`, bordure `#EAC3B9`.
- Tailles : `sm` 32, `default` 40, `lg` 48. Focus ring `indigo-400` 2px offset 2.

```tsx
<Button>Ouvrir la fiche</Button>
<Button variant="secondary">Comparer</Button>
<Button variant="ghost">Ajouter au portefeuille</Button>
```

### Autres
- **Input / Select** : bordure `neutral-200`, fond blanc, rayon `md`, focus ring `indigo-400`. Erreur : bordure `danger`.
- **Card** : surface blanche, bordure `neutral-200`, rayon `lg`, ombre `sm`. Padding 20–24.
- **Badge** : pilule, `sm`. Statuts via couleurs ci-dessus (fond = teinte, texte = couleur foncée).
- **Tabs** : support clé de la progressive disclosure. Onglet actif : texte `indigo-700`, soulignement `indigo-500` 2px. Inactif : `neutral-500`.
- **Table** : triable et filtrable. En-tête `neutral-500` label caps, lignes séparées par `neutral-100`, hover `neutral-50`, chiffres en `font-mono` alignés à droite.
- **Dialog / Sheet / Tooltip** : surface blanche, ombre `lg`, rayon `lg`. Sheet pour les filtres mobile.

---

## 7. Composants signature

### ConfidenceDots
Indice de confiance à 3 niveaux. 3 points 7px ; remplis en `indigo-500`, vides en `neutral-200`.
`élevée` = 3 · `moyenne` = 2 · `faible` = 1. Toujours accompagné du libellé textuel pour l'accessibilité.

### DataBlock (bloc de donnée sourcée) — composant central
Structure : label (caps) · valeur (`font-mono`, + tendance optionnelle) · ligne meta (source · date) + ConfidenceDots.

| Prop | Type | Notes |
|---|---|---|
| `label` | string | ex. « Prix au m² » |
| `value` | string | `font-mono` |
| `trend` | string? | ex. « +4,2% », couleur `success`/`danger` |
| `source` | string | ex. « DVF » |
| `date` | string | ex. « 03/2025 » |
| `confidence` | 'élevée' \| 'moyenne' \| 'faible' | |
| `unavailable` | boolean | bascule l'état vide |

```tsx
<DataBlock label="Prix au m²" value="3 240 €" trend="+4,2%"
  source="DVF" date="03/2025" confidence="élevée" />
```

Rendu : Card padding 16–20, label `neutral-500` caps, valeur 24–28 mono `neutral-900`, meta séparée par un filet `neutral-100`, source en mono `neutral-500`.

### UnavailableState
Quand `unavailable` : bordure `neutral-300` en pointillés, fond transparent, texte `neutral-500` « Donnée indisponible », pas de valeur fantôme. Optionnel : bouton « Demander la donnée ».

### ScoreGauge (0–100)
Anneau SVG. Piste `neutral-100` 7px, arc `indigo-500` 7px `stroke-linecap=round`, départ -90°. Chiffre central 38 `font-extrabold`, « / 100 » en mono `neutral-500`. Tailles 72 / 140.

### RadarScore
Radar par catégorie (ex. Constructibilité, Risques, Prix, Ensoleillement, Accès). Grille `neutral-200`, surface `indigo-500` à 18% d'opacité, contour `indigo-500`. Derrière l'onglet « Détail » (progressive disclosure).

### StatusPin
Marqueur de carte : cercle 13px de la couleur de statut + halo (`box-shadow 0 0 0 3px` couleur à 18%). Variante prix/score : dégradé neutre→indigo selon la valeur.

### AlertChip
Pilule. `danger` : fond `#F8E7E2`, texte `#C0432E`, bordure `#EAC3B9`, point 7px. `warning` : fond `#FBF2DD`, texte `#8A5E10`. Toujours factuel et sourcé : « Risque inondation · aléa fort · PPRi 2021 ».

---

## 8. Logo et assets

- `assets/veriterra-mark.svg` — symbole (bloc carré de parcelles, parcelle ambre, ombres débordantes), fond transparent, coins `rx 8`.
- `assets/veriterra-mark-dark.svg` — version fond sombre.
- Lockup : symbole à gauche, mot « Veriterra » (Archivo 700, -0.025em) à droite.
- Zone de protection ≥ moitié du côté du carré. Taille mini symbole 24px (favicon : parcelles + repère ambre, sans ombres).
- Ne pas recolorer hors palette, ne pas étirer, ne pas poser sur fond chargé sans aplat.

---

## 9. Accessibilité

- Contraste texte AA (indigo-500 sur blanc ≈ 8:1, neutral-500 sur blanc ≈ 4.6:1).
- Cibles tactiles ≥ 44 px en mobile.
- Statut/risque jamais transmis par la seule couleur : toujours libellé + icône.
- Focus visible (ring `indigo-400`).
- Respect de `prefers-reduced-motion` pour la lecture animée de la journée (vue soleil).

---

## 10. Fichiers de référence

- `docs/design-system.md` : ce document (spécification).
- `packages/ui/src/styles/theme.css` : variables CSS shadcn + `@theme` Tailwind v4. Source de vérité des tokens, importée par l'app (`app/src/app/globals.css`) et par le build CSS du package.
- `@veriterra/ui` (`packages/ui`) : implémentation React des composants. Vague 1 livrée (§6 Button, Card, Badge, Input, Tabs ; §7 ConfidenceDots, DataBlock, UnavailableState, ScoreGauge, AlertChip, StatusPin). Vague 2 à venir (Select, Dialog, Sheet, Tooltip, Table, RadarScore).
- `Logo Veriterra final.dc.html` : logo (lockups clair/sombre, app icon, export SVG).
- `Identité Veriterra.dc.html` : charte visuelle initiale (palette actualisée en indigo, ce document fait foi pour les tokens).
- Écrans produit (dashboard, fiche terrain, comparateur, vue soleil, mode visite) : à venir (Tranche 1+), ils montreront les composants en contexte.
