// Driver navigation map — the same vector basemap as the fleet map (MapLibre +
// the self-hosted Protomaps extract, colored from the --map-* tokens; see
// basemap.js), with street routing from routing.js.
//
// Two views share one persistent map element (re-attached on every render so
// the camera and the drive simulation survive live store updates):
//   'brief' — route briefing: the whole route, north-up.
//   'drive' — heading-up, pitched, following the truck along the current leg.
//             The driver can pan away (Re-center brings the camera back) or
//             switch to an overview of the rest of the route.
//
// Maneuver card and ETA markup live here too, so the screen can render them
// immediately and the map can update them in place as the truck moves.
import { store, currentStopIndex, DEPOT } from './store.js';
import { icon, esc } from './ui.js';
import { loadMapLibre, mapStyle, restyle, readTokens, tokenKey, BOUNDS } from './basemap.js';
import { loadRoads, shortest, maneuvers, pointAt, slice, fmtDist, streetLabel } from './routing.js';
import { AREA_KINDS } from './fleetmap.js';

const SPEED = 11;        // demo drive speed along a leg, m/s — a leg takes 20–60 s
const ETA_SPEED = 5.4;   // m/s for ETAs (~12 mph average through Back Bay)
const STOP_MIN = 4;      // minutes spent at each stop, for the route-remaining estimate
const ZOOM = 16.6, PITCH = 50;
const ROUTE_TOKENS = ['route', 'route-casing', 'route-next', 'route-done'];

const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'no-preference' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const angle = (a) => ((a % 360) + 540) % 360 - 180;
const hazards = (s) => s.areas.filter((a) => a.kind === 'closure' || a.kind === 'hazmat');

let ml = null;
const N = {
  el: null, map: null, ready: false, failed: false, view: 'drive', mode: 'follow',
  g: null, key: null, legs: [], leg: -1, d: 0, heading: 0, rerouted: null,
  truck: null, stops: [], raf: 0, last: 0, lineAt: 0, hud: '', tokens: null, ro: null,
};

// ---------------------------------------------------------------- routes
const pts = (s) => [[DEPOT.lng, DEPOT.lat], ...s.route.stops.map((x) => [x.lng, x.lat])];
const routeKey = (s) => JSON.stringify([s.route.stops.map((x) => x.id), hazards(s).map((a) => [a.id, a.latlngs])]);
const plan = (from, to, avoid) => { const r = shortest(N.g, from, to, avoid); r.steps = maneuvers(r); return r; };

// Where the truck is in the route: parked at the depot, driving leg `idx`
// (depot/previous stop → stop idx), at stop idx, or finished.
function phaseOf(s) {
  const r = s.route, idx = currentStopIndex(s), st = r.stops[idx];
  if (!st) return { phase: 'done', idx: r.stops.length - 1 };
  if (!r.acknowledged) return { phase: 'parked', idx };
  if (r.arrivedAt === st.id) return { phase: 'arrived', idx };
  return { phase: 'driving', idx };
}

// (Re)plan every leg when the stops or the closures change. A reroute while a
// leg is under way starts from where the truck is now.
function sync(s) {
  if (!N.g) return;
  const k = routeKey(s);
  const ph = phaseOf(s);
  if (ph.idx !== N.leg) { N.leg = ph.idx; N.d = 0; }
  if (k === N.key) return;
  const p = pts(s), avoid = hazards(s);
  const midLeg = N.key && ph.phase === 'driving' && N.d > 0 && N.legs[ph.idx];
  const here = midLeg ? truckAt(s).p : null;
  N.legs = p.slice(1).map((to, i) => plan(i === ph.idx && here ? here : p[i], to, avoid));
  if (midLeg) { N.d = 0; N.rerouted = Date.now(); }
  N.key = k;
}

function truckAt(s) {
  const { phase, idx } = phaseOf(s), leg = N.legs[idx];
  if (!leg) { const p = pts(s)[phase === 'parked' ? 0 : idx + 1] || pts(s)[0]; return { p, heading: N.heading }; }
  if (phase === 'parked') return { p: leg.coords[0], heading: pointAt(leg.coords, 0).heading };
  if (phase === 'arrived' || phase === 'done') return { p: leg.coords.at(-1), heading: pointAt(leg.coords, leg.length).heading };
  return pointAt(leg.coords, N.d);
}

