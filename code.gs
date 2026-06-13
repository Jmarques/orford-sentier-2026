/**
 * Rapport de sentier — Script Apps Script (backend)
 * ----------------------------------------------------------------
 * Reçoit les soumissions JSON du formulaire mobile, enregistre la
 * photo/vidéo dans un dossier Drive, et ajoute une ligne à la
 * feuille Google.
 *
 * Étapes d'installation :
 *   1. Créer une feuille Google → copier son ID dans SHEET_ID.
 *      - Onglet « Signalements » : les données (en-tête créé par setupSheet).
 *      - Onglet « Config » : les mots de passe. Colonne A = libellé,
 *        colonne B = valeur. Deux lignes attendues :
 *            communaute | <mot de passe de la communauté>
 *            comite     | <mot de passe du comité>
 *        Cet onglet n'est JAMAIS exposé (doGet ne lit que « Signalements »).
 *        Garder la feuille partagée uniquement avec le comité.
 *   2. Créer un dossier Drive  → copier son ID dans FOLDER_ID.
 *   3. Exécuter setupSheet() une fois pour créer l'en-tête.
 *   4. Déployer → Nouveau déploiement → Application Web.
 *      Exécuter en tant que : Moi.
 *      Qui a accès : Tout le monde.
 *      Copier l'URL /exec dans le fichier HTML.
 * ---------------------------------------------------------------- */

// ======== CONFIG =========================================================
const SHEET_ID   = '13BZIbWOw77hZQu25otyYBJfjY5zFWhRNuwjv2bFYcXY';
const FOLDER_ID  = '16MgtyEf36wbkFXbJnHDVIdRig2Sl55nJ';
const SHEET_NAME = 'Signalements'; // onglet des données
const CONFIG_NAME = 'Config';      // onglet des mots de passe (jamais exposé)
const PROJECTS_NAME = 'Projets';   // onglet des projets d'entretien
// =========================================================================

/**
 * Retourne l'onglet des données par NOM (jamais par index). C'est essentiel :
 * référencer par index risquerait de lire l'onglet « Config » et d'exposer
 * les mots de passe via doGet.
 */
function getDataSheet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Onglet « ' + SHEET_NAME + ' » introuvable.');
  return sheet;
}

/** Onglet « Projets », référencé par nom (même raison que getDataSheet). */
function getProjectsSheet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PROJECTS_NAME);
  if (!sheet) throw new Error('Onglet « ' + PROJECTS_NAME + ' » introuvable.');
  return sheet;
}

/**
 * Lit les mots de passe depuis l'onglet « Config » (par libellé en colonne A,
 * robuste si on réordonne les lignes) et les met en cache 5 min via
 * CacheService — on ne touche donc la feuille qu'une fois toutes les 5 min,
 * pas à chaque POST.
 */
function getSecrets() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('orford_secrets');
  if (cached) return JSON.parse(cached);

  const secrets = { communaute: '', comite: '' };
  const sheet   = SpreadsheetApp.openById(SHEET_ID).getSheetByName(CONFIG_NAME);
  if (sheet) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 0; i < rows.length; i++) {
      const key = String(rows[i][0] || '').trim().toLowerCase();
      const val = String(rows[i][1] || '');
      if (key === 'communaute') secrets.communaute = val;
      else if (key === 'comite') secrets.comite = val;
    }
  }
  cache.put('orford_secrets', JSON.stringify(secrets), 300); // 5 min
  return secrets;
}

/**
 * Déduit le niveau d'autorisation d'un mot de passe :
 *   'comite'     → autorise tout
 *   'communaute' → autorise la création de signalements
 *   null         → refusé
 * Le comité l'emporte si les deux codes étaient identiques.
 */
function checkRole(password) {
  const pw = String(password == null ? '' : password);
  if (!pw) return null;
  const s = getSecrets();
  if (s.comite && pw === s.comite) return 'comite';
  if (s.communaute && pw === s.communaute) return 'communaute';
  return null;
}

