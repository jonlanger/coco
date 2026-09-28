// Fleet operations map — a real, pannable vector map of Boston (MapLibre GL +
// a Protomaps tile extract served from this repo; see basemap.js). The basemap
// is colored from the --map-* design tokens, so it follows the light/dark theme
// and the high-contrast setting. Territories, live trucks, incidents and any
// areas the manager designates are drawn on top. Areas are drawn by tapping
// corners on the map and saved to the shared store, so closures and hazard
// zones reach the crews.
//
// The platform re-renders screens on every store change, so the map lives in
// one persistent element that is re-attached to each new render instead of
// being rebuilt (keeps pan/zoom and in-progress drawing intact).
import { store, actions, DEPOT } from './store.js';
import { icon, esc, sheet, toast } from './ui.js';
import { loadMapLibre, mapStyle, restyle, readTokens, tokenKey, snapshot, BOUNDS } from './basemap.js';
import { loadRoads, shortest } from './routing.js';

export const AREA_KINDS = {
  territory: { label: 'Service territory', icon: 'map', color: '#006FE6', hint: 'Assign a truck and collection days. Stops inside are routed to that crew.' },
  closure: { label: 'Road closure', icon: 'x', color: '#D93A0B', hint: 'Routes avoid this area. Crews get a dispatch alert right away.' },
  hazmat: { label: 'Hazard zone', icon: 'alert-octagon', color: '#B45309', hint: 'Crews see a warning and need hazmat PPE to enter.' },
  staging: { label: 'Staging / drop-off', icon: 'building', color: '#6D28D9', hint: 'Spare trucks, bin drop-offs or bulk-item staging.' },
};
const STATUS_COLOR = { ok: '#2E9E1E', warn: '#D4A300', danger: '#D93A0B', info: '#006FE6' };
const DRAFT = '#006FE6';

let ml = null;

// ---------------------------------------------------------------- geometry
// The store keeps [lat, lng]; MapLibre and GeoJSON want [lng, lat].
const ll = ([la, ln]) => [ln, la];
const ring = (pts) => [...pts.map(ll), ll(pts[0])];
const polygon = (pts, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring(pts)] } });
const fc = (features) => ({ type: 'FeatureCollection', features });
const centroid = (pts) => { let a = 0, x = 0, y = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; const f = p[0] * q[1] - q[0] * p[1]; a += f; x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f; }); return a ? [x / (3 * a), y / (3 * a)] : pts[0]; };
export function inside([la, ln], pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ai, bi] = pts[i], [aj, bj] = pts[j];
    if ((bi > ln) !== (bj > ln) && la < ((aj - ai) * (ln - bi)) / (bj - bi) + ai) c = !c;
  }
  return c;
}
function areaKm2(pts) {
  const R = 6371, lat0 = (pts[0][0] * Math.PI) / 180;
  const xy = pts.map(([la, ln]) => [((ln * Math.PI) / 180) * R * Math.cos(lat0), ((la * Math.PI) / 180) * R]);
  let a = 0; xy.forEach((p, i) => { const q = xy[(i + 1) % xy.length]; a += p[0] * q[1] - q[0] * p[1]; });
  return Math.abs(a / 2);
}
const boundsOf = (pts) => pts.reduce((b, p) => b.extend(ll(p)), new ml.LngLatBounds());

// ---------------------------------------------------------------- state
const M = {
  el: null, map: null, ready: false, tokens: null, layers: { territories: true, trucks: true, incidents: true, areas: true },
  markers: { territories: [], trucks: [], incidents: [], areas: [] }, vertices: [],
  draw: null, edit: null, data: null, popup: null, tip: null, failed: false,
};
// Map layers that belong to each layer chip (markers are tracked in M.markers)
const GROUP_LAYERS = { territories: ['terr-fill', 'terr-line'], areas: ['area-fill', 'area-line', 'area-line-dash'], trucks: ['route'], incidents: [] };

