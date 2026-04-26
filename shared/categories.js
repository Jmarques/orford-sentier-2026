// ============================================================
// Category → family → icon mapping.
// Single source of truth for both:
//   - map.html (legend, pins, popups, todo drawer items)
//   - index.html (dropdown option icons)
// Add or rename categories here once; both pages follow.
// ============================================================
(function () {
  // Map a free-form category label to one of 6 visual families.
  // Regexes are loose so future labels (e.g. "Arbres tombés multiples")
  // still sort correctly without code changes.
  function categoryFamily(category) {
    const c = String(category || '').toLowerCase();
    if (/arbre|végétation|vegetation/.test(c))                          return 'nature';
    if (/pancarte|balise/.test(c))                                      return 'signalisation';
    if (/pont|passerelle/.test(c))                                      return 'infrastructure';
    if (/déchet|dechet|débris|debris/.test(c))                          return 'dechets';
    if (/érosion|erosion|ravinement|inondation|drainage|danger/.test(c)) return 'terrain';
    return 'autre';
  }

  // Family → Font Awesome (Web Awesome) icon name.
  const FAMILY_ICONS = {
    nature:         'tree',
    signalisation:  'signs-post',
    infrastructure: 'bridge',
    dechets:        'trash-can',
    terrain:        'triangle-exclamation',
    autre:          'circle-question',
  };

  function categoryIcon(category) {
    return FAMILY_ICONS[categoryFamily(category)];
  }

  window.ORFORD = window.ORFORD || {};
  window.ORFORD.categoryFamily = categoryFamily;
  window.ORFORD.categoryIcon   = categoryIcon;
  window.ORFORD.FAMILY_ICONS   = FAMILY_ICONS;
})();
