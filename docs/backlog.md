# Backlog — Veriterra

Format : `US-x.y` — En tant que … je veux … afin de …, suivi des critères d'acceptation. Tag de phase : [MVP], [V2], [LATER].

---

## Epic 0 — Socle et compte

**US-0.1 [MVP] Authentification OIDC.** En tant qu'utilisateur, je me connecte via Pocket ID afin d'accéder à mes terrains.
- Connexion et déconnexion OIDC fonctionnelles.
- Session stockée, expiration gérée.
- Aucune page protégée accessible sans session.

**US-0.2 [MVP] Organisation et partage.** En tant qu'utilisateur, je partage mes terrains avec mon conjoint afin de décider à deux.
- Chaque donnée est rattachée à une organisation.
- Un membre invité voit les terrains de l'organisation, pas ceux des autres organisations.
- Test d'isolation : un utilisateur d'une autre organisation reçoit 403 sur une ressource non autorisée.

**US-0.3 [MVP] Socle technique déployable.** En tant qu'admin, je déploie la stack via Docker Compose afin de faire tourner l'app.
- `docker compose up` lève app, worker, Postgres+PostGIS, Redis.
- Health checks verts.

## Epic 1 — Fiche terrain et localisation

**US-1.1 [MVP] Recherche d'adresse.** Je saisis une adresse afin de centrer la carte.
- Autocomplétion via la BAN.
- À la sélection, la carte se centre, le code INSEE est récupéré.

**US-1.2 [MVP] Localisation assistée de la parcelle.** Je clique la ou les bonnes parcelles afin de cibler le terrain.
- Le cadastre s'affiche sur le fond ortho à l'adresse trouvée.
- Au clic, la parcelle est surlignée, ses attributs s'affichent (identifiant, surface, commune).
- Possibilité de sélectionner plusieurs parcelles (rare mais supporté), surface agrégée.

**US-1.3 [MVP] Création de terrain.** Je crée une fiche terrain afin de la suivre.
- Une fiche est créée avec la ou les parcelles, l'adresse, la date.
- Champs manuels disponibles : prix demandé, lien annonce, notes.
- La création lance l'enrichissement en arrière-plan.

**US-1.4 [MVP] Préchargement non bloquant.** Je vois d'abord les infos rapides afin de ne pas attendre.
- Les données rapides (contour, surface, commune, libellé de zone) s'affichent immédiatement.
- Les blocs lourds se remplissent progressivement avec un squelette par bloc, pas de spinner global.
- Écran de chargement bloquant seulement si une vue requiert une donnée non prête.

