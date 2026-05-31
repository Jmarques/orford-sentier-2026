# Orford-sur-le-Lac — Entretien des sentiers

Petite application communautaire pour le **Comité d'entretien des sentiers
d'Orford-sur-le-Lac** (Québec, fr-CA). Les résidents signalent les problèmes
rencontrés sur les sentiers (arbres tombés, déchets, pancartes brisées,
ravinement…) ; le comité fait le triage, le suivi et la résolution.

> 📖 Pour le **mode d'emploi destiné aux utilisateurs** (bénévoles, comité),
> voir [`GUIDE.md`](GUIDE.md). Le présent document est la doc **technique**.

---

## Architecture en bref

```
┌─────────────────────┐      fetch() GET/POST       ┌──────────────────────────┐
│  Pages HTML statiques│ ──────────────────────────► │ Google Apps Script (web)  │
│  (index / map /      │                             │  code.gs  → doGet/doPost  │
│   corvees / guide)   │ ◄────────────────────────── │                           │
└─────────────────────┘        JSON                  └────────────┬─────────────┘
                                                                   │
                                                        ┌──────────▼───────────┐
                                                        │  Google Sheet (1 ligne│
                                                        │  = 1 signalement)     │
                                                        │  + dossier Drive       │
                                                        │    (photos)            │
                                                        └───────────────────────┘
```

- **Front-end** : pages HTML **statiques**, sans build, sans framework. Chaque
  page est un fichier autonome avec son CSS et son JS inline, plus quelques
  modules partagés dans `shared/`. Les dépendances tierces (Web Awesome,
  Leaflet, exifr, fonts) sont chargées par **CDN** — il n'y a donc rien à
  compiler ni à bundler.
- **Back-end** : un seul fichier **Google Apps Script** (`code.gs`) déployé en
  *Application Web*. Il expose un `doGet` (liste des signalements) et un
  `doPost` (création + actions de mise à jour).
- **Stockage** : une **feuille Google Sheets** (une ligne par signalement) et un
  **dossier Google Drive** (les photos). Pas de base de données, pas
  d'authentification — le modèle est basé sur la confiance pour une petite
  communauté.

---

## Stack

