// ============================================================
// Trail overlay loader.
// Reads shared/trails.geojson once (cached for the lifetime of
// the page), then exposes ORFORD.addTrailsToMap(map) so any
// Leaflet map in the app can paint the trail network with
// a single line.
//
// Expected GeoJSON shape — one Feature per trail:
//   {
//     "type": "Feature",
//     "properties": { "name": "Sentier de la Sapinière", "color": "#a4572e" },
//     "geometry":   { "type": "LineString",
//                     "coordinates": [[lng, lat], [lng, lat], ...] }
//   }
// Note GeoJSON's coordinate order is [longitude, latitude] — the
// reverse of Leaflet's L.marker([lat, lng]). Leaflet handles the
// translation when reading GeoJSON, so just feed it raw.
// ============================================================
(function () {
  let cachedPromise = null;

  // Used when a trail has no color in the GeoJSON, AND for the
  // "Autre sentier" entry in the form's trail dropdown — i.e. anything
  // we don't have a tracked colour for falls back to ochre.
  const FALLBACK_COLOR = '#e89327';

  function loadTrails() {
    if (!cachedPromise) {
      cachedPromise = fetch('shared/trails.geojson')
        .then((r) => (r.ok ? r.json() : null))
        .catch((err) => {
          console.warn('[trails] could not load shared/trails.geojson:', err);
          return null;
        });
    }
    return cachedPromise;
  }

  async function addTrailsToMap(map) {
    const data = await loadTrails();
    if (!data || !data.features || data.features.length === 0) return null;

    const layer = L.geoJSON(data, {
      style: (feature) => ({
        color:    (feature.properties && feature.properties.color) || FALLBACK_COLOR,
        weight:   4,
        opacity:  0.85,
        lineCap:  'round',
        lineJoin: 'round',
      }),
      onEachFeature: (feature, lyr) => {
        const name = feature.properties && feature.properties.name;
        if (name) {
          lyr.bindTooltip(name, { sticky: true, direction: 'top', opacity: 0.95 });
        }
      },
    });

    layer.addTo(map);
    return layer;
  }

  // Strip accents + lowercase, so "Sapiniére" matches "Sapinière" etc.
  // Won't paper over real divergences (e.g. "des" vs "de l'") but it
  // forgives typos and case differences between the HTML and GeoJSON.
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      // Strip Unicode combining diacritical marks (U+0300 to U+036F)
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  // Look up the color associated with a trail name (used by the form
  // dropdown to show a coloured dot next to each option). Returns the
  // FALLBACK_COLOR for unknown trails — including "Autre sentier".
  async function getTrailColor(name) {
    const data = await loadTrails();
    if (data && Array.isArray(data.features)) {
      const target = normalize(name);
      const match = data.features.find(
        (f) => f.properties && normalize(f.properties.name) === target
      );
      if (match && match.properties && match.properties.color) {
        return match.properties.color;
      }
    }
    return FALLBACK_COLOR;
  }

  window.ORFORD = window.ORFORD || {};
  window.ORFORD.addTrailsToMap     = addTrailsToMap;
  window.ORFORD.getTrailColor      = getTrailColor;
  window.ORFORD.TRAIL_FALLBACK_COLOR = FALLBACK_COLOR;
})();
