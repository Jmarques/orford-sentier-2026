// ============================================================
// Horizon d'un projet — plage de dates « début/fin » affichée
// en langage humain. La granularité est implicite dans la plage :
//   début = fin              → « 20 juin »   (jour précis)
//   1er–dernier jour du mois → « Août »
//   saison météorologique    → « Été 2026 »  (été = juin–août, etc.)
//   année civile complète    → « 2027 »
//   plage vide               → « À planifier »
//   autre plage              → « 20 juin – 5 juil. »
// L'année n'est affichée que si elle diffère de l'année courante.
//
// Les dates circulent en chaînes « yyyy-MM-dd » (voir code.gs) et
// sont interprétées en heure LOCALE — jamais new Date('yyyy-MM-dd')
// qui les lirait en UTC et décalerait d'un jour au Québec.
//
// Expose sur window.ORFORD :
//   formatHorizon(start, end)     → libellé humain
//   horizonSortKey(start)         → nombre pour trier (vide → +Infinity)
//   detectHorizonKind(start, end) → { kind, year, month, season } pour
//                                   pré-remplir le formulaire d'édition
//   seasonRange(season, year)     → { start, end } d'une saison
// ============================================================
(function () {
  // Saisons météorologiques (mois complets — simples et prévisibles) :
  // l'hiver chevauche deux années (déc. → fév. de l'année suivante).
  const SEASONS = {
    printemps: { label: 'Printemps', startMonth: 3,  endMonth: 5 },
    ete:       { label: 'Été',       startMonth: 6,  endMonth: 8 },
    automne:   { label: 'Automne',   startMonth: 9,  endMonth: 11 },
    hiver:     { label: 'Hiver',     startMonth: 12, endMonth: 2 },
  };

  function parseIso(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function lastDayOfMonth(y, m) {
    return new Date(y, m, 0).getDate(); // jour 0 du mois suivant
  }

  function toDate(p) { return new Date(p.y, p.m - 1, p.d); }

  function monthName(m, y) {
    return new Date(y, m - 1, 1).toLocaleDateString('fr-CA', { month: 'long' });
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // « 20 juin » / « 20 juin 2027 » (année seulement si ≠ année courante)
  function dayLabel(p, forceYear) {
    const withYear = forceYear || p.y !== new Date().getFullYear();
    return toDate(p).toLocaleDateString('fr-CA', {
      day: 'numeric', month: 'long', year: withYear ? 'numeric' : undefined,
    });
  }

  function yearSuffix(y) {
    return y !== new Date().getFullYear() ? ' ' + y : '';
  }

  // { start, end } en « yyyy-MM-dd » pour une saison donnée. Pour l'hiver,
  // `year` est l'année de DÉBUT (Hiver 2026 = déc. 2026 → fév. 2027).
  function seasonRange(season, year) {
    const s = SEASONS[season];
    if (!s) return null;
    const endYear = s.endMonth < s.startMonth ? year + 1 : year;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return {
      start: year + '-' + pad(s.startMonth) + '-01',
      end: endYear + '-' + pad(s.endMonth) + '-' + pad(lastDayOfMonth(endYear, s.endMonth)),
    };
  }

  /**
   * Reconnaît la « forme » d'une plage — sert à formatHorizon et au
   * formulaire d'édition pour re-sélectionner le bon raccourci.
   * Retourne { kind: 'none'|'day'|'month'|'season'|'year'|'range',
   *            start, end, year?, month?, season? }.
   */
  function detectHorizonKind(start, end) {
    const a = parseIso(start);
    const b = parseIso(end);
    if (!a && !b) return { kind: 'none' };
    if (!a || !b) return { kind: 'range', start: a, end: b };
    if (a.y === b.y && a.m === b.m && a.d === b.d) {
      return { kind: 'day', start: a, end: b };
    }
    const isMonthSpan = a.d === 1 && b.d === lastDayOfMonth(b.y, b.m);
    if (isMonthSpan && a.y === b.y && a.m === b.m) {
      return { kind: 'month', start: a, end: b, year: a.y, month: a.m };
    }
    if (isMonthSpan && a.y === b.y && a.m === 1 && b.m === 12) {
      return { kind: 'year', start: a, end: b, year: a.y };
    }
    if (isMonthSpan) {
      for (const key in SEASONS) {
        const s = SEASONS[key];
        const endYear = s.endMonth < s.startMonth ? a.y + 1 : a.y;
        if (a.m === s.startMonth && b.m === s.endMonth && b.y === endYear) {
          return { kind: 'season', start: a, end: b, season: key, year: a.y };
        }
      }
    }
    return { kind: 'range', start: a, end: b };
  }

  function formatHorizon(start, end) {
    const h = detectHorizonKind(start, end);
    switch (h.kind) {
      case 'none':
        return 'À planifier';
      case 'day':
        return dayLabel(h.start);
      case 'month':
        return cap(monthName(h.month, h.year)) + yearSuffix(h.year);
      case 'season': {
        const s = SEASONS[h.season];
        // L'hiver chevauche deux années → « Hiver 2026-2027 » pour lever le doute.
        if (h.season === 'hiver') return s.label + ' ' + h.year + '-' + (h.year + 1);
        return s.label + yearSuffix(h.year);
      }
      case 'year':
        return String(h.year);
      default: { // 'range' — y compris une plage à moitié vide
        if (!h.start) return 'D’ici le ' + dayLabel(h.end);
        if (!h.end) return 'Dès le ' + dayLabel(h.start);
        const sameYear = h.start.y === h.end.y;
        const from = toDate(h.start).toLocaleDateString('fr-CA', {
          day: 'numeric', month: 'long',
          year: sameYear ? undefined : 'numeric',
        });
        const to = dayLabel(h.end);
        return from + ' – ' + to;
      }
    }
  }

  // Clé de tri : les projets sans date (« À planifier ») vont en dernier.
  function horizonSortKey(start) {
    const p = parseIso(start);
    return p ? toDate(p).getTime() : Infinity;
  }

  window.ORFORD = window.ORFORD || {};
  window.ORFORD.formatHorizon     = formatHorizon;
  window.ORFORD.horizonSortKey    = horizonSortKey;
  window.ORFORD.detectHorizonKind = detectHorizonKind;
  window.ORFORD.seasonRange       = seasonRange;
})();
