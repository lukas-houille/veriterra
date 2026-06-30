# Cahier des charges fonctionnel — Veriterra

## 1. Vision et problème

Trouver un terrain à bâtir oblige aujourd'hui à croiser à la main le cadastre, le PLU, Géorisques, le DVF, un outil d'ombres et un tableur de suivi. Veriterra unifie tout cela : à partir d'une adresse d'annonce, l'outil aide à localiser la parcelle, génère une synthèse automatique sourcée (façon Parcello), permet d'explorer en 3D les ombres portées du relief et des bâtiments alentours sur plusieurs périodes de l'année, et assure le suivi, la notation et la comparaison des terrains.

Différenciateur face à Parcello et consorts : la visualisation solaire 3D et le suivi de prospection, sur des données plus précises en France (RGE ALTI 1 m, cadastre PCI).

## 2. Personas

- **Maître d'ouvrage / auto-constructeur** (cible primaire) : étudier, noter et comparer des terrains pour faire construire.
- **Conjoint / co-décideur** : consulter et commenter les terrains partagés.
- **Administrateur** (toi) : déployer, gérer comptes et organisations, monitorer.
- **Plus tard, en SaaS** : constructeurs de maisons individuelles, lotisseurs, courtiers (acheteurs de leads).

## 3. Périmètre et phasage

- **MVP** : création de terrain (adresse, cadastre, clic parcelle), enrichissement auto (PLU+IA, risques, DVF, pente, expo, services), score hybride (jauge + radar), tableau comparatif, alertes rouges, soleil interactif (instant + journée), statuts CRM, dashboard carte, photos et notes, PWA, OIDC, Docker.
- **V2** : halo annuel et heatmap d'ensoleillement, maison projetée paramétrique, synthèse IA à la demande, mode visite complet (AR soleil, mémo vocal, vérif GPS), isochrone trajet-travail, tension communale, exports PDF/CSV/GeoJSON, alerte DVF "peut-être vendu".
- **Plus tard** : AR des limites cadastrales, import de modèle 3D, détection d'opportunités, marketplace de leads, ouverture SaaS multi-tenant publique.

Détail des stories dans `docs/backlog.md`. Priorisation MoSCoW par story.

## 4. Modules fonctionnels

