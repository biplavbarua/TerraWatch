/**
 * main.js — TerraWatch application orchestrator.
 * Initializes the MapLibre globe and wires up all modules.
 */

import { fetchGeoJSON, fetchStats } from './api.js';
import { initEventLayer, updateEventLayer, filterByCategory, CATEGORIES } from './layers/eventLayer.js';
import { clearEventPath } from './layers/pathLayer.js';
import { initSidebar, updateSidebarEvents, selectEventInList } from './ui/sidebar.js';
import { initChatPanel } from './ui/chatPanel.js';
import { showEventCard, closeEventCard } from './ui/eventCard.js';

// ─── MapLibre alias (loaded via CDN before this module) ──────────────────
const maplibregl = window.maplibregl;

let map;
let currentGeoJSON = { type: 'FeatureCollection', features: [] };
let sidebarVisible = true;
let _booted = false;      // guard: only one boot path runs loadEvents()
let _refreshTimer = null; // handle to the auto-refresh interval


// ─── Globe init ───────────────────────────────────────────────────────────
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [0, 20],
    zoom: 1.6,
    minZoom: 1,
    maxZoom: 14,
    projection: 'globe',   // MapLibre v4+ constructor param (primary method)
    attributionControl: false,
  });

  // Expose globally for debugging
  window._twMap = map;

  // Surface map errors immediately
  map.on('error', (e) => {
    console.error('[TerraWatch] Map error:', e.error ?? e);
  });

  return map;
}


// ─── Data loading ─────────────────────────────────────────────────────────
async function loadEvents(filters = {}) {
  try {
    const [geojson, stats] = await Promise.all([
      fetchGeoJSON({ status: 'open', limit: 2000, ...filters }),
      fetchStats('open'),
    ]);

    currentGeoJSON = geojson;

    if (map.getSource('events-source')) {
      updateEventLayer(map, geojson);
    } else {
      initEventLayer(map, geojson);
      bindMapEvents();
    }

    updateSidebarEvents(geojson, stats);
    updateStatsBar(stats);
    updateLiveBadge(geojson.features.length);
  } catch (err) {
    showToast(`Failed to load events: ${err.message}`, 'error');
    console.error('[TerraWatch] loadEvents error:', err);
  }
}

// ─── Map event binding ────────────────────────────────────────────────────
function bindMapEvents() {
  // Click on a cluster → zoom in to expand
  map.on('click', 'events-clusters', async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['events-clusters'] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    try {
      // MapLibre v4: getClusterExpansionZoom returns a Promise (callback API removed)
      const zoom = await map.getSource('events-source').getClusterExpansionZoom(clusterId);
      map.easeTo({ center: features[0].geometry.coordinates, zoom });
    } catch (err) {
      console.warn('[TerraWatch] cluster expand error:', err);
    }
  });


  // Cluster hover cursor
  map.on('mouseenter', 'events-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'events-clusters', () => { map.getCanvas().style.cursor = ''; });

  // Click on event marker
  map.on('click', 'events-circle', e => {
    const feature = e.features?.[0];
    if (!feature) return;
    clearEventPath(map);

    map.flyTo({
      center: feature.geometry.coordinates,
      zoom: Math.max(map.getZoom(), 4),
      speed: 1.4,
      curve: 1.2,
    });

    showEventCard(map, feature, {
      onShowPath: () => selectEventInList(feature.properties.eonet_id),
    });
    selectEventInList(feature.properties.eonet_id);
  });

  // Hover cursor
  map.on('mouseenter', 'events-circle', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'events-circle', () => {
    map.getCanvas().style.cursor = '';
  });

  // Click on blank globe → clear selection
  map.on('click', e => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['events-circle', 'events-clusters'] });
    if (!features.length) {
      closeEventCard();
      clearEventPath(map);
      document.querySelectorAll('.event-list-item').forEach(el =>
        el.classList.remove('selected'));
    }
  });
}


// ─── Category filter (sidebar → map) ─────────────────────────────────────
function handleFilter(visibleCategories) {
  filterByCategory(map, visibleCategories);
}

