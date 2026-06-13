// ============================================================
// Journal de suivi — composant partagé (carte + fiche projet).
// ------------------------------------------------------------
// Source de vérité UNIQUE pour le rendu des entrées et le
// composeur d'ajout, afin que les deux surfaces ne divergent
// plus (c'est d'avoir écrit deux fois ce composant qu'est née
// l'incohérence corrigée en juin 2026).
//
// Conventions (identiques partout) :
//   • Entrée stockée : « [yyyy-MM-dd HH:mm · auteur] texte », une par ligne.
//   • Affichage : « Auteur · 5 juin » (année seulement si différente,
//     heure complète en infobulle au survol de la date).
//   • Composeur : textarea + petit bouton NEUTRE « Ajouter » (l'ajout au
//     journal est une action secondaire — les boutons forts restent
//     Résolu / Marquer terminé) + nom en pastille « au nom de ⟨Jean ✎⟩ »
//     (champ visible seulement si aucun nom mémorisé).
//
// Les styles vivent dans shared/theme.css (classes .jr-*), en `em` pour
// hériter de la densité du conteneur (popup compact, fiche confortable).
//
// API (window.ORFORD.journal) :
//   savedName()                       → nom mémorisé ('' si aucun)
//   entryHtml({author, date, text, auto}) → HTML d'une entrée
//   entriesHtml(blob)                 → HTML de tout un journal stocké
//   composerHtml(uid, opts)           → HTML du composeur (ids suffixés uid)
//   wireComposer(uid, submit)         → branche le composeur ;
//                                       submit(text, author) → Promise<bool>
// ============================================================
(function () {
  const NAME_KEY = 'orford.reporterName';

  function savedName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function rememberName(name) {
    try { if (name) localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
  }

  // Horodatage LOCAL « yyyy-MM-dd HH:mm » (même format que le serveur).
  // Sert au repli optimiste côté client — jamais toISOString(), qui est en
  // UTC et décale la date en soirée au Québec.
  function stamp(d) {
    d = d || new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // « 2026-06-05 09:12 » (format stocké) ou Date/ISO → Date, sinon null.
  function toDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }

  // Libellé court « 5 juin » (+ année si ≠ année courante).
  function shortDate(d) {
    const withYear = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString('fr-CA', {
      day: 'numeric', month: 'long', year: withYear ? 'numeric' : undefined,
    });
  }
  // Infobulle complète « 5 juin 2026, 09 h 12 ».
  function fullDate(d) {
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
      + ', ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Une entrée : en-tête « Auteur · 5 juin » puis le texte.
   * `auto` = entrée dérivée (ex. « a signalé le problème ») → texte en italique.
   * `date` accepte une Date, un ISO ou le format stocké ; absente → pas de date.
   */
  function entryHtml(opts) {
    const d = toDate(opts.date);
    const dateHtml = d
      ? ' · <span class="jr-date" title="' + escapeHtml(fullDate(d)) + '">' + escapeHtml(shortDate(d)) + '</span>'
      : '';
    return '<div class="jr-entry' + (opts.auto ? ' jr-entry--auto' : '') + '">'
      + '<div class="jr-entry__head"><span class="jr-author">'
      + escapeHtml(opts.author || 'Anonyme') + '</span>' + dateHtml + '</div>'
      + '<div class="jr-entry__text">' + escapeHtml(opts.text || '') + '</div>'
      + '</div>';
  }

  /** Tout un journal stocké (« [date · auteur] texte », une entrée par ligne). */
  function entriesHtml(blob) {
    return String(blob || '').split('\n')
      .filter(function (l) { return l.trim(); })
      .map(function (line) {
        const m = line.match(/^\[(.*?) · (.*?)\] (.*)$/);
        if (!m) return entryHtml({ author: '', text: line });
        return entryHtml({ date: m[1], author: m[2], text: m[3] });
      }).join('');
  }

  /**
   * Le composeur. `uid` suffixe tous les ids (un composeur par signalement
   * ouvert / par fiche). opts.placeholder personnalise l'invite.
   */
  function composerHtml(uid, opts) {
    opts = opts || {};
    const name = savedName();
    return '<div class="jr-composer" data-uid="' + escapeHtml(String(uid)) + '">'
      + '<textarea class="jr-input" id="jr-in-' + uid + '" rows="2" placeholder="'
      +   escapeHtml(opts.placeholder || 'Ajouter une note…') + '"></textarea>'
      + '<div class="jr-actions">'
      +   '<button type="button" class="jr-add" id="jr-add-' + uid + '">Ajouter</button>'
      +   '<span class="jr-by">au nom de '
      +     '<button type="button" class="jr-chip" id="jr-chip-' + uid + '"'
      +       (name ? '' : ' hidden') + ' title="Modifier le nom">'
      +       '<span class="jr-chip__name">' + escapeHtml(name) + '</span>'
      +       '<wa-icon name="pen" variant="solid"></wa-icon>'
      +     '</button>'
      +     '<input type="text" class="jr-name" id="jr-name-' + uid + '" '
      +       'placeholder="Votre nom" value="' + escapeHtml(name) + '"'
      +       (name ? ' hidden' : '') + ' />'
      +   '</span>'
      + '</div>'
      + '</div>';
  }

  /**
   * Branche un composeur déjà dans le DOM. `submit(text, author)` fait
   * l'écriture (POST + mise à jour locale) et résout à `true` en cas de
   * succès — le composeur se vide alors. Idempotent : re-brancher le même
   * composeur (ex. popup rouvert) ne double pas les écouteurs.
   */
  function wireComposer(uid, submit) {
    const add  = document.getElementById('jr-add-' + uid);
    const input = document.getElementById('jr-in-' + uid);
    const chip = document.getElementById('jr-chip-' + uid);
    const name = document.getElementById('jr-name-' + uid);
    if (!add || !input || add.dataset.wired) return;
    add.dataset.wired = '1';

    chip.addEventListener('click', function () {
      chip.hidden = true;
      name.hidden = false;
      name.focus();
      name.select();
    });

    add.addEventListener('click', async function () {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      const author = name.value.trim();
      rememberName(author);

      add.disabled = true;
      input.disabled = true;
      try {
        if (await submit(text, author)) input.value = '';
      } finally {
        add.disabled = false;
        input.disabled = false;
      }
    });
  }

  window.ORFORD = window.ORFORD || {};
  window.ORFORD.journal = {
    savedName: savedName,
    stamp: stamp,
    entryHtml: entryHtml,
    entriesHtml: entriesHtml,
    composerHtml: composerHtml,
    wireComposer: wireComposer,
  };
})();