// ---------------------------------------------------------------- guidance
/** Everything the maneuver card and ETA need, or null while the route loads. */
export function navInfo(s = store.get()) {
  if (!N.g) return null;
  sync(s);
  const { phase, idx } = phaseOf(s), leg = N.legs[idx], st = s.route.stops[idx];
  if (!leg || !st) return { phase, ready: true };
  const d = phase === 'driving' ? N.d : phase === 'parked' ? 0 : leg.length;
  const left = Math.max(0, leg.length - d);
  const i = leg.steps.findIndex((x) => x.at > d + 2);
  const next = leg.steps[i === -1 ? leg.steps.length - 1 : i], after = leg.steps[i + 1];
  const onStreet = [...leg.steps].reverse().find((x) => x.at <= d + 2)?.street;
  const later = N.legs.slice(idx + 1).reduce((a, l) => a + l.length, 0);
  const now = Date.now();
  const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // Which side of the street the stop is on: road heading vs. the curb connector
  const c = leg.coords, n = c.length;
  const curb = n > 2 && Math.hypot((c[n - 1][0] - c[n - 2][0]) * 82000, (c[n - 1][1] - c[n - 2][1]) * 111320) > 2
    ? (angle(Math.atan2((c[n - 1][0] - c[n - 2][0]) * 82000, (c[n - 1][1] - c[n - 2][1]) * 111320) * 180 / Math.PI - pointAt(c, Math.max(0, leg.length - 20)).heading) > 0 ? 'right' : 'left')
    : null;
  return {
    ready: true, phase, stop: st, idx, curb,
    arriving: phase === 'driving' && left < 20,
    dist: next.at - d, step: next, onStreet,
    then: after && after.at - next.at < 150 ? after : null,
    left, mins: Math.max(1, Math.round(left / ETA_SPEED / 60)), eta: clock(now + (left / ETA_SPEED) * 1000),
    routeLeft: left + later,
    routeMins: Math.round((left + later) / ETA_SPEED / 60 + (s.route.stops.length - idx) * STOP_MIN),
    rerouted: N.rerouted && now - N.rerouted < 20000,
  };
}