/**
 * Réponse d'échec d'authentification. Le drapeau `authError` indique au
 * client de re-demander le mot de passe (code faux OU rôle insuffisant).
 */
function authError(msg) {
  return jsonResponse({ ok: false, authError: true, error: msg });
}

// Traduction des sources GPS (valeurs techniques → libellés français)
const GPS_SOURCE_FR = {
  'device': 'Appareil',
  'exif':   'Photo EXIF',
  'picker': 'Choix manuel',
  '':       ''
};


/**
 * Point d'entrée principal — appelé par le formulaire et la page carte
 * via fetch(). Le champ `action` route entre les différentes opérations :
 *   - (par défaut)        → création d'un nouveau signalement
 *   - 'updateLocation'    → mise à jour des coordonnées d'une rangée existante
 *   - 'updateStatus'      → clôture d'un signalement (Résolu / Doublon)
 *   - 'appendFollowup'    → entrée au journal de suivi d'un signalement
 *   - 'createProject'     → nouveau projet d'entretien (onglet Projets)
 *   - 'updateProject'     → mise à jour d'un projet existant (par ID)
 *   - 'setReportProject'  → assigne/retire un signalement à un projet (col. P)
 *   - 'closeProject'      → clôt un projet + résout/détache ses signalements
 *   - 'appendProjectFollowup' → entrée au journal de suivi d'un projet
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'updateLocation') {
      return updateLocationHandler(data);
    }
    if (data.action === 'updateStatus') {
      return updateStatusHandler(data);
    }
    if (data.action === 'appendFollowup') {
      return appendFollowupHandler(data);
    }
    if (data.action === 'createProject') {
      return createProjectHandler(data);
    }
    if (data.action === 'updateProject') {
      return updateProjectHandler(data);
    }
    if (data.action === 'setReportProject') {
      return setReportProjectHandler(data);
    }
    if (data.action === 'closeProject') {
      return closeProjectHandler(data);
    }
    if (data.action === 'appendProjectFollowup') {
      return appendProjectFollowupHandler(data);
    }
    // No action = a new report from the form. An unknown action is rejected
    // rather than mis-handled as a report (avoids junk rows on version skew).
    if (data.action) {
      return jsonResponse({ ok: false, error: 'Action inconnue : ' + data.action });
    }
    return createReport(data);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function createReport(data) {
  // Un mot de passe valide (communauté ou comité) est requis pour signaler.
  if (!checkRole(data.password)) {
    return authError('Mot de passe incorrect ou manquant.');
  }

  // Enregistrer le média dans Drive (s'il y en a un)
  let mediaUrl = '';
  let mediaName = '';
  if (data.mediaBase64 && data.mediaType && data.mediaName) {
    const folder  = DriveApp.getFolderById(FOLDER_ID);
    const decoded = Utilities.base64Decode(data.mediaBase64);

    // Préfixer le nom de fichier avec un horodatage pour éviter les collisions.
    const safeName =
      Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') +
      '_' + sanitizeFilename(data.mediaName);

    const blob = Utilities.newBlob(decoded, data.mediaType, safeName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    mediaUrl  = file.getUrl();
    mediaName = safeName;
  }

  // Construire le lien Google Maps si on a des coordonnées
  const mapsLink =
    (data.latitude != null && data.longitude != null)
      ? 'https://www.google.com/maps?q=' + data.latitude + ',' + data.longitude
      : '';

  // Traduire la source GPS
  const gpsSourceFr = GPS_SOURCE_FR[data.gpsSource] != null
    ? GPS_SOURCE_FR[data.gpsSource]
    : (data.gpsSource || '');

  // Ajouter la ligne
  const sheet = getDataSheet();
  sheet.appendRow([
    new Date(),                  // A  Horodatage
    data.trail        || '',     // B  Sentier
    data.category     || '',     // C  Catégorie
    data.latitude     != null ? data.latitude  : '', // D  Latitude
    data.longitude    != null ? data.longitude : '', // E  Longitude
    data.gpsAccuracy  != null ? data.gpsAccuracy : '', // F  Précision GPS (m)
    gpsSourceFr,                 // G  Source GPS
    mapsLink,                    // H  Lien Maps
    mediaUrl,                    // I  URL du média
    mediaName,                   // J  Nom du fichier média
    data.reporterName || '',     // K  Nom du déclarant
    data.notes        || '',     // L  Notes
    '',                          // M  Priorité  (à remplir manuellement)
    'Nouveau'                    // N  Statut    (colonne de suivi)
  ]);

  return jsonResponse({ ok: true, mediaUrl: mediaUrl });
}

/**
 * Met à jour les colonnes GPS (D, E, F, G, H) d'une rangée existante.
 * Appelé depuis le drawer admin de map.html quand un membre du comité
 * place un repère a posteriori sur un signalement sans coordonnées.
 */
function updateLocationHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const row = parseInt(data.rowIndex, 10);
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(row) || row < 2) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }

  const sheet = getDataSheet();
  if (row > sheet.getLastRow()) {
    return jsonResponse({ ok: false, error: 'Ligne introuvable.' });
  }

  // Écrit lat (D), lng (E), précision vide (F), source = "Choix manuel
  // (différé)" (G), et le lien Maps (H), en une seule opération.
  sheet.getRange(row, 4, 1, 5).setValues([[
    lat,
    lng,
    '',
    'Choix manuel (différé)',
    'https://www.google.com/maps?q=' + lat + ',' + lng
  ]]);

  return jsonResponse({ ok: true });
}

/**
 * Clôture un signalement en mettant à jour son statut (colonne N).
 * Appelé depuis map.html quand un bénévole ferme un signalement
 * (« Résolu » = tâche faite, « Doublon » = redondant). On restreint
 * aux deux statuts de clôture pour éviter les valeurs arbitraires.
 */
function updateStatusHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const row = parseInt(data.rowIndex, 10);
  const status = String(data.status || '');
  // « Clôturé » est le vocabulaire courant (commun signalements/projets,
  // juin 2026) ; « Résolu » reste accepté pour les vieux clients en cache.
  const ALLOWED = ['Clôturé', 'Résolu', 'Doublon'];

  if (!Number.isInteger(row) || row < 2 || ALLOWED.indexOf(status) === -1) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }

  const sheet = getDataSheet();
  if (row > sheet.getLastRow()) {
    return jsonResponse({ ok: false, error: 'Ligne introuvable.' });
  }

  sheet.getRange(row, 14).setValue(status); // N = Statut
  return jsonResponse({ ok: true });
}

/**
 * Ajoute une entrée au journal de suivi (colonne O) d'une rangée existante.
 * Le suivi est APPEND-only : on lit la valeur courante et on y ajoute une
 * ligne « [date · auteur] texte » — jamais d'écrasement. Permet de proposer
 * des résolutions ou de commenter un signalement (depuis map.html).
 */
function appendFollowupHandler(data) {
  const row    = parseInt(data.rowIndex, 10);
  // Collapse newlines so each follow-up entry stays on a single line — the
  // client parses the log one line per entry.
  const text   = String(data.text || '').replace(/\s*\n+\s*/g, ' ').trim();
  const author = String(data.author || '').trim();

  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  if (!Number.isInteger(row) || row < 2 || !text) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }

  const sheet = getDataSheet();
  if (row > sheet.getLastRow()) {
    return jsonResponse({ ok: false, error: 'Ligne introuvable.' });
  }

  const cell     = sheet.getRange(row, 15); // O = Suivi
  const existing = String(cell.getValue() || '');
  const stamp    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const entry    = '[' + stamp + ' · ' + (author || 'Anonyme') + '] ' + text;
  const updated  = existing ? existing + '\n' + entry : entry;

  cell.setValue(updated);
  return jsonResponse({ ok: true, followup: updated });
}


