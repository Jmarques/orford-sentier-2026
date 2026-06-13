// Test temporaire des pages Projets + mode assignation (back-end intercepté).
// Usage : serveur sur le port 8765, puis `node scripts/_test-projets.mjs`.
import { chromium } from 'playwright';

const PROJECTS = [
  { id: 'P-1', timestamp: '2026-06-01T12:00:00Z', title: "Dégager l'arbre tombé du Ruisseau",
    description: 'Problème / historique :\nGros mélèze tombé après la tempête de mai.',
    trails: ['Sentier des Ruisseaux'], start: '2026-06-20', end: '2026-06-20',
    status: 'Actif', participants: 'Jean, Lise',
    followup: '[2026-06-05 09:12 · Jean] Bois commandé chez le fournisseur.' },
  { id: 'P-2', timestamp: '2026-05-15T12:00:00Z', title: 'Remplacer les 3 panneaux de départ',
    description: '', trails: ["Sentier de l'Écurie", 'Sentier de la Sapinière'],
    start: '2026-08-01', end: '2026-08-31', status: 'Actif', participants: '', followup: '' },
];

const REPORTS = [
  { rowIndex: 2, timestamp: '2026-05-20T10:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Arbre tombé', latitude: 45.3030, longitude: -72.2690, accuracy: 5,
    gpsSource: 'Appareil', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Sophie', notes: 'Tronc en travers.', priority: '',
    status: 'Nouveau', followup: '', project: 'P-1' },
  { rowIndex: 3, timestamp: '2026-05-21T10:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Végétation envahissante', latitude: 45.3045, longitude: -72.2700, accuracy: 8,
    gpsSource: 'Appareil', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Marc', notes: '', priority: '',
    status: 'Nouveau', followup: '', project: '' },
  { rowIndex: 4, timestamp: '2026-05-22T10:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Déchets ou débris', latitude: 45.3020, longitude: -72.2675, accuracy: 6,
    gpsSource: 'Appareil', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Anne', notes: '', priority: '',
    status: 'Nouveau', followup: '', project: 'P-2' },
  { rowIndex: 5, timestamp: '2026-05-23T10:00:00Z', trail: 'Sentier des Ruisseaux',
    category: 'Balise effacée', latitude: 45.3055, longitude: -72.2710, accuracy: 4,
    gpsSource: 'Appareil', photoUrl: '', photoThumb: '', photoName: '',
    reporterName: 'Luc', notes: '', priority: '',
    status: 'Résolu', followup: '', project: 'P-1' },
];

const FAKE = { ok: true, count: REPORTS.length, reports: REPORTS, projects: PROJECTS };

const posts = []; // corps des POST interceptés

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.route('**/script.google.com/**', (route) => {
  const req = route.request();
  if (req.method() === 'POST') {
    posts.push(JSON.parse(req.postData()));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE) });
});
// Mot de passe « déjà mémorisé » pour court-circuiter le prompt d'auth.
await page.addInitScript(() => localStorage.setItem('orford.auth', 'test'));

// ===== 1. Fiche projet : signalements rattachés =====
await page.goto('http://localhost:8765/projets.html?id=P-1');
await page.waitForSelector('.fiche');
const nAttached = await page.locator('.report-item').count();
console.log('fiche P-1 — signalements rattachés :', nAttached, '(attendu : 2)');
console.log('fiche P-1 — bouton Rattacher présent :', await page.locator('wa-button[href*="assigner=P-1"]').count() === 1);
await page.screenshot({ path: '/tmp/p2-fiche.png', fullPage: true });

// ===== 1b. Journal de suivi : entrée existante + ajout (composant partagé) =====
console.log('journal — entrées affichées :', await page.locator('.jr-entry').count(), '(attendu : 1)');
console.log('journal — en-tête 1re entrée :', (await page.locator('.jr-entry__head').first().textContent()).trim(),
  '(attendu : Jean · 5 juin — pas d\'année, pas d\'heure)');