/** Planned distance and time for the whole route (briefing screen). */
export function routeTotals(s = store.get()) {
  if (!N.g) return null;
  sync(s);
  const m = N.legs.reduce((a, l) => a + l.length, 0);
  const mins = Math.round(m / ETA_SPEED / 60 + s.route.stops.length * STOP_MIN);
  return { miles: (m / 1609.34).toFixed(1), time: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` };
}

const say = (step, st) => step.verb === 'Arrive' ? `Arrive at ${esc(st.address)}` : `${step.verb}${step.verb === 'Continue' ? ' on' : step.verb === 'Continue onto' ? '' : ' onto'} ${esc(streetLabel(step.street))}`;

/** Inner markup of the maneuver card. */
export function turnInner(info, s = store.get()) {
  const st = info?.stop;
  if (!info || !st) return `<span class="d-turn__ic">${icon('route')}</span><div class="grow" style="min-width:0"><p class="d-turn__big">${info ? 'Route complete' : 'Finding route…'}</p><p class="d-turn__street">${info ? 'Head to the transfer station' : 'Planning around closures'}</p></div>`;
  if (info.phase === 'arrived') return `<span class="d-turn__ic">${icon('pin')}</span><div class="grow" style="min-width:0"><p class="d-turn__big">At stop ${info.idx + 1}</p><p class="d-turn__street">${esc(st.address)}</p></div>`;
  if (info.arriving) return `<span class="d-turn__ic">${icon('pin')}</span><div class="grow" style="min-width:0"><p class="d-turn__big">Arrived</p><p class="d-turn__street">${esc(st.address)}${info.curb ? ` · on your ${info.curb}` : ''}</p></div>`;
  return `<span class="d-turn__ic">${icon(info.step.icon)}</span><div class="grow" style="min-width:0"><p class="d-turn__big t-num">${fmtDist(info.dist)}</p><p class="d-turn__street">${say(info.step, st)}</p></div>`;
}
/** "Then …" strip under the maneuver card (empty when nothing follows closely). */
export function thenInner(info) {
  if (!info?.then || info.arriving || info.phase !== 'driving') return '';
  return `<span>Then</span>${icon(info.then.icon)}<span class="truncate">${info.then.verb === 'Arrive' ? 'arrive at stop' : esc(streetLabel(info.then.street))}</span>`;
}
/** Trip summary line: arrival time · minutes · distance. */
export function etaInner(info, s = store.get()) {
  if (!info?.stop) return `<strong>—</strong>`;
  if (s.route.onBreak) return `<strong>On break</strong><span>Route paused</span>`;
  if (info.phase === 'arrived' || info.arriving) return `<strong>At stop ${info.idx + 1}</strong><span>${s.route.stops.length - info.idx - 1} to go · ~${info.routeMins} min left</span>`;
  return `<strong class="t-num">${info.eta}</strong><span class="t-num">${info.mins} min · ${fmtDist(info.left)}</span>`;
}

function paintHud() {
  const root = N.el?.closest('.screen'); if (!root) return;
  const s = store.get(), info = navInfo(s);
  const html = [turnInner(info, s), thenInner(info), etaInner(info, s), info?.arriving ? 1 : 0, info?.rerouted ? 1 : 0].join('§');
  if (html === N.hud) return;
  N.hud = html;
  const set = (sel, h) => root.querySelectorAll(sel).forEach((e) => { e.innerHTML = h; });
  set('[data-nav-turn]', turnInner(info, s));
  root.querySelectorAll('[data-nav-then]').forEach((e) => { const h = thenInner(info); e.innerHTML = h; e.hidden = !h; });
  set('[data-nav-eta]', etaInner(info, s));
  root.querySelector('.d-turn')?.classList.toggle('is-arriving', !!info?.arriving);
  root.querySelector('[data-arrive]')?.classList.toggle('is-ready', !!info?.arriving);
  root.querySelectorAll('[data-nav-rerouted]').forEach((e) => { e.hidden = !info?.rerouted; });
  const tot = routeTotals(s);
  if (tot) { set('[data-nav-miles]', `${tot.miles} mi`); set('[data-nav-time]', tot.time); }
}

// ---------------------------------------------------------------- map element
function ensureEl() {
  if (N.el) return N.el;
  const el = document.createElement('div');
  el.className = 'nmap';
  el.innerHTML = `<div class="nmap__canvas" data-canvas></div>
    <div class="nmap__ctl" role="group" aria-label="Map view">
      <button class="nmap__btn" data-overview aria-pressed="false" aria-label="Show the rest of the route">${icon('route')}</button>
      <button class="nmap__btn nmap__btn--recenter" data-recenter hidden>${icon('nav')}<span>Re-center</span></button>
    </div>
    <div class="nmap__fallback" data-fallback hidden></div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-recenter')) setMode('follow');
    if (b.hasAttribute('data-overview')) setMode(N.mode === 'overview' ? 'follow' : 'overview');
  });
  N.el = el;
  return el;
}

function setMode(m) {
  N.mode = m;
  N.el.querySelector('[data-recenter]').hidden = m !== 'free';
  const ov = N.el.querySelector('[data-overview]');
  ov.setAttribute('aria-pressed', m === 'overview');
  ov.setAttribute('aria-label', m === 'overview' ? 'Back to navigation' : 'Show the rest of the route');
  ov.innerHTML = icon(m === 'overview' ? 'nav' : 'route');
  camera(true);
}

/**
 * Attach the navigation map to a container.
 * @param {HTMLElement} host
 * @param {{ view: 'brief'|'drive' }} opts
 */
