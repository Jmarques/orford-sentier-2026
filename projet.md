# Projets d'entretien — décisions & plan

> Document de travail (temporaire) — brainstorm des 12 juin 2026.
> Objectif : organiser les efforts d'entretien du comité en « projets ».

---

## 1. Le besoin

La page **Corvées** répond à « *qu'est-ce qu'il y a à faire?* » (vue agrégée
des signalements ouverts). Il manque le « *comment on s'organise pour le
faire?* » : regrouper des signalements en unités de travail, leur donner un
horizon temporel, et y rattacher le contexte (historique, solution retenue,
participants).

Observation terrain : le comité priorise naturellement par **horizon de
réalisation** (« le 20 juin », « en août », « l'an prochain ») plutôt que par
niveau d'urgence abstrait.

**Principe directeur** : faciliter l'organisation sans que l'outil devienne un
frein. Le public est en grande partie des boomers → voir
[« Principes UI »](#8-principes-ui-pour-notre-public).

---

## 2. Décisions prises

| # | Sujet | Décision |
|---|-------|----------|
| 1 | **Nom** | « **Projet** » — c'est le mot employé naturellement par le comité. |
| 2 | **Emplacement** | **Nouvelle page `projets.html`**, entrée dédiée dans le bandeau (Signaler · Carte · Corvées · Projets · Guide). |
| 3 | **Horizon** | **Plage de dates** (début/fin) avec raccourcis de saisie : date précise (20 juin → début = fin), mois, saison, année. Tri par date de début. Affichage humain : « 20 juin », « Août », « Été 2026 », « 2027 ». Plage vide = « À planifier ». |
| 4 | **Sentiers** | Relation **0..N** : multi-select dans le formulaire, stocké en une colonne (noms séparés par des virgules). |
| 5 | **Champs descriptifs** | **Titre** (= le but, court et actionnable) + **Description** libre. Pas de champs matériel/budget dédiés : le **placeholder de la Description suggère un mini-modèle** (Problème / Solution retenue / Matériel / Budget) — guide sans obliger. Les approbations de budget (événements datés) iront au **journal** (Phase 3). On ajoutera un champ dédié seulement si l'usage montre que l'info se perd. |
| 6 | **Signalements** | Un signalement appartient à **0 ou 1 projet** ; un projet a 0..N signalements. Colonne `Projet` dans l'onglet `Signalements` ; la liste côté projet se recalcule en filtrant. |
| 7 | **Cycle de vie des signalements** | **« En cours » disparaît** (jamais utilisé) et est remplacé par un état **dérivé** « **Assigné** » (= colonne `Projet` remplie). Nouveau cycle : `Nouveau → Assigné → Résolu / Doublon`. Personne ne saisit « Assigné » — il est toujours vrai par construction. |
| 8 | **Carte** | **Badge popup seulement** : la légende se simplifie à 3 états (`Nouveau / Résolu / Doublon` — le filtre « En cours » est retiré). Si un signalement est assigné, son popup affiche un badge cliquable « Projet : *X* » qui mène à la fiche projet. |
| 9 | **Assignation** | **Mode assignation de la carte** (`map.html?assigner=P-3`) — voir section 6. C'est le **seul** chemin d'assignation (pas de picker sur la fiche projet). Le paramètre `?projet=` reste **réservé** à un futur filtre d'affichage par projet (ex. `?projet=P-3,P-7`). |
| 10 | **Clôture** | « Marquer terminé » sur un projet propose de marquer `Résolu` ses signalements ouverts (liste avec cases pré-cochées + confirmation). Un signalement décoché est **détaché** du projet et redevient `Nouveau` (retourne au triage). |
| 11 | **Journal / commentaires** | Réutiliser le pattern « Suivi » des signalements : journal append-only `[date · auteur] texte`. → Phase 3. |
| 12 | **Participants** | **Champ texte simple** sur la fiche projet, édité par le comité (« Jean, Lise, Marc »). Pas de route dédiée, pas de bouton « Ça m'intéresse ». |
| 13 | **Auth** | Toute écriture liée aux projets = mot de passe **comité**. Rien ne change pour le résident qui signale. |
| 14 | **Corvées** | **Inchangée pour l'instant.** On observe l'usage réel de Projets quelques semaines, puis on réévalue (boîte de triage « non assignés »? fusion? statu quo?). |

---

### Révisions UX (12 juin 2026, après livraison des 3 phases)

| Sujet | Décision |
|-------|----------|
| **Journal unifié** | Le suivi des signalements (popup carte) et des projets (fiche) partagent un **composant unique** (`shared/journal.js` + styles `.jr-*`) : entrées « **Jean** · 5 juin » (heure au survol), composeur identique (bouton neutre « Ajouter » + nom en pastille « au nom de ⟨Jean ✎⟩ »). |
| **Hiérarchie des boutons** | L'ajout au journal est une action **secondaire** (petit bouton neutre) ; les actions principales — « ✓ Clôturer » d'un signalement, « ✓ Clôturer le projet » — sont les seuls boutons forts (pilules pleines, icône `circle-check` commune). |
| **Vocabulaire commun** | « **Clôturé** » remplace « Résolu » (signalements) et « Terminé » (projets). Anciennes valeurs toujours reconnues par les clients et le serveur ; renommage des vieilles lignes à la main dans la feuille, comme pour « Fermé ». Le label « Clôturer : » devant les boutons a été supprimé. |
| **Signalement assigné = géré par son projet** | Plus **aucune action individuelle** (commentaire, clôture, doublon) tant qu'un signalement est dans un projet : l'accordéon « Suivi & résolution » garde le journal en lecture et affiche un court renvoi + la balise vers la fiche. Contournements assumés : retirer du projet (mode assignation) pour agir individuellement, ou décocher dans le dialogue de clôture du projet. |

## 3. Modèle de données

### Nouvel onglet `Projets` (1 ligne = 1 projet)

| Col | En-tête | Notes |
|-----|---------|-------|
| A | ID | identifiant stable `P-1`, `P-2`, … (les numéros de ligne bougent, pas les ID) |
| B | Horodatage | date de création |
| C | Titre | le but, court |
| D | Description | texte long (historique, solution retenue…) |
| E | Sentiers | noms séparés par `, ` (0..N) |
| F | Début | date ISO ou vide (vide = à planifier) |
| G | Fin | date ISO ou vide |
| H | Statut | `Actif` / `Terminé` / `Abandonné` |
| I | Participants | texte libre |
| J | Suivi | journal append-only, même format que les signalements (Phase 3) |

### Onglet `Signalements` — nouvelle colonne

| Col | En-tête | Notes |
|-----|---------|-------|
| P | Projet | ID du projet (`P-3`) ou vide. Un signalement ↔ au plus un projet. |

### Affichage humain de l'horizon (front)

Une fonction `formatHorizon(debut, fin)` (dans `shared/`, réutilisable) :

- début = fin → « 20 juin » (+ année si ≠ année courante)
- plage = mois exact → « Août »
- plage = saison/année exacte → « Été 2026 », « 2027 »
- sinon → « 20 juin – 5 juil. »
- vide → « À planifier »

---

## 4. Back-end (`code.gs`) — nouvelles routes

Mêmes conventions que l'existant : `doPost` routé par `action`, mot de passe
revalidé par `checkRole()` à chaque requête. **Tout en niveau comité.**

| `action` | Effet |
|----------|-------|
| `createProject` | Nouvelle ligne `Projets` (ID auto-incrémenté, statut `Actif`). |
| `updateProject` | Met à jour titre / description / sentiers / début / fin / statut / participants. |
| `setReportProject` | Écrit ou efface l'ID projet sur une ligne `Signalements` (col. P) — sert à assigner ET retirer. |
| `appendProjectFollowup` | Phase 3 — ajoute une entrée au journal (col. J), sans écraser. |

`doGet` : ajouter les projets à la réponse existante
(`{ ok, reports, projects }`) — un seul fetch pour les pages qui croisent les
deux. `rowToReport()` expose la nouvelle colonne `project`.

⚠️ Rappels : mettre à jour `setupSheet()` (en-têtes onglet `Projets` +
colonne P), et **redéployer** l'application Web après modification.

---

## 5. UX de la page `projets.html`

### Liste (vue par défaut)

- Projets `Actif` triés par **date de début** croissante ; « À planifier »
  (sans date) en bas ; `Terminé` / `Abandonné` repliés tout en bas.
  **Pas de groupes visuels** « En retard / À venir » — le tri par date
  suffit, les regroupements n'ajoutaient que du bruit.
- Chaque carte : horizon (badge), titre, pastilles sentiers (couleurs du
  GeoJSON), nb de signalements rattachés, participants.
- Bouton `+ Nouveau projet` (gate mot de passe comité existant).

```
PROJETS                                  [+ Nouveau projet]
───────────────────────────────────────────────────────────
▸ 20 juin    Dégager l'arbre du Ruisseau      ●Ruisseaux
             3 signalements · Jean, Lise
▸ Août       Remplacer 3 panneaux de départ   ●Écurie ●Sapinière
             2 signalements
▸ 2027       Drainage section nord            ●Ruisseaux
─ À planifier ──────────────────────────────────────────────
▸            Banc au belvédère
─ Terminés (4) ─────────────────────────────── [déplier] ──
```

### Fiche projet (clic sur une carte → **vraie vue**, URL `?id=P-3`)

Pas de tiroir ni de modal : la page change, le bouton « retour » du
navigateur fonctionne.

1. Titre, horizon, statut, sentiers, participants (éditables, comité).
2. Description.
3. **Signalements rattachés** : liste en lecture (vignette + catégorie +
   statut). Bouton « **Rattacher des signalements** » → ouvre
   `map.html?assigner=P-3` (mode assignation, section 6).
4. Bouton « **Marquer terminé** » → dialogue de clôture (décision #10).
5. Journal (Phase 3).

### Création / édition

Formulaire simple : **seuls titre et horizon sont obligatoires**. L'horizon
se saisit par **gros boutons radio** (`Date précise` / `Mois` / `Saison` /
`Année` / `À planifier`) qui ouvrent le bon champ — jamais deux date-pickers
nus. Description, sentiers, participants : ajoutables après coup. Créer un
projet doit prendre 30 secondes.

Le placeholder de la **Description** propose un mini-modèle (sans rien
imposer) :

```
Problème / historique :
Solution retenue :
Matériel nécessaire :
Budget (si requis) :
```

---

## 6. Mode assignation de la carte (`map.html?assigner=P-3`)

> Choix du paramètre : `?assigner=` (le verbe = l'action du mode). Le nom
> `?projet=` est **réservé** pour un futur filtre d'affichage « voir les
> tâches du/des projet(s) X » en mode normal — les deux ne doivent pas
> entrer en collision.

L'assignation se fait **sur la carte**, là où le comité a déjà l'habitude
d'ouvrir les signalements — et le popup du mode normal ne gagne **aucun**
bouton (il est déjà assez chargé).

- **Hero modifié** : « Assigner des signalements au projet *Nom du projet* ».
- **Bannière persistante** : « Mode assignation — projet *X* ·
  [Terminer → retour au projet] ». Sortie du mode toujours visible.
- **Filtres pré-appliqués** : sentiers du projet + signalements ouverts.
  Débrayables si on cherche ailleurs. (⚠️ le filtre actuel n'accepte qu'un
  sentier — à étendre pour accepter une liste.)
- **Pas de select box** : le projet vient de l'URL, le popup n'offre qu'une
  action contextuelle.

Trois états visibles des repères dans ce mode :

| État du signalement | Apparence | Action dans le popup |
|---------------------|-----------|----------------------|
| Ouvert, sans projet | normale | « **Assigner à ce projet** » |
| Déjà dans **ce** projet | couleur/halo distinctif | « **Retirer du projet** » |
| Déjà dans un **autre** projet | grisé, mention « Déjà dans : *Y* » | aucune (le retirer d'abord depuis l'autre projet — pas de réassignation en un clic) |

---

## 7. Plan de développement (itératif, valider à chaque phase)

### Phase 1 — le cœur : liste + création ✅ *(livrée et validée le 12 juin 2026)*

- [x] `code.gs` : onglet `Projets` (en-tête auto-réparant via
      `ensureProjectsHeader`), `setupProjectsSheet()`, `createProject`,
      `updateProject`, projets dans `doGet`.
- [x] `projets.html` : liste triée par horizon, fiche projet (`?id=`),
      formulaire de création avec raccourcis d'horizon, édition
      (y compris participants).
- [x] `formatHorizon()` dans `shared/horizon.js`.
- [x] Liste des sentiers dérivée du GeoJSON (`getTrailList()` dans
      `shared/trails.js` — sentiers principaux seulement).
- [x] Entrée « Projets » dans `shared/masthead.js`.
- [x] Nettoyage : « En cours » retiré de la légende/des filtres de
      `map.html`, des docs et des captures synthétiques
      (⚠️ relancer `npm run screenshots` pour rafraîchir le guide).

### Phase 2 — assigner et clôturer ✅ *(livrée le 12 juin 2026 — à valider sur le terrain)*

- [x] `code.gs` : colonne P + `setReportProject` + `closeProject` (une seule
      requête pour résoudre/détacher en bloc) + `project` dans `rowToReport()`.
- [x] Carte : **mode assignation** (`?assigner=`) complet — hero, bannière,
      pré-filtre (1 sentier → sélection directe ; N sentiers → option
      synthétique « Sentiers du projet »), 3 états de repères
      (normal / ocre = ce projet / gris = autre projet), actions
      assigner/retirer.
- [x] Carte (mode normal) : chip « Projet : *X* » cliquable dans le popup
      des signalements assignés (seul ajout au popup du quotidien).
- [x] Fiche projet : liste des signalements rattachés + bouton vers le mode
      assignation.
- [x] Clôture : « Marquer terminé » → dialogue de résolution en bloc avec
      cases à décocher (décochés = détachés, retour au triage).
- ⚠️ Déploiement : recopier `code.gs` + **redéployer**, puis ré-exécuter
      `setupSheet()` une fois (ajoute l'en-tête « Projet » en colonne P —
      ne touche que la ligne 1).

### Phase 3 — mémoire du projet ✅ *(livrée le 12 juin 2026)*

- [x] Journal de suivi (`appendProjectFollowup` + UI sur la fiche, dates
      affichées en clair, nom mémorisé partagé avec le reste de l'app).
- [x] Documentation : README (routes, modèle, structure), GUIDE.md
      (section « Organiser les projets » + calque « anciens tracés »),
      captures régénérées avec données synthétiques de projets.
- ⚠️ Déploiement : recopier `code.gs` + **redéployer**.

### À réévaluer après usage

- Sort de la page **Corvées** (boîte de triage « non assignés »? fusion dans
  Projets? statu quo?).
- **Filtre carte par projet** en mode normal (`?projet=P-3` ou
  `?projet=P-3,P-7`) — le nom de paramètre est réservé pour ça.
- **Champ « Matériel » dédié** (et/ou suivi de budget structuré) si l'usage
  montre que l'info se perd dans la Description.
- Toute idée de participation des bénévoles hors comité (« Ça m'intéresse »).

### Hors scope (pour l'instant)

Notifications, calendrier/iCal, adopt-a-trail (toujours différé).

---

## 8. Principes UI pour notre public

Le public (comité et bénévoles) est en grande partie des **boomers**. Règles
tenues tout au long de la conception :

- **Des vraies vues, pas des tiroirs** : la fiche projet est une page (URL
  propre, bouton retour fonctionnel), pas un drawer superposé.
- **Des mots, pas des icônes seules** : « Assigné au projet : … », pas un
  pictogramme mystère.
- **États dérivés plutôt que saisis** : « Assigné » se déduit, personne n'a
  de discipline de mise à jour à tenir — l'info est toujours vraie.
- **Popups de la carte : ne rien ajouter en mode normal** — ils sont déjà
  chargés. Les fonctions contextuelles passent par des modes dédiés
  (paramètre d'URL), visibles seulement quand on en a besoin.
- **Minimum de champs obligatoires** (titre + horizon), gros boutons,
  raccourcis de saisie pour les dates.
- **Pas de pagination ni de recherche** : à l'échelle du comité
  (10–20 projets), une liste chronologique suffit.
- **Une sortie évidente de chaque mode** (bannière avec gros bouton
  « Terminer »).