await page.locator('#jr-in-fiche').evaluate((el) => { el.value = 'Tronçonneuse réservée pour samedi.'; });
await page.locator('#jr-name-fiche').evaluate((el) => { el.value = 'Lise'; });
await page.click('#jr-add-fiche');
await page.waitForTimeout(700);
const fuPost = posts.find((p) => p.action === 'appendProjectFollowup');
console.log('appendProjectFollowup envoyé :', JSON.stringify({ id: fuPost.id, text: fuPost.text, author: fuPost.author }));
console.log('journal — entrées après ajout :', await page.locator('.jr-entry').count(), '(attendu : 2)');
console.log('journal — bouton Ajouter neutre :', (await page.locator('#jr-add-fiche').textContent()).trim(), '+ classe .jr-add');
// Le nom vient d'être mémorisé → au re-rendu, la pastille remplace le champ.
console.log('journal — pastille du nom après ajout :', await page.locator('#jr-chip-fiche:not([hidden])').count() === 1);
await page.screenshot({ path: '/tmp/p3-journal.png', fullPage: true });

// ===== 2. Clôture : dialogue + répartition résolus/détachés =====
await page.click('#btnCloseProject');
await page.waitForSelector('#closeOverlay:not([hidden])');
const nBoxes = await page.locator('#closeList input').count();
console.log('dialogue clôture — signalements ouverts listés :', nBoxes, '(attendu : 1)');
await page.screenshot({ path: '/tmp/p2-cloture.png' });
await page.click('#closeConfirm');
await page.waitForSelector('#closeOverlay', { state: 'hidden', timeout: 5000 });
const closePost = posts.find((p) => p.action === 'closeProject');
console.log('closeProject envoyé :', JSON.stringify({ id: closePost.id, resolve: closePost.resolve, detach: closePost.detach }),
  '(attendu : id P-1, resolve [2], detach [])');
console.log('fiche après clôture — badge Terminé :', (await page.locator('.fiche .badge--statut-termine').count()) === 1);

// ===== 3. Carte en mode normal : le popup dépend de l'assignation =====
// Assigné → journal en lecture + renvoi court vers la fiche (ni composeur,
// ni clôture). Libre → composeur partagé + boutons « ✓ Clôturer / Doublon ».
await page.goto('http://localhost:8765/map.html');
await page.waitForSelector('.marker-pin', { timeout: 10000 });
console.log('mode normal — bannière cachée :', await page.locator('#assignBanner').isHidden());
const nPins = await page.locator('.marker-pin').count();
let assignedChecked = false, freeChecked = false;
for (let i = 0; i < nPins && !(assignedChecked && freeChecked); i++) {
  // Ferme le popup précédent : il peut recouvrir le pin suivant.
  const closeBtn = page.locator('.leaflet-popup-close-button');
  if (await closeBtn.count()) { await closeBtn.first().click(); await page.waitForTimeout(250); }
  await page.locator('.marker-pin').nth(i).click();
  await page.waitForSelector('.leaflet-popup .fa__head', { timeout: 5000 });
  const popup = page.locator('.leaflet-popup').last();
  await popup.locator('.fa__head').click();
  await page.waitForTimeout(300);
  const hasRedirect = (await popup.locator('.jr-redirect').count()) > 0;
  if (hasRedirect && !assignedChecked) {
    assignedChecked = true;
    console.log('popup assigné — renvoi :', (await popup.locator('.jr-redirect').textContent()).trim());
    console.log('popup assigné — balise projet :', (await popup.locator('.project-chip').count()) === 1);
    console.log('popup assigné — AUCUN composeur ni bouton de clôture :',
      (await popup.locator('.jr-composer').count()) === 0 && (await popup.locator('.close-btn').count()) === 0);
    await popup.screenshot({ path: '/tmp/p4-popup-assigne.png' });
  } else if (!hasRedirect && !freeChecked) {
    freeChecked = true;
    console.log('popup libre — bouton principal :', (await popup.locator('.close-btn').first().textContent()).trim(), '(attendu : Clôturer)');
    console.log('popup libre — composeur présent :', (await popup.locator('.jr-composer').count()) === 1);
    // Ajout d'un suivi depuis le popup (POST appendFollowup).
    await popup.locator('.jr-input').evaluate((el) => { el.value = 'Je passerai voir demain.'; });
    await popup.locator('.jr-name').evaluate((el) => { el.hidden = false; el.value = 'Marc'; });
    await popup.locator('.jr-add').click();
    await page.waitForTimeout(600);
  }
}
console.log('popup — les deux cas rencontrés :', assignedChecked && freeChecked);
const mapFuPost = posts.find((p) => p.action === 'appendFollowup');
console.log('appendFollowup envoyé :', JSON.stringify({ rowIndex: mapFuPost.rowIndex, text: mapFuPost.text, author: mapFuPost.author }));

