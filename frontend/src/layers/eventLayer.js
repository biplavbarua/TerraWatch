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

/** Radius scaling based on severity (1-5). */
const RADIUS_EXPR = [
  'match', ['coalesce', ['get', 'severity_score'], 2],
  1, 5,
  2, 7,
  3, 10,
  4, 14,
  5, 20,
  7 // default
];

let _pulseTimer = null;
let _pulseOffset = 0;
let _pulseDir = 1;

function startPulseAnimation(map) {
  stopPulse(); // clear any existing timer before starting a new one
  _pulseTimer = setInterval(() => {
    _pulseOffset += _pulseDir * 0.3;
    if (_pulseOffset > 6 || _pulseOffset < 0) _pulseDir *= -1;
    if (map.getLayer('events-halo')) {
      map.setPaintProperty('events-halo', 'circle-radius', [
        '+',
        RADIUS_EXPR,
        ['+', 3, _pulseOffset]
      ]);
    }
  }, 60);
}


/**
 * Add all event layers to the map.
 * @param {maplibregl.Map} map
 * @param {GeoJSON.FeatureCollection} geojson
 */
export function initEventLayer(map, geojson) {
  stopPulse(); // defensive: clear any timer from a previous init call

  // GeoJSON source with clustering enabled
  map.addSource('events-source', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 4,      // clusters dissolve above zoom 4
    clusterRadius: 40,      // pixels within which points cluster
  });

  // ── Cluster circle (shows count) ──────────────────────────────────────────
  map.addLayer({
    id: 'events-clusters',
    type: 'circle',
    source: 'events-source',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#ff9500', 10,   // amber: < 10
        '#ff6b35', 50,   // orange: 10 - 49
        '#ff4458',       // red: 50+
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        16, 10, 22, 50, 30
      ],
      'circle-opacity': 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.25)',
    },
  });

  // ── Cluster label ─────────────────────────────────────────────────────────
  map.addLayer({
    id: 'events-cluster-count',
    type: 'symbol',
    source: 'events-source',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'], // fonts present in dark-matter style
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });


  // Pulsing halo (open events only — unclustered)
  map.addLayer({
    id: 'events-halo',
    type: 'circle',
    source: 'events-source',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'open']],
    paint: {
      'circle-radius': ['+', RADIUS_EXPR, 3],
      'circle-color': buildColorExpression(),
      'circle-opacity': [
        'interpolate', ['linear'], ['coalesce', ['get', 'severity_score'], 2],
        1, 0.15,
        3, 0.2,
        5, 0.35
      ],
      'circle-stroke-width': 0,
    },
  });

  // Solid inner circle (unclustered)
  map.addLayer({
    id: 'events-circle',
    type: 'circle',
    source: 'events-source',
    filter: ['!', ['has', 'point_count']],
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

/** Apply category filter — pass null/empty to show all. */
export function filterByCategory(map, categories) {
  if (!categories || categories.length === 0) {
    // Show all — restore cluster layers and remove individual filters
    map.setFilter('events-clusters', ['has', 'point_count']);
    map.setFilter('events-cluster-count', ['has', 'point_count']);
    map.setFilter('events-circle', ['!', ['has', 'point_count']]);
    map.setFilter('events-halo', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'open']]);
    return;
  }
  const catFilter = ['in', ['get', 'category'], ['literal', categories]];
  // Hide clusters when a specific filter is active (clusters don't expose category)
  map.setFilter('events-clusters', ['all', ['has', 'point_count'], catFilter]);
  map.setFilter('events-cluster-count', ['all', ['has', 'point_count'], catFilter]);
  map.setFilter('events-circle', ['all', ['!', ['has', 'point_count']], catFilter]);
  map.setFilter('events-halo', [
    'all',
    ['!', ['has', 'point_count']],
    catFilter,
    ['==', ['get', 'status'], 'open'],
  ]);
}


export function stopPulse() {
  if (_pulseTimer) { clearInterval(_pulseTimer); _pulseTimer = null; }
}