function ensureEl() {
  if (M.el) return M.el;
  const el = document.createElement('div');
  el.className = 'fmap';
  el.innerHTML = `
    <div class="fmap__canvas" data-canvas></div>
    <div class="fmap__bar fmap__bar--top">
      <div class="fmap__chips" role="group" aria-label="Map layers">
        ${[['territories', 'map', 'Territories'], ['trucks', 'truck', 'Trucks'], ['incidents', 'alert', 'Incidents'], ['areas', 'layers', 'Areas']].map(([k, ic, l]) => `<button class="fmap__chip" aria-pressed="true" data-layer="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}
      </div>
      <button class="btn btn--sm fmap__draw" data-draw>${icon('plus')}New area</button>
    </div>
    <div class="fmap__drawbar" data-drawbar hidden>
      <p class="fmap__drawhint" data-hint>Tap the map to place corners</p>
      <div class="row" style="--gap:6px">
        <button class="btn btn--sm btn--neutral" data-undo>${icon('chevron-left')}Undo</button>
        <button class="btn btn--sm btn--neutral" data-cancel>Cancel</button>
        <button class="btn btn--sm" data-finish disabled>${icon('check')}Finish</button>
      </div>
    </div>
    <div class="fmap__zoom" role="group" aria-label="Zoom">
      <button data-zoom="1" aria-label="Zoom in">${icon('plus')}</button>
      <button data-zoom="-1" aria-label="Zoom out">${icon('minus')}</button>
    </div>
    <div class="fmap__legend" aria-hidden="true">
      <span><i style="background:${STATUS_COLOR.ok}"></i>On schedule</span><span><i style="background:${STATUS_COLOR.warn}"></i>At risk</span><span><i style="background:${STATUS_COLOR.danger}"></i>Delayed</span>
      <span><i class="sq" style="background:${AREA_KINDS.closure.color}"></i>Closure</span><span><i class="sq" style="background:${AREA_KINDS.hazmat.color}"></i>Hazard</span>
    </div>
    <div class="fmap__fallback" data-fallback hidden></div>`;
  el.addEventListener('click', onChrome);
  M.el = el;
  return el;
}

function onChrome(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.layer) {
    const k = b.dataset.layer; M.layers[k] = !M.layers[k]; b.setAttribute('aria-pressed', M.layers[k]);
    setGroup(k);
  } else if (b.dataset.zoom) M.map?.easeTo({ zoom: M.map.getZoom() + Number(b.dataset.zoom), duration: 250 });
  else if (b.hasAttribute('data-draw')) startDraw();
  else if (b.hasAttribute('data-undo')) { M.draw?.pts.pop(); paintDraft(); }
  else if (b.hasAttribute('data-cancel')) { M.edit ? endEdit(false) : stopDraw(); }
  else if (b.hasAttribute('data-finish')) { M.edit ? endEdit(true) : finishDraw(); }
}

function setGroup(k) {
  if (!M.ready) return;
  const on = M.layers[k];
  GROUP_LAYERS[k].forEach((id) => M.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
  M.markers[k].forEach((m) => (on ? m.addTo(M.map) : m.remove()));
}

/**
 * Attach the map to a container and sync it with the latest data.
 * @param {HTMLElement} host
 * @param {{ trucks: Array, zoneStatus: Object, onTruck: Function }} data
 */
export function mountFleetMap(host, data) {
  const el = ensureEl();
  M.data = data;
  host.append(el);
  if (M.failed) return;
  loadMapLibre().then((lib) => {
    ml = lib;
    if (!M.map) init();
    if (!M.ready) return; // 'load' will sync
    syncTokens();
    requestAnimationFrame(() => M.map.resize());
    paint();
  }).catch(fallback);
}

// Theme or contrast changed since the last render → recolor the basemap.
function syncTokens() {
  if (!M.el.isConnected) return; // tokens only resolve in the page; the next mount syncs
  const tk = tokenKey(readTokens(M.el));
  if (tk !== M.tokens) { M.tokens = tk; restyle(M.map, M.el); }
}

function init() {
  const canvas = M.el.querySelector('[data-canvas]');
  const built = store.get().areas.filter((a) => a.builtIn).flatMap((a) => a.latlngs);
  const [[w, s], [e, n]] = BOUNDS;
  M.map = new ml.Map({
    container: canvas, style: mapStyle(M.el),
    bounds: boundsOf(built), fitBoundsOptions: { padding: 28 },
    maxBounds: [[w - 0.05, s - 0.03], [e + 0.05, n + 0.03]], minZoom: 11, maxZoom: 18,
    dragRotate: false, pitchWithRotate: false, touchPitch: false, scrollZoom: false,
    attributionControl: { compact: false },
  });
  M.tokens = tokenKey(readTokens(M.el));
  M.map.touchZoomRotate.disableRotation();
  M.map.keyboard.disableRotation();
  // Scroll-zoom only after the map has been engaged, so the page still scrolls
  M.map.on('click', () => M.map.scrollZoom.enable());
  canvas.addEventListener('mouseleave', () => M.map.scrollZoom.disable());
  M.popup = new ml.Popup({ closeButton: false, maxWidth: '300px', offset: 20, className: 'fmap__popup' });
  M.tip = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'fmap__tip' });

  M.map.on('load', () => {
    addOverlays();
    M.ready = true;
    syncTokens();
    Object.keys(M.layers).forEach(setGroup);
    paint();
  });
  M.map.on('click', (e) => { if (M.draw) { M.draw.pts.push([e.lngLat.lat, e.lngLat.lng]); paintDraft(); } });
  M.map.on('click', ['area-fill', 'terr-fill'], (e) => { if (M.draw || M.edit) return; openArea(e.features[0].properties.id); });
  for (const id of ['area-fill', 'terr-fill']) {
    M.map.on('mouseenter', id, () => { if (!M.draw) M.map.getCanvas().style.cursor = 'pointer'; });
    M.map.on('mouseleave', id, () => { M.map.getCanvas().style.cursor = ''; M.tip.remove(); });
  }
  // Hover label for closures, hazard zones and staging (territories are labelled permanently)
  M.map.on('mousemove', 'area-fill', (e) => {
    const p = e.features[0].properties;
    M.tip.setLngLat(e.lngLat).setHTML(`<b>${esc(p.name)}</b><br>${AREA_KINDS[p.kind].label}`).addTo(M.map);
  });
}

function addOverlays() {
  const m = M.map, below = m.getStyle().layers.find((l) => l.type === 'symbol')?.id; // keep street names readable over tinted areas
  ['areas', 'route', 'draft'].forEach((id) => m.addSource(id, { type: 'geojson', data: fc([]) }));
  const isT = ['==', ['get', 't'], true], notT = ['!=', ['get', 't'], true];
  m.addLayer({ id: 'terr-fill', type: 'fill', source: 'areas', filter: isT, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } }, below);
  m.addLayer({ id: 'terr-line', type: 'line', source: 'areas', filter: isT, paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 } }, below);
  m.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', filter: notT, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, below);
  m.addLayer({ id: 'area-line', type: 'line', source: 'areas', filter: ['all', notT, ['!=', ['get', 'kind'], 'closure']], paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 } }, below);
  m.addLayer({ id: 'area-line-dash', type: 'line', source: 'areas', filter: ['==', ['get', 'kind'], 'closure'], paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9, 'line-dasharray': [2.4, 2.4] } }, below);
  m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': DRAFT, 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [0.1, 2.2] } });
  m.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', paint: { 'fill-color': DRAFT, 'fill-opacity': ['case', ['get', 'dash'], 0.12, 0.15] } });
  m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['get', 'dash'], paint: { 'line-color': DRAFT, 'line-width': 2.5, 'line-dasharray': [1.6, 2.4] } });
  m.addLayer({ id: 'edit-line', type: 'line', source: 'draft', filter: ['!', ['get', 'dash']], paint: { 'line-color': DRAFT, 'line-width': 2.5 } });
}

function fallback() {
  M.failed = true;
  const f = M.el.querySelector('[data-fallback]');
  f.hidden = false;
  f.innerHTML = `<div>${icon('map', 'ico--xl')}<p class="t-title">Map unavailable</p><p class="t-sm t-subtle">This browser couldn't start the map renderer (WebGL).</p></div>`;
}

