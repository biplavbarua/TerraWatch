/**
 * Event card — rich MapLibre popup for a clicked event marker.
 */

import { CATEGORIES } from '../layers/eventLayer.js';
import { fetchEventPath } from '../api.js';
import { showEventPath, clearEventPath } from '../layers/pathLayer.js';

let _popup = null;

/**
 * Show a popup for a clicked GeoJSON feature.
 * @param {maplibregl.Map} map
 * @param {GeoJSON.Feature} feature
 * @param {{ onShowPath?: Function }} opts
 */
export function showEventCard(map, feature, { onShowPath } = {}) {
  const p = feature.properties;
  const meta = CATEGORIES[p.category] ?? CATEGORIES.unknown;

  const isOpen = p.status === 'open';
  const hasPath = isOpen && parseInt(p.path_points ?? '0') > 1;
  const mag = p.magnitude_value != null
    ? `${parseFloat(p.magnitude_value).toLocaleString()} ${p.magnitude_unit ?? ''}`
    : '—';
  const when = p.last_seen ? _relativeTime(new Date(p.last_seen)) : '—';
  const whenFull = p.last_seen ? new Date(p.last_seen).toLocaleString() : '—';
  const coords = feature.geometry.coordinates;
  const lat = coords[1]?.toFixed(4);
  const lon = coords[0]?.toFixed(4);
  const bgColor = hexToRgba(meta.color, 0.15);

  const severityLevels = {
    1: { label: 'Low', color: '#3b82f6' },
    2: { label: 'Minor', color: '#10b981' },
    3: { label: 'Moderate', color: '#f59e0b' },
    4: { label: 'Severe', color: '#ef4444' },
    5: { label: 'Extreme', color: '#b91c1c' }
  };
  const sev = severityLevels[p.severity_score] ?? severityLevels[2];

  const html = `
    <div class="event-popup">
      <div class="popup-header">
        <div class="popup-cat-icon" style="background:${bgColor}">
          ${meta.emoji}
        </div>
        <div>
          <div class="popup-title">${escHtml(p.title)}</div>
          <div class="popup-cat-label">${meta.label}</div>
        </div>
      </div>

      <div class="popup-badges" style="display:flex; gap:8px; align-items:center; margin-bottom:16px;">
        <div class="popup-badge ${isOpen ? 'open' : 'closed'}" style="margin-bottom:0;">
          <span class="dot"></span>
          ${isOpen ? 'Active' : 'Closed'}
        </div>
        <div class="popup-badge" style="margin-bottom:0; background:${hexToRgba(sev.color, 0.15)}; color:${sev.color}; border:1px solid ${hexToRgba(sev.color, 0.3)};">
          Severity: ${p.severity_score} - ${sev.label}
        </div>
      </div>

      <div class="popup-stat">
        <span>Magnitude</span>
        <span>${mag}</span>
      </div>
      <div class="popup-stat" title="${whenFull}">
        <span>Last seen</span>
        <span>${when}</span>
      </div>
      <div class="popup-stat">
        <span>Coordinates</span>
        <span>${lat}°, ${lon}°</span>
      </div>
      ${hasPath ? `
      <div class="popup-stat">
        <span>Track points</span>
        <span>${p.path_points}</span>
      </div>` : ''}

      <div class="popup-actions">
        ${hasPath ? `<button class="popup-btn primary" id="show-path-btn">🗺 Show Path</button>` : ''}
        ${p.source_url ? `<button class="popup-btn" id="source-link-btn">🔗 Source</button>` : ''}
        <button class="popup-btn" id="ask-about-btn">💬 Ask AI</button>
      </div>
    </div>
  `;

  // Remove existing popup
  _popup?.remove();

  const { Popup } = window.maplibregl;
  _popup = new Popup({ closeButton: true, maxWidth: '340px', offset: 15 })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);

  // Bind path button
  document.getElementById('show-path-btn')?.addEventListener('click', async () => {
    try {
      const pathGeoJSON = await fetchEventPath(p.eonet_id);
      clearEventPath(map);
      showEventPath(map, pathGeoJSON, p.category);
      onShowPath?.(p.eonet_id);
    } catch (e) {
      console.error('Path fetch failed:', e);
      window.showToast?.('Could not load event path', 'error');
    }
  });

  // Source link button
  document.getElementById('source-link-btn')?.addEventListener('click', () => {
    if (p.source_url) window.open(p.source_url, '_blank', 'noopener,noreferrer');
  });

  // AI button
  document.getElementById('ask-about-btn')?.addEventListener('click', () => {
    import('./chatPanel.js').then(({ toggleChatPanel }) => {
      toggleChatPanel(true);
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = `Tell me about "${p.title}". It is a ${meta.label} event${mag !== '—' ? ` with magnitude ${mag}` : ''}.`;
        input.dispatchEvent(new Event('input'));
        input.focus();
      }
    });
  });
}

export function closeEventCard() {
  _popup?.remove();
  _popup = null;
}

function _relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  return date.toLocaleDateString();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha ?? 1})`;
}

function escHtml(str) {
  return String(str ?? '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
