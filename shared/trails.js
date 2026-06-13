// ============================================================
// Trail overlay loader.
// Reads shared/trails.geojson once (cached for the lifetime of
// the page), then exposes ORFORD.addTrailsToMap(map) so any
// Leaflet map in the app can paint the trail network with
// a single line.
//
// Expected GeoJSON shape — one Feature per segment (main trail or access):
//   {
//     "type": "Feature",
//     "properties": {
//       "name":      "…",         // displayed name
//       "color":     "#…",        // segment colour
//       "condition"?: "rough",    // overgrown / unmaintained → dashed + labelled
//       "kind"?:      "access",   // distinguishes trail accesses from main trails
//       "parent"?:    "Sentier …" // for kind:access — its parent trail's name,
//                                 // so the access stays visible when the
//                                 // parent trail is selected in the filter.
//     },
//     "geometry":   { "type": "LineString",
//                     "coordinates": [[lng, lat], [lng, lat], ...] }
//   }
//
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

  const BASE_WEIGHT   = 4;
  const HOVER_WEIGHT  = 7;
  const BASE_OPACITY  = 0.9;
  const HOVER_OPACITY = 1;
  // Dashed pattern for rough trails — same colour & opacity as the rest,
  // just dashed so they read as "different" without disappearing.
  const ROUGH_DASH = '6, 6';

  function baseStyleFor(feature) {
    const props = (feature && feature.properties) || {};
    return {
      color:     props.color || FALLBACK_COLOR,
      weight:    BASE_WEIGHT,
      opacity:   BASE_OPACITY,
      dashArray: props.condition === 'rough' ? ROUGH_DASH : null,
      lineCap:   'round',
      lineJoin:  'round',
    };
  }

  async function addTrailsToMap(map) {
    const data = await loadTrails();
    if (!data || !data.features || data.features.length === 0) return null;

    const exploded = {
      type: 'FeatureCollection',
      features: explodeMultiLines(data.features),
    };

    const layer = L.geoJSON(exploded, {
      style: baseStyleFor,
      onEachFeature: (feature, lyr) => {
        const props = (feature && feature.properties) || {};
        const name = props.name;
        if (name) {
          const dist = featureLengthMeters(feature);
          const parts = [name];
          if (dist > 0) parts.push(formatDistance(dist));
          if (props.condition === 'rough') parts.push('Broussailleux');
          lyr.bindTooltip(parts.join(' · '), { sticky: true, direction: 'top', opacity: 0.95 });
        }
        lyr.on('mouseover', () => {
          // Keep dashArray; just thicken and re-opacify for readability.
          lyr.setStyle({ weight: HOVER_WEIGHT, opacity: HOVER_OPACITY });
          lyr.bringToFront();
        });
        lyr.on('mouseout', () => {
          lyr.setStyle(baseStyleFor(feature));
        });
      },
    });

    layer.addTo(map);
    return layer;
  }

  // Projette le point `p` ([lng, lat]) sur le segment [a, b] et renvoie le
  // pied de la perpendiculaire, BORNÉ aux extrémités du segment (si le pied
  // tombe au-delà, c'est l'extrémité la plus proche). Calcul dans un plan
  // local équirectangulaire autour de `p` (mètres) — exact à l'échelle d'un
  // sentier. Retourne un point [lng, lat].
  function projectOnSegment(p, a, b) {
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((p[1] * Math.PI) / 180);
    const toXY = (c) => [(c[0] - p[0]) * mPerDegLng, (c[1] - p[1]) * mPerDegLat];
    const A = toXY(a), B = toXY(b); // P est l'origine (0, 0)
    const ABx = B[0] - A[0], ABy = B[1] - A[1];
    const ab2 = ABx * ABx + ABy * ABy;
    let t = ab2 ? (-A[0] * ABx - A[1] * ABy) / ab2 : 0;
    t = Math.max(0, Math.min(1, t)); // borne aux extrémités
    const fx = A[0] + t * ABx, fy = A[1] + t * ABy;
    return [p[0] + fx / mPerDegLng, p[1] + fy / mPerDegLat];
  }

  // Point le plus proche du TRACÉ d'un sentier donné (sa ligne principale ET
  // ses sous-sections `parent`, mais pas les accès/connecteurs), par projection
  // perpendiculaire sur le segment le plus proche. Sert à « aimanter » une
  // position GPS imprécise sur le sentier choisi. Retourne
  // { lat, lng, distance } (mètres), ou null si le sentier n'a pas de tracé
  // (« Autre sentier », sentier absent du GeoJSON) — auquel cas on n'aimante pas.
  async function nearestPointOnTrail(trailName, lat, lng) {
    const data = await loadTrails();
    if (!data || !Array.isArray(data.features)) return null;
    const target = normalize(trailName);
    if (!target) return null;

    const lines = [];
    for (const f of data.features) {
      const props = (f && f.properties) || {};
      if (props.kind === 'access') continue;
      if (normalize(props.name) !== target && normalize(props.parent) !== target) continue;
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach((c) => lines.push(c));
    }
    if (lines.length === 0) return null;

    const p = [lng, lat];
    let best = null, bestDist = Infinity;
    for (const coords of lines) {
      for (let i = 1; i < coords.length; i++) {
        const foot = projectOnSegment(p, coords[i - 1], coords[i]);
        const d = haversine(p, foot);
        if (d < bestDist) { bestDist = d; best = foot; }
      }
    }
    if (!best) return null;
    return { lat: best[1], lng: best[0], distance: bestDist };
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

  // List of the MAIN trails (no access segments, no child sections that
  // roll up under a parent), in file order, deduped. Single source of truth
  // for any UI that needs "the trails": one entry per name, with its colour
  // and whether it's rough (broussailleux).
  async function getTrailList() {
    const data = await loadTrails();
    const out = [];
    const seen = new Set();
    if (data && Array.isArray(data.features)) {
      for (const f of data.features) {
        const p = (f && f.properties) || {};
        if (!p.name || p.kind === 'access' || p.parent) continue;
        const key = normalize(p.name);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: p.name,
          color: p.color || FALLBACK_COLOR,
          rough: p.condition === 'rough',
        });
      }
    }
    return out;
  }

  window.ORFORD = window.ORFORD || {};
  window.ORFORD.addTrailsToMap     = addTrailsToMap;
  window.ORFORD.getTrailColor      = getTrailColor;
  window.ORFORD.getTrailList       = getTrailList;
  window.ORFORD.nearestPointOnTrail = nearestPointOnTrail;
  window.ORFORD.TRAIL_FALLBACK_COLOR = FALLBACK_COLOR;
})();