// ======== Projets =========================================================
// Onglet « Projets » : 1 ligne = 1 projet d'entretien.
// Colonnes : A ID · B Horodatage · C Titre · D Description · E Sentiers
//            F Début · G Fin · H Statut · I Participants · J Suivi
// L'ID (P-1, P-2, …) est STABLE : c'est lui — jamais le numéro de ligne —
// qui sert de référence (notamment depuis la colonne Projet des
// signalements, en phase 2).

// « Clôturé » est la valeur courante ; « Terminé » (ancien vocabulaire)
// reste accepté pour les lignes/clients existants.
const PROJECT_STATUSES = ['Actif', 'Clôturé', 'Terminé', 'Abandonné'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROJECT_HEADERS = [
  'ID', 'Horodatage', 'Titre', 'Description', 'Sentiers',
  'Début', 'Fin', 'Statut', 'Participants', 'Suivi'
];

/**
 * Garantit que la ligne 1 de l'onglet Projets est bien l'en-tête. doGet et
 * rowToProject sautent toujours la ligne 1 : sans en-tête, la première
 * ligne de données devient invisible. Si des données occupent déjà la
 * ligne 1 (setup oublié), on INSÈRE une ligne au-dessus — jamais d'écrasement.
 */
function ensureProjectsHeader(sheet) {
  const row1 = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, PROJECT_HEADERS.length).getValues()[0]
    : [];
  if (String(row1[0] || '').trim() === 'ID') return; // en-tête déjà en place
  const hasContent = row1.some(function (v) { return String(v).trim() !== ''; });
  if (hasContent) sheet.insertRowBefore(1); // données en ligne 1 → on pousse vers le bas
  sheet.getRange(1, 1, 1, PROJECT_HEADERS.length).setValues([PROJECT_HEADERS]);
}

/** Ligne (1-indexée) d'un projet par son ID, ou -1 si introuvable. */
function findProjectRowById(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return -1;
}

