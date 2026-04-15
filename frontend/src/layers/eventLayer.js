/**
 * Event layer — renders EONET events as colored, animated circles on the globe.
 *
 * Layer IDs:
 *   'events-source' — GeoJSON source
 *   'events-halo'   — pulsing outer ring (open events only)
 *   'events-circle' — solid inner circle
 *   'events-label'  — category emoji labels (high zoom only)
 */

export const CATEGORIES = {
  wildfires:    { color: '#ff6b35', emoji: '🔥', label: 'Wildfires' },
  severeStorms: { color: '#00b4d8', emoji: '🌪️', label: 'Severe Storms' },
  earthquakes:  { color: '#ff4458', emoji: '🌍', label: 'Earthquakes' },
  floods:       { color: '#3a86ff', emoji: '🌊', label: 'Floods' },
  volcanoes:    { color: '#ff9500', emoji: '🌋', label: 'Volcanoes' },
  landslides:   { color: '#c77dff', emoji: '⛰️',  label: 'Landslides' },
  seaLakeIce:   { color: '#90e0ef', emoji: '🧊', label: 'Sea & Lake Ice' },
  drought:      { color: '#ffd166', emoji: '☀️',  label: 'Drought' },
  snow:         { color: '#e8f4f8', emoji: '❄️',  label: 'Snow' },
  tempExtremes: { color: '#ff6b6b', emoji: '🌡️', label: 'Temp Extremes' },
  dustHaze:     { color: '#c4a882', emoji: '🌫️', label: 'Dust & Haze' },
  waterColor:   { color: '#06d6a0', emoji: '💧', label: 'Water Color' },
  manmade:      { color: '#9b5de5', emoji: '⚠️', label: 'Manmade' },
  unknown:      { color: '#888',    emoji: '📍', label: 'Unknown' },
};

/** Build MapLibre match expression: [category] → color */
function buildColorExpression() {
  const expr = ['match', ['get', 'category']];
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    expr.push(id, meta.color);
  }
  expr.push('#888'); // fallback
  return expr;
}

/** Build MapLibre match expression: [category] → emoji string */
function buildEmojiExpression() {
  const expr = ['match', ['get', 'category']];
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    expr.push(id, meta.emoji);
  }
  expr.push('📍');
  return expr;
}

/** Radius scaling based on magnitude (normalized, 5–28 px). */
const RADIUS_EXPR = [
  'case',
  ['!=', ['get', 'magnitude_value'], null],
  ['interpolate', ['linear'], ['get', 'magnitude_value'], 0, 5, 200, 22],
  8, // default
];

let _pulseTimer = null;
let _pulseRadius = 14;
let _pulseDir = 1;

function startPulseAnimation(map) {
  if (_pulseTimer) return;
  _pulseTimer = setInterval(() => {
    _pulseRadius += _pulseDir * 0.6;
    if (_pulseRadius > 22 || _pulseRadius < 12) _pulseDir *= -1;
    if (map.getLayer('events-halo')) {
      map.setPaintProperty('events-halo', 'circle-radius', _pulseRadius);
    }
  }, 60);
}

/**
 * Add all event layers to the map.
 * @param {maplibregl.Map} map
 * @param {GeoJSON.FeatureCollection} geojson
 */
export function initEventLayer(map, geojson) {
  // GeoJSON source
  map.addSource('events-source', {
    type: 'geojson',
    data: geojson,
    cluster: false,
  });

  // Pulsing halo (open events only)
  map.addLayer({
    id: 'events-halo',
    type: 'circle',
    source: 'events-source',
    filter: ['==', ['get', 'status'], 'open'],
    paint: {
      'circle-radius': 14,
      'circle-color': buildColorExpression(),
      'circle-opacity': 0.18,
      'circle-stroke-width': 0,
    },
  });

  // Solid inner circle
  map.addLayer({
    id: 'events-circle',
    type: 'circle',
    source: 'events-source',
    paint: {
      'circle-radius': RADIUS_EXPR,
      'circle-color': buildColorExpression(),
      'circle-opacity': [
        'case', ['==', ['get', 'status'], 'open'], 0.9, 0.55,
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.15,
    },
  });

  startPulseAnimation(map);
}

/**
 * Replace GeoJSON source data (called after filtering or reload).
 * @param {maplibregl.Map} map
 * @param {GeoJSON.FeatureCollection} geojson
 */
export function updateEventLayer(map, geojson) {
  const src = map.getSource('events-source');
  if (src) src.setData(geojson);
}

/** Apply category filter — pass null to show all. */
export function filterByCategory(map, categories) {
  if (!categories || categories.length === 0) {
    map.setFilter('events-circle', null);
    map.setFilter('events-halo', ['==', ['get', 'status'], 'open']);
    return;
  }
  const catFilter = ['in', ['get', 'category'], ['literal', categories]];
  map.setFilter('events-circle', catFilter);
  map.setFilter('events-halo', [
    'all',
    catFilter,
    ['==', ['get', 'status'], 'open'],
  ]);
}

export function stopPulse() {
  if (_pulseTimer) { clearInterval(_pulseTimer); _pulseTimer = null; }
}
