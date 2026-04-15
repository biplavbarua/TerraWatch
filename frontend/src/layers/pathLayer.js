/**
 * Path layer — renders storm/event trajectory as an animated dashed line.
 *
 * Layer IDs: 'path-line', 'path-direction-arrows'
 */

import { CATEGORIES } from './eventLayer.js';

const PATH_SOURCE = 'path-source';
const PATH_LAYER  = 'path-line';

let _dashTimer = null;
let _dashOffset = 0;

function startDashAnimation(map) {
  if (_dashTimer) return;
  _dashTimer = setInterval(() => {
    _dashOffset = (_dashOffset + 0.5) % 10;
    if (map.getLayer(PATH_LAYER)) {
      map.setPaintProperty(PATH_LAYER, 'line-dasharray', [
        _dashOffset / 10,
        (10 - _dashOffset) / 10 * 2,
      ]);
    }
  }, 50);
}

function stopDashAnimation() {
  if (_dashTimer) { clearInterval(_dashTimer); _dashTimer = null; }
}

/**
 * Draw the trajectory for an event.
 * @param {maplibregl.Map} map
 * @param {GeoJSON.FeatureCollection} pathGeoJSON — from GET /events/{id}/path
 * @param {string} category — event category (for color)
 */
export function showEventPath(map, pathGeoJSON, category = 'unknown') {
  clearEventPath(map);

  const color = CATEGORIES[category]?.color ?? '#888';
  const features = pathGeoJSON?.features ?? [];
  if (!features.length) return;

  const feature = features[0];
  if (!feature?.geometry?.coordinates?.length) return;

  // Ensure LineString (if only 1 coord wrap as MultiPoint dots)
  const geom = feature.geometry;
  const isLine = geom.type === 'LineString' && geom.coordinates.length > 1;

  map.addSource(PATH_SOURCE, {
    type: 'geojson',
    data: pathGeoJSON,
  });

  if (isLine) {
    // Fine trail line
    map.addLayer({
      id: 'path-trail',
      type: 'line',
      source: PATH_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': 2,
        'line-opacity': 0.35,
      },
    }, 'events-halo');

    // Animated dashed overlay
    map.addLayer({
      id: PATH_LAYER,
      type: 'line',
      source: PATH_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': 2.5,
        'line-opacity': 0.85,
        'line-dasharray': [0, 2],
      },
    }, 'events-circle');

    startDashAnimation(map);

    // Origin dot
    const origin = geom.coordinates[0];
    map.addSource('path-origin-src', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Point', coordinates: origin } },
    });
    map.addLayer({
      id: 'path-origin',
      type: 'circle',
      source: 'path-origin-src',
      paint: {
        'circle-radius': 5,
        'circle-color': color,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.9,
      },
    }, 'events-circle');
  }
}

/** Remove all path layers and sources. */
export function clearEventPath(map) {
  stopDashAnimation();
  const layers = ['path-trail', PATH_LAYER, 'path-origin'];
  const sources = [PATH_SOURCE, 'path-origin-src'];
  layers .forEach(id => { if (map.getLayer(id))   map.removeLayer(id); });
  sources.forEach(id => { if (map.getSource(id))  map.removeSource(id); });
}