// ─── Sidebar event selection → fly to + popup ────────────────────────────
function handleSelectEvent(feature) {
  if (!feature) return;
  clearEventPath(map);

  map.flyTo({
    center: feature.geometry.coordinates,
    zoom: Math.max(map.getZoom(), 4),
    speed: 1.4,
    curve: 1.2,
  });

  showEventCard(map, feature, {
    onShowPath: () => selectEventInList(feature.properties.eonet_id),
  });
}

// ─── Stats bar ────────────────────────────────────────────────────────────
function updateStatsBar(stats) {
  const bar = document.getElementById('stats-chips');
  if (!bar || !stats?.by_category) return;

  bar.innerHTML = stats.by_category.slice(0, 8).map(({ category, count }) => {
    const meta = CATEGORIES[category] ?? CATEGORIES.unknown;
    return `
      <div class="stat-chip">
        <span class="stat-dot" style="background:${meta.color}"></span>
        <span>${meta.emoji} ${meta.label}</span>
        <span class="stat-count">${count}</span>
      </div>`;
  }).join('');
}

function updateLiveBadge(count) {
  const el = document.getElementById('event-count');
  if (el) el.textContent = `${count} active`;
}

// ─── Sidebar toggle ───────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  document.getElementById('sidebar')?.classList.toggle('hidden', !sidebarVisible);
  document.getElementById('stats-bar')?.classList.toggle('sidebar-hidden', !sidebarVisible);
  document.getElementById('toggle-sidebar-btn')?.classList.toggle('active', sidebarVisible);
}

// ─── Toast utility ────────────────────────────────────────────────────────
window.showToast = function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

// ─── Auto-refresh every 15 min — pauses when tab is hidden ───────────────
function startAutoRefresh() {
  // Clear any existing timer first (safe to call multiple times)
  if (_refreshTimer) clearInterval(_refreshTimer);

  _refreshTimer = setInterval(() => {
    // Skip fetch if tab is hidden — saves API calls and battery
    if (document.visibilityState === 'hidden') return;
    loadEvents();
    showToast('Events refreshed', 'info');
  }, 15 * 60 * 1000);
}

// Resume/pause auto-refresh with tab visibility
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _booted) {
    // Tab became visible — reload immediately then restart timer
    loadEvents();
    startAutoRefresh();
  }
});


// ─── Loading overlay ──────────────────────────────────────────────────────
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 700);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────
async function bootstrap() {
  // Init map
  initMap();

  // Init UI modules
  initSidebar({ onSelect: handleSelectEvent, onFilter: handleFilter });
  initChatPanel();

  // Wire navbar buttons
  document.getElementById('toggle-sidebar-btn')?.addEventListener('click', toggleSidebar);

  // Timeout fallback — if style.load never fires (e.g. no WebGL / tile blocked)
  // still show the UI and load event list data.
  const loadingTimeout = setTimeout(async () => {
    if (!_booted) {
      _booted = true;
      console.warn('[TerraWatch] style.load timed out — skipping globe render, showing UI.');
      await loadEvents();
      startAutoRefresh();
      hideLoading();
    }
  }, 10000);


  // Wait for map style + set globe projection/atmosphere together
  map.once('style.load', async () => {
    if (_booted) return; // timeout already fired — skip
    _booted = true;
    clearTimeout(loadingTimeout);


    // Globe projection is already set via `projection: 'globe'` in the Map constructor.
    // MapLibre v5 does not need setProjection() called post-load.
    // (calling it after style.load triggers a full style rebuild and can cause flicker)
    console.log('[TerraWatch] Projection from constructor:', map.getProjection?.()?.name ?? 'unavailable');


    // Space atmosphere (MapLibre v5: setSky replaces setFog)
    try {
      map.setSky({
        'sky-color': '#000008',
        'sky-horizon-blend': 0.015,
        'horizon-color': '#060612',
        'horizon-fog-blend': 0.4,
        'fog-color': '#030310',
        'fog-ground-blend': 0.9,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0],
      });
    } catch (e) {
      console.warn('[TerraWatch] setSky failed:', e.message);
    }



    await loadEvents();
    startAutoRefresh();
    hideLoading();
  });
}

bootstrap();
