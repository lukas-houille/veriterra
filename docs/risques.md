# Registre des risques — Veriterra

Pour chaque risque : impact, probabilité, plan de limitation.

## Données et couverture

**R1. Couverture dégradée en rural.** DVF exclut le 57, 67, 68 ; le GpU n'a pas tous les PLU ; le LiDAR HD n'est pas partout. L'outil est plus fort en ville qu'en campagne, l'inverse du besoin. Impact fort, proba élevée. Limitation : "donnée indisponible" comme cas de première classe, fallback saisie manuelle, indiquer la couverture par commune.

**R2. Estimation DVF peu fiable.** Prix passés, pas le prix d'annonce ; comparables terrains à bâtir rares en rural. Impact moyen, proba élevée. Limitation : toujours afficher le nombre de comparables et une fourchette, jamais un chiffre sec ; seuil minimal de comparables sous lequel on n'estime pas.

**R3. MNS figé pour la végétation.** Le relevé date du vol ; les arbres poussent, sont coupés, perdent leurs feuilles. Le halo d'hiver basé sur un relevé d'été surestime l'ombre des feuillus. Impact moyen, proba moyenne. Limitation : afficher la date du MNS et un caveat saisonnier sur la végétation.

**R4. Mauvaise parcelle sélectionnée.** Adresse vague mal géocodée, on analyse le mauvais terrain. Risque silencieux le plus grave. Impact fort, proba moyenne. Limitation : localisation assistée avec confirmation explicite au clic, affichage de l'identifiant parcellaire, vérification GPS sur place.

## Juridique et conformité

**R5. Erreur d'extraction PLU.** Une règle mal extraite oriente un achat, risque de responsabilité (surtout en SaaS). Impact fort, proba moyenne. Limitation : disclaimer CU systématique, citation de l'article source, indice de confiance, validation humaine, l'outil reste une aide à la décision.

**R6. Conformité DVF en SaaS.** La licence interdit la ré-identification et l'indexation par moteurs de recherche. Impact fort en SaaS public, nul en perso. Limitation : ne pas exposer de transactions indexables, agréger, bloquer l'indexation.

**R7. RGPD.** Adresses, contacts, photos sont des données personnelles ; le partage de leads aggrave les obligations. Impact fort en SaaS. Limitation : consentement explicite révocable pour les leads, export et suppression des données, minimisation.

**R8. Données propriétaires MAJIC.** Identifier le propriétaire est réservé à la sphère publique. Impact moyen. Limitation : ne pas compter dessus, hors périmètre.

## Technique

**R9. Performance du moteur d'ombres.** Calcul lourd sur MNS dans le navigateur, sur mobile. Impact fort, proba élevée si mal conçu. Limitation : architecture deux étages, précalcul serveur en tuiles d'ombre, client léger. À cadrer en premier avec une preuve de perf sur une parcelle réelle.

**R10. Les 20% durs en vibe-coding.** Moteur d'ombres, justesse géospatiale, isolation multi-tenant, robustesse des pipelines : demandent de la revue. Impact fort. Limitation : revue par sous-agent en contexte neuf, tests d'isolation, ne pas se fier au vibe-coding pur sur la sécurité.

**R11. APIs publiques qui bougent.** Migration IGN vers la Géoplateforme, format DVF qui change à chaque millésime. Impact moyen, proba élevée dans le temps. Limitation : couche d'abstraction par source, tests de contrat, cache pour amortir les pannes.

**R12. Hors-ligne contre géodonnées lourdes.** Le stockage navigateur est borné, le MNS est gros. Impact faible. Limitation : offline partiel (fiches et photos oui, gros raster non), périmètre offline explicite.

## Produit

**R13. Scope creep, ne jamais livrer.** Le produit est gros (CRM, SIG, IA, 3D, mobile, SaaS). Risque numéro un. Impact critique, proba élevée. Limitation : MVP serré, sortir une version qui sert sur cinq terrains réels avant d'ajouter quoi que ce soit, phasage strict MVP puis V2 puis plus tard.

**R14. Sur-ingénierie SaaS prématurée.** Construire toute la plomberie multi-tenant et facturation avant d'avoir validé l'utilité. Impact moyen. Limitation : architecture propre oui, plomberie SaaS complète non, tant que le besoin perso n'est pas couvert.

**R15. Faux sens du score.** Un score n'est pas une vérité, c'est une pondération. Impact moyen. Limitation : toujours montrer les données brutes derrière, le score guide sans trancher.