| Couche        | Techno                                                            |
|---------------|-------------------------------------------------------------------|
| UI            | HTML/CSS/JS natif, [Web Awesome](https://webawesome.com) (web components) |
| Cartographie  | [Leaflet](https://leafletjs.com) + `leaflet.markercluster`         |
| Photos/EXIF   | [exifr](https://github.com/MikeKovarik/exifr) (lecture du GPS dans les photos) |
| Tracés        | GeoJSON (`shared/trails.geojson`)                                 |
| Back-end      | Google Apps Script (`code.gs`)                                    |
| Données       | Google Sheets + Google Drive                                      |
| Outillage     | Node.js (Playwright pour les captures du guide)                   |

---

## Démarrer un serveur local

Comme tout est statique, **il suffit de servir le dossier en HTTP**. On ne peut
pas juste ouvrir les fichiers en `file://` : les pages chargent
`shared/trails.geojson` par `fetch()`, ce qui exige une vraie origine HTTP.

Prérequis : [Node.js](https://nodejs.org) installé (pour `npm`/`npx`).

### Option recommandée — avec rechargement automatique 🔁

```bash
npm run dev
```

Cela lance [`live-server`](https://www.npmjs.com/package/live-server) sur
**http://localhost:8765** et **recharge le navigateur automatiquement** dès
qu'un fichier change (HTML, CSS, JS, GeoJSON). `npx` télécharge `live-server`
au premier lancement — aucune installation préalable nécessaire.

Pages disponibles une fois le serveur lancé :

- http://localhost:8765/index.html — **Signaler** (formulaire)
- http://localhost:8765/map.html — **Carte**
- http://localhost:8765/corvees.html — **Corvées**
- http://localhost:8765/guide.html — **Guide**

### Option sans dépendance — Python (pas d'auto-reload)

Si Python 3 est installé, aucun téléchargement n'est nécessaire :

```bash
npm run serve          # = python3 -m http.server 8765
```

Il faut alors **rafraîchir le navigateur à la main** après chaque modification.

### Astuces de développement

- **Console mobile sans câble** : ajoutez `?debug` à l'URL (ex.
  `…/index.html?debug`). Un bouton flottant ouvre une console JS complète
  ([eruda](https://github.com/liriliri/eruda)) directement sur la page —
  pratique pour déboguer sur un vrai téléphone.
- **Paramètres d'URL de la carte** : `map.html` accepte des filtres
  pré-appliqués via la query string, utilisés par la page Corvées :
  - `?trail=Sentier%20des%20Ruisseaux` — n'affiche qu'un sentier.
  - `?type=dechets` — ne montre qu'un type (`nature`, `signalisation`,
    `infrastructure`, `terrain`, `dechets`, `autre`).
  - Les deux se combinent : `?trail=…&type=dechets`.

---

## Structure du projet

```
.
├── index.html            # Page « Signaler » (formulaire mobile)
├── map.html              # Carte des signalements (+ outils comité)
├── corvees.html          # Console d'organisation (matrice sentier × type)
├── guide.html            # Rend GUIDE.md en page web
├── code.gs               # Back-end Google Apps Script (à déployer côté Google)
│
├── shared/               # Modules partagés par toutes les pages
│   ├── config.js         #   window.ORFORD : URL du back-end, centre/zoom carte
│   ├── theme.css         #   thème visuel commun (couleurs, typo, composants)
│   ├── masthead.js       #   <site-masthead> — bandeau de navigation du haut
│   ├── footer.js         #   <site-footer> — pied de page commun
│   ├── trails.js         #   chargeur GeoJSON + ORFORD.addTrailsToMap(map)
│   ├── categories.js     #   catégorie → famille visuelle → icône (6 familles)
│   └── trails.geojson    #   tracés GPS des sentiers (source de vérité)
│
├── scripts/
│   └── screenshots.mjs   # Génère les captures de GUIDE.md (Playwright)
├── docs/screenshots/     # Captures utilisées par le guide
│
├── GUIDE.md              # Mode d'emploi utilisateur (illustré)
├── README.md             # Ce fichier
└── package.json          # Scripts npm + dépendances de dev
```

Les pages partagent leur look et leur navigation via les composants
`<site-masthead>` / `<site-footer>` et `shared/theme.css`. Toute la config
runtime tient dans `shared/config.js`, exposée en un seul global `window.ORFORD`
pour que les `<script>` non-modules de chaque page la lisent sans bundling.

> **Note sur l'ordre des scripts** : `config.js` est chargé **sans `defer`**
> pour que `window.ORFORD` existe avant le `<script>` inline en bas de page.

---

## Le fichier GeoJSON des sentiers (`shared/trails.geojson`)

C'est la **source de vérité** des tracés. `shared/trails.js` le charge une fois
(mis en cache pour la durée de vie de la page) puis expose
`ORFORD.addTrailsToMap(map)` : une seule ligne suffit à peindre tout le réseau
sur n'importe quelle carte Leaflet de l'app.

### Forme générale

C'est un `FeatureCollection` standard : **une `Feature` par segment** (sentier
principal ou accès). Chaque feature a une géométrie `LineString` et un bloc
`properties`.

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name":  "Sentier de la Sapinière",   // nom affiché
        "color": "#1f7a3a"                     // couleur du tracé
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-72.28479, 45.30590],   // ⚠ [longitude, latitude] — lng EN PREMIER
          [-72.28477, 45.30653],
          [-72.28505, 45.30831]
        ]
      }
    }
  ]
}
```

### ⚠️ Ordre des coordonnées

GeoJSON impose **`[longitude, latitude]`** — l'**inverse** de Leaflet qui
attend `L.marker([lat, lng])`. Leaflet fait la conversion automatiquement quand
il lit du GeoJSON, donc on fournit les coordonnées brutes telles quelles. C'est
le piège le plus courant : si un sentier apparaît en plein océan, les deux
nombres sont probablement inversés.

### Propriétés disponibles

| Propriété    | Requis | Description |
|--------------|:------:|-------------|
| `name`       | ✓      | Nom affiché du segment (sert aussi au tooltip et au filtre de la carte). |
| `color`      | ✓\*    | Couleur du tracé (hex, ex. `#1f7a3a`). À défaut, retombe sur l'ocre `#e89327`. |
| `condition`  | —      | État du segment. Seule valeur gérée : `"rough"` → tracé **en pointillés** et libellé **« Broussailleux »** (sentier existant mais non entretenu officiellement). |
| `kind`       | —      | Type de segment. `"access"` marque un **accès** (entrée/sortie depuis une rue résidentielle, p. ex.) par opposition à un sentier principal. |
| `parent`     | —      | Pour un `kind: "access"` : le **nom du sentier principal** auquel il se rattache. Permet à l'accès de **rester visible** quand on sélectionne son sentier parent dans le filtre de la carte. |