/** Prochain ID libre (max des suffixes numériques existants + 1). */
function nextProjectId(sheet) {
  const last = sheet.getLastRow();
  let max = 0;
  if (last >= 2) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const m = String(ids[i][0]).match(/^P-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return 'P-' + (max + 1);
}

/** Date « yyyy-MM-dd » validée, ou '' si absente/incorrecte. */
function cleanIsoDate(value) {
  const s = String(value || '').trim();
  return ISO_DATE_RE.test(s) ? s : '';
}

/** Liste de sentiers (tableau ou chaîne) → chaîne « A, B » normalisée. */
function cleanTrails(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map(function (t) { return String(t).trim(); })
    .filter(Boolean)
    .join(', ');
}

/**
 * Crée un projet (réservé au comité). Seul le titre est obligatoire —
 * créer un projet doit rester une affaire de 30 secondes.
 * Un verrou protège la génération de l'ID contre deux créations simultanées.
 */
function createProjectHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const title = String(data.title || '').trim();
  if (!title) {
    return jsonResponse({ ok: false, error: 'Le titre est obligatoire.' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getProjectsSheet();
    ensureProjectsHeader(sheet); // auto-réparation si le setup n'a pas tourné
    const id = nextProjectId(sheet);
    sheet.appendRow([
      id,                                  // A  ID
      new Date(),                          // B  Horodatage
      title,                               // C  Titre
      String(data.description || ''),      // D  Description
      cleanTrails(data.trails),            // E  Sentiers
      cleanIsoDate(data.start),            // F  Début
      cleanIsoDate(data.end),              // G  Fin
      'Actif',                             // H  Statut
      String(data.participants || ''),     // I  Participants
      ''                                   // J  Suivi (journal, phase 3)
    ]);
    return jsonResponse({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Met à jour un projet existant, repéré par son ID stable (jamais par
 * numéro de ligne). Le journal (col. J) n'est jamais touché ici — il a sa
 * propre route append-only (phase 3).
 */
function updateProjectHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const id = String(data.id || '').trim();
  const title = String(data.title || '').trim();
  const status = String(data.status || 'Actif');
  if (!id || !title || PROJECT_STATUSES.indexOf(status) === -1) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }

  const sheet = getProjectsSheet();
  const row = findProjectRowById(sheet, id);
  if (row === -1) {
    return jsonResponse({ ok: false, error: 'Projet introuvable : ' + id });
  }

  // C..I en une seule écriture (ID, Horodatage et Suivi restent intacts).
  sheet.getRange(row, 3, 1, 7).setValues([[
    title,                               // C  Titre
    String(data.description || ''),      // D  Description
    cleanTrails(data.trails),            // E  Sentiers
    cleanIsoDate(data.start),            // F  Début
    cleanIsoDate(data.end),              // G  Fin
    status,                              // H  Statut
    String(data.participants || '')      // I  Participants
  ]]);
  return jsonResponse({ ok: true });
}

/**
 * Assigne un signalement à un projet (projectId = « P-3 ») ou l'en détache
 * (projectId = ''). Colonne P de l'onglet Signalements — c'est la SEULE
 * écriture du lien signalement↔projet : la relation « au plus un projet »
 * est garantie par construction.
 */
function setReportProjectHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const row = parseInt(data.rowIndex, 10);
  const projectId = String(data.projectId || '').trim();

  if (!Number.isInteger(row) || row < 2) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }
  // Un ID non vide doit exister dans l'onglet Projets — pas de lien orphelin.
  if (projectId !== '' && findProjectRowById(getProjectsSheet(), projectId) === -1) {
    return jsonResponse({ ok: false, error: 'Projet introuvable : ' + projectId });
  }

  const sheet = getDataSheet();
  if (row > sheet.getLastRow()) {
    return jsonResponse({ ok: false, error: 'Ligne introuvable.' });
  }

  sheet.getRange(row, 16).setValue(projectId); // P = Projet
  return jsonResponse({ ok: true });
}

/**
 * Clôt un projet en une seule requête : statut → « Clôturé », les
 * signalements de `resolve` passent à « Clôturé », ceux de `detach` sont
 * détachés du projet (col. P vidée) et gardent leur statut — ils retournent
 * au triage. Le client envoie la répartition décidée dans le dialogue de
 * confirmation (cases cochées = clôturer, décochées = détacher).
 */
function closeProjectHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const id = String(data.id || '').trim();
  const projectsSheet = getProjectsSheet();
  const projectRow = id ? findProjectRowById(projectsSheet, id) : -1;
  if (projectRow === -1) {
    return jsonResponse({ ok: false, error: 'Projet introuvable : ' + id });
  }

  const cleanRows = function (list) {
    return (Array.isArray(list) ? list : [])
      .map(function (n) { return parseInt(n, 10); })
      .filter(function (n) { return Number.isInteger(n) && n >= 2; });
  };
  const resolve = cleanRows(data.resolve);
  const detach  = cleanRows(data.detach);

  const sheet = getDataSheet();
  const last = sheet.getLastRow();
  resolve.forEach(function (row) {
    if (row <= last) sheet.getRange(row, 14).setValue('Clôturé'); // N = Statut
  });
  detach.forEach(function (row) {
    if (row <= last) sheet.getRange(row, 16).setValue(''); // P = Projet
  });

  projectsSheet.getRange(projectRow, 8).setValue('Clôturé'); // H = Statut
  return jsonResponse({ ok: true, resolved: resolve.length, detached: detach.length });
}

/**
 * Ajoute une entrée au journal de suivi d'un projet (col. J). Même pattern
 * APPEND-only que le suivi des signalements : « [date · auteur] texte »,
 * jamais d'écrasement. Repéré par ID stable, pas par numéro de ligne.
 */
function appendProjectFollowupHandler(data) {
  if (checkRole(data.password) !== 'comite') {
    return authError('Action réservée au comité.');
  }

  const id = String(data.id || '').trim();
  // Le client lit le journal une ligne par entrée — pas de retours internes.
  const text   = String(data.text || '').replace(/\s*\n+\s*/g, ' ').trim();
  const author = String(data.author || '').trim();
  if (!id || !text) {
    return jsonResponse({ ok: false, error: 'Paramètres invalides.' });
  }

  const sheet = getProjectsSheet();
  const row = findProjectRowById(sheet, id);
  if (row === -1) {
    return jsonResponse({ ok: false, error: 'Projet introuvable : ' + id });
  }

  const cell     = sheet.getRange(row, 10); // J = Suivi
  const existing = String(cell.getValue() || '');
  const stamp    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const entry    = '[' + stamp + ' · ' + (author || 'Anonyme') + '] ' + text;
  const updated  = existing ? existing + '\n' + entry : entry;

  cell.setValue(updated);
  return jsonResponse({ ok: true, followup: updated });
}

function rowToProject(row) {
  // L'ordre doit correspondre à appendRow() dans createProjectHandler.
  const [id, timestamp, title, description, trails, start, end, status, participants, followup] = row;
  // Si Sheets a converti une date saisie en vrai Date, on la re-sérialise en
  // yyyy-MM-dd dans le fuseau du script (jamais via toISOString → décalage UTC).
  const toIso = function (v) {
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return cleanIsoDate(v);
  };
  return {
    id:           String(id || ''),
    timestamp:    timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || ''),
    title:        String(title || ''),
    description:  String(description || ''),
    trails:       String(trails || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
    start:        toIso(start),
    end:          toIso(end),
    status:       String(status || 'Actif'),
    participants: String(participants || ''),
    followup:     String(followup || '')
  };
}


/**
 * Retourne tous les signalements (avec coordonnées GPS valides) en JSON.
 * Consommé par la page map.html pour afficher les marqueurs sur la carte.
 */
function doGet() {
  try {
    const sheet = getDataSheet();
    const values = sheet.getDataRange().getValues();

    const reports = [];
    // values[0] est la ligne d'en-tête — on la saute.
    // On retourne TOUTES les rangées (même sans coordonnées) ; le client
    // map.html sépare les deux groupes : pinable sur la carte vs à localiser.
    for (let i = 1; i < values.length; i++) {
      const report = rowToReport(values[i]);
      report.rowIndex = i + 1; // 1-indexé pour Sheet.getRange()
      reports.push(report);
    }

    // Projets — même réponse, un seul fetch pour les pages qui croisent les
    // deux. Tolérant : si l'onglet n'existe pas encore, la liste est vide.
    const projects = [];
    try {
      const pValues = getProjectsSheet().getDataRange().getValues();
      for (let i = 1; i < pValues.length; i++) {
        const project = rowToProject(pValues[i]);
        if (project.id) projects.push(project); // ignore les lignes vides
      }
    } catch (e) { /* onglet absent → projects: [] */ }

    return jsonResponse({ ok: true, count: reports.length, reports: reports, projects: projects });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function rowToReport(row) {
  // L'ordre doit correspondre à appendRow() dans doPost.
  // `_mapsLink` n'est pas utilisé côté carte (on recalcule via lat/lng).
  const [timestamp, trail, category, lat, lng, accuracy, gpsSource,
         _mapsLink, mediaUrl, mediaName, reporter, notes, priority, status, followup, project] = row;
  const fileId = extractDriveFileId(mediaUrl);
  return {
    timestamp:    timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || ''),
    trail:        String(trail || ''),
    category:     String(category || ''),
    latitude:     lat === '' || lat == null ? null : Number(lat),
    longitude:    lng === '' || lng == null ? null : Number(lng),
    accuracy:     accuracy === '' || accuracy == null ? null : Number(accuracy),
    gpsSource:    String(gpsSource || ''),
    photoUrl:     String(mediaUrl || ''),
    // URL de vignette Drive — fonctionne pour les fichiers partagés publiquement.
    photoThumb:   fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800' : '',
    photoName:    String(mediaName || ''),
    reporterName: String(reporter || ''),
    notes:        String(notes || ''),
    priority:     String(priority || ''),
    status:       String(status || ''),
    followup:     String(followup || ''),
    project:      String(project || '')   // ID de projet (P-3) ou ''
  };
}

function extractDriveFileId(url) {
  if (!url) return '';
  // Les IDs Drive font typiquement 25+ caractères alphanumériques / tirets.
  const m = String(url).match(/[-\w]{25,}/);
  return m ? m[0] : '';
}


/**
 * À exécuter UNE FOIS après avoir collé votre SHEET_ID. Crée la
 * ligne d'en-tête et applique un peu de mise en forme. Peut être
 * ré-exécuté sans risque — ne touche que la ligne 1.
 */
function setupSheet() {
  const sheet = getDataSheet();
  const headers = [
    'Horodatage', 'Sentier', 'Catégorie',
    'Latitude', 'Longitude', 'Précision GPS (m)', 'Source GPS',
    'Lien Maps', 'URL du média', 'Nom du fichier',
    'Nom du déclarant', 'Notes',
    'Priorité', 'Statut', 'Suivi', 'Projet'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1f3a2e')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  // Format date français pour la colonne Horodatage (jj/mm/aaaa hh:mm:ss)
  sheet.getRange('A2:A').setNumberFormat('dd/mm/yyyy HH:mm:ss');

  // Largeurs de colonnes raisonnables
  sheet.setColumnWidth(1, 160); // Horodatage
  sheet.setColumnWidth(2, 140); // Sentier
  sheet.setColumnWidth(3, 200); // Catégorie
  sheet.setColumnWidths(4, 3, 110); // Lat, Lng, Précision
  sheet.setColumnWidth(7, 110); // Source
  sheet.setColumnWidth(8, 180); // Lien Maps
  sheet.setColumnWidth(9, 220); // URL du média
  sheet.setColumnWidth(10, 180); // Nom du fichier
  sheet.setColumnWidth(11, 160); // Déclarant
  sheet.setColumnWidth(12, 300); // Notes
  sheet.setColumnWidth(13, 100); // Priorité
  sheet.setColumnWidth(14, 110); // Statut
  sheet.setColumnWidth(15, 320); // Suivi
  sheet.setColumnWidth(16, 70);  // Projet
}

/**
 * À exécuter UNE FOIS après avoir créé l'onglet « Projets ». NON DESTRUCTIF :
 * si des données occupent déjà la ligne 1 (projet créé avant le setup), une
 * ligne est INSÉRÉE au-dessus pour l'en-tête — rien n'est écrasé. Peut être
 * ré-exécuté sans risque.
 */
function setupProjectsSheet() {
  const sheet = getProjectsSheet();
  ensureProjectsHeader(sheet);
  sheet.getRange(1, 1, 1, PROJECT_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1f3a2e')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  sheet.getRange('B2:B').setNumberFormat('dd/mm/yyyy HH:mm:ss');
  // Début/Fin restent du texte « yyyy-MM-dd » — le format @ évite que Sheets
  // les convertisse en dates locales ambiguës.
  sheet.getRange('F2:G').setNumberFormat('@');

  sheet.setColumnWidth(1, 60);   // ID
  sheet.setColumnWidth(2, 160);  // Horodatage
  sheet.setColumnWidth(3, 260);  // Titre
  sheet.setColumnWidth(4, 360);  // Description
  sheet.setColumnWidth(5, 220);  // Sentiers
  sheet.setColumnWidths(6, 2, 100); // Début, Fin
  sheet.setColumnWidth(8, 100);  // Statut
  sheet.setColumnWidth(9, 200);  // Participants
  sheet.setColumnWidth(10, 320); // Suivi
}


// ---------- utilitaires --------------------------------------------------
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeFilename(name) {
  return String(name).replace(/[^\w.\-]+/g, '_').slice(0, 120);
}