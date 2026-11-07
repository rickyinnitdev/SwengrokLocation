// Guess-map helpers, loaded lazily the first time a guess map is created:
// quick-jump chips, overlay layers, crosshair mode, a touch loupe and a live khan label.
// There is deliberately NO place search or geocoding here (owner decision).
import { applyMapProfile } from './profile.js';
import { khanAt, featureBounds } from './geo.js';
import { CHIP_SETS, RIVERS, PP_ORIENTATION_IDS, KH_CITIES } from './areas.js';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'; // TODO(tiles): evaluate a provider/self-hosted tiles before launch
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let khanDataPromise = null;
function loadKhans() {
  khanDataPromise ||= fetch('/data/pp-khans.geojson').then(r => r.json()).catch(() => null);
  return khanDataPromise;
}

/**
 * @param {object} o
 * @param {L.Map} o.map  @param {object} o.cfg  MODE_CONFIG entry  @param {object} o.L  Leaflet
 * @param {(latlng)=>void} o.onPin  place or move the guess pin
 * @param {()=>string} o.lang  'en' | 'km'   @param {(k:string)=>string} o.t
 * @param {object} o.landmarks  LOCATIONS_DB.landmarks   @param {(khanId:string)=>void} [o.onKhanPick]
 */
export function mountMapTools({ map, cfg, L, onPin, lang, t, landmarks = [], onKhanPick, resetView }) {
  const profile = cfg.map;
  const wrapper = map.getContainer().parentElement;
  const locked = profile.lockedOverlays || {};
  const available = [...new Set([...profile.overlays, ...Object.keys(locked)])];
  const enabled = new Set(profile.overlays.filter(o => locked[o] !== false));
  for (const [k, v] of Object.entries(locked)) { if (v === true) enabled.add(k); }
  const layers = {};
  let khans = null;
  let destroyed = false;
  let crosshair = false;

  const root = document.createElement('div');
  root.className = 'map-tools';
  wrapper.appendChild(root);

  // ---------- chips ----------
  const chipRow = document.createElement('div');
  chipRow.className = 'map-chips';
  chipRow.setAttribute('role', 'toolbar');
  root.appendChild(chipRow);
  const chip = (label, onClick, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'map-chip ' + cls; b.textContent = label; b.addEventListener('click', onClick);
    return b;
  };
  // No animation: the panel can resize under the cursor, and a resize cancels a running zoom animation.
  // The desktop panel grows under the cursor right after a chip is tapped, so a fit made at the
  // small size is repeated for the next 900 ms of resizes. Any drag or zoom by the player cancels it.
  let lastFit = null, fitting = false;
  const fit = bounds => {
    fitting = true;
    map.invalidateSize();
    map.fitBounds(bounds, { animate: false, padding: [8, 8] });
    fitting = false;
    lastFit = { bounds, at: Date.now() };
  };
  const refit = () => {
    if (fitting || !lastFit || Date.now() - lastFit.at > 900) return;
    fitting = true; map.fitBounds(lastFit.bounds, { animate: false, padding: [8, 8] }); fitting = false;
  };
  map.on('resize', refit);
  map.on('dragstart', () => { lastFit = null; });
  function renderChips() {
    chipRow.replaceChildren();
    chipRow.appendChild(chip('🏠 ' + t('map.reset'), () => { if (!resetView?.()) applyMapProfile(map, profile); }, 'reset'));
    if (profile.quickJumps === 'pp-khans') {
      for (const f of khans?.features || []) {
        const p = f.properties;
        const b = chip(lang() === 'km' ? p.nameKm : p.name, () => fit(featureBounds(f)));
        b.dataset.area = p.id;
        chipRow.appendChild(b);
      }
    } else {
      for (const a of CHIP_SETS[profile.quickJumps] || []) {
        const b = chip(lang() === 'km' ? a.km : a.name, () => fit(a.bounds));
        b.dataset.area = a.id;
        chipRow.appendChild(b);
      }
    }
  }

  // ---------- overlays ----------
  const hasKhans = available.includes('khans') || profile.quickJumps === 'pp-khans';
  const ready = hasKhans ? loadKhans().then(d => { khans = d; }) : Promise.resolve();
  function buildLayer(name) {
    if (name === 'khans' && khans) {
      const g = L.geoJSON(khans, {
        style: { color: '#b8860b', weight: 1.4, dashArray: '5 5', fillOpacity: 0.02, fillColor: '#d4a017' },
        onEachFeature: (f, layer) => {
          layer.bindTooltip(esc(lang() === 'km' ? f.properties.nameKm : f.properties.name), { permanent: true, direction: 'center', className: 'khan-label' });
          if (cfg.isDistrict) {
            layer.on('click', e => {
              if (e.originalEvent) L.DomEvent.stop(e);
              g.eachLayer(l => l.setStyle({ fillOpacity: 0.02, weight: 1.4 }));
              layer.setStyle({ fillOpacity: 0.3, weight: 3 });
              onKhanPick?.(f.properties.id);
            });
          } else {
            layer.options.interactive = false;
          }
        }
      });
      return g;
    }
    if (name === 'river') {
      return L.layerGroup(RIVERS.map(r => L.marker(r.at, {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'river-label', html: `<span>${esc(lang() === 'km' ? r.km : r.name)}</span>`, iconSize: [90, 18] })
      })));
    }
    if (name === 'landmarks') {
      const dot = (txt, lat, lng) => L.marker([lat, lng], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'lm-label', html: `<i>◆</i><span>${esc(txt)}</span>`, iconSize: [0, 0] })
      });
      if (cfg.isCambodia) return L.layerGroup(KH_CITIES.map(([n, km, lat, lng]) => dot(lang() === 'km' ? km : n, lat, lng)));
      return L.layerGroup(landmarks.filter(l => PP_ORIENTATION_IDS.includes(l.id)).map(l => dot(l.name.replace(/\s*[(&].*$/, ''), l.lat, l.lng)));
    }
    return null;
  }
  function syncLayers() {
    for (const name of available) {
      const want = enabled.has(name);
      if (want && !layers[name]) { layers[name] = buildLayer(name); }
      const layer = layers[name];
      if (!layer) continue;
      if (want && !map.hasLayer(layer)) layer.addTo(map);
      if (!want && map.hasLayer(layer)) map.removeLayer(layer);
    }
  }
  const layerBtn = chip('🗺️ ' + t('map.layers'), () => panel.classList.toggle('open'), 'layers');
  const panel = document.createElement('div');
  panel.className = 'map-layer-panel';
  function renderPanel() {
    panel.replaceChildren();
    for (const name of available) {
      const row = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = enabled.has(name);
      const isLocked = name in locked;
      cb.disabled = isLocked;
      cb.addEventListener('change', () => { cb.checked ? enabled.add(name) : enabled.delete(name); syncLayers(); });
      const span = document.createElement('span');
      span.textContent = t('map.layer.' + name) + (isLocked ? ' 🔒' : '');
      row.append(cb, span);
      panel.appendChild(row);
    }
    const xh = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = crosshair; cb.id = 'map-crosshair-toggle';
    cb.addEventListener('change', () => setCrosshair(cb.checked));
    const sp = document.createElement('span'); sp.textContent = '✛ ' + t('map.crosshair');
    xh.append(cb, sp);
    panel.appendChild(xh);
  }
  if (available.length || true) { root.append(layerBtn, panel); }

  // ---------- live place name ("📍 Toul Kork") ----------
  const where = document.createElement('div');
  where.id = 'map-pin-where';
  where.hidden = true;
  root.appendChild(where);
  function showWhere(latlng) {
    // Khan Detective hides it; it would give the answer away. Non-Phnom-Penh modes have no polygon data.
    if (cfg.isDistrict || profile.quickJumps !== 'pp-khans' || !khans || !latlng) { where.hidden = true; return; }
    const k = khanAt(latlng.lat, latlng.lng, khans);
    where.hidden = false;
    where.textContent = '📍 ' + (k ? (lang() === 'km' ? k.nameKm : k.name) : t('map.outside'));
  }

  // ---------- crosshair ----------
  const cross = document.createElement('div');
  cross.className = 'map-crosshair';
  cross.hidden = true;
  cross.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 2v10M20 28v10M2 20h10M28 20h10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  wrapper.appendChild(cross);
  function setCrosshair(on) {
    crosshair = on; cross.hidden = !on; wrapper.classList.toggle('crosshair-on', on);
    const cb = panel.querySelector('#map-crosshair-toggle'); if (cb) cb.checked = on;
  }
  const onMove = () => { if (crosshair) showWhere(map.getCenter()); };
  const onDragEnd = () => { if (crosshair) { onPin(map.getCenter()); } };
  map.on('move', onMove);
  map.on('dragend', onDragEnd);
  // One-thumb default on phones.
  setCrosshair(window.matchMedia('(max-width: 479px)').matches);

  // ---------- loupe (touch drag of the pin) ----------
  let loupe = null, loupeMap = null;
  function ensureLoupe() {
    if (loupe) return;
    loupe = document.createElement('div');
    loupe.className = 'map-loupe'; loupe.hidden = true;
    loupe.innerHTML = '<div class="loupe-map"></div><i></i>';
    wrapper.appendChild(loupe);
    loupeMap = L.map(loupe.firstChild, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false });
    L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(loupeMap);
  }
  function updateLoupe(marker) {
    const ll = marker.getLatLng();
    loupeMap.setView(ll, Math.min(map.getZoom() + 2, profile.maxZoom), { animate: false });
    const pt = map.latLngToContainerPoint(ll);
    loupe.style.left = Math.max(55, Math.min(wrapper.clientWidth - 55, pt.x)) + 'px';
    loupe.style.top = Math.max(60, pt.y - 90) + 'px';
    showWhere(ll);
  }
  function attachMarker(marker) {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    marker.on('drag', () => { if (touch) { ensureLoupe(); loupe.hidden = false; loupeMap.invalidateSize(); updateLoupe(marker); } else showWhere(marker.getLatLng()); });
    marker.on('dragend', () => { if (loupe) loupe.hidden = true; });
  }

  // ---------- lifecycle ----------
  function render() { renderChips(); renderPanel(); layerBtn.textContent = '🗺️ ' + t('map.layers'); }
  ready.then(() => {
    if (destroyed) return;
    render(); syncLayers();
    // Labels are language dependent, so rebuild layers when the language changes.
  });
  render();
  return {
    attachMarker,
    pinMoved: showWhere,
    // New round: back to the profile view unless the mode asks to keep it.
    resetRound() {
      showWhere(null);
      if (!profile.keepViewBetweenRounds && !resetView?.()) applyMapProfile(map, profile);
    },
    relabel() {
      for (const name of Object.keys(layers)) { if (map.hasLayer(layers[name])) map.removeLayer(layers[name]); delete layers[name]; }
      render(); syncLayers();
    },
    destroy() {
      destroyed = true; map.off('resize', refit); map.off('move', onMove); map.off('dragend', onDragEnd);
      root.remove(); cross.remove(); loupe?.remove(); loupeMap?.remove();
      for (const l of Object.values(layers)) if (l && map.hasLayer(l)) map.removeLayer(l);
    },
    get crosshair() { return crosshair; }
  };
}
