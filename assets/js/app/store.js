// Shared data layer for all four CoCo roles.
// One store → customer, driver, collector and fleet manager all read/write
// the same records, persisted to localStorage and synced across tabs.

const KEY = 'coco-proto-v3';

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

// Stops sit on their street (lat/lng), which the driver's navigation routes
// between. gx/gy place them on the procedural SVG grid (map.js) that the
// customer and collector previews still use.
export const DEPOT = { lat: 42.3472, lng: -71.0752, name: 'Back Bay depot' };
const STOPS = [
  { id: 's1', lat: 42.34992, lng: -71.07726, name: 'Priya Raman', address: '12 Dartmouth St', gx: 1, gy: 1, bin: 'Standard Bin', size: '96 gal', type: 'general', barcode: 'CC-204311' },
  { id: 's2', lat: 42.34572, lng: -71.07256, name: 'Oliver Chen', address: '40 Appleton St', gx: 2, gy: 1, bin: 'Standard Bin', size: '64 gal', type: 'general', barcode: 'CC-204322' },
  { id: 's3', lat: 42.3504, lng: -71.0736, name: 'Larissa Abignonto', address: '185 Antonino St', gx: 3, gy: 1, bin: 'Standard Bin', size: '96 gal', type: 'general', barcode: 'CC-204347' },
  { id: 's4', lat: 42.35095, lng: -71.07535, name: 'Marcus Webb', address: '77 Clarendon St', gx: 3, gy: 2, bin: 'Recycling', size: '64 gal', type: 'recycling', barcode: 'CC-204358' },
  { id: 's5', lat: 42.35211, lng: -71.07348, name: 'Hana Okafor', address: '9 Berkeley St', gx: 4, gy: 2, bin: 'Dumpster', size: '4 yd', type: 'general', barcode: 'CC-204366', notes: 'Commercial — café. Rear alley access.' },
  { id: 's6', lat: 42.35287, lng: -71.07383, name: 'Meredith Ferntov', address: '24 Commonwealth Ave, Apt 21', gx: 4, gy: 3, bin: 'Standard Bin', size: '96 gal', type: 'general', barcode: 'CC-204913', notes: 'Bins behind side gate — code 2140.', customer: true, extra: '3 bags (bulk)' },
  { id: 's7', lat: 42.35243, lng: -71.08031, name: 'Daniel Ruiz', address: '310 Marlborough St', gx: 5, gy: 3, bin: 'Standard Bin', size: '96 gal', type: 'general', barcode: 'CC-204920' },
  { id: 's8', lat: 42.3499, lng: -71.07969, name: 'Aiko Tanaka', address: '58 Exeter St', gx: 5, gy: 4, bin: 'Recycling', size: '96 gal', type: 'recycling', barcode: 'CC-204938' },
  { id: 's9', lat: 42.3496, lng: -71.08254, name: 'Grace Sullivan', address: '221 Newbury St', gx: 6, gy: 4, bin: 'Standard Bin', size: '64 gal', type: 'general', barcode: 'CC-204944' },
  { id: 's10', lat: 42.35009, lng: -71.08459, name: 'Tomás Alvarez', address: '15 Gloucester St', gx: 6, gy: 5, bin: 'Roll-off', size: '20 yd', type: 'bulk', barcode: 'CC-204951', notes: 'Renovation debris. Check for drywall.' },
  { id: 's11', lat: 42.35197, lng: -71.08529, name: 'Sofia Rossi', address: '400 Beacon St', gx: 7, gy: 5, bin: 'Standard Bin', size: '96 gal', type: 'general', barcode: 'CC-204967' },
  { id: 's12', lat: 42.34999, lng: -71.08625, name: 'Ethan Brooks', address: '82 Hereford St', gx: 7, gy: 6, bin: 'Recycling', size: '64 gal', type: 'recycling', barcode: 'CC-204973' },
];