// ---------------------------------------------------------------- painting
// Trucks, incidents and vertices are HTML markers so they keep the design
// system's styling and are reachable by keyboard.
function marker(html, lnglat, { label, inert, pop, cls = '' } = {}) {
  const b = document.createElement(inert ? 'span' : 'button');
  b.className = `fmap__mk ${cls}`;
  if (label) b.setAttribute('aria-label', label);
  if (inert) b.setAttribute('aria-hidden', 'true');
  else b.type = 'button';
  b.innerHTML = html;
  if (pop) b.addEventListener('click', (e) => { e.stopPropagation(); if (M.draw || M.edit) return; M.popup.setLngLat(lnglat).setHTML(pop).addTo(M.map); });
  return new ml.Marker({ element: b }).setLngLat(lnglat);
}

function paint() {
  if (!M.ready) return;
  const s = store.get(), d = M.data;
  Object.values(M.markers).flat().forEach((m) => m.remove());
  M.markers = { territories: [], trucks: [], incidents: [], areas: [] };

  const areas = [];
  s.areas.forEach((a) => {
    if (M.edit?.id === a.id) return; // being edited — drawn by the editor
    const isT = a.kind === 'territory';
    const st = isT ? d.zoneStatus[a.id] || 'info' : null;
    areas.push(polygon(a.latlngs, { id: a.id, t: isT, kind: a.kind, name: a.name, color: isT ? STATUS_COLOR[st] : AREA_KINDS[a.kind].color }));
    if (isT) M.markers.territories.push(marker(`<span class="fmap__label is-${st}">${esc(a.name)}</span>`, ll(centroid(a.latlngs)), { inert: true, cls: 'fmap__mk--label' }));
  });
  M.map.getSource('areas').setData(fc(areas));

  d.trucks.forEach((t) => {
    M.markers.trucks.push(marker(`<span class="fmap__truck is-${t.status}${t.live ? ' is-live' : ''}">${icon('truck')}</span>`, [t.lng, t.lat], {
      label: `Truck ${t.id}`,
      pop: `<div class="fmap__pop"><p class="t-title">Truck ${t.id}${t.live ? ' · Live' : ''}</p><p class="t-sm t-subtle">${esc(t.zoneName)} · ${esc(t.loc)}</p><p class="t-sm">${t.made}/${t.made + t.left} stops · ${esc(t.driver.split(' ')[0])} & ${esc(t.collector.split(' ')[0])}</p><a class="btn btn--sm btn--block" href="#/truck/${t.id}">Open truck</a></div>`,
    }));
  });
  const live = d.trucks.find((t) => t.live);
  M.map.getSource('route').setData(fc(live ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: plannedRoute(s) } }] : []));

  s.incidents.filter((i) => i.status !== 'resolved' && i.lat).forEach((i) => {
    M.markers.incidents.push(marker(`<span class="fmap__inc is-${i.severity.toLowerCase()}">${icon('alert')}</span>`, [i.lng, i.lat], {
      label: `${i.title} (${i.severity})`,
      pop: `<div class="fmap__pop"><p class="t-title">${esc(i.title)}</p><p class="t-sm t-subtle">${esc(i.from)} · ${i.at} · ${i.severity}</p><a class="btn btn--sm btn--block" href="#/incident/${i.id}">Resolve</a></div>`,
    }));
  });

  Object.entries(M.markers).forEach(([k, ms]) => M.layers[k] && ms.forEach((m) => m.addTo(M.map)));
}

