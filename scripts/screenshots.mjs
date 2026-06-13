// scripts/screenshots.mjs
// Génère les captures d'écran de GUIDE.md.
//
// Prérequis :
//   - npm i -D playwright && npx playwright install chromium  (déjà fait)
//   - un serveur HTTP qui sert le projet sur http://localhost:8765
//     (le repo en lance déjà un avec : python3 -m http.server 8765)
//
// Usage :
//   node scripts/screenshots.mjs
//
// Toutes les requêtes vers le backend Google Apps Script sont interceptées
// et remplacées par un JEU DE DONNÉES SYNTHÉTIQUE — aucune donnée réelle
// n'apparaît dans les captures, et le résultat est reproductible.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = resolve(__dirname, '..', 'docs', 'screenshots');
const BASE      = 'http://localhost:8765';

// ----- Jeu de données synthétique --------------------------------------
const FAKE_REPORTS = [
  // Sentier de la Sapinière
  { rowIndex: 2, timestamp: '2026-05-12T10:30:00Z', trail: 'Sentier de la Sapinière',
    category: 'Érosion', latitude: 45.3070, longitude: -72.2870, accuracy: 8,
    gpsSource: 'Appareil', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/sap-erosion/600/400',
    photoName: '', reporterName: 'Marie B.',
    notes: 'Petit ravinement à droite du sentier, à surveiller après les prochaines pluies.',
    priority: '', status: 'Nouveau', followup: '' },
  { rowIndex: 3, timestamp: '2026-05-18T14:10:00Z', trail: 'Sentier de la Sapinière',
    category: 'Arbre tombé', latitude: 45.3081, longitude: -72.2885, accuracy: 5,
    gpsSource: 'Appareil', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/sap-arbre/600/400',
    photoName: '', reporterName: 'Jacques L.',
    notes: 'Gros bouleau en travers juste avant le belvédère.',
    priority: 'Haute', status: 'Nouveau',
    followup: '[2026-05-20 09:15 · Comité] Équipe sur place samedi prochain avec la tronçonneuse.\n[2026-05-23 18:00 · Patrick] Arbre coupé ; à dégager dimanche matin.' },

  // Sentier des Ruisseaux — plusieurs déchets + une pancarte
  { rowIndex: 4, timestamp: '2026-05-15T11:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Déchets', latitude: 45.3017, longitude: -72.2669, accuracy: 12,
    gpsSource: 'Photo EXIF', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/ru-dechets-1/600/400',
    photoName: '', reporterName: 'Sophie R.',
    notes: 'Sac de canettes près du petit pont.',
    priority: '', status: 'Nouveau', project: 'P-2', followup: '' },
  { rowIndex: 5, timestamp: '2026-05-15T11:05:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Déchets', latitude: 45.3022, longitude: -72.2673, accuracy: 10,
    gpsSource: 'Photo EXIF', photoUrl: '',
    photoThumb: '', photoName: '', reporterName: 'Sophie R.',
    notes: 'Et un autre, 100 m plus loin.',
    priority: '', status: 'Nouveau', followup: '' },
  { rowIndex: 6, timestamp: '2026-05-20T08:20:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Pancarte abîmée', latitude: 45.3019, longitude: -72.2665, accuracy: 7,
    gpsSource: 'Appareil', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/ru-pancarte/600/400',
    photoName: '', reporterName: 'Marc D.',
    notes: 'Pancarte du circuit bleu décollée du poteau.',
    priority: '', status: 'Nouveau', followup: '' },
  { rowIndex: 7, timestamp: '2026-05-22T13:15:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Érosion', latitude: null, longitude: null, accuracy: null,
    gpsSource: '', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/ru-erosion/600/400',
    photoName: '', reporterName: 'Visiteur',
    notes: "Le sentier s'enfonce après la côte du castor.",
    priority: '', status: 'Nouveau', followup: '' },

  // Sentier de l'Écurie — pont (avec un beau journal de suivi), rattaché au
  // projet P-1 pour montrer la balise « Projet » dans le popup.
  { rowIndex: 8, timestamp: '2026-05-08T16:45:00Z', trail: "Sentier de l'Écurie",
    category: 'Pont/passerelle', latitude: 45.3058, longitude: -72.2805, accuracy: 6,
    gpsSource: 'Appareil', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/ec-pont/600/400',
    photoName: '', reporterName: 'Anne P.',
    notes: 'Planche cassée au milieu du pont, vraiment dangereux.',
    priority: 'Haute', status: 'Nouveau', project: 'P-1',
    followup: '[2026-05-09 18:00 · Comité] Bois commandé chez Patrick. Pose prévue le 23 mai.\n[2026-05-23 14:30 · Patrick] Pose terminée ; un coup de peinture la semaine prochaine.' },

  // Sentier Vertendre — un résolu (pour démontrer le filtre)
  { rowIndex: 9, timestamp: '2026-04-30T09:00:00Z', trail: 'Sentier Vertendre',
    category: 'Arbre tombé', latitude: 45.2995, longitude: -72.2650, accuracy: 8,
    gpsSource: 'Appareil', photoUrl: '',
    photoThumb: 'https://picsum.photos/seed/v-arbre/600/400',
    photoName: '', reporterName: 'Louise M.',
    notes: "Bouleau tombé près de l'entrée.",
    priority: '', status: 'Résolu',
    followup: '[2026-05-02 11:00 · Louise M.] Coupé et déplacé samedi matin.' },

  // À localiser sans sentier précisé
  { rowIndex: 10, timestamp: '2026-05-25T10:00:00Z', trail: '',
    category: 'Autre', latitude: null, longitude: null, accuracy: null,
    gpsSource: '', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Anonyme',
    notes: "Un randonneur m'a parlé d'une zone très boueuse, je ne sais pas où.",
    priority: '', status: 'Nouveau', followup: '' },

  // Un doublon (sur les déchets)
  { rowIndex: 11, timestamp: '2026-05-16T10:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Déchets', latitude: 45.3018, longitude: -72.2670, accuracy: 14,
    gpsSource: 'Photo EXIF', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Anonyme',
    notes: 'Sac près du pont (vu hier).',
    priority: '', status: 'Doublon', followup: '' },
];