\* `color` n'est pas strictement obligatoire (il y a une couleur de repli), mais
on en met une pour chaque sentier.

### Distances calculées automatiquement

Pas besoin de saisir les longueurs : `trails.js` calcule la distance de chaque
segment à la volée (formule de Haversine sur les points du `LineString`) et
l'affiche dans le tooltip au survol (en m ou km).

### MultiLineString

Si une feature est un `MultiLineString`, `trails.js` **éclate** chaque
sous-ligne en sa propre `Feature`/couche Leaflet, pour qu'on puisse survoler,
mesurer et surligner chaque tronçon indépendamment.

### Comment éditer/créer le tracé

La façon la plus simple est l'éditeur visuel **[geojson.io](https://geojson.io)** :

1. Ouvrir geojson.io, naviguer jusqu'à Orford-sur-le-Lac.
2. Tracer chaque sentier avec l'outil ligne (LineString), en suivant la trace
   sur le fond de carte (ou en important une trace GPX si on en a une).
3. Renseigner les `properties` (`name`, `color`, etc.) dans le panneau de
   droite, ou directement dans l'onglet JSON.
4. Copier le JSON résultant dans `shared/trails.geojson`.

Le champ `_doc` en tête du fichier rappelle toutes ces conventions, et le bloc
de commentaires en haut de `shared/trails.js` documente la forme attendue.

---

## Catégories et icônes (`shared/categories.js`)

Source de vérité unique pour le mapping **catégorie → famille visuelle → icône**,
partagée par `map.html` (légende, pins, popups) et `index.html` (icônes du menu
déroulant). Les libellés libres saisis dans le formulaire sont rangés dans **6
familles** via des regex souples (donc un futur libellé comme « Arbres tombés
multiples » se classe sans toucher au code) :

| Famille          | Déclencheurs (regex)                                  | Icône (Font Awesome) |
|------------------|-------------------------------------------------------|----------------------|
| `nature`         | arbre, végétation                                     | `tree`               |
| `signalisation`  | pancarte, balise                                      | `signs-post`         |
| `infrastructure` | pont, passerelle                                      | `bridge`             |
| `dechets`        | déchet, débris                                        | `trash-can`          |
| `terrain`        | érosion, ravinement, inondation, drainage, danger     | `triangle-exclamation` |
| `autre`          | (tout le reste)                                       | `circle-question`    |

Pour ajouter ou renommer une catégorie, on modifie **uniquement ce fichier** ;
les deux pages suivent automatiquement.

---

## Back-end — Google Apps Script (`code.gs`)

Tout le serveur tient dans `code.gs`, déployé comme **Application Web** Apps
Script. Le front l'appelle par `fetch()` sur l'URL `/exec` configurée dans
`shared/config.js` (`ENDPOINT_URL`).

### Modèle de données (colonnes de la feuille)

L'ordre des colonnes de `appendRow()` doit correspondre à celui de
`rowToReport()` — ne pas réordonner l'un sans l'autre.