1. **Cadrage et socle** : France métropolitaine, logique à la demande avec cache, multi-tenant propre.
2. **Fiche terrain** : objet "Terrain" issu d'une annonce, rattaché à une ou plusieurs parcelles, créé par recherche d'adresse ou clic carte, avec localisation assistée (affichage du cadastre, l'utilisateur clique la ou les bonnes parcelles).
3. **Enrichissement auto** : cadastre, PLU avec extraction IA des règles (cache par document), Géorisques, DVF (prix, écart, comparables), pente et exposition, services de proximité. Fraîcheur par source (snapshot daté, bouton rafraîchir, DVF semestriel avec détection auto "peut-être vendu").
4. **Analyse solaire** : interactif léger (instant, journée animée) côté client ; analyses lourdes (halo annuel aux solstices, heatmap d'ensoleillement, ombres MNS avec végétation) précalculées côté serveur. Vue 3D terrain plus bâtiments. Maison projetée en volume paramétrique (V2).
5. **Scoring et comparaison** : score hybride (auto pondéré + override manuel), jauge globale 0-100 et radar par catégorie sur la fiche, tableau triable pour comparer, alertes rouges sans exclusion.
6. **CRM et workflow** : statuts (À contacter, À visiter, Visité, Démarches en cours, Sous compromis, Vendu ou écarté), contacts (agent, propriétaire, notaire), relances avec rappel, lien annonce, pièces jointes, historique de prix, motif d'abandon.
7. **Mobile et mode visite** : PWA responsive complète plus parcours visite épuré (photos géotaguées, mémo vocal, AR parcours du soleil, vérification de la bonne parcelle par GPS).
8. **Exports et rapports** : PDF de synthèse sourcé par terrain, export comparatif CSV ou PDF, GeoJSON de la parcelle et des analyses.
9. **Admin et SaaS** : dashboard admin séparé protégé par rôle (comptes, organisations, monitoring, feature flags), et plus tard back-office marketplace de leads et facturation.

### Scorecard par défaut (à ajuster, override manuel possible)

Chaque critère est noté sur 100 et pondéré. Score global = somme pondérée.

| Critère | Poids | Source |
|---|---|---|
| Prix et écart au marché | 20 | DVF |
| Constructibilité et enveloppe utile | 15 | PLU (GpU + IA), forme parcelle |
| Géorisques | 15 | Géorisques |
| Ensoleillement et exposition | 15 | moteur soleil, RGE ALTI |
| Pente et topographie | 10 | RGE ALTI |
| Services de proximité | 10 | OSM |
| Trajet-travail | 10 | isochrone |
| Tension et dynamique communale | 5 | DVF |

Le score devient relatif au projet quand une fiche projet est définie. Les alertes rouges pèsent sur le score sans l'annuler ni exclure le terrain.

## 5. Fiche projet immobilier

Chaque organisation peut définir un projet : par défaut une fourchette de m² cible et un budget max ; en option un programme détaillé (plain-pied, R+1, R+2, R+3, surfaces par pièce). Sert trois fois : rendre le score relatif au besoin réel, alimenter le volume paramétrique de maison pour les ombres, et tester si l'enveloppe constructible du PLU accepte le programme. Prévoir dès maintenant un flag de consentement pour le partage (marketplace de leads, plus tard).

## 6. Sources de données (toutes en Licence Ouverte Etalab 2.0, attribution IGN/DGFiP)

| Donnée | Source | Accès | Note |
|---|---|---|---|
| Géocodage adresse | BAN | api-adresse.data.gouv.fr | lat/lon + code INSEE |
| Parcelles cadastrales | API Carto IGN, Cadastre Etalab | GeoJSON | source PCI |
| Altitude, pente, expo | RGE ALTI 1 m, MNT LiDAR HD 50 cm | Géoplateforme | pente/aspect calculés serveur |
| Surface (ombres fines, végétation) | MNS LiDAR HD | Géoplateforme | déploiement en cours, fallback MNT+BD TOPO |
| Hauteurs de bâtiments | BD TOPO | Géoplateforme | meilleur qu'OSM |
| PLU / zonage / SUP | API Carto GpU | apicarto.ign.fr/api/gpu | règlement parsé par IA |
| Risques | Géorisques | API Géorisques | argile, inondation, radon, sismicité, sites pollués |
| Prix et comparables | DVF, DVF+ | API officielle, Cerema | hors couverture Alsace-Moselle (57, 67, 68) et Mayotte |
| Services de proximité | OSM Overpass | écoles, commerces, transports | distances |

Caveats data : couverture dégradée en rural exactement là où on cherche ; DVF passé et non prix d'annonce ; MNS figé à la date du vol (végétation). Toujours afficher source, date, confiance, nombre de comparables et fourchette.

## 7. Sécurité et RGPD

- Isolation multi-tenant par organisation, Row-Level Security PostgreSQL, testée.
- OIDC Pocket ID, rôles utilisateur et admin, dashboard admin séparé (route ou sous-domaine dédié, auth renforcée).
- Secrets hors dépôt, clés d'API côté serveur uniquement, TLS Caddy, rate limiting, validation des entrées, en-têtes de sécurité, scan de dépendances, journal d'audit, sauvegardes.
- RGPD : adresses, contacts et photos sont des données personnelles. Le partage de leads exige un consentement explicite, révocable, opt-in. DVF interdit la ré-identification et l'indexation par moteurs de recherche : à respecter en SaaS public.
- Disclaimer systématique : l'outil est une aide à la décision, jamais un certificat d'urbanisme. Seul le CU est opposable.

## 8. Monétisation (plus tard)

Mise en relation payante : un utilisateur avec parcelle, programme et budget est un lead très qualifié pour les constructeurs de maisons individuelles, lotisseurs et courtiers (pas les promoteurs, qui visent le collectif). Opt-in explicite, marketplace à deux faces avec back-office. Prévoir maintenant uniquement le flag de consentement côté données.

## 9. Architecture

Voir `docs/architecture.md` (monolithe modulaire plus worker, schéma, CI/CD, déploiement).

## 10. Modèle de données (vue d'ensemble)

Organisation, Utilisateur, MembreOrganisation (rôle), Terrain, Parcelle (n par terrain), BlocEnrichissement (type, valeur, source, date, confiance), Score (par critère, poids, override), Statut/Pipeline, Contact, Relance, Photo, Note, ProjetImmo, Alerte, JournalAudit. Tout rattaché à une Organisation.
