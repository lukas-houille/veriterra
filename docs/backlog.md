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
- Modèle de données **FAIT** en Tranche 0 (table `Membership` + RLS par organisation) : le partage futur n'exige pas de migration. Ce qui reste = l'UX de collaboration (US-0.4).

**US-0.4 [MVP] Collaboration sur le projet.** En tant qu'acheteur, je veux inviter une ou plusieurs personnes à travailler sur mon projet afin de partager la base des terrains, notes et agenda et de décider ensemble.
- Un membre invité rejoint l'organisation et voit le même projet, les mêmes terrains, notes et visites planifiées ; les modifications sont partagées en temps quasi réel.
- Invitation par email ou lien, avec un rôle (propriétaire, éditeur, lecture seule) ; révocation possible.
- Les données restent scopées à l'organisation (RLS) : aucun accès inter-organisation.
- **Décision d'architecture à prendre** avant implémentation : partage au niveau **organisation** (tous les projets de l'org sont partagés, le plus simple, le modèle actuel `Membership`) vs. partage **par projet** (ACL fine, plusieurs projets dont certains privés) ; et mécanisme d'invitation (lien signé vs. compte OIDC pré-provisionné).

**US-0.3 [MVP] Socle technique déployable.** En tant qu'admin, je déploie la stack via Docker Compose afin de faire tourner l'app.
- `docker compose up` lève app, worker, Postgres+PostGIS, Redis.
- Health checks verts.

## Epic 1 — Projet, exploration et fiche terrain

L'exploration est la feature phare. Le parcours : définir mon projet (onboarding court) puis explorer des terrains et les ajouter à la liste du projet.

**US-1.0 [MVP] Projet et onboarding court.** En tant qu'acheteur, je définis mon projet afin que tout soit noté et filtré selon mon besoin.
- À la première connexion, un onboarding court (une étape) : budget max, fourchette de m² cible, type de maison (plain-pied, R+1, R+2, R+3). Tous les champs sont optionnels et l'étape est passable (un projet par défaut est créé).
- Le projet est rattaché à l'organisation (RLS). Un flag de consentement de partage (opt-in, faux par défaut) est prévu dès maintenant pour la future marketplace.
- Le projet est modifiable ensuite. Le score et les filtres deviennent relatifs au projet (effet complet en Tranche 3).

**US-1.1 [MVP] Recherche d'adresse.** Je saisis une adresse afin de centrer la carte.
- Autocomplétion via la BAN.
- À la sélection, la carte se centre, le code INSEE est récupéré.

**US-1.2 [MVP] Localisation assistée de la parcelle.** Je clique la ou les bonnes parcelles afin de cibler le terrain.
- Le cadastre s'affiche sur le fond ortho à l'adresse trouvée.
- Au clic, la parcelle est surlignée, ses attributs s'affichent (identifiant, surface, commune).
- Possibilité de sélectionner plusieurs parcelles (rare mais supporté), surface agrégée.

**US-1.3 [MVP] Ajout d'un terrain au projet.** Je crée une fiche terrain afin de la suivre dans mon projet.
- Une fiche est créée avec la ou les parcelles, l'adresse, la date, rattachée au projet courant.
- Champs manuels disponibles : prix demandé, lien annonce, notes.
- La création lance l'enrichissement en arrière-plan (Tranche 2).

**US-1.4 [MVP] Préchargement non bloquant.** Je vois d'abord les infos rapides afin de ne pas attendre.
- Les données rapides (contour, surface, commune, libellé de zone) s'affichent immédiatement.
- Les blocs lourds se remplissent progressivement avec un squelette par bloc, pas de spinner global.
- Écran de chargement bloquant seulement si une vue requiert une donnée non prête.

