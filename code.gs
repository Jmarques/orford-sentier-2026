/**
 * Rapport de sentier — Script Apps Script (backend)
 * ----------------------------------------------------------------
 * Reçoit les soumissions JSON du formulaire mobile, enregistre la
 * photo/vidéo dans un dossier Drive, et ajoute une ligne à la
 * feuille Google.
 *
 * Étapes d'installation :
 *   1. Créer une feuille Google → copier son ID dans SHEET_ID.
 *   2. Créer un dossier Drive  → copier son ID dans FOLDER_ID.
 *   3. Exécuter setupSheet() une fois pour créer l'en-tête.
 *   4. Déployer → Nouveau déploiement → Application Web.
 *      Exécuter en tant que : Moi.
 *      Qui a accès : Tout le monde.
 *      Copier l'URL /exec dans le fichier HTML.
 * ---------------------------------------------------------------- */

// ======== CONFIG =========================================================
const SHEET_ID  = '13BZIbWOw77hZQu25otyYBJfjY5zFWhRNuwjv2bFYcXY';
const FOLDER_ID = '16MgtyEf36wbkFXbJnHDVIdRig2Sl55nJ';
// =========================================================================

// Traduction des sources GPS (valeurs techniques → libellés français)
const GPS_SOURCE_FR = {
  'device': 'Appareil',
  'exif':   'Photo EXIF',
  '':       ''
};


/**
 * Point d'entrée principal — appelé par le formulaire via fetch().
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

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
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
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

  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}


/**
 * Vérification de l'état — visiter l'URL /exec dans un navigateur
 * devrait afficher ce message.
 */
function doGet() {
  return ContentService
    .createTextOutput('Point de terminaison Rapport de sentier actif.')
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * À exécuter UNE FOIS après avoir collé votre SHEET_ID. Crée la
 * ligne d'en-tête et applique un peu de mise en forme. Peut être
 * ré-exécuté sans risque — ne touche que la ligne 1.
 */
function setupSheet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  const headers = [
    'Horodatage', 'Sentier', 'Catégorie',
    'Latitude', 'Longitude', 'Précision GPS (m)', 'Source GPS',
    'Lien Maps', 'URL du média', 'Nom du fichier',
    'Nom du déclarant', 'Notes',
    'Priorité', 'Statut'
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