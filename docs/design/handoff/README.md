# Handoff : Design System Veriterra

## Overview
Veriterra est un CRM de prospection foncière pour particuliers : à partir d'une adresse, le produit localise une parcelle, génère une synthèse sourcée (cadastre, PLU, risques, prix au m², ensoleillement), permet d'explorer en 3D les ombres portées sur l'année, et sert à suivre, noter et comparer des terrains à bâtir. Ce paquet contient le **socle d'identité et le design system** : marque, tokens, et spécifications de composants.

## À propos des fichiers
Les fichiers `.dc.html` de ce paquet sont des **références de design créées en HTML** (prototypes montrant l'intention visuelle), pas du code de production à copier tel quel. L'objectif est de **recréer ce design system dans l'environnement cible** (React + Tailwind v4 + shadcn/ui recommandé) en suivant ses conventions. Si aucun environnement n'existe encore, partir sur React + Vite + Tailwind v4 + shadcn/ui + Lucide.

Point de départ immédiat : `veriterra-theme.css` (variables CSS shadcn + `@theme` Tailwind v4) se colle directement dans un projet shadcn.

## Fidélité
**Haute fidélité (hifi)** pour la marque, les couleurs, la typographie et le logo : reproduire au pixel. Les composants sont décrits par **spécifications précises** (`design-system.md`) plus que par des maquettes finales ; les implémenter avec les primitives shadcn/ui en appliquant ces tokens. Les **écrans produit sont inclus dans ce paquet** (voir « Écrans » ci-dessous et l'inventaire `design-system.md` section 11) et montrent les composants en contexte : partir d'eux pour le comportement, de `design-system.md` pour les tokens.

## Design Tokens
Tous les tokens (couleurs marque + neutres + sémantiques + statuts, typographie, espacement, rayons, ombres) sont dans **`design-system.md` section 2 à 5** et codés dans **`veriterra-theme.css`**.

Repères clés :
- Primaire `indigo-500 #2F3B6E`, encre `#161A2E`, accent soleil `amber-500 #DB9B2C`.
- Fond de page `#F5F6FA`, surface `#FFFFFF`, bordure `#DADEE8`, texte secondaire `#6C7488`.
- Sémantiques : success `#2E7D5B`, warning `#DB9B2C`, danger `#C0432E`, info `#2F6E8F`.
- Polices : Archivo (UI), Spline Sans Mono (données). Rayon défaut 8px. Icônes Lucide 1.5px.

## Composants
Spécifiés dans `design-system.md` :
- **Base (shadcn)** : Button (default/secondary/ghost/destructive), Input, Select, Card, Badge, Tabs (clé de la progressive disclosure), Table (triable/filtrable, chiffres en mono), Dialog/Sheet/Tooltip.
- **Signature produit** : `ConfidenceDots`, `DataBlock` (bloc de donnée sourcée, composant central), `UnavailableState` (donnée indisponible), `ScoreGauge` (jauge 0–100), `RadarScore` (radar par catégorie), `StatusPin` (pins de carte par statut), `AlertChip` (risque/attention, toujours sourcé).
- **App et foncier** : Top bar (shell : Explorer · Mes terrains · bulle Profil), `MapCanvas` (carte pan/zoom + parcelles), `ParcelInfoCard` (infos parcelle au clic), `SunControls` + `Scene3D` (ensoleillement / ombres portées, montés à la demande), `WeightSliders` (pondération des critères), Wizard d'onboarding. **Inventaire complet composant → écran dans `design-system.md` section 11.**

Chaque composant signature a une table de props et un exemple dans `design-system.md` section 7.

## Interactions & comportement
- **Progressive disclosure** : l'essentiel par défaut, le détail (radar, sources détaillées, analyse soleil avancée) derrière des onglets ou sheets.
- **États** : toujours gérer `loading`, `vide / donnée indisponible`, `erreur`. Une valeur absente n'affiche jamais de chiffre fantôme.
- **Responsive** : PWA, desktop pour dashboard/fiche/comparateur, mobile-first pour le mode visite. Cibles tactiles ≥ 44 px.
- **Accessibilité** : contraste AA, focus ring `#5A6BA8`, statut/risque jamais par la couleur seule (libellé + icône), respect de `prefers-reduced-motion`.

## Assets
- `assets/veriterra-mark.svg` — symbole (bloc carré de parcelles, parcelle ambre, ombres débordantes), fond transparent, coins rx 8.
- `assets/veriterra-mark-dark.svg` — version fond sombre.
- Icônes : bibliothèque **Lucide** (déjà incluse avec shadcn/ui), trait 1.5px.
- Polices : Google Fonts (Archivo, Spline Sans Mono).

## Files
- `design-system.md` — design system complet (tokens + composants + usage). **Document de référence.**
- `veriterra-theme.css` — thème shadcn/ui + Tailwind v4 prêt à l'emploi.
- `Logo Veriterra final.dc.html` — référence logo (lockups clair/sombre, app icon, tailles).
- **Écrans produit** (`.dc.html`, s'ouvrent seuls) : `Landing`, `Onboarding`, `Explorer`, `Dashboard portefeuille` (Mes terrains), `Positionnement`, `Profil`, `Mode visite mobile`.
- `support.js` — runtime des Design Components (requis pour ouvrir les `.dc.html`).
- `assets/veriterra-mark.svg`, `assets/veriterra-mark-dark.svg` — symbole vectoriel.

Un développeur qui n'était pas dans la conversation peut implémenter le socle à partir de `design-system.md` + `veriterra-theme.css` seuls.