// Service territories (real Boston neighborhoods, approximate boundaries).
export const TERRITORIES = [
  { id: 'north-end', name: 'North End', latlngs: [[42.3690, -71.0562], [42.3683, -71.0512], [42.3645, -71.0495], [42.3622, -71.0535], [42.3628, -71.0568], [42.3656, -71.0590]] },
  { id: 'west-end', name: 'West End', latlngs: [[42.3685, -71.0690], [42.3656, -71.0590], [42.3628, -71.0568], [42.3606, -71.0618], [42.3610, -71.0712], [42.3645, -71.0722]] },
  { id: 'beacon-hill', name: 'Beacon Hill', latlngs: [[42.3610, -71.0712], [42.3606, -71.0618], [42.3572, -71.0612], [42.3552, -71.0700], [42.3578, -71.0728]] },
  { id: 'downtown', name: 'Downtown', latlngs: [[42.3606, -71.0618], [42.3628, -71.0568], [42.3622, -71.0535], [42.3575, -71.0505], [42.3538, -71.0520], [42.3528, -71.0590], [42.3572, -71.0612]] },
  { id: 'chinatown', name: 'Chinatown', latlngs: [[42.3552, -71.0700], [42.3572, -71.0612], [42.3528, -71.0590], [42.3478, -71.0588], [42.3470, -71.0652], [42.3495, -71.0690]] },
  { id: 'back-bay', name: 'Back Bay', latlngs: [[42.3578, -71.0728], [42.3552, -71.0700], [42.3495, -71.0690], [42.3452, -71.0802], [42.3473, -71.0888], [42.3522, -71.0902], [42.3556, -71.0850]] },
  { id: 'seaport', name: 'Seaport', latlngs: [[42.3538, -71.0520], [42.3525, -71.0415], [42.3485, -71.0345], [42.3438, -71.0392], [42.3443, -71.0510], [42.3478, -71.0588], [42.3528, -71.0590]] },
  { id: 'south-boston', name: 'South Boston', latlngs: [[42.3443, -71.0510], [42.3438, -71.0392], [42.3385, -71.0262], [42.3305, -71.0305], [42.3298, -71.0535], [42.3372, -71.0598], [42.3478, -71.0588]] },
];

export const INCIDENT_STATUS = ['open', 'acknowledged', 'in-progress', 'resolved'];
function incident(o) {
  return { status: 'open', owner: null, steps: {}, resolution: null, log: [{ at: o.at, who: o.role === 'System' ? 'CoCo' : o.from, text: `Reported: ${o.title || o.type}` }], ...o, title: o.title || o.type };
}