| Col | En-tête             | Notes |
|-----|---------------------|-------|
| A   | Horodatage          | Date de création |
| B   | Sentier             | |
| C   | Catégorie           | |
| D   | Latitude            | vide si « à localiser » |
| E   | Longitude           | vide si « à localiser » |
| F   | Précision GPS (m)   | |
| G   | Source GPS          | `Appareil` / `Photo EXIF` / `Choix manuel` |
| H   | Lien Maps           | calculé depuis lat/lng |
| I   | URL du média        | fichier Drive |
| J   | Nom du fichier      | |
| K   | Nom du déclarant    | |
| L   | Notes               | |
| M   | Priorité            | rempli manuellement |
| N   | **Statut**          | `Nouveau` / `En cours` / `Résolu` / `Doublon` |
| O   | **Suivi**           | journal append-only, une ligne `[date · auteur] texte` par entrée |

### Routes (`doPost`, routées par le champ `action`)

| `action`         | Effet |
|------------------|-------|
| *(aucune)*       | `createReport` — nouveau signalement (statut `Nouveau`). |
| `updateLocation` | Met à jour lat/lng/source/lien Maps d'une ligne existante (repère posé a posteriori depuis le tiroir « à localiser »). |
| `updateStatus`   | Clôt un signalement — uniquement `Résolu` ou `Doublon` (liste blanche). |
| `appendFollowup` | Ajoute une entrée datée au journal de suivi (col. O), **sans jamais écraser** l'existant. |

`doGet` renvoie **toutes** les lignes en JSON (`{ ok, count, reports }`), y
compris celles sans coordonnées : c'est le client (`map.html`) qui sépare les
signalements « plaçables » de ceux « à localiser ». Les vignettes photo sont
servies via `https://drive.google.com/thumbnail?id=…`.

### Installation / déploiement du back-end

1. Créer une feuille Google → copier son ID dans `SHEET_ID`.
2. Créer un dossier Drive → copier son ID dans `FOLDER_ID`.
3. Coller `code.gs` dans le projet Apps Script lié, puis exécuter
   **`setupSheet()` une fois** (crée la ligne d'en-tête + la mise en forme).
4. **Déployer → Nouveau déploiement → Application Web**
   - *Exécuter en tant que* : **Moi**
   - *Qui a accès* : **Tout le monde**
5. Copier l'URL `/exec` dans `ENDPOINT_URL` de `shared/config.js`.

> ⚠️ **Toute modification de `code.gs` exige un redéploiement manuel** (gérer
> la version du déploiement) pour prendre effet. Pour éviter d'invalider l'URL,
> mettre à jour le déploiement existant plutôt que d'en créer un nouveau.

---

## Captures d'écran du guide (`scripts/screenshots.mjs`)

Le guide (`GUIDE.md` / `guide.html`) s'appuie sur des captures rangées dans
`docs/screenshots/`, **générées automatiquement** avec Playwright. Le script
**intercepte tous les appels au back-end** et les remplace par un **jeu de
données synthétique** : aucune donnée réelle n'apparaît, et les captures sont
reproductibles.

```bash
# Prérequis (une fois) :
npm install
npx playwright install chromium

# Lancer un serveur local dans un terminal :
npm run serve            # http://localhost:8765 (le script attend ce port)

# Puis, dans un autre terminal, générer les captures :
npm run screenshots
```

Les fichiers sont écrits dans `docs/screenshots/`. Le script gère deux contextes
(desktop pour la carte/Corvées, mobile pour le formulaire) afin que chaque
capture ait la bonne taille.

---

## Conventions & rappels

- **Langue** : interface et contenu en **français (fr-CA)**.
- **Pas d'auth** : modèle de confiance ; tout le monde peut signaler, consulter,
  commenter et clôturer.
- **Modèle de statut** consolidé à `Nouveau / En cours / Résolu / Doublon`.
- **Numéro de ligne** : chaque popup expose discrètement le numéro de ligne de
  la feuille Google — pratique pour corriger un détail directement dans le
  tableur.
- **Pas de build** : on édite un fichier, on rafraîchit (ou on laisse
  `npm run dev` recharger). Rien à compiler.

---

*Comité d'entretien des sentiers · Orford-sur-le-Lac*