export function mountNav(host, { view = 'drive' } = {}) {
  const el = ensureEl();
  if (N.view !== view) { N.view = view; N.mode = view === 'brief' ? 'overview' : 'follow'; }
  el.dataset.view = view;
  host.append(el);
  if (N.onAttach) { const f = N.onAttach; N.onAttach = null; f(); }
  N.el.querySelector('.nmap__ctl').hidden = view === 'brief';
  if (N.failed) return;
  N.ro ??= new ResizeObserver(() => { if (N.ready) { N.map.resize(); camera(false); } });
  N.ro.disconnect(); N.ro.observe(el);
  Promise.all([loadMapLibre(), N.g || loadRoads().then((g) => { N.g = g; }).catch(() => {})]).then(([lib]) => {
    ml = lib;
    if (!N.map) init();
    paintHud();
    if (!N.ready) return; // 'load' paints
    syncTokens();
    N.map.resize();
    paint();
    if (N.mode !== 'free') camera(false);
    run();
  }).catch(fallback);
}

function init() {
  const [[w, s], [e, n]] = BOUNDS;
  N.map = new ml.Map({
    container: N.el.querySelector('[data-canvas]'), style: mapStyle(N.el),
    center: [DEPOT.lng, DEPOT.lat], zoom: 15,
    maxBounds: [[w - 0.05, s - 0.03], [e + 0.05, n + 0.03]], minZoom: 12, maxZoom: 18.5,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: { compact: true },
  });
  N.tokens = tokenKey(readTokens(N.el));
  N.map.touchZoomRotate.disableRotation();
  N.map.keyboard.disableRotation();
  // Any pan or zoom by the driver leaves follow mode until they re-center
  const manual = (e) => { if (e.originalEvent && N.view === 'drive' && N.mode === 'follow') setMode('free'); };
  N.map.on('dragstart', manual);
  N.map.on('zoomstart', manual);
  // Layer colors come from tokens, which only resolve while the element is in
  // the page. If the driver has already left the screen, finish on next mount.
  const ready = () => {
    addLayers();
    N.ready = true;
    N.tokens = null; syncTokens();
    paint(); camera(false);
    run();
  };
  N.map.on('load', () => { if (N.el.isConnected) ready(); else N.onAttach = ready; });
}

function routeColors() {
  const cs = getComputedStyle(N.el);
  return Object.fromEntries(ROUTE_TOKENS.map((k) => [k, cs.getPropertyValue(`--map-${k}`).trim()]));
}

function addLayers() {
  const m = N.map, c = routeColors();
  const below = m.getStyle().layers.find((l) => l.type === 'symbol')?.id; // zones sit under street names
  ['zones', 'done', 'later', 'leg', 'driven'].forEach((id) => m.addSource(id, { type: 'geojson', data: fc([]) }));
  m.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, below);
  m.addLayer({ id: 'zone-line', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 2] } }, below);
  const cap = { 'line-cap': 'round', 'line-join': 'round' };
  m.addLayer({ id: 'done', type: 'line', source: 'done', layout: cap, paint: { 'line-color': c['route-done'], 'line-width': 4, 'line-opacity': 0.55 } });
  m.addLayer({ id: 'later', type: 'line', source: 'later', layout: cap, paint: { 'line-color': c['route-next'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7] } });
  m.addLayer({ id: 'driven', type: 'line', source: 'driven', layout: cap, paint: { 'line-color': c['route-done'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 10] } });
  m.addLayer({ id: 'leg-casing', type: 'line', source: 'leg', layout: cap, paint: { 'line-color': c['route-casing'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 7, 17, 17] } });
  m.addLayer({ id: 'leg', type: 'line', source: 'leg', layout: cap, paint: { 'line-color': c.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 11] } });
}

function syncTokens() {
  if (!N.el.isConnected) return;
  const tk = tokenKey(readTokens(N.el)) + routeColors().route;
  if (tk === N.tokens) return;
  N.tokens = tk;
  restyle(N.map, N.el);
  const c = routeColors();
  N.map.setPaintProperty('done', 'line-color', c['route-done']);
  N.map.setPaintProperty('driven', 'line-color', c['route-done']);
  N.map.setPaintProperty('later', 'line-color', c['route-next']);
  N.map.setPaintProperty('leg-casing', 'line-color', c['route-casing']);
  N.map.setPaintProperty('leg', 'line-color', c.route);
}