// The live truck's route along real streets (same routing as the driver's
// navigation, so closures drawn here show up as detours). Straight lines
// between stops until the road graph has loaded.
let roads = null, roadsLoading = null, planned = { key: null, coords: null };
function plannedRoute(s) {
  const pts = [[DEPOT.lng, DEPOT.lat], ...s.route.stops.map((x) => [x.lng, x.lat])];
  if (!roads) {
    roadsLoading ??= loadRoads().then((g) => { roads = g; paint(); }).catch(() => {});
    return pts;
  }
  const avoid = s.areas.filter((a) => a.kind === 'closure' || a.kind === 'hazmat');
  const key = JSON.stringify([pts, avoid.map((a) => a.latlngs)]);
  if (planned.key !== key) planned = { key, coords: pts.slice(1).flatMap((p, i) => shortest(roads, pts[i], p, avoid).coords) };
  return planned.coords;
}

// ---------------------------------------------------------------- drawing
function setBars(drawing) {
  M.el.querySelector('[data-drawbar]').hidden = !drawing;
  M.el.querySelector('.fmap__bar--top').hidden = drawing;
  M.el.classList.toggle('is-drawing', drawing);
  M.popup.remove(); M.tip.remove();
}
function clearDraft() {
  M.vertices.forEach((v) => v.remove()); M.vertices = [];
  M.map.getSource('draft').setData(fc([]));
}
function startDraw() {
  if (!M.ready) return;
  M.draw = { pts: [] };
  M.map.doubleClickZoom.disable();
  setBars(true);
  paintDraft();
}
function stopDraw() {
  M.draw = null; clearDraft();
  M.map.doubleClickZoom.enable();
  setBars(false);
}
function paintDraft() {
  const d = M.draw; if (!d) return;
  clearDraft();
  const n = d.pts.length;
  if (n > 1) M.map.getSource('draft').setData(fc([polygon(d.pts, { dash: true })]));
  d.pts.forEach((p, i) => {
    const first = i === 0 && n > 2;
    const v = marker(`<span class="fmap__vtx${first ? ' is-first' : ''}"></span>`, ll(p), first ? { label: 'Close shape' } : { inert: true });
    if (first) v.getElement().addEventListener('click', (e) => { e.stopPropagation(); finishDraw(); });
    M.vertices.push(v.addTo(M.map));
  });
  M.el.querySelector('[data-hint]').textContent = n === 0 ? 'Tap the map to place the first corner' : n < 3 ? `${n} corner${n > 1 ? 's' : ''} · add at least ${3 - n} more` : `${n} corners · tap the first corner or Finish`;
  M.el.querySelector('[data-finish]').disabled = n < 3;
  M.el.querySelector('[data-undo]').disabled = n === 0;
}
function finishDraw() {
  const pts = M.draw.pts.slice();
  stopDraw();
  areaForm({ id: 'a' + Date.now(), latlngs: pts, kind: 'closure', name: '' }, true);
}