// ----- Projets synthétiques (pour la page Projets + le mode assignation) --
const FAKE_PROJECTS = [
  { id: 'P-1', timestamp: '2026-05-09T12:00:00Z',
    title: "Réparer la passerelle de l'Écurie",
    description: 'Problème / historique :\nPlanche cassée signalée le 8 mai, dangereuse.\nSolution retenue :\nRemplacer les 3 planches du centre et repeindre.\nMatériel nécessaire :\nBois traité (commandé), visseuse, peinture.\nBudget (si requis) :\n80 $ approuvés le 12 mai.',
    trails: ["Sentier de l'Écurie"], start: '2026-06-20', end: '2026-06-20',
    status: 'Actif', participants: 'Patrick, Anne',
    followup: '[2026-05-12 19:00 · Comité] Budget de 80 $ approuvé.\n[2026-05-23 14:30 · Patrick] Planches posées — reste la peinture.' },
  { id: 'P-2', timestamp: '2026-05-16T12:00:00Z',
    title: 'Grand ménage du sentier des Ruisseaux',
    description: 'Tournée de ramassage des déchets accumulés le long du ruisseau.',
    trails: ['Sentier des Ruisseaux'], start: '2026-08-01', end: '2026-08-31',
    status: 'Actif', participants: 'Sophie', followup: '' },
  { id: 'P-3', timestamp: '2026-05-20T12:00:00Z',
    title: 'Drainage de la section nord',
    description: '', trails: ['Sentier des Ruisseaux'],
    start: '2027-01-01', end: '2027-12-31', status: 'Actif', participants: '', followup: '' },
  { id: 'P-4', timestamp: '2026-05-22T12:00:00Z',
    title: 'Banc au belvédère',
    description: '', trails: ['Sentier de la Sapinière'],
    start: '', end: '', status: 'Actif', participants: '', followup: '' },
  { id: 'P-5', timestamp: '2026-04-02T12:00:00Z',
    title: 'Corvée de nettoyage printanière',
    description: '', trails: [], start: '2026-05-01', end: '2026-05-31',
    status: 'Terminé', participants: 'Tout le comité', followup: '' },
];

