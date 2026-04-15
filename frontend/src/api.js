/**
 * TerraWatch API client — fetch wrapper for the FastAPI backend.
 */

const BASE = 'http://localhost:8000/api';

async function _json(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Fetch all events as JSON. */
export async function fetchEvents({ category, status = 'open', limit = 500, days } = {}) {
  const p = new URLSearchParams({ status, limit });
  if (category) p.set('category', category);
  if (days)     p.set('days', days);
  return _json(`${BASE}/events?${p}`);
}

/** Fetch events as a GeoJSON FeatureCollection — direct MapLibre source. */
export async function fetchGeoJSON({ category, status = 'open', limit = 1000 } = {}) {
  const p = new URLSearchParams({ status, limit });
  if (category) p.set('category', category);
  return _json(`${BASE}/events/geojson?${p}`);
}

/** Fetch trajectory GeoJSON for a single event. */
export async function fetchEventPath(eonetId) {
  return _json(`${BASE}/events/${eonetId}/path`);
}

/** Fetch single event detail. */
export async function fetchEvent(eonetId) {
  return _json(`${BASE}/events/${eonetId}`);
}

/** Get event counts by category. */
export async function fetchStats(status = 'open') {
  return _json(`${BASE}/stats?status=${status}`);
}

/** Ask the AI a natural language question. */
export async function askAI(question) {
  const res = await _json(`${BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return res.answer;
}
