# PLAN.md — Séquençage des tranches (Veriterra)

On construit en tranches verticales de bout en bout, une à la fois. Chaque tranche est livrable, testée, documentée, mergée via PR. On ne passe à la suivante qu'une fois la précédente "faite" au sens de la Definition of Done (voir CLAUDE.md).

## Colonne vertébrale produit

> **Onboarding court (je définis mon projet) → j'EXPLORE des terrains → je les ajoute à la liste de mon projet → j'évalue → je compare → je suis.**

L'**exploration est la feature phare**. Tout (score, ombres, enveloppe) est **relatif au projet** de l'acheteur (budget, m², type de maison), défini dès l'onboarding (court, champs optionnels). Le **B2B / marketplace** (mise en relation acheteur ↔ constructeurs ↔ agents) vient plus tard, mais le modèle Projet + un flag de consentement de partage sont posés dès maintenant. Un acheteur avec parcelle + projet + budget est le lead qualifié qui fera venir l'offre.

## Tranche 0 — Socle
Repo, CI, Docker Compose (app, worker, Postgres+PostGIS, Redis), auth OIDC Pocket ID, multi-tenant + Row-Level Security + test d'isolation, design system `@veriterra/ui`. **FAIT.** Stories : US-0.1, US-0.2, US-0.3.

## Tranche 1 — Projet et exploration
Landing publique. Onboarding court : définir mon projet (budget, m² cible, type de maison), backend Projet + flag de consentement. Exploration : carte, recherche d'adresse, **recherche par surface approchée (±X m²)** dans une zone, clic parcelle, ajout à la liste des terrains du projet. Fiche terrain avec données rapides (contour, surface, commune).
Stories : US-1.0 (projet + onboarding), US-1.1 (recherche adresse), US-1.2 (localisation parcelle), US-1.6 (recherche par surface), US-1.3 (ajout au projet), US-5.2 (dashboard carte).
Sortie : je cadre mon projet, j'explore et je collecte de vrais terrains.

## Tranche 2 — Évaluer (enrichissement sourcé)
La synthèse qui fait la valeur (façon Parcello) : cadastre, PLU avec extraction IA (cache par document), Géorisques, DVF (prix, écart, fallback hors couverture), pente et exposition, services. Provenance, fraîcheur, préchargement non bloquant, états "donnée indisponible".
Stories : US-2.1 à US-2.6, US-1.4 (préchargement non bloquant, désormais utile car il y a de la donnée à précharger).
Sortie : une fiche se remplit toute seule, sourcée.

## Tranche 3 — Noter et comparer
Score hybride **relatif au projet**, jauge plus radar, tableau comparatif triable avec filtres, alertes rouges. Fiche projet raffinée.
Stories : US-3.1 à US-3.5.
Sortie : on note contre son besoin, on filtre, on compare, on décide.

## Tranche 4 — Soleil interactif
Position du soleil, journée animée, ombres temps réel relief plus BD TOPO, vue 3D, version 2.5D mobile. La fonctionnalité signature. Cadrer une preuve de perf sur une parcelle réelle (risque R9).
Stories : US-4.1.

## Tranche 5 — Suivi (CRM) et mobile
Statuts, photos, notes, **visites planifiées + agenda** (US-5.6), liens externes multiples (US-5.7), outils de mesure (US-1.5), PWA installable avec offline partiel.
Stories : US-5.1, US-5.3, US-5.6, US-5.7, US-1.5, US-6.1.
Sortie : suivi utilisable, app installable.

## Jalon MVP
À la fin de la tranche 5, l'outil doit servir sur cinq terrains réels. On ne va pas plus loin tant que ce n'est pas vrai (risque R13).

## Tranche 6 — Exploration avancée (prospection active)
**Détection d'opportunités** : filtre des terrains **constructibles sans bâtiment** (croisement cadastre bâti / BD TOPO Bâtiment + zone PLU constructible), et **contact mairie automatisé** (bouton qui prépare un mail pré-rempli vers la mairie, email trouvé via l'Annuaire de l'Administration, pour demander l'identité du propriétaire). Base d'un futur moteur à leads.
Stories : US-1.7 (constructible sans bâtiment + contact mairie).

## Tranche 7 — Analyse solaire avancée
Halo annuel aux solstices, heatmap d'ensoleillement (précalcul serveur, tuiles), maison projetée paramétrique. Stories : US-4.2 à US-4.4.

## Tranche 8 — Visite et enrichissement avancé
Mode visite (mémo vocal, GPS, synchro différée), AR parcours du soleil, coûts indicatifs, détection "peut-être vendu", enveloppe constructible utile, isochrone trajet-travail, contacts et relances, historique de prix. Stories : US-2.7, US-2.8, US-2.9, US-2.10, US-5.4, US-5.5, US-6.2, US-6.3.

## Tranche 9 — Exports et synthèse IA
PDF de synthèse sourcé, export comparatif et GeoJSON, synthèse IA à la demande. Stories : US-7.1, US-7.2, US-7.3.

## Tranche 10 — Admin
Section admin séparée protégée par rôle. Story : US-8.1.

## Tranche 11 — B2B et marketplace
L'autre côté : mise en relation de l'acheteur qualifié (parcelle + projet + budget, consentement opt-in) avec constructeurs, lotisseurs, agents. Back-office pro, partage conditionné au consentement. Stories : US-8.2, US-8.3.

## Plus tard
Durcissement SaaS public, AR limites cadastrales, import modèle 3D.
