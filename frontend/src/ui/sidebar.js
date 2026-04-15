/**
 * Sidebar — category filters + searchable event list.
 */

import { CATEGORIES } from '../layers/eventLayer.js';
import { fetchGeoJSON } from '../api.js';

let _allFeatures = [];
let _hiddenCategories = new Set();   // categories the user has toggled OFF
let _searchQuery = '';
let _onSelectCallback = null;
let _onFilterCallback = null;
let _statsData = {};

/** Initialize the sidebar with DOM bindings. */
export function initSidebar({ onSelect, onFilter }) {
  _onSelectCallback = onSelect;
  _onFilterCallback = onFilter;
  _buildCategoryFilters();
  _bindSearch();
}

function _buildCategoryFilters() {
  const container = document.getElementById('category-filters');
  if (!container) return;

  container.innerHTML = Object.entries(CATEGORIES).map(([id, meta]) => `
    <label class="category-filter active" data-cat="${id}" title="${meta.label}">
      <input type="checkbox" checked />
      <span class="cat-dot" style="background:${meta.color}; color:${meta.color}"></span>
      <span class="cat-label">${meta.emoji} ${meta.label}</span>
      <span class="cat-count" id="cnt-${id}">0</span>
    </label>
  `).join('');

  // Toggle logic: clicking hides/shows a category
  container.querySelectorAll('.category-filter').forEach(el => {
    el.addEventListener('click', () => {
      const cat = el.dataset.cat;
      const wasVisible = el.classList.contains('active');
      el.classList.toggle('active', !wasVisible);
      if (wasVisible) {
        _hiddenCategories.add(cat);    // now hidden
      } else {
        _hiddenCategories.delete(cat); // now visible again
      }
      _applyFilter();
    });
  });
}

function _bindSearch() {
  const input = document.getElementById('sidebar-search');
  if (!input) return;
  input.addEventListener('input', e => {
    _searchQuery = e.target.value.toLowerCase();
    _renderEventList();
  });
}

function _applyFilter() {
  const visibleCats = Object.keys(CATEGORIES).filter(c => !_hiddenCategories.has(c));
  _onFilterCallback?.(visibleCats);
  _renderEventList();
}


/** Update features from a new GeoJSON FeatureCollection. */
export function updateSidebarEvents(geojson, statsData = {}) {
  _allFeatures = geojson.features ?? [];
  _statsData = statsData;

  // Update counts per category
  const counts = {};
  for (const f of _allFeatures) {
    const cat = f.properties.category ?? 'unknown';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  Object.entries(counts).forEach(([cat, n]) => {
    const el = document.getElementById(`cnt-${cat}`);
    if (el) el.textContent = n;
  });

  _renderEventList();
}

function _getVisibleFeatures() {
  return _allFeatures.filter(f => {
    const cat = f.properties.category ?? 'unknown';
    if (_hiddenCategories.has(cat)) return false;
    if (_searchQuery) {
      const title = (f.properties.title ?? '').toLowerCase();
      if (!title.includes(_searchQuery)) return false;
    }
    return true;
  });
}

function _renderEventList() {
  const list = document.getElementById('event-list');
  if (!list) return;

  const visible = _getVisibleFeatures();

  if (!visible.length) {
    list.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px">
        No events match current filters
      </div>`;
    return;
  }

  list.innerHTML = visible.slice(0, 200).map(f => {
    const p = f.properties;
    const meta = CATEGORIES[p.category] ?? CATEGORIES.unknown;
    const isOpen = p.status === 'open';
    const mag = p.magnitude_value
      ? `${parseFloat(p.magnitude_value).toFixed(0)} ${p.magnitude_unit}`
      : '';
    const when = p.last_seen
      ? _relativeTime(new Date(p.last_seen))
      : '';
    return `
      <div class="event-list-item ${isOpen ? 'eli-open' : ''}"
           data-id="${p.eonet_id}" role="button" tabindex="0">
        <span class="eli-dot" style="background:${meta.color}; color:${meta.color}"></span>
        <div class="eli-content">
          <div class="eli-title">${p.title}</div>
          <div class="eli-meta">${[mag, when].filter(Boolean).join(' · ')}</div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.event-list-item').forEach(el => {
    el.addEventListener('click', () => {
      list.querySelectorAll('.event-list-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      const id = el.dataset.id;
      const feature = visible.find(f => f.properties.eonet_id === id);
      _onSelectCallback?.(feature);
    });
  });
}

function _relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

/** Highlight a specific event in the list. */
export function selectEventInList(eonetId) {
  const list = document.getElementById('event-list');
  list?.querySelectorAll('.event-list-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === eonetId);
    if (el.dataset.id === eonetId) el.scrollIntoView({ block: 'nearest' });
  });
}
