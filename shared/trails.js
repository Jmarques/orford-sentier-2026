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

  // Great-circle distance between two [lng, lat] points, in metres.
  function haversine(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function lineLength(coords) {
    let d = 0;
    for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
    return d;
  }

  function featureLengthMeters(feature) {
    const g = feature && feature.geometry;
    if (!g) return 0;
    if (g.type === 'LineString') return lineLength(g.coordinates);
    if (g.type === 'MultiLineString') {
      return g.coordinates.reduce((sum, c) => sum + lineLength(c), 0);
    }
    return 0;
  }

  function formatDistance(meters) {
    if (meters >= 1000) return (meters / 1000).toFixed(1).replace('.', ',') + ' km';
    return Math.round(meters) + ' m';
  }

  // Each MultiLineString sub-line becomes its own LineString Feature so it
  // gets its own Leaflet layer — that way we can hover one section at a
  // time, show its individual length in the tooltip, and highlight just
  // that section without touching its siblings.
  function explodeMultiLines(features) {
    const out = [];
    for (const f of features) {
      const g = f && f.geometry;
      if (g && g.type === 'MultiLineString') {
        g.coordinates.forEach((coords) => {
          out.push({
            type: 'Feature',
            properties: f.properties,
            geometry: { type: 'LineString', coordinates: coords },
          });
        });
      } else {
        out.push(f);
      }
    }
    return out;
  }

  const BASE_WEIGHT  = 4;
  const HOVER_WEIGHT = 7;
  const BASE_OPACITY  = 0.85;
  const HOVER_OPACITY = 1;

  async function addTrailsToMap(map) {
    const data = await loadTrails();
    if (!data || !data.features || data.features.length === 0) return null;

    const exploded = {
      type: 'FeatureCollection',
      features: explodeMultiLines(data.features),
    };

    const layer = L.geoJSON(exploded, {
      style: (feature) => ({
        color:    (feature.properties && feature.properties.color) || FALLBACK_COLOR,
        weight:   BASE_WEIGHT,
        opacity:  BASE_OPACITY,
        lineCap:  'round',
        lineJoin: 'round',
      }),
      onEachFeature: (feature, lyr) => {
        const name = feature.properties && feature.properties.name;
        if (name) {
          const dist = featureLengthMeters(feature);
          const label = dist > 0 ? name + ' · ' + formatDistance(dist) : name;
          lyr.bindTooltip(label, { sticky: true, direction: 'top', opacity: 0.95 });
        }
        lyr.on('mouseover', () => {
          lyr.setStyle({ weight: HOVER_WEIGHT, opacity: HOVER_OPACITY });
          lyr.bringToFront();
        });
        lyr.on('mouseout', () => {
          lyr.setStyle({ weight: BASE_WEIGHT, opacity: BASE_OPACITY });
        });
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