function fallback() {
  N.failed = true;
  const f = N.el.querySelector('[data-fallback]');
  f.hidden = false;
  f.innerHTML = `<div>${icon('map', 'ico--xl')}<p class="t-title">Map unavailable</p><p class="t-sm t-subtle">This device couldn't start the map renderer (WebGL). Directions still work.</p></div>`;
}

// ---------------------------------------------------------------- painting
const fc = (features) => ({ type: 'FeatureCollection', features });
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });

function paint() {
  if (!N.ready) return;
  const s = store.get();
  sync(s);
  N.map.getSource('zones').setData(fc(hazards(s).map((a) => ({ type: 'Feature', properties: { color: AREA_KINDS[a.kind].color }, geometry: { type: 'Polygon', coordinates: [[...a.latlngs.map(([la, ln]) => [ln, la]), [a.latlngs[0][1], a.latlngs[0][0]]]] } }))));
  const { phase, idx } = phaseOf(s);
  const past = phase === 'done' ? N.legs : N.legs.slice(0, idx);
  N.map.getSource('done').setData(fc(past.map((l) => line(l.coords))));
  N.map.getSource('later').setData(fc((phase === 'done' ? [] : N.legs.slice(idx + 1)).map((l) => line(l.coords))));
  paintLeg(s);

  N.stops.forEach((m) => m.remove());
  N.stops = s.route.stops.map((x, i) => {
    const cur = i === idx && phase !== 'done';
    const cls = x.status === 'done' ? 'is-done' : x.status === 'issue' ? 'is-issue' : cur ? 'is-current' : '';
    const el = document.createElement('span');
    el.className = `nmap__stop ${cls}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = x.status === 'done' ? icon('check') : x.status === 'issue' ? icon('alert') : String(i + 1);
    return new ml.Marker({ element: el, anchor: cur ? 'bottom' : 'center' }).setLngLat([x.lng, x.lat]).addTo(N.map);
  });
  if (!N.truck) {
    const el = document.createElement('span');
    el.className = 'nmap__puck';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Your truck');
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 20 12 16 5 20Z"/></svg>';
    N.truck = new ml.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(truckAt(s).p).addTo(N.map);
  }
  moveTruck(s);
}

function paintLeg(s) {
  const { phase, idx } = phaseOf(s), leg = N.legs[idx];
  const on = leg && phase !== 'done';
  const d = phase === 'driving' ? N.d : phase === 'parked' ? 0 : leg?.length || 0;
  N.map.getSource('leg').setData(fc(on && phase !== 'arrived' ? [line(slice(leg.coords, d))] : []));
  N.map.getSource('driven').setData(fc(on && d > 0 ? [line(slice(leg.coords, 0, d))] : []));
}

function moveTruck(s = store.get()) {
  if (!N.truck) return;
  const t = truckAt(s);
  N.truck.setLngLat(t.p).setRotation(N.heading);
  return t;
}

// ---------------------------------------------------------------- camera
// How much of the map each overlay (maneuver card, stop sheet, side panel)
// covers, so the truck and the route stay in the visible part.
function insets() {
  const box = N.el.getBoundingClientRect(), pad = { top: 0, bottom: 0, left: 0, right: 0 };
  const scope = N.el.closest('.screen'); if (!scope || !box.width) return pad;
  const rects = [...scope.querySelectorAll('[data-nav-inset]')].map((o) => o.getBoundingClientRect()).map((r) => ({ r,
    w: Math.min(r.right, box.right) - Math.max(r.left, box.left), h: Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) }))
    .filter(({ w, h }) => w > 0 && h > 0 && !(w > box.width * 0.6 && h > box.height * 0.6));
  // Side panels first (landscape), then top and bottom bands outside them
  const side = ({ w, h }) => h > box.height * 0.6 && w < box.width * 0.6;
  rects.filter(side).forEach(({ r }) => {
    if (r.left - box.left < box.right - r.right) pad.left = Math.max(pad.left, r.right - box.left);
    else pad.right = Math.max(pad.right, box.right - r.left);
  });
  rects.filter((x) => !side(x)).forEach(({ r }) => {
    if (r.right <= box.left + pad.left + 1 || r.left >= box.right - pad.right - 1) return;
    if (r.top - box.top < box.bottom - r.bottom) pad.top = Math.max(pad.top, r.bottom - box.top);
    else pad.bottom = Math.max(pad.bottom, box.bottom - r.top);
  });
  // Never let the overlays leave less than 140px of map
  const fit = (a, b, room) => { const over = a + b + 140 - room; return over > 0 ? [Math.max(0, a - over / 2), Math.max(0, b - over / 2)] : [a, b]; };
  [pad.top, pad.bottom] = fit(pad.top, pad.bottom, box.height);
  [pad.left, pad.right] = fit(pad.left, pad.right, box.width);
  Object.entries(pad).forEach(([k, v]) => N.el.style.setProperty(`--nav-${k}`, `${Math.round(v)}px`));
  return pad;
}

function camera(animate) {
  if (!N.ready) return;
  const s = store.get(), pad = insets();
  const dur = animate && !reduced() ? 700 : 0;
  if (N.view === 'brief' || N.mode === 'overview') {
    const { phase, idx } = phaseOf(s);
    const legs = N.view === 'brief' || phase === 'parked' ? N.legs : N.legs.slice(idx);
    const coords = legs.length ? legs.flatMap((l) => l.coords) : pts(s);
    if (N.view === 'drive') coords.push(truckAt(s).p);
    const b = coords.reduce((bb, p) => bb.extend(p), new ml.LngLatBounds(coords[0], coords[0]));
    const m = 36;
    N.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 }); // fitBounds adds the follow camera's padding otherwise
    N.map.fitBounds(b, { padding: { top: pad.top + m, bottom: pad.bottom + m, left: pad.left + m, right: pad.right + m }, bearing: 0, pitch: 0, maxZoom: 16.5, duration: dur });
  } else if (N.mode === 'follow') {
    const t = truckAt(s);
    N.heading = t.heading;
    N.truck?.setRotation(N.heading);
    N.map[dur ? 'easeTo' : 'jumpTo']({ center: t.p, zoom: ZOOM, pitch: PITCH, bearing: N.heading, padding: lookAhead(pad), ...(dur ? { duration: dur } : {}) });
  }
}
// Put the truck in the lower part of the visible map so more road ahead shows
function lookAhead(pad) {
  const h = N.el.clientHeight - pad.top - pad.bottom;
  return { ...pad, top: pad.top + Math.max(0, h * 0.34) };
}

// ---------------------------------------------------------------- drive loop
function run() {
  if (N.raf) return;
  N.last = 0;
  N.raf = requestAnimationFrame(tick);
}
function tick(t) {
  if (!N.el?.isConnected) { N.raf = 0; return; }
  N.raf = requestAnimationFrame(tick);
  const dt = N.last ? Math.min(0.25, (t - N.last) / 1000) : 0;
  N.last = t;
  if (document.hidden || !N.ready || N.view !== 'drive') return;
  const s = store.get();
  sync(s);
  const { phase, idx } = phaseOf(s), leg = N.legs[idx];
  if (phase !== 'driving' || !leg || s.route.onBreak) { paintHud(); return; }
  if (N.d < leg.length) {
    N.d = Math.min(leg.length, N.d + SPEED * dt);
    const pos = pointAt(leg.coords, N.d);
    // Ease the heading round corners instead of snapping
    N.heading += angle(pos.heading - N.heading) * Math.min(1, dt * 2.5);
    N.truck?.setLngLat(pos.p).setRotation(N.heading);
    if (N.mode === 'follow') N.map.jumpTo({ center: pos.p, bearing: N.heading, padding: lookAhead(insets()) });
    if (t - N.lineAt > 120) { N.lineAt = t; paintLeg(s); }
  }
  paintHud();
}