function seed() {
  return {
    version: 3,
    onboarded: { customer: false, driver: false, collector: false },
    notices: [
      { id: 'n0', icon: 'calendar', title: 'Pickup tomorrow, 9 – 11 AM', body: 'Trash + 3 bulk bags. Bins out by 9.', at: 'Yesterday' },
    ],
    customer: {
      name: 'Meredith Ferntov', first: 'Meredith', email: 'meredith@example.com', phone: '(617) 555-0142',
      address: '24 Commonwealth Ave, Apt 21', city: 'Boston, MA 02116', placement: 'Side gate',
      plan: 'Weekly · Trash + Recycling', card: 'Visa •••• 6411', autopay: true, stopId: 's6',
      notify: { dayBefore: true, nearby: true, complete: true, delays: true, tips: false },
      rating: 0,
    },
    route: {
      truck: 'Truck 0091', territory: 'Back Bay', driver: 'Stan Pietro', collector: 'Miguel Sorano',
      preTrip: false, acknowledged: false, arrivedAt: null, onBreak: false,
      phase: null,            // collector progress at the current stop: scanned → checked
      tips: [],               // transfer-station visits { at, tons }
      shift: null,            // end-of-shift report once submitted
      stops: STOPS.map((s, i) => ({ ...s, status: i < 2 ? 'done' : 'pending', completedAt: i < 2 ? `8:${i ? '41' : '22'} AM` : null })),
    },
    pickups: [
      { id: 'p-today', stopId: 's6', date: iso(today), window: '9 – 11 AM', kind: 'Recurring', waste: 'General home trash', extra: '+ 3 bulk bags', price: 0, status: 'scheduled' },
      { id: 'p-next', date: iso(addDays(7)), window: '9 – 11 AM', kind: 'Recurring', waste: 'Trash + Recycling', price: 0, status: 'scheduled' },
    ],
    history: [
      { id: 'h1', date: iso(addDays(-7)), kind: 'Recurring', waste: 'Trash + Recycling', weight: 38, status: 'complete' },
      { id: 'h2', date: iso(addDays(-12)), kind: 'One-time', waste: 'Bulk — armchair', weight: 52, status: 'complete' },
      { id: 'h3', date: iso(addDays(-14)), kind: 'Recurring', waste: 'Trash + Recycling', weight: 41, status: 'complete' },
      { id: 'h4', date: iso(addDays(-21)), kind: 'Recurring', waste: 'Trash', weight: 0, status: 'missed', note: 'Bin not reachable — gate locked. Credited $12.' },
      { id: 'h5', date: iso(addDays(-28)), kind: 'Recurring', waste: 'Trash + Recycling', weight: 36, status: 'complete' },
    ],
    messages: [
      { id: 'm1', from: 'dispatch', text: 'Morning crew — Boylston closed between Dartmouth & Exeter until 11. Route updated.', at: '7:02 AM' },
      { id: 'm2', from: 'collector', text: 'On the step. Ready when you are.', at: '8:05 AM' },
      { id: 'm3', from: 'driver', text: 'Rolling. First stop Dartmouth.', at: '8:06 AM' },
    ],
    unread: { driver: 0, collector: 1, customer: 0 },
    incidents: [
      incident({ id: 'i0', from: 'Truck 0047', role: 'System', type: 'Vehicle issue', title: 'Brake service overdue', severity: 'High', note: 'Past the 12,000 mi brake-service threshold by 340 mi. Truck is still on its Chinatown route.', at: '6:10 AM', lat: 42.3503, lng: -71.0622 }),
      incident({ id: 'i1', from: 'Truck 0034', role: 'Driver', type: 'Road hazard', title: 'Downed tree limb on Devonshire St', severity: 'Medium', note: 'Branch blocking the right lane at Devonshire & Water St. Crew went around it.', at: '8:47 AM', lat: 42.3572, lng: -71.0572 }),
      incident({ id: 'i2', from: 'Truck 0012', role: 'Collector', type: 'Contaminated recycling', title: 'Contaminated recycling · 125 Salem St', severity: 'Low', note: 'Food waste and plastic bags in the recycling cart. Left a tag, did not collect.', at: '9:05 AM', lat: 42.3645, lng: -71.0555, status: 'acknowledged', owner: 'Lucas Pelligrino' }),
    ],
    areas: [
      ...TERRITORIES.map((t) => ({ ...t, kind: 'territory', builtIn: true })),
      // Matches the 7:02 dispatch. Fleet can lift it; the driver's route goes around it until then.
      { id: 'a-boylston', kind: 'closure', name: 'Boylston St · Dartmouth to Exeter', until: '11:00', notes: 'Water main repair. Both lanes closed.', latlngs: [[42.34975, -71.0792], [42.35015, -71.0777], [42.34983, -71.0777], [42.34943, -71.0792]], createdAt: iso(today) },
    ],
    points: 1240,
    fleetFilter: 'all',
  };
}

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 3) { syncStops(s); return s; }
    }
  } catch { /* storage unavailable — fall back to memory */ }
  return seed();
}
// Stop positions are reference data: keep saved progress, take the latest coordinates.
function syncStops(s) {
  s.route?.stops?.forEach((x) => { const o = STOPS.find((y) => y.id === x.id); if (o) { x.lat = o.lat; x.lng = o.lng; } });
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const store = {
  get: () => state,
  // Mutate via a function so every change persists + notifies.
  update(fn, { silent = false } = {}) {
    fn(state);
    persist();
    if (!silent) subs.forEach((f) => f(state, 'local'));
  },
  reset() {
    state = seed();
    persist();
    subs.forEach((f) => f(state, 'reset'));
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

// Cross-tab sync — open the driver in one window and the customer in another.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = JSON.parse(e.newValue); subs.forEach((f) => f(state, 'remote')); } catch { /* ignore */ }
});

// ---------- Derived selectors ----------
export function currentStopIndex(s = state) {
  const i = s.route.stops.findIndex((x) => x.status === 'pending');
  return i === -1 ? s.route.stops.length : i;
}
export function currentStop(s = state) {
  return s.route.stops[currentStopIndex(s)] || null;
}
export function stopById(id, s = state) {
  return s.route.stops.find((x) => x.id === id);
}
// Truck load, rising with each stop since the last transfer-station tip.
export function loadPct(s = state) {
  const since = doneCount(s) - (s.route.tips.at(-1)?.done || 0);
  return Math.min(98, 18 + since * 7);
}
export function doneCount(s = state) {
  return s.route.stops.filter((x) => x.status !== 'pending').length;
}

// Customer-facing status of today's pickup, derived from the crew's progress.
export function customerPickupState(s = state) {
  const idx = s.route.stops.findIndex((x) => x.id === s.customer.stopId);
  const stop = s.route.stops[idx];
  const cur = currentStopIndex(s);
  if (!stop) return { key: 'scheduled' };
  if (stop.status === 'done') return { key: 'collected', stop, at: stop.completedAt };
  if (stop.status === 'issue') return stop.resolution?.rescheduled
    ? { key: 'rescheduled', stop, problem: stop.problem, date: stop.resolution.rescheduled, note: stop.resolution.text }
    : { key: 'issue', stop, problem: stop.problem, note: stop.resolution?.text };
  const away = idx - cur;
  if (!s.route.acknowledged) return { key: 'scheduled', stop, away };
  if (away <= 0) return { key: 'here', stop, away: 0, phase: s.route.arrivedAt === stop.id ? s.route.phase : null };
  if (away === 1) return { key: 'nearby', stop, away };
  return { key: 'enroute', stop, away, eta: etaFor(away) };
}
export function etaFor(stopsAway) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + stopsAway * 7);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
export function nowTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---------- Shared actions ----------
export const actions = {
  sendMessage(from, text) {
    store.update((s) => {
      s.messages.push({ id: 'm' + Date.now(), from, text, at: nowTime() });
      if (from !== 'driver') s.unread.driver++;
      if (from !== 'collector') s.unread.collector++;
    });
  },
  driverArrived() {
    store.update((s) => { s.route.arrivedAt = currentStop(s)?.id || null; s.route.phase = null; });
    const st = currentStop();
    if (st) actions.sendMessage('driver', `At ${st.address}. ${st.bin} — ${st.size}.`);
  },
  completeStop(id, detail = {}) {
    store.update((s) => {
      const st = s.route.stops.find((x) => x.id === id);
      if (!st) return;
      st.status = 'done';
      st.completedAt = nowTime();
      Object.assign(st, detail);
      s.route.arrivedAt = null;
      s.route.phase = null;
      s.points += 10;
      if (st.customer) {
        const p = s.pickups.find((p) => p.stopId === id);
        if (p) p.status = 'complete';
        notify(s, 'check-circle', 'Pickup complete', `Collected at ${st.completedAt}. Photo proof attached.`);
      }
    });
  },
  flagStop(id, problem, note) {
    store.update((s) => {
      const st = s.route.stops.find((x) => x.id === id);
      if (!st) return;
      st.status = 'issue';
      st.problem = problem;
      st.completedAt = nowTime();
      s.route.arrivedAt = null;
      s.route.phase = null;
      s.incidents.unshift(incident({ id: 'i' + Date.now(), from: s.route.truck, role: 'Collector', type: problem, title: `${problem} · ${st.address}`, severity: /hazard/i.test(problem) ? 'High' : /contaminat/i.test(problem) ? 'Low' : 'Medium', note: note || `Flagged at ${st.address}.`, at: nowTime(), stopId: id, lat: st.lat, lng: st.lng }));
      if (st.customer) notify(s, 'alert', `Crew flagged: ${problem}`, 'We couldn’t finish your pickup. Fleet operations is on it and will update you shortly.');
    });
    actions.sendMessage('collector', `Flagged ${stopById(id).address}: ${problem}. Moving on.`);
  },
  report(role, type, severity, note) {
    store.update((s) => {
      const st = currentStop(s) || s.route.stops.at(-1);
      s.incidents.unshift(incident({ id: 'i' + Date.now(), from: s.route.truck, role, type, severity, note, at: nowTime(), stopId: null, lat: st.lat + 0.0006, lng: st.lng - 0.0004 }));
    });
  },
  // Collector progress at the stop, mirrored live in the driver and customer apps.
  collectorPhase(phase) {
    store.update((s) => { if (s.route.arrivedAt) s.route.phase = phase; });
  },
  tip(tons) {
    store.update((s) => { s.route.tips.push({ at: nowTime(), tons, done: doneCount(s) }); });
    actions.sendMessage('driver', `Tipped at Casella transfer station · ${tons} tons.`);
  },
  endShift(report) {
    store.update((s) => { s.route.shift = { ...report, at: nowTime() }; });
    actions.sendMessage('driver', 'Shift report submitted. Post-trip inspection passed.');
  },
  approvePickup(id, truck) {
    store.update((s) => {
      const p = s.pickups.find((x) => x.id === id); if (!p) return;
      p.status = 'approved'; p.truck = truck;
      notify(s, 'check-circle', 'Pickup approved', `${p.waste} on ${p.date} · ${p.window}. ${truck} is assigned.`);
    });
  },
  // ---- Fleet areas (drawn on the fleet map)
  saveArea(area) {
    const isNew = !store.get().areas.some((a) => a.id === area.id);
    store.update((s) => {
      const i = s.areas.findIndex((a) => a.id === area.id);
      if (i === -1) s.areas.push(area); else s.areas[i] = { ...s.areas[i], ...area };
    });
    if (isNew && area.kind === 'closure') actions.dispatch(`Road closure added: ${area.name}. Routes through it are re-optimized — follow in-cab directions.`);
    if (isNew && area.kind === 'hazmat') actions.dispatch(`Hazard zone marked: ${area.name}. Do not enter without hazmat PPE.`);
  },
  deleteArea(id) {
    const a = store.get().areas.find((x) => x.id === id);
    store.update((s) => { s.areas = s.areas.filter((x) => x.id !== id); });
    if (a?.kind === 'closure') actions.dispatch(`Road closure lifted: ${a.name}.`);
  },
  dispatch(text) { actions.sendMessage('dispatch', text); },
  // ---- Incident workflow (fleet compliance & safety)
  incident(id, fn, logText) {
    store.update((s) => {
      const inc = s.incidents.find((x) => x.id === id); if (!inc) return;
      fn(inc, s);
      if (logText) inc.log.push({ at: nowTime(), who: 'Lucas P. · Fleet', text: logText });
    });
  },
  notifyCustomer(icon, title, body) { store.update((s) => notify(s, icon, title, body)); },
  // Demo helper: advance the crew one stop (acknowledges route if needed).
  advance() {
    const s = store.get();
    if (!s.route.acknowledged) { store.update((s) => { s.route.acknowledged = true; s.route.preTrip = true; }); return; }
    const st = currentStop();
    if (st) actions.completeStop(st.id, { compliant: true });
  },
};

function notify(s, icon, title, body) {
  s.notices.unshift({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 5), icon, title, body, at: nowTime() });
  s.unread.customer = (s.unread.customer || 0) + 1;
}