// ===== 3b. Filtre projet sur la carte =====
await page.goto('http://localhost:8765/map.html');
await page.waitForSelector('.marker-pin', { timeout: 10000 });
console.log('filtre projet — options :', await page.locator('#projectFilter option').count(), '(attendu : 4 — Tous/Sans/P-1/P-2)');
console.log('filtre projet — pins par défaut :', await page.locator('.marker-pin').count(), '(attendu : 3, tout visible)');
await page.selectOption('#projectFilter', 'aucun');
await page.waitForTimeout(400);
console.log('« Sans projet » — pins :', await page.locator('.marker-pin').count(), '(attendu : 1)');
await page.selectOption('#projectFilter', 'P-1');
await page.waitForTimeout(400);
console.log('« P-1 » — pins :', await page.locator('.marker-pin').count(), '(attendu : 1)');
await page.goto('http://localhost:8765/map.html?projet=aucun');
await page.waitForSelector('.marker-pin', { timeout: 10000 });
console.log('?projet=aucun — select :', await page.locator('#projectFilter').inputValue(),
  '· pins :', await page.locator('.marker-pin').count(), '(attendu : aucun · 1)');
await page.goto('http://localhost:8765/map.html?assigner=P-1');
await page.waitForSelector('.marker-pin', { timeout: 10000 });
console.log('mode assignation — filtre projet masqué :', await page.locator('#projectFilterGroup').isHidden());
await page.goto('http://localhost:8765/projets.html?id=P-2');
await page.waitForSelector('.fiche');
console.log('fiche — lien « Voir sur la carte » :', await page.locator('.fiche__map-link').getAttribute('href'));

// ===== 4. Mode assignation =====
await page.goto('http://localhost:8765/map.html?assigner=P-1');
await page.waitForSelector('.marker-pin', { timeout: 10000 });
console.log('assignation — bannière visible :', await page.locator('#assignBanner').isVisible());
console.log('assignation — titre du projet :', await page.locator('#assignBannerTitle').textContent());
console.log('assignation — hero :', (await page.locator('.page-hero h1').textContent()).trim());
console.log('assignation — sortie vers :', await page.locator('#assignExit').getAttribute('href'));
console.log('assignation — filtre sentier :', await page.locator('#trailFilter').inputValue());
console.log('assignation — pins ocre (dans CE projet) :', await page.locator('.marker-pin.pin-mine').count(), '(attendu : 1)');
console.log('assignation — pins gris (autre projet) :', await page.locator('.marker-pin.pin-other').count(), '(attendu : 1)');
await page.screenshot({ path: '/tmp/p2-carte-mode.png', fullPage: true });

// Popup d'un signalement non assigné → bouton « Assigner à ce projet »
await page.locator('.marker-pin:not(.pin-mine):not(.pin-other)').first().click();
await page.waitForSelector('.popup .assign-btn');
console.log('popup non-assigné — bouton :', (await page.locator('.popup .assign-btn').textContent()).trim());
await page.screenshot({ path: '/tmp/p2-popup-assigner.png' });
await page.click('.popup .assign-btn');
await page.waitForTimeout(600);
const assignPost = posts.find((p) => p.action === 'setReportProject');
console.log('setReportProject envoyé :', JSON.stringify({ rowIndex: assignPost.rowIndex, projectId: assignPost.projectId }),
  '(attendu : rowIndex 3, P-1)');
console.log('après assignation — pins ocre :', await page.locator('.marker-pin.pin-mine').count(), '(attendu : 2)');

// Popup d'un signalement du projet → « Retirer du projet »
await page.locator('.marker-pin.pin-mine').first().click();
await page.waitForSelector('.popup .assign-btn--remove');
console.log('popup assigné — bouton :', (await page.locator('.popup .assign-btn--remove').textContent()).trim());

// Popup d'un signalement d'un AUTRE projet → note, pas de bouton
await page.locator('.marker-pin.pin-other').first().click();
await page.waitForSelector('.popup .assign-note');
console.log('popup autre projet — note :', (await page.locator('.popup .assign-note').textContent()).trim());
console.log('popup autre projet — aucun bouton :',
  (await page.locator('.leaflet-popup:has(.assign-note) .assign-btn').count()) === 0);
await page.screenshot({ path: '/tmp/p2-popup-autre.png' });

await browser.close();
console.log('OK');