const FAKE_GET = JSON.stringify({
  ok: true, count: FAKE_REPORTS.length,
  reports: FAKE_REPORTS, projects: FAKE_PROJECTS,
});

// ----- Helpers ---------------------------------------------------------
async function shot(target, name) {
  const path = resolve(OUT_DIR, name + '.png');
  await target.screenshot({ path });
  console.log('  ', name + '.png');
}

async function attachRoute(context) {
  await context.route('**/script.google.com/macros/**', async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: FAKE_GET });
      return;
    }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
    const resp = body.action === 'appendFollowup'
      ? { ok: true, followup: '[2026-05-30 12:00 · Demo] Suivi de test.' }
      : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
  });
}

// ----- Main ------------------------------------------------------------
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // Desktop context — pour la carte et Corvées
  const desktop = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });
  await attachRoute(desktop);

  const page = await desktop.newPage();

  // ----- Bandeau navigation (extrait depuis une page neutre) -----------
  await page.goto(BASE + '/map.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('site-masthead a[href="index.html"]');
  await page.waitForTimeout(400);
  const masthead = await page.locator('site-masthead');
  await shot(masthead, 'bandeau-navigation');

  // ----- Carte — vue d'ensemble ---------------------------------------
  await page.goto(BASE + '/map.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-marker-icon');
  await page.waitForTimeout(1200);
  await shot(page, 'carte-vue-densemble');

  // ----- Carte — légende avec une infobulle visible (au survol) ------
  await page.locator('.legend-item[data-status="nouveau"]').hover();
  await page.waitForTimeout(400);
  const lb = await page.locator('.legend').boundingBox();
  await page.screenshot({
    path: resolve(OUT_DIR, 'carte-legende-tooltip.png'),
    clip: { x: lb.x, y: Math.max(0, lb.y - 36), width: lb.width, height: lb.height + 36 },
  });
  console.log('   carte-legende-tooltip.png');

  // ----- Carte — popup ouvert (Pont/passerelle de l'Écurie, assigné au
  // projet P-1 : l'accordéon fermé + la vue d'ensemble du popup) ---------
  await page.goto(BASE + '/map.html?trail=' + encodeURIComponent("Sentier de l'Écurie"),
    { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-marker-icon');
  await page.waitForTimeout(1000);
  // Clique sur le premier marker visible
  await page.locator('.leaflet-marker-icon').first().click();
  await page.waitForSelector('.leaflet-popup', { state: 'visible' });
  await page.waitForTimeout(700);
  await shot(page, 'carte-popup');

  // ----- Carte — popup d'un Nouveau NON assigné (Sapinière) : journal
  // complet (composeur + boutons ✓ Clôturer / Doublon). Ses deux pins sont
  // assez espacés pour ne pas se regrouper en cluster au zoom par défaut.
  await page.goto(BASE + '/map.html?trail=' + encodeURIComponent('Sentier de la Sapinière'),
    { waitUntil: 'networkidle' });
  await page.waitForSelector('.marker-pin', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.locator('.marker-pin').first().click();
  await page.waitForSelector('.leaflet-popup .fa__head', { timeout: 10000 });
  await page.locator('.leaflet-popup .fa__head').click();
  await page.waitForSelector('.leaflet-popup .close-row', { timeout: 5000 });
  await page.waitForTimeout(500);
  // Gros plan sur tout l'accordéon (journal + composeur + clôture)…
  const followup = page.locator('.leaflet-popup .fa');
  await shot(followup, 'carte-suivi');
  // …et sur son corps seul (pour la section « Clôturer un signalement »).
  const closePopup = page.locator('.leaflet-popup .fa__body');
  await shot(closePopup, 'carte-popup-cloture');

  // ----- Carte — tiroir « à localiser » ------------------------------
  await page.goto(BASE + '/map.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#todoChip:not([hidden])');
  await page.waitForTimeout(800);
  await page.click('#todoChip');
  await page.waitForSelector('#drawer.open');
  await page.waitForTimeout(500);
  await shot(page, 'carte-tiroir-a-localiser');

  // ----- Corvées — vue d'ensemble -----------------------------------
  await page.goto(BASE + '/corvees.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.matrix');
  await page.waitForTimeout(800);
  await shot(page, 'corvees-vue-densemble');

  // Gros plan sur les cartes par sentier
  const cards = page.locator('.trail-cards');
  await shot(cards, 'corvees-cartes-sentier');

  // ----- Carte arrivée depuis un clic sur Corvées -------------------
  await page.goto(BASE + '/map.html?trail=' + encodeURIComponent('Sentier des Ruisseaux') + '&type=dechets',
    { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-marker-icon');
  await page.waitForTimeout(1200);
  await shot(page, 'corvees-vers-carte');

  // ----- Carte — anciens tracés en transparence ----------------------
  await page.goto(BASE + '/map.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-marker-icon');
  await page.waitForTimeout(800);
  await page.click('#oldTracesToggle');
  await page.waitForTimeout(1200); // laisse charger les images du calque
  await shot(page, 'carte-anciens-traces');

  // ----- Projets — liste ---------------------------------------------
  await page.goto(BASE + '/projets.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.project-card');
  await page.waitForTimeout(800);
  await shot(page, 'projets-vue-densemble');

  // ----- Projets — fiche (signalements rattachés + journal) ----------
  await page.goto(BASE + '/projets.html?id=P-1', { waitUntil: 'networkidle' });
  await page.waitForSelector('.fiche');
  await page.waitForTimeout(800);
  await shot(page, 'projets-fiche');

  // ----- Projets — dialogue « Marquer terminé » ----------------------
  await page.click('#btnCloseProject');
  await page.waitForSelector('#closeOverlay:not([hidden])');
  await page.waitForTimeout(400);
  await shot(page.locator('.overlay-card'), 'projets-cloture');
  await page.click('#closeCancel');

  // ----- Carte — mode assignation (?assigner=) ------------------------
  await page.goto(BASE + '/map.html?assigner=P-2', { waitUntil: 'networkidle' });
  // Les pins peuvent arriver regroupés en bulle (cluster).
  await page.waitForSelector('.marker-pin, .marker-cluster', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot(page, 'carte-mode-assignation');

  // Popup d'un signalement assignable : si les pins sont regroupés en
  // bulle, on clique la bulle (zoom/dépliage) jusqu'à voir un pin individuel.
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.marker-pin:not(.pin-mine):not(.pin-other)').count() > 0) break;
    await page.locator('.marker-cluster').first().click();
    await page.waitForTimeout(900);
  }
  await page.locator('.marker-pin:not(.pin-mine):not(.pin-other)').first().click();
  await page.waitForSelector('.leaflet-popup .assign-btn', { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page.locator('.leaflet-popup'), 'carte-popup-assigner');

  await desktop.close();

  // Mobile context — formulaire (vue initiale + état après ajout d'une photo)
  const mobile = await browser.newContext({
    viewport: { width: 414, height: 880 },
    deviceScaleFactor: 1, // 1x = fichiers plus légers pour l'embed dans le guide
  });
  await attachRoute(mobile);
  const mpage = await mobile.newPage();
  await mpage.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await mpage.waitForSelector('form');
  await mpage.waitForTimeout(600);
  await shot(mpage, 'formulaire-signaler');

  // Ajout d'une minuscule photo SANS EXIF GPS → le site révèle le bloc
  // « Votre position » avec les deux boutons. On capture cette zone.
  const noExifJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////' +
    '//////////////////////////////////////////////////////////2wBDAf//////' +
    '////////////////////////////////////////////////////////////////////' +
    '/////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAA' +
    'AAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX' +
    '/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    'base64'
  );
  await mpage.setInputFiles('#galleryInput',
    { name: 'demo.jpg', mimeType: 'image/jpeg', buffer: noExifJpeg });
  await mpage.waitForSelector('#gpsField', { state: 'visible', timeout: 6000 });
  await mpage.waitForTimeout(700);
  const gpsField = mpage.locator('#gpsField');
  await gpsField.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  await shot(gpsField, 'formulaire-gps-actions');

  await mobile.close();

  await browser.close();
  console.log('Done — captures dans docs/screenshots/');
}

main().catch(err => { console.error(err); process.exit(1); });