// ---------------------------------------------------------------- editing shapes
function startEdit(id) {
  const a = store.get().areas.find((x) => x.id === id); if (!a || !M.ready) return;
  M.edit = { id, pts: a.latlngs.map((p) => p.slice()) };
  setBars(true);
  M.el.querySelector('[data-undo]').hidden = true;
  M.el.querySelector('[data-hint]').textContent = `Drag the corners to reshape ${a.name}`;
  M.el.querySelector('[data-finish]').disabled = false;
  M.el.querySelector('[data-finish]').innerHTML = `${icon('check')}Save shape`;
  paint(); paintEdit();
  M.map.fitBounds(boundsOf(a.latlngs), { padding: 40 });
}
function paintEdit() {
  clearDraft();
  const draft = M.map.getSource('draft');
  draft.setData(fc([polygon(M.edit.pts, { dash: false })]));
  M.edit.pts.forEach((p, i) => {
    const v = new ml.Marker({ element: Object.assign(document.createElement('span'), { className: 'fmap__mk', innerHTML: '<span class="fmap__vtx is-edit"></span>' }), draggable: true }).setLngLat(ll(p));
    v.on('drag', () => { const q = v.getLngLat(); M.edit.pts[i] = [q.lat, q.lng]; draft.setData(fc([polygon(M.edit.pts, { dash: false })])); });
    M.vertices.push(v.addTo(M.map));
  });
}
function endEdit(save) {
  const { id, pts } = M.edit;
  M.edit = null; clearDraft();
  M.el.querySelector('[data-undo]').hidden = false;
  M.el.querySelector('[data-finish]').innerHTML = `${icon('check')}Finish`;
  setBars(false);
  if (save) { actions.saveArea({ id, latlngs: pts }); toast('Boundary updated — routes re-planned', 'map'); }
  else paint();
}