**US-1.5 [MVP] Outils de mesure.** Je veux mesurer sur la carte afin de vérifier des distances et surfaces.
- Mesure de distance (polyligne, total en mètres).
- Mesure de surface (polygone, aire en m²).
- Mesure de dénivelé entre deux points (différence d'altitude et pente en %, depuis le RGE ALTI).
- Mesure de recul (distance la plus courte d'un point à la limite de parcelle).

**US-1.6 [MVP] Recherche par surface approchée.** En explorant près d'une adresse sans la connaître exactement, je veux trouver les parcelles proches d'une surface cible afin de repérer les bons candidats.
- Saisie d'une surface cible et d'une tolérance ±X m² ; dans la zone explorée, les parcelles dont la contenance est dans l'intervalle sont mises en avant.
- Résultats cliquables pour ajouter au projet.

**US-1.7 [V2] Terrains constructibles sans bâtiment et contact mairie.** En explorant, je veux repérer les terrains nus constructibles et contacter la mairie afin d'identifier le propriétaire.
- Filtre des parcelles constructibles (zone PLU) et sans bâtiment (croisement du bâti cadastre / BD TOPO Bâtiment).
- Bouton "Contacter la mairie" qui prépare un mail pré-rempli (demande d'identité du propriétaire) vers l'email de la mairie, trouvé via l'Annuaire de l'Administration ; état "email mairie indisponible" géré proprement.

**US-1.9 [MVP] Modifier un terrain enregistré.** En tant qu'acheteur, je veux modifier un terrain déjà enregistré afin de corriger ou compléter ses informations.
- Depuis la fiche, modifier les champs manuels : libellé, adresse, prix demandé, lien d'annonce, notes, et statut (à étudier, prometteur, réservé, écarté).
- Enregistrement scopé à l'organisation (RLS) : impossible de modifier le terrain d'une autre organisation.
- Les données parcellaires faisant autorité (contour, surface, IDU) ne sont pas éditables à la main (la ré-association de parcelles viendra plus tard).

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

**US-5.3 [MVP] Photos et notes. LIVRÉE (photos).** Je veux documenter un terrain afin de m'en souvenir.
- Photos et notes attachées à un terrain.
- Photos livrées via le socle stockage objet (voir US-5.8, `feat/terrain-documents`) : dépôt, grille, provenance, suppression. Notes déjà présentes sur la fiche (champ `notes`, US-1.9).

**US-5.4 [V2] Contacts et relances.** Je veux gérer les contacts afin de relancer.
- Contacts (agent, propriétaire, notaire), relances avec rappel.

**US-5.5 [V2] Historique de prix et motif d'abandon.** Je veux tracer l'évolution afin de négocier et capitaliser.
- Historique du prix, motif d'abandon saisissable.

**US-5.6 [V2] Visites planifiées et agenda.** Je veux planifier une visite afin de m'organiser et y revenir facilement.
- Choix d'une date et d'une heure de visite depuis la fiche terrain.
- Ajout à un agenda : export `.ics` et lien Google Agenda, avec les infos du terrain (adresse, parcelle) et un lien de retour vers la fiche.
- Rappel avant la visite ; la visite bascule le statut vers « À visiter » et apparaît dans le pipeline.

**US-5.7 [V2] Liens externes multiples.** Je veux rattacher plusieurs annonces (leboncoin, sites immobiliers) afin de suivre un terrain sur toutes ses sources.
- Au-delà du `lienAnnonce` unique de la fiche (déjà présent), possibilité d'ajouter plusieurs liens nommés, avec la source détectée.

**US-5.8 [V2] Documents attachés au terrain. LIVRÉE.** Je veux joindre des documents à un terrain (étude de sol, bornage, CU, devis, diagnostic) afin de centraliser le dossier.
- Dépôt de fichiers (PDF, images) rattachés à un terrain, avec type/libellé, provenance (déposé par, date) et taille ; stockés hors base et hors dépôt (stockage objet).
- Chaque document porte sa source et sa date, cohérent avec la règle des chiffres sourcés (un document est une pièce justificative datée, pas une valeur inventée).
- État "aucun document" géré proprement.
- **Décision d'architecture prise** (`feat/terrain-documents`) : stockage objet **MinIO auto-hébergé** (réseau interne, jamais exposé au navigateur ni à Caddy) ; modèle `TerrainDocument` scopé tenant (RLS ENABLE+FORCE) ; upload et download **par proxy applicatif** (chaque accès ré-authentifié et re-scopé tenant, aucune URL de stockage exposée) ; liste blanche de types (PDF, JPEG, PNG, WebP), taille max configurable, **sniff des octets d'en-tête** (anti-usurpation), en-têtes de download durcis (nosniff, disposition selon la nature).
- **Reste en suivi** : antivirus ClamAV (arrivera avec US-8.4), miniatures générées, conversion HEIC, purge des objets orphelins à la suppression d'un terrain.

**US-8.4 [LATER] Partage externe d'un document (côté offre).** En tant que propriétaire ou agent, je veux partager un document sur un terrain (ex. une étude de sol) afin d'enrichir le dossier de l'acheteur.
- Un tiers externe (propriétaire, agent, notaire) dépose un document via un lien de partage dédié et révocable, sans compte inter-organisation.
- Le partage est conditionné à un consentement explicite ; il ne franchit jamais l'isolation tenant par défaut (pas d'accès inter-organisation implicite, voir règle inviolable n°2).
- Traçabilité : qui a déposé quoi, quand ; l'acheteur valide ou écarte la pièce.
- **Décision d'architecture requise** : modèle de partage (lien signé à durée limitée vs. invité), frontière de confiance des uploads externes, articulation avec le consentement marketplace (US-8.2). Brique de la marketplace (côté offre qui alimente le lead).

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
