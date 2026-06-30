# PLAN.md — Séquençage des tranches (Veriterra)

On construit en tranches verticales de bout en bout, une à la fois. Chaque tranche est livrable, testée, documentée, mergée via PR. On ne passe à la suivante qu'une fois la précédente "faite" au sens de la Definition of Done (voir CLAUDE.md).

## Tranche 0 — Socle (avant tout)
Repo git initialisé, CI GitHub Actions, Docker Compose (app, worker, Postgres+PostGIS, Redis), auth OIDC Pocket ID, modèle multi-tenant minimal avec Row-Level Security et test d'isolation, squelette UI. Stories : US-0.1, US-0.2, US-0.3.
Sortie : on se connecte, on a une organisation, la stack tourne en local.

## Tranche 1 — Créer un terrain de bout en bout
Recherche d'adresse BAN, affichage cadastre, clic parcelle, création de fiche, sauvegarde, apparition dans le dashboard. Préchargement non bloquant en place (même sans enrichissement encore). Outils de mesure de base. Stories : US-1.1 à US-1.5, US-5.2 (carte dashboard minimale).
Sortie : on enregistre un vrai terrain depuis une adresse.

## Tranche 2 — Enrichissement automatique
PLU avec extraction IA (cache par document), Géorisques, DVF (prix, écart, fallback hors couverture), pente et exposition, services. Provenance, fraîcheur, états "donnée indisponible". Stories : US-2.1 à US-2.6.
Sortie : une fiche se remplit toute seule, sourcée.

## Tranche 3 — Scoring et comparaison
Score hybride, jauge plus radar, fiche projet, tableau triable avec filtres, alertes rouges. Stories : US-3.1 à US-3.5.
Sortie : on note, on filtre, on compare.

## Tranche 4 — Soleil interactif
Position du soleil, journée animée, ombres temps réel relief plus BD TOPO, vue 3D, version 2.5D mobile. Stories : US-4.1. Cadrer ici une preuve de perf sur une parcelle réelle (risque R9).
Sortie : la fonctionnalité signature, en version légère.

## Tranche 5 — CRM de base et mobile
Statuts, photos, notes, PWA installable avec offline partiel. Stories : US-5.1, US-5.3, US-6.1.
Sortie : suivi utilisable, app installable.

## Jalon MVP
À la fin de la tranche 5, l'outil doit servir sur cinq terrains réels. On ne va pas plus loin tant que ce n'est pas vrai (risque R13).

## Tranche 6 — Analyse solaire avancée
Halo annuel aux solstices, heatmap d'ensoleillement (précalcul serveur, tuiles), maison projetée paramétrique. Stories : US-4.2 à US-4.4.

## Tranche 7 — Visite et enrichissement avancé
Mode visite (mémo vocal, GPS, synchro différée), AR parcours du soleil, coûts indicatifs, détection "peut-être vendu", enveloppe constructible utile, isochrone trajet-travail, contacts et relances, historique de prix. Stories : US-2.7, US-2.8, US-2.9, US-2.10, US-5.4, US-5.5, US-6.2, US-6.3.

## Tranche 8 — Exports et synthèse IA
PDF de synthèse sourcé, export comparatif et GeoJSON, synthèse IA à la demande. Stories : US-7.1, US-7.2, US-7.3.

## Tranche 9 — Admin
Section admin séparée protégée par rôle. Story : US-8.1.

## Plus tard
Marketplace de leads, durcissement SaaS, AR limites cadastrales, import modèle 3D. Stories : US-8.2, US-8.3.