// ---------------------------------------------------------------- sheets
function areaForm(a, isNew) {
  const trucks = M.data.trucks;
  sheet(`<div class="row row--between" style="margin-bottom:4px"><h2 class="t-h3">${isNew ? 'Designate new area' : 'Edit area'}</h2><button class="icon-btn icon-btn--ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <p class="t-sm t-muted" style="margin-bottom:16px">${areaKm2(a.latlngs).toFixed(2)} km² · ${a.latlngs.length} corners</p>
    <form class="stack" style="--gap:16px" data-form>
      <div class="field"><label class="label" for="ar-name">Name</label><input class="input" id="ar-name" required placeholder="e.g. Boylston St water main work" value="${esc(a.name)}"></div>
      <fieldset class="field" style="border:0;padding:0"><legend class="label" style="margin-bottom:8px">Type</legend>
        <div class="choice-grid">${Object.entries(AREA_KINDS).map(([k, v]) => `<label class="choice"><input type="radio" name="kind" value="${k}" ${a.kind === k ? 'checked' : ''} ${a.builtIn && k !== 'territory' ? 'disabled' : ''}><span class="choice__icon" style="color:${v.color}">${icon(v.icon)}</span><span class="t-sm" style="font-weight:700">${v.label}</span></label>`).join('')}</div>
        <p class="hint t-xs t-subtle" data-kind-hint style="margin-top:8px">${AREA_KINDS[a.kind].hint}</p>
      </fieldset>
      <div class="field" data-for="territory"><label class="label" for="ar-truck">Assigned truck</label><select class="select" id="ar-truck"><option value="">Unassigned</option>${trucks.map((t) => `<option ${a.truck === t.id ? 'selected' : ''} value="${t.id}">Truck ${t.id} · ${esc(t.driver)}</option>`).join('')}</select></div>
      <div class="field" data-for="territory"><span class="label">Collection days</span><div class="segmented" role="group">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<button type="button" aria-pressed="${(a.days || []).includes(d)}" aria-selected="${(a.days || []).includes(d)}" data-day="${d}">${d}</button>`).join('')}</div></div>
      <div class="field" data-for="closure"><label class="label" for="ar-until">Closed until</label><input class="input" id="ar-until" type="time" value="${a.until || '11:00'}"></div>
      <div class="field"><label class="label" for="ar-notes">Notes for crews</label><textarea class="textarea" id="ar-notes" placeholder="What should drivers and collectors know?">${esc(a.notes || '')}</textarea></div>
      <button class="btn btn--lg btn--block" type="submit">${isNew ? 'Save area' : 'Save changes'}</button>
    </form>`, (el, close) => {
    const form = el.querySelector('[data-form]');
    const sync = () => {
      const k = form.querySelector('input[name=kind]:checked').value;
      el.querySelectorAll('[data-for]').forEach((f) => { f.hidden = f.dataset.for !== k; });
      el.querySelector('[data-kind-hint]').textContent = AREA_KINDS[k].hint;
    };
    sync();
    form.addEventListener('change', sync);
    el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.setAttribute('aria-selected', on); }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kind = form.querySelector('input[name=kind]:checked').value;
      actions.saveArea({
        ...a, kind, name: el.querySelector('#ar-name').value.trim() || AREA_KINDS[kind].label,
        truck: kind === 'territory' ? el.querySelector('#ar-truck').value || null : null,
        days: [...el.querySelectorAll('[data-day][aria-pressed=true]')].map((b) => b.dataset.day),
        until: kind === 'closure' ? el.querySelector('#ar-until').value : null,
        notes: el.querySelector('#ar-notes').value.trim(), createdAt: a.createdAt || new Date().toISOString(),
      });
      close();
      toast(kind === 'closure' ? 'Closure saved — crews alerted, routes adjusted' : kind === 'hazmat' ? 'Hazard zone saved — crews alerted' : 'Area saved', 'map');
    });
  });
}

function openArea(id) {
  const s = store.get(); const a = s.areas.find((x) => x.id === id); if (!a) return;
  const kind = AREA_KINDS[a.kind];
  const ts = M.data.trucks.filter((t) => inside([t.lat, t.lng], a.latlngs));
  const inc = s.incidents.filter((i) => i.status !== 'resolved' && i.lat && inside([i.lat, i.lng], a.latlngs));
  const stops = s.route.stops.filter((x) => inside([x.lat, x.lng], a.latlngs));
  const st = a.kind === 'territory' ? M.data.zoneStatus[a.id] : null;
  sheet(`<div class="row row--between" style="margin-bottom:6px"><span class="chip chip--outline">${icon(kind.icon)}${kind.label}</span><button class="icon-btn icon-btn--ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <h2 class="t-h2">${esc(a.name)}</h2>
    <p class="t-sm t-muted" style="margin:4px 0 16px">${areaKm2(a.latlngs).toFixed(2)} km²${a.days?.length ? ' · ' + a.days.join(', ') : ''}${a.until ? ' · until ' + a.until : ''}${st ? ' · ' + { ok: 'On schedule', warn: 'At risk', danger: 'Delayed', info: 'No trucks' }[st] : ''}</p>
    ${a.notes ? `<div class="alert" style="margin-bottom:14px">${icon('info')}<div>${esc(a.notes)}</div></div>` : ''}
    <div class="fm-area-stats">
      <div><strong class="t-num">${ts.length}</strong><span>Trucks inside</span></div>
      <div><strong class="t-num">${stops.length}</strong><span>Route stops</span></div>
      <div><strong class="t-num">${inc.length}</strong><span>Open incidents</span></div>
    </div>
    ${ts.length ? `<div class="list" style="margin:14px 0">${ts.slice(0, 4).map((t) => `<a class="list-item" href="#/truck/${t.id}" data-close><span class="list-item__icon">${icon('truck')}</span><span class="list-item__body"><span class="list-item__title" style="display:block">Truck ${t.id}</span><span class="list-item__meta">${esc(t.driver)} · ${t.made}/${t.made + t.left} stops</span></span>${icon('chevron-right', 'list-item__chev')}</a>`).join('')}</div>` : ''}
    <div class="fm-area-actions">
      ${a.kind === 'territory' ? `<a class="btn btn--secondary" href="#/fleet?zone=${a.id}" data-close>${icon('list')}Trucks</a>` : ''}
      <button class="btn btn--neutral" data-edit-shape data-close>${icon('target')}Edit boundary</button>
      <button class="btn btn--neutral" data-edit-info>${icon('sliders')}Details</button>
      ${a.builtIn ? '' : `<button class="btn btn--danger" data-del>${icon('trash')}${a.kind === 'closure' ? 'Lift closure' : 'Delete'}</button>`}
    </div>`, (el, close) => {
    el.querySelector('[data-edit-shape]').addEventListener('click', () => startEdit(id));
    el.querySelector('[data-edit-info]').addEventListener('click', () => { close(); areaForm(a, false); });
    el.querySelector('[data-del]')?.addEventListener('click', () => { actions.deleteArea(id); close(); toast(a.kind === 'closure' ? 'Closure lifted — crews notified' : 'Area deleted', 'map'); });
  });
}

export function focusMap(latlng) { if (M.ready) M.map.flyTo({ center: ll(latlng), zoom: 15, duration: 800 }); }

// Static map thumbnail for truck and incident detail. The basemap image is
// rendered by basemap.js (one offscreen map, cached), in the theme of the
// element it lands in; the pin is plain HTML on top. The last image for a spot
// is inlined right away so re-renders don't flash.
const lastShot = new Map();
export function staticMap(lat, lng, { z = 15, pin = 'alert', tone = 'danger' } = {}) {
  watchThumbs();
  const at = `${lng},${lat},${z}`, prev = lastShot.get(at);
  return `<div class="smap" data-smap="${at}"${prev ? ` data-tk="${esc(prev.tk)}"` : ''} role="img" aria-label="Map of location">${prev ? `<img class="smap__img" src="${prev.url}" alt="">` : ''}<span class="smap__pin smap__pin--${tone}">${icon(pin)}</span><span class="smap__attr">© OpenStreetMap</span></div>`;
}

let observer = null;
function watchThumbs() {
  if (observer) return;
  const hydrate = () => document.querySelectorAll('.smap[data-smap]').forEach((el) => {
    const tk = tokenKey(readTokens(el));
    if (el.dataset.tk === tk && el.querySelector('.smap__img')) return;
    el.dataset.tk = tk;
    const at = el.dataset.smap, [lng, lat, z] = at.split(',').map(Number);
    snapshot(el, lng, lat, z).then((url) => {
      lastShot.set(at, { tk, url });
      if (!el.isConnected || el.dataset.tk !== tk) return;
      let img = el.querySelector('.smap__img');
      if (!img) { img = Object.assign(document.createElement('img'), { className: 'smap__img', alt: '' }); el.prepend(img); }
      img.src = url;
    }).catch(() => el.classList.add('is-failed'));
  });
  observer = new MutationObserver(() => requestAnimationFrame(hydrate));
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme', 'data-contrast'] });
  requestAnimationFrame(hydrate);
}