**US-1.5 [MVP] Outils de mesure.** Je veux mesurer sur la carte afin de vérifier des distances et surfaces.
- Mesure de distance (polyligne, total en mètres).
- Mesure de surface (polygone, aire en m²).
- Mesure de dénivelé entre deux points (différence d'altitude et pente en %, depuis le RGE ALTI).
- Mesure de recul (distance la plus courte d'un point à la limite de parcelle).

## Epic 2 — Enrichissement automatique

**US-2.1 [MVP] Extraction PLU par IA.** Je veux les règles d'urbanisme structurées afin de connaître la constructibilité.
- Zonage récupéré via API Carto GpU.
- Le règlement est parsé par IA en emprise au sol, hauteur, reculs, stationnement.
- Chaque valeur cite l'article source et un indice de confiance ; les cas incertains sont signalés à vérifier.
- Le règlement est parsé une fois par document et mis en cache (réutilisé pour toutes les parcelles de la zone).

**US-2.2 [MVP] Risques Géorisques.** Je veux les risques afin d'écarter les terrains à problème.
- Argile (RGA), inondation, radon, sismicité, sites pollués récupérés et affichés avec source et date.

**US-2.3 [MVP] Prix DVF et écart.** Je veux le prix du secteur afin de juger le prix demandé.
- Comparables DVF terrains à bâtir autour de la parcelle.
- Estimation et écart au prix demandé, avec nombre de comparables et fourchette, jamais un chiffre sec.
- Hors couverture (57, 67, 68, Mayotte) : bascule explicite en saisie manuelle.

**US-2.4 [MVP] Pente et exposition.** Je veux la topographie afin d'anticiper les surcoûts et l'orientation.
- Pente et exposition dérivées du RGE ALTI, affichées sur la parcelle.

**US-2.5 [MVP] Services de proximité.** Je veux les distances aux services afin d'évaluer la localisation.
- Distances aux écoles, commerces, transports via OSM.

**US-2.6 [MVP] Provenance et fraîcheur.** Je veux savoir d'où vient chaque donnée afin de m'y fier.
- Chaque bloc porte source, date, confiance.
- Bouton "rafraîchir" par bloc et global.
- État "donnée indisponible" géré comme cas de première classe.

**US-2.7 [V2] Coûts indicatifs.** Je veux des fourchettes de surcoûts afin de comparer le vrai coût.
- Fourchettes dérivées des drivers fiables (pente, argile) avec hypothèses affichées.
- Override par mes devis réels. Jamais un chiffre sec.

**US-2.8 [V2] Détection "peut-être vendu".** Je veux être alerté quand un terrain est probablement vendu.
- À chaque millésime DVF, si une mutation tombe sur la parcelle, statut basculé en "peut-être vendu" à valider.

**US-2.9 [V2] Enveloppe constructible utile.** Je veux la zone réellement bâtissable afin de juger la forme du terrain.
- Après application des reculs PLU, calcul et tracé de la zone constructible, sa surface et sa forme.
- Indicateurs de compacité et de largeur de façade utile (détecte terrain en drapeau, façade étroite).

**US-2.10 [V2] Isochrone trajet-travail.** Je veux le temps de trajet afin d'en faire un critère.
- Temps de trajet jusqu'à un point de référence (lieu de travail), affiché et utilisable dans le score.

## Epic 3 — Scoring et comparaison

**US-3.1 [MVP] Score hybride.** Je veux un score afin de prioriser.
- Critères notés sur 100, pondérés (poids réglables), score global calculé.
- Override manuel par critère, avec trace de la valeur d'origine.

**US-3.2 [MVP] Affichage du score.** Je veux voir le score afin de le lire vite.
- Jauge globale 0-100 et radar par catégorie sur la fiche.

**US-3.3 [MVP] Tableau comparatif.** Je veux comparer mes terrains afin de choisir.
- Tableau triable par n'importe quelle colonne (prix, score, pente, etc.).
- Filtres par statut, commune, budget, score.

**US-3.4 [MVP] Alertes rouges.** Je veux voir les points bloquants afin de ne pas perdre de temps.
- Drapeaux rouges (non constructible, inondable, hors DVF) visibles sur fiche, table et carte.
- Les alertes pèsent sur le score sans l'annuler, sans exclure le terrain.

**US-3.5 [MVP] Fiche projet.** Je veux définir mon projet afin de scorer relativement à mon besoin.
- Fourchette de m² et budget par défaut ; programme détaillé optionnel.
- Le score devient relatif au projet.

## Epic 4 — Analyse solaire

**US-4.1 [MVP] Soleil interactif.** Je veux voir le soleil et les ombres afin de juger l'ensoleillement.
- Curseurs date et heure, position du soleil affichée.
- Journée animée (timelapse).
- Ombres temps réel du relief et des bâtiments BD TOPO, vue 3D, fluide y compris sur mobile (2.5D allégée sur mobile).

**US-4.2 [V2] Halo annuel aux solstices.** Je veux l'enveloppe d'ombrage annuelle afin de voir les périodes extrêmes.
- Calculé côté serveur, rendu par durée d'ombre (heatmap), calques solstice été et hiver superposables.
- Derrière un onglet "analyse avancée", calcul à la demande.

**US-4.3 [V2] Heatmap d'ensoleillement.** Je veux les heures de soleil cumulées afin d'évaluer le potentiel.
- Carte de durée d'ensoleillement sur une période, précalculée serveur.

**US-4.4 [V2] Maison projetée.** Je veux poser un volume afin de voir ses ombres et vérifier emprise et reculs.
- Emprise dessinée, hauteur réglable, volume déplaçable et pivotable (paramétrique, pas de modèle importé).
- Ombres du volume suivant le soleil ; ratio emprise/parcelle et reculs vérifiés contre le PLU.

## Epic 5 — CRM et workflow

**US-5.1 [MVP] Statuts.** Je veux un pipeline afin de suivre mes démarches.
- Statuts : À contacter, À visiter, Visité, Démarches en cours, Sous compromis, Vendu ou écarté.
- Changement de statut depuis la fiche et le dashboard.

**US-5.2 [MVP] Dashboard carte.** Je veux voir mes terrains sur une carte afin d'avoir la vue d'ensemble.
- Carte avec pins colorés par statut ou score.
- Filtres synchronisés avec le tableau.

**US-5.3 [MVP] Photos et notes.** Je veux documenter un terrain afin de m'en souvenir.
- Photos et notes attachées à un terrain.

**US-5.4 [V2] Contacts et relances.** Je veux gérer les contacts afin de relancer.
- Contacts (agent, propriétaire, notaire), relances avec rappel.

**US-5.5 [V2] Historique de prix et motif d'abandon.** Je veux tracer l'évolution afin de négocier et capitaliser.
- Historique du prix, motif d'abandon saisissable.

## Epic 6 — Mobile et visite

**US-6.1 [MVP] PWA installable.** Je veux installer l'app afin de l'utiliser comme une app.
- Installable, fonctionne hors-ligne pour les fiches et photos déjà chargées.

**US-6.2 [V2] Mode visite.** Sur place, je veux capturer vite afin de ne rien oublier.
- Photos géotaguées, mémo vocal, vérification de la bonne parcelle par GPS, changement de statut, faible conso, synchro différée.

**US-6.3 [V2] AR parcours du soleil.** Sur place, je veux voir le soleil en AR afin de juger l'ensoleillement réel.
- Superposition du parcours du soleil dans la caméra (orientation et heure, pas de limites cadastrales).

## Epic 7 — Exports

**US-7.1 [V2] PDF de synthèse.** Je veux un rapport afin de partager.
- PDF par terrain, sourcé, avec disclaimer CU.

**US-7.2 [V2] Export comparatif et GeoJSON.** Je veux exporter afin de réutiliser ailleurs.
- Export CSV ou PDF du comparatif, GeoJSON de la parcelle et des analyses.

**US-7.3 [V2] Synthèse IA à la demande.** Je veux un verdict rédigé afin de lire vite les points forts et faibles.
- Bouton qui génère, à la demande, une synthèse en langage naturel à partir des données déjà sourcées.
- L'IA synthétise et explique, elle n'invente aucun chiffre ; chaque affirmation renvoie aux données source.

## Epic 8 — Admin et SaaS

**US-8.1 [MVP] Section admin.** En tant qu'admin, je gère comptes et organisations afin d'administrer.
- Section /admin protégée par rôle, séparée, liste comptes et organisations, monitoring de base.

**US-8.2 [LATER] Marketplace de leads.** Je veux proposer mes leads aux pros afin de monétiser.
- Opt-in explicite et révocable, back-office pro, partage conditionné au consentement.

**US-8.3 [LATER] Durcissement SaaS.** Je veux ouvrir au public afin de passer en SaaS.
- Multi-tenant durci, facturation, quotas, observabilité.
