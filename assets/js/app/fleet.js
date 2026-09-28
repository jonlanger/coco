// Fleet manager — a command surface, not a task list. Risk surfaces first
// (what needs a decision now), then the live map, then performance.
// Jobs: oversee crews & customer status · enforce safety/SOP and resolve
// incidents · keep trucks serviced · report performance and cost.
import { store, actions, doneCount, currentStopIndex, TERRITORIES } from './store.js';
import { icon, esc, img, chip, statusChip, avatar, toast, sheet, on, fmtDate } from './ui.js';
import { mountFleetMap, staticMap, AREA_KINDS } from './fleetmap.js';
import { toggleTheme } from './platform.js';

const R = '#/';

const BASE_TRUCKS = [
  ['0091', 'back-bay', '24 Commonwealth Ave', 'Stan Pietro', 'Miguel Sorano', 0, 0, 'ontime', true],
  ['0012', 'north-end', '125 Salem St', 'Alan Costances', 'Abigail Smith', 12, 34, 'delayed', true],
  ['0023', 'west-end', '10 Whittier Pl', 'Lenny Shonton', 'Phil Speckles', 34, 45, 'delayed', true],
  ['0034', 'downtown', '161 Devonshire St', 'Amy Johnson', 'Rafael Xi', 23, 54, 'delayed', true],
  ['0047', 'chinatown', '682 Washington St', 'Christoph Bentson', 'Manny Ventuzo', 67, 77, 'risk', false],
  ['0056', 'beacon-hill', '55 Mt Vernon St', 'Quin Stronz', 'Ursala Wells', 11, 64, 'risk', true],
  ['0068', 'seaport', '30 Melcher St', 'Francis Cream', 'Gustav Mienato', 45, 64, 'ontime', true],
  ['0072', 'south-boston', '117 W Broadway', 'Hannah Llenes', 'Lorenzo Pascal', 51, 38, 'ontime', true],
  ['0083', 'back-bay', '400 Beacon St', 'Keisha Moore', 'Dev Patel', 40, 29, 'ontime', true],
  ['0094', 'seaport', '1 Seaport Blvd', 'Ivan Petrov', 'Lucia Gomez', 38, 41, 'risk', true],
  ['0105', 'south-boston', '600 E Broadway', 'Nora Kelly', 'Sam Okoro', 58, 22, 'ontime', true],
  ['0116', 'downtown', '1 Federal St', 'Wes Carter', 'Ming Zhao', 29, 50, 'ontime', false],
];
const zoneName = (id) => TERRITORIES.find((z) => z.id === id)?.name || id;
const center = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

function trucks(s = store.get()) {
  return BASE_TRUCKS.map(([id, zone, loc, driver, collector, made, left, status, compliant], i) => {
    const area = s.areas.find((a) => a.id === zone) || TERRITORIES.find((z) => z.id === zone);
    const [cla, cln] = center(area.latlngs);
    const t = { id, zone, zoneName: zoneName(zone), loc, driver, collector, made, left, status, compliant, lat: cla + (((i * 37) % 9) - 4) * 0.0006, lng: cln + (((i * 53) % 9) - 4) * 0.0008 };
    if (id === '0091') {
      const d = doneCount(s);
      const cur = s.route.stops[currentStopIndex(s)];
      const issues = s.route.stops.filter((x) => x.status === 'issue' && !x.resolution).length;
      const open = s.incidents.filter((x) => x.from === 'Truck 0091' && x.status !== 'resolved').length;
      const last = cur || s.route.stops.at(-1);
      Object.assign(t, { made: d, left: s.route.stops.length - d, loc: cur?.address || 'Casella transfer station', status: open || issues ? 'risk' : 'ontime', compliant: !issues, live: true, lat: last.lat, lng: last.lng });
    }
    if (id === '0047' && s.incidents.find((x) => x.id === 'i0')?.steps.pull) Object.assign(t, { status: 'risk', loc: 'Back Bay shop · out of service' });
    return t;
  });
}
function zoneStatus(ts) {
  const rank = { delayed: 3, risk: 2, ontime: 1 };
  const out = {};
  ts.forEach((t) => { if (!out[t.zone] || rank[t.status] > rank[out[t.zone]]) out[t.zone] = t.status; });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v === 'delayed' ? 'danger' : v === 'risk' ? 'warn' : 'ok']));
}
const theme = () => document.getElementById('app')?.dataset.theme || 'light';
const openIncidents = (s) => s.incidents.filter((i) => i.status !== 'resolved');

const NAV = [['overview', 'grid', 'Overview'], ['fleet', 'truck', 'Fleet'], ['pickups', 'users', 'Pickups'], ['maintenance', 'wrench', 'Maintenance'], ['compliance', 'shield-check', 'Safety']];
const tabs = (s) => NAV.map(([k, ic, l]) => ({
  key: k, href: R + k, icon: ic, label: l,
  badge: k === 'compliance' ? openIncidents(s).length : k === 'pickups' ? s.pickups.filter((p) => p.status === 'requested').length : 0,
}));

function shell(title, content, s, actions = '') {
  const n = openIncidents(s).length;
  return `<div class="fm">
    <div class="fm-main">
      <header class="fm-top">
        <button class="icon-btn icon-btn--brand hide-desktop" data-menu aria-label="Menu">${icon('menu')}</button>
        <div class="grow" style="min-width:0"><p class="t-xs t-subtle hide-mobile">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1 class="t-h2 truncate">${title}</h1></div>
        <div class="input-group fm-search hide-mobile">${icon('search')}<input class="input" placeholder="Search trucks, crews, addresses" data-search aria-label="Search"></div>
        ${actions}
        <button class="icon-btn icon-btn--ghost" data-theme-toggle aria-label="Toggle dark mode">${icon(theme() === 'dark' ? 'sun' : 'moon')}</button>
        <a class="icon-btn icon-btn--ghost" href="${R}compliance" aria-label="${n} open incidents" style="position:relative">${icon('bell')}${n ? `<span class="badge" style="position:absolute;top:4px;right:2px">${n}</span>` : ''}</a>
      </header>
      <div class="fm-content">${content}</div>
    </div>
  </div>`;
}
function mountShell(root, { go }) {
  on(root, '[data-theme-toggle]', 'click', toggleTheme);
  on(root, '[data-search]', 'keydown', (e, i) => { if (e.key === 'Enter') go(R + 'fleet?q=' + encodeURIComponent(i.value)); });
  on(root, 'tr[data-href]', 'click', (e, tr) => go(tr.dataset.href));
  on(root, 'tr[data-href]', 'keydown', (e, tr) => { if (e.key === 'Enter') go(tr.dataset.href); });
  on(root, '[data-t]', 'click', (e, b) => toast(b.dataset.t, 'info'));
}

const pct = (t) => (t.made / (t.made + t.left || 1)) * 100;
const progKind = (t) => (t.status === 'delayed' ? 'danger' : t.status === 'risk' ? 'warn' : 'ok');
const truckRow = (t) => `<tr data-href="${R}truck/${t.id}" tabindex="0">
  <td><strong>Truck ${t.id}</strong>${t.live ? ' <span class="dot dot--pulse" title="Live"></span>' : ''}</td><td>${t.zoneName}</td><td class="t-muted">${esc(t.loc)}</td>
  <td>${statusChip(t.status)}</td><td>${esc(t.driver)}</td><td>${esc(t.collector)}</td>
  <td class="num">${t.made}</td><td class="num">${t.left}</td><td>${statusChip(t.compliant ? 'compliant' : 'noncompliant')}</td></tr>`;
const truckCard = (t) => `<a class="card card--interactive fm-tcard" href="${R}truck/${t.id}">
  <div class="row row--between"><strong>Truck ${t.id}${t.live ? ' <span class="dot dot--pulse"></span>' : ''}</strong>${statusChip(t.status)}</div>
  <p class="t-sm t-muted">${t.zoneName} · ${esc(t.loc)}</p>
  <div class="row row--between t-sm"><span>${esc(t.driver.split(' ')[0])} & ${esc(t.collector.split(' ')[0])}</span><span class="t-num"><strong>${t.made}</strong> <span class="t-subtle">/ ${t.made + t.left}</span></span></div>
  <div class="progress progress--${progKind(t)}"><span style="width:${pct(t)}%"></span></div>
  ${t.compliant ? '' : `<p class="row t-xs" style="--gap:6px;color:var(--danger-soft-ink)">${icon('alert')}Compliance issue</p>`}
</a>`;
function fleetList(ts) {
  return `<div class="hide-desktop fm-cards">${ts.map(truckCard).join('')}</div>
    <div class="table-wrap hide-mobile"><table class="table"><thead><tr><th>Truck</th><th>Territory</th><th>Current location</th><th>Schedule</th><th>Driver</th><th>Collector</th><th class="num">Made</th><th class="num">Left</th><th>Compliance</th></tr></thead><tbody>${ts.map(truckRow).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Incident helpers
const SLA_MIN = { High: 15, Medium: 60, Low: 240 };
function minutesSince(at) {
  const m = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(at || ''); if (!m) return 0;
  const d = new Date(); let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, +m[2]);
  return Math.max(0, Math.round((d - t) / 60000));
}
function sla(i) {
  if (i.status !== 'open') return null;
  const left = SLA_MIN[i.severity] - minutesSince(i.at);
  return left >= 0 ? { kind: 'warn', text: `Respond in ${left < 60 ? left + ' min' : Math.round(left / 60) + ' h'}` } : { kind: 'danger', text: 'Response overdue' };
}
const SEV = { High: 'danger', Medium: 'warn', Low: 'info' };
const SEV_ORDER = ['High', 'Medium', 'Low'];
const STATUS_LABEL = { open: 'New', acknowledged: 'Acknowledged', 'in-progress': 'In progress', resolved: 'Resolved' };
const INC_PHASES = ['open', 'acknowledged', 'in-progress', 'resolved'];
const statusPill = (st) => chip({ open: 'danger-soft', acknowledged: 'info-soft', 'in-progress': 'warn-soft', resolved: 'ok-soft' }[st], STATUS_LABEL[st], { open: 'bell', acknowledged: 'check', 'in-progress': 'clock', resolved: 'check-circle' }[st]);
const sevChip = (sev) => chip(SEV[sev], sev, 'alert');
const OWNERS = [['Lucas Pelligrino', 'Fleet manager (you)'], ['Dana Whitfield', 'Safety officer'], ['Back Bay shop', 'Maintenance'], ['Rosa Alvarez', 'Customer care'], ['Dispatch', 'Route operations']];
const incIcon = (i) => (i.type === 'Vehicle issue' ? 'wrench' : /hazard/i.test(i.type) ? 'alert-octagon' : /recycl/i.test(i.type) ? 'recycle' : /access|bin/i.test(i.type) ? 'bin' : 'alert');

const incidentRow = (i) => {
  const d = sla(i);
  return `<a class="fm-incrow fm-incrow--${SEV[i.severity]}" href="${R}incident/${i.id}">
    <span class="fm-incrow__ic">${icon(incIcon(i))}</span>
    <span class="grow" style="min-width:0"><span class="fm-incrow__t">${esc(i.title)}</span><span class="t-xs t-subtle">${esc(i.from)} · ${esc(i.role)} · ${i.at}${i.owner ? ' · ' + esc(i.owner) : ''}</span></span>
    <span class="fm-incrow__meta">${sevChip(i.severity)}${d ? chip(d.kind, d.text, 'clock') : statusPill(i.status)}</span>
    ${icon('chevron-right', 'list-item__chev')}
  </a>`;
};

// ---------------------------------------------------------------------------
const overview = {
  tab: 'overview',
  render({ state }) {
    const ts = trucks(state);
    const inc = openIncidents(state);
    const reqs = state.pickups.filter((p) => p.status === 'requested');
    const closures = state.areas.filter((a) => a.kind === 'closure');
    const onTime = Math.round((ts.filter((t) => t.status === 'ontime').length / ts.length) * 100);
    const kpis = [
      ['check-circle', `${(11204 + doneCount(state)).toLocaleString()}`, 'Pickups done', '57% of 19,521 today'],
      ['clock', `${onTime}%`, 'Trucks on schedule', `${ts.filter((t) => t.status === 'delayed').length} delayed · ${ts.filter((t) => t.status === 'risk').length} at risk`],
      ['alert', `${inc.length}`, 'Open incidents', `${inc.filter((i) => i.severity === 'High').length} high severity`],
      ['fuel', '$4,812', 'Fuel spend today', '3% under budget'],
    ];
    const attention = [
      ...reqs.map((p) => ({ kind: 'info', icon: 'plus', title: `New pickup request · ${esc(state.customer.name)}`, meta: `${esc(p.waste)} · ${fmtDate(p.date)} · needs a truck`, href: R + 'pickups' })),
      ...inc.slice().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).slice(0, 4).map((i) => ({ kind: SEV[i.severity], icon: incIcon(i), title: esc(i.title), meta: `${esc(i.from)} · ${i.at} · ${sla(i)?.text || STATUS_LABEL[i.status]}`, href: R + 'incident/' + i.id })),
      ...(state.booked?.['0047'] && state.booked?.['0116'] ? [] : [{ kind: 'warn', icon: 'wrench', title: '2 trucks overdue for service', meta: 'Truck 0047 brakes · Truck 0116 hydraulics', href: R + 'maintenance' }]),
      ...(state.training?.['Miguel Sorano'] ? [] : [{ kind: 'warn', icon: 'shield', title: '3 crew certifications expire soon', meta: 'Sharps handling & hazmat · within 14 days', href: R + 'compliance?tab=certs' }]),
    ];
    const terr = state.areas.filter((a) => a.kind === 'territory').map((a) => {
      const zt = ts.filter((t) => t.zone === a.id);
      const made = zt.reduce((n, t) => n + t.made, 0), all = zt.reduce((n, t) => n + t.made + t.left, 0);
      return { a, n: zt.length, p: all ? Math.round((made / all) * 100) : 0, st: zoneStatus(zt)[a.id] || 'ok' };
    });
    return shell('Operations', `
      <div class="fm-kpis">
        ${kpis.map(([ic, v, l, m]) => `<div class="card fm-kpi"><div class="row row--between"><span class="t-sm t-muted" style="font-weight:600">${l}</span><span class="fm-kpi__ic">${icon(ic)}</span></div><span class="metric__value t-num">${v}</span><span class="t-xs t-subtle">${m}</span></div>`).join('')}
      </div>
      <div class="fm-ops">
        <section class="card fm-mapcard">
          <div class="fm-mapcard__head"><div style="min-width:0"><h2 class="t-h3">Live operations map</h2><p class="t-sm t-subtle">Tap a territory to manage it, or draw a new area for closures, hazards and routes.</p></div>
            ${closures.length ? chip('danger-soft', `${closures.length} closure${closures.length > 1 ? 's' : ''} active`, 'x') : ''}</div>
          <div class="fm-mapcard__map" data-fleet-map></div>
        </section>
        <section class="card stack fm-attn" style="--gap:12px">
          <div class="row row--between"><h2 class="t-h3">Needs a decision</h2><span class="chip chip--danger-soft">${attention.length}</span></div>
          <div class="stack" style="--gap:8px">${attention.map((a) => `<a class="fm-alert fm-alert--${a.kind}" href="${a.href}"><span class="fm-alert__icon">${icon(a.icon)}</span><span class="grow" style="min-width:0"><span class="t-sm" style="font-weight:700;display:block">${a.title}</span><span class="t-xs t-subtle">${a.meta}</span></span>${icon('chevron-right', 'list-item__chev')}</a>`).join('')}</div>
        </section>
      </div>
      <div class="fm-grid">
        <section class="stack" style="--gap:12px">
          <div class="row row--between"><h2 class="t-h3">Trucks needing attention</h2><a class="t-sm" href="${R}fleet" style="font-weight:700">All ${ts.length} trucks</a></div>
          <div class="fm-cards">${ts.filter((t) => t.status !== 'ontime' || t.live).map(truckCard).join('')}</div>
        </section>
        <section class="card stack" style="--gap:6px">
          <div class="row row--between" style="margin-bottom:6px"><h2 class="t-h3">Territory progress</h2><span class="t-xs t-subtle">Completed vs planned</span></div>
          ${terr.map(({ a, n, p, st }) => `<a class="fm-terr" href="${R}fleet?zone=${a.id}"><span class="dot dot--${st}"></span><span class="grow" style="min-width:0"><span class="t-sm" style="font-weight:700;display:block">${esc(a.name)}</span><span class="t-xs t-subtle">${n} truck${n === 1 ? '' : 's'}${a.truck ? ' · Truck ' + a.truck + ' assigned' : ''}</span></span><span class="fm-terr__bar"><span class="progress progress--${st}"><span style="width:${p}%"></span></span></span><strong class="t-sm t-num fm-terr__pct">${p}%</strong></a>`).join('')}
        </section>
      </div>`, state, `<button class="btn btn--sm btn--outline hide-mobile" data-export>${icon('download')}Daily report</button>`);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    const ts = trucks(ctx.state);
    mountFleetMap(root.querySelector('[data-fleet-map]'), { trucks: ts, zoneStatus: zoneStatus(ts), theme: theme() });
    on(root, '[data-export]', 'click', () => toast('Daily operations report exported (PDF)', 'download'));
  },
};

const fleet = {
  tab: 'fleet',
  render({ state, query }) {
    const f = query.get('f') || 'all';
    const q = (query.get('q') || '').toLowerCase();
    const zone = query.get('zone');
    let ts = trucks(state);
    if (zone) ts = ts.filter((t) => t.zone === zone);
    if (f !== 'all') ts = ts.filter((t) => t.status === f);
    if (q) ts = ts.filter((t) => [t.id, t.driver, t.collector, t.loc, t.zoneName].join(' ').toLowerCase().includes(q));
    const all = trucks(state);
    const count = (k) => all.filter((t) => t.status === k).length;
    return shell(zone ? zoneName(zone) : 'Fleet', `
      <div class="fm-filters">
        <div class="segmented" role="tablist">${[['all', 'All', all.length], ['delayed', 'Delayed', count('delayed')], ['risk', 'At risk', count('risk')], ['ontime', 'On schedule', count('ontime')]].map(([k, l, n]) => `<button role="tab" aria-selected="${f === k}" data-f="${k}">${l} <span class="t-subtle">${n}</span></button>`).join('')}</div>
        ${zone || q ? `<a class="btn btn--sm btn--neutral" href="${R}fleet">${icon('x')}Clear ${zone ? 'territory' : 'search'}</a>` : ''}
      </div>
      <div class="input-group hide-desktop">${icon('search')}<input class="input" placeholder="Search trucks, crews…" value="${esc(q)}" data-search aria-label="Search"></div>
      ${ts.length ? fleetList(ts) : `<div class="card" style="text-align:center;padding:40px"><p class="t-muted">No trucks match.</p></div>`}`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    on(root, '[data-f]', 'click', (e, b) => ctx.go(R + 'fleet?f=' + b.dataset.f + (ctx.query.get('zone') ? '&zone=' + ctx.query.get('zone') : ''), { replace: true }));
  },
};

const truck = {
  tab: 'fleet',
  render({ state, params }) {
    const t = trucks(state).find((x) => x.id === params[0]) || trucks(state)[0];
    const live = t.live;
    const r = state.route;
    const events = live
      ? [
        ...(r.shift ? [{ t: r.shift.at, k: 'done', m: `Shift report submitted · ${r.shift.stops} stops · ${r.shift.tons} t tipped` }] : []),
        ...r.tips.map((x) => ({ t: x.at, k: 'done', m: `Tipped at Casella transfer station · ${x.tons} t` })).reverse(),
        ...r.stops.filter((s) => s.status !== 'pending').map((s) => ({ t: s.completedAt, k: s.status === 'issue' ? 'issue' : 'done', m: `${s.status === 'issue' ? 'Flagged' : 'Collected'} · ${s.address}${s.problem ? ' — ' + s.problem : ''}` })).reverse(),
        ...(r.acknowledged ? [{ t: '8:00 AM', k: 'done', m: 'Route acknowledged by driver' }] : []),
        ...(r.preTrip ? [{ t: '7:41 AM', k: 'done', m: 'Pre-trip inspection passed (6/6)' }] : []),
      ]
      : [{ t: '10:12 AM', k: 'done', m: 'Stop 34 collected' }, { t: '9:58 AM', k: t.status === 'delayed' ? 'issue' : 'done', m: t.status === 'delayed' ? 'Delay reported · traffic' : 'Stop 33 collected' }, { t: '7:35 AM', k: 'done', m: 'Pre-trip inspection passed' }];
    const inc = state.incidents.filter((i) => i.from === 'Truck ' + t.id && i.status !== 'resolved');
    const load = live ? Math.max(8, Math.min(100, Math.round(22 + (t.made / 12) * 70 - r.tips.length * 70))) : 71;
    return shell(`Truck ${t.id}`, `
      <a class="btn btn--sm btn--ghost" href="${R}fleet" style="align-self:flex-start;margin-left:-8px">${icon('chevron-left')}All trucks</a>
      ${inc.map((i) => `<a class="alert alert--${SEV[i.severity] === 'info' ? 'warn' : SEV[i.severity]} fm-linkalert" href="${R}incident/${i.id}">${icon('alert')}<div><strong>${esc(i.title)}</strong>${STATUS_LABEL[i.status]} · open the incident to resolve it</div></a>`).join('')}
      <div class="fm-grid">
        <section class="card stack" style="--gap:14px">
          <div class="row row--between row--wrap" style="--gap:8px"><div style="min-width:0"><p class="t-eyebrow">${t.zoneName}</p><p class="t-h3">${esc(t.loc)}</p></div><div class="row row--wrap" style="--gap:6px">${statusChip(t.status)}${statusChip(t.compliant ? 'compliant' : 'noncompliant')}</div></div>
          <div class="fm-truckmap">${staticMap(t.lat, t.lng, { pin: 'truck', tone: progKind(t) === 'ok' ? 'brand' : progKind(t) })}</div>
          <div class="row row--between t-sm"><span>${t.made} of ${t.made + t.left} pickups</span><span class="t-subtle">${Math.round(pct(t))}%</span></div>
          <div class="progress progress--${progKind(t)}"><span style="width:${pct(t)}%"></span></div>
        </section>
        <div class="stack" style="--gap:16px">
          <section class="card stack" style="--gap:12px"><h2 class="t-title">Crew</h2>
            ${[[t.driver, 'Driver', 'persona-driver.jpg', live && r.onBreak ? 'On break' : '2:14 drive time'], [t.collector, 'Collector', 'persona-collector.jpg', t.compliant ? 'All certs valid' : 'Cert renewal due']].map(([n, role, im, sub]) => `<div class="row" style="--gap:12px">${avatar(live ? img(im) : '', n)}<div class="grow" style="min-width:0"><p style="font-weight:700">${esc(n)}</p><p class="t-xs t-subtle">${role} · ${sub}</p></div><button class="icon-btn icon-btn--sm" data-t="Calling ${esc(n)}…" aria-label="Call ${esc(n)}">${icon('phone')}</button></div>`).join('')}
            ${live ? `<button class="btn btn--sm btn--neutral" data-msg>${icon('message')}Message crew</button>` : ''}
          </section>
          <section class="card stack" style="--gap:10px"><h2 class="t-title">Vehicle</h2>
            ${[['Fuel', 62, 'ok', '62%'], ['Load', load, load > 85 ? 'warn' : '', load + '%'], ['Next service', t.id === '0047' ? 100 : 38, t.id === '0047' ? 'danger' : 'ok', t.id === '0047' ? 'Overdue' : '420 mi']].map(([l, v, k, lab]) => `<div class="stack" style="--gap:6px"><div class="row row--between t-sm"><span>${l}</span><span class="t-num">${lab}</span></div><div class="progress ${k ? 'progress--' + k : ''}"><span style="width:${v}%"></span></div></div>`).join('')}
          </section>
        </div>
      </div>
      <section class="card stack" style="--gap:14px"><h2 class="t-title">Activity</h2>
        <ol class="timeline">${events.slice(0, 10).map((e) => `<li class="timeline__item timeline__item--${e.k}"><span class="timeline__node">${icon(e.k === 'issue' ? 'alert' : 'check')}</span><div class="timeline__body"><p class="timeline__title">${esc(e.m)}</p><p class="timeline__meta">${e.t}</p></div></li>`).join('')}</ol>
      </section>`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    on(root, '[data-msg]', 'click', () => crewMessage());
  },
};

function crewMessage(prefill = '') {
  sheet(`<h2 class="t-h3">Message Truck 0091 crew</h2><p class="t-sm t-muted" style="margin:4px 0 14px">Arrives in the driver and collector crew channel as Dispatch.</p>
    <div class="stack" style="--gap:12px"><textarea class="textarea" data-txt placeholder="Message">${esc(prefill)}</textarea>
    <div class="row row--wrap" style="--gap:6px">${['Take your 30 min break after this stop', 'Tip after stop 9 — you’re near capacity', 'Call dispatch when you can'].map((q) => `<button class="chip chip--outline" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <button class="btn btn--lg btn--block" data-send>${icon('send')}Send to crew</button></div>`, (el, close) => {
    on(el, '[data-q]', 'click', (e, b) => { el.querySelector('[data-txt]').value = b.dataset.q; });
    el.querySelector('[data-send]').addEventListener('click', () => { const v = el.querySelector('[data-txt]').value.trim(); if (!v) return; actions.dispatch(v); close(); toast('Sent — driver and collector notified', 'send'); });
  });
}

// ---------------------------------------------------------------------------
const pickups = {
  tab: 'pickups',
  render({ state }) {
    const reqs = state.pickups.filter((p) => ['requested', 'approved'].includes(p.status) && p.id !== 'p-next' && p.waste !== 'Rescheduled pickup');
    const route = state.route.stops.map((s) => ({ name: s.name, addr: s.address, type: s.bin + ' · ' + s.size, status: s.status === 'done' ? 'complete' : s.status === 'issue' ? (s.resolution?.rescheduled ? 'scheduled' : 'issue') : 'scheduled', at: s.status === 'issue' && s.resolution?.rescheduled ? 'Rescheduled' : s.completedAt }));
    return shell('Scheduled customers', `
      <div class="fm-kpis fm-kpis--3">
        <div class="card metric"><span class="metric__label">Completed today</span><span class="metric__value">${(11204 + doneCount(state)).toLocaleString()}</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}57% of schedule</span></div>
        <div class="card metric"><span class="metric__label">Issues flagged</span><span class="metric__value">${38 + state.route.stops.filter((s) => s.status === 'issue').length}</span><span class="metric__delta">0.3% of pickups</span></div>
        <div class="card metric"><span class="metric__label">Requests to approve</span><span class="metric__value">${reqs.filter((r) => r.status === 'requested').length}</span><span class="metric__delta">214 approved today</span></div>
      </div>
      ${reqs.length ? `<section class="stack" style="--gap:10px"><h2 class="t-h3">Pickup requests</h2>
        ${reqs.map((p) => `<div class="card fm-req">
          ${p.photo ? `<img class="fm-req__img" src="${img('house-bags.jpg')}" alt="Customer photo of items">` : `<span class="list-item__icon">${icon('box')}</span>`}
          <div class="grow stack" style="--gap:4px;min-width:0"><p class="t-title">${esc(state.customer.name)} · ${esc(p.waste)}</p><p class="t-sm t-subtle">${esc(state.customer.address)} · ${fmtDate(p.date)} · ${esc(p.window)}${p.price ? ' · $' + p.price : ''}</p>${p.notes ? `<p class="t-sm t-muted">“${esc(p.notes)}”</p>` : ''}</div>
          ${p.status === 'requested' ? `<div class="fm-req__act"><select class="select" data-truck="${p.id}" aria-label="Assign truck"><option value="Truck 0091">Truck 0091 · Back Bay</option><option value="Truck 0083">Truck 0083 · Back Bay</option></select><button class="btn" data-approve="${p.id}">${icon('check')}Approve</button></div>` : statusChip('approved', '', `Approved · ${p.truck || 'Truck 0091'}`)}
        </div>`).join('')}</section>` : ''}
      <section class="stack" style="--gap:10px"><h2 class="t-h3">Truck 0091 · Back Bay route</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th class="hide-mobile">Address</th><th class="hide-mobile">Service</th><th>Status</th></tr></thead><tbody>
        ${route.map((r) => `<tr><td><strong>${esc(r.name)}</strong><p class="t-xs t-subtle hide-desktop">${esc(r.addr)}</p></td><td class="hide-mobile t-muted">${esc(r.addr)}</td><td class="hide-mobile">${esc(r.type)}</td><td>${statusChip(r.status)}${r.at ? `<p class="t-xs t-subtle" style="margin-top:4px">${r.at}</p>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    on(root, '[data-approve]', 'click', (e, b) => { const t = root.querySelector(`[data-truck="${b.dataset.approve}"]`).value; actions.approvePickup(b.dataset.approve, t); toast(`Approved — customer notified, added to ${t}`); });
  },
};

// ---------------------------------------------------------------------------
const MAINT = [
  ['0047', 'Brake service', 'Overdue by 340 mi', 100, 'danger', 'Autocar ACX', '$1,240'],
  ['0116', 'Hydraulic arm seal', 'Overdue by 2 days', 100, 'danger', 'McNeilus Atlantic', '$860'],
  ['0034', 'Oil & filter', 'Due in 120 mi', 88, 'warn', 'McNeilus Atlantic', '$310'],
  ['0056', 'DOT annual inspection', 'Due in 3 days', 82, 'warn', 'Heil Durapack', '$450'],
  ['0091', 'Brake inspection', 'Due in 6 days', 74, 'warn', 'McNeilus Atlantic', '$180'],
  ['0068', 'Tire rotation', 'Due in 9 days', 61, 'ok', 'Autocar ACX', '$220'],
  ['0072', 'Oil & filter', 'Due in 610 mi', 40, 'ok', 'Heil Durapack', '$310'],
];
const maintenance = {
  tab: 'maintenance',
  render({ state }) {
    const booked = state.booked || {};
    return shell('Maintenance', `
      <div class="fm-kpis fm-kpis--3">
        <div class="card metric"><span class="metric__label">Overdue</span><span class="metric__value" style="color:var(--danger-soft-ink)">${MAINT.filter((m) => m[4] === 'danger' && !booked[m[0]]).length}</span><span class="metric__delta">Pull from route recommended</span></div>
        <div class="card metric"><span class="metric__label">Due in 7 days</span><span class="metric__value">5</span><span class="metric__delta">3 can be batched Saturday</span></div>
        <div class="card metric"><span class="metric__label">Month to date</span><span class="metric__value">$18.2k</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}6% under budget</span></div>
      </div>
      <div class="stack" style="--gap:10px">${MAINT.map(([id, task, due, p, k, model, cost]) => `<div class="card fm-maint">
        <span class="list-item__icon" style="background:var(--${k}-soft);color:var(--${k}-soft-ink)">${icon('wrench')}</span>
        <div class="grow stack" style="--gap:6px;min-width:0"><div class="row row--between row--wrap" style="--gap:6px"><p><strong>Truck ${id}</strong> <span class="t-muted">· ${task}</span></p>${booked[id] ? chip('ok-soft', 'Booked · ' + booked[id], 'calendar') : chip(k === 'ok' ? 'ok-soft' : k === 'warn' ? 'warn-soft' : 'danger', due, k === 'danger' ? 'alert' : 'clock')}</div><div class="progress progress--${k}"><span style="width:${p}%"></span></div><p class="t-xs t-subtle">${model} · est. ${cost}</p></div>
        <button class="btn btn--sm ${k === 'danger' && !booked[id] ? '' : 'btn--outline'}" data-sched="${id}">${booked[id] ? 'Change' : 'Schedule'}</button></div>`).join('')}</div>`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    on(root, '[data-sched]', 'click', (e, b) => bookService(b.dataset.sched));
  },
};
function bookService(id) {
  sheet(`<h2 class="t-h3">Schedule service · Truck ${id}</h2><p class="t-muted" style="margin:6px 0 16px">Back Bay depot shop.</p>
    <div class="stack" style="--gap:10px">${['Tonight · 6 PM (after shift)', 'Saturday · 7 AM (batched)', 'Now — pull from route'].map((o, i) => `<label class="choice"><input type="radio" name="slot" value="${o}" ${i === 0 ? 'checked' : ''}><span class="t-title grow">${o}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
    <button class="btn btn--lg btn--block" data-ok>Confirm</button></div>`, (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => {
    const slot = el.querySelector('input[name=slot]:checked').value;
    store.update((s) => { s.booked = { ...(s.booked || {}), [id]: slot.split(' (')[0] }; });
    close(); toast(`Service booked for Truck ${id}`, 'wrench');
  }));
}

// ---------------------------------------------------------------------------
// Compliance & safety — incidents first, then certifications and SOP health.
const compliance = {
  tab: 'compliance',
  render({ state, query }) {
    const tab = query.get('tab') || 'incidents';
    const f = query.get('f') || 'active';
    const all = state.incidents;
    const act = all.filter((i) => i.status !== 'resolved');
    const res = all.filter((i) => i.status === 'resolved');
    const list = (f === 'resolved' ? res : f === 'new' ? all.filter((i) => i.status === 'open') : act)
      .slice().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    const body = tab === 'incidents' ? `
      <div class="fm-filters">
        <div class="segmented" role="tablist">${[['active', 'Active', act.length], ['new', 'New', all.filter((i) => i.status === 'open').length], ['resolved', 'Resolved', res.length]].map(([k, l, n]) => `<button role="tab" aria-selected="${f === k}" data-f="${k}">${l} <span class="t-subtle">${n}</span></button>`).join('')}</div>
      </div>
      <div class="stack" style="--gap:8px">${list.length ? list.map(incidentRow).join('') : `<div class="card stack center" style="--gap:10px;text-align:center;padding:36px"><span class="f-empty" style="background:var(--ok-soft);color:var(--ok-soft-ink)">${icon('check', 'ico--xl')}</span><p class="t-title">Nothing here</p><p class="t-sm t-subtle">New reports from drivers and collectors appear here instantly.</p></div>`}</div>`
      : tab === 'certs' ? certsTab(state) : sopTab();
    return shell('Compliance & safety', `
      <div class="fm-kpis">
        <div class="card metric"><span class="metric__label">Active incidents</span><span class="metric__value">${act.length}</span><span class="metric__delta">${act.filter((i) => sla(i)?.kind === 'danger').length} past response time</span></div>
        <div class="card metric"><span class="metric__label">Resolved today</span><span class="metric__value">${res.length + 6}</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}Avg. 38 min to resolve</span></div>
        <div class="card metric"><span class="metric__label">Fleet compliance</span><span class="metric__value">96.4%</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}1.2% this month</span></div>
        <div class="card metric"><span class="metric__label">Days since injury</span><span class="metric__value">128</span><span class="metric__delta">Record: 211</span></div>
      </div>
      <nav class="fm-tabs" aria-label="Compliance sections">${[['incidents', 'Incidents'], ['certs', 'Certifications'], ['sop', 'SOP health']].map(([k, l]) => `<a href="${R}compliance?tab=${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      ${body}`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    on(root, '[data-f]', 'click', (e, b) => ctx.go(R + 'compliance?tab=incidents&f=' + b.dataset.f, { replace: true }));
    on(root, '[data-train]', 'click', (e, b) => scheduleTraining(b.dataset.train));
    on(root, '[data-brief]', 'click', () => { actions.dispatch('Safety briefing: never handle unknown containers — photograph, step back and flag it. Hazmat will collect.'); toast('Briefing sent to all crews', 'send'); });
  },
};

const CREW = [
  ['Miguel Sorano', 'Collector · Truck 0091', 'Sharps & needle handling', 14, 'persona-collector.jpg'],
  ['Abigail Smith', 'Collector · Truck 0012', 'Sharps & needle handling', 9, ''],
  ['Manny Ventuzo', 'Collector · Truck 0047', 'Hazmat awareness', 11, ''],
  ['Stan Pietro', 'Driver · Truck 0091', 'CDL medical card', 142, 'persona-driver.jpg'],
  ['Keisha Moore', 'Driver · Truck 0083', 'Air brake endorsement', 201, ''],
];
function certsTab(state) {
  const tr = state.training || {};
  return `<section class="card stack" style="--gap:4px">
    <div class="row row--between" style="margin-bottom:6px"><h2 class="t-h3">Crew certifications</h2><span class="t-xs t-subtle">Soonest to expire first</span></div>
    ${CREW.map(([n, role, cert, days, im]) => `<div class="fm-cert">${avatar(im ? img(im) : '', n)}<div class="grow" style="min-width:0"><p style="font-weight:700">${esc(n)}</p><p class="t-xs t-subtle">${esc(role)} · ${esc(cert)}</p></div>
      <div class="fm-cert__end">${tr[n] ? chip('ok-soft', 'Training ' + tr[n], 'calendar') : days <= 30 ? chip(days <= 10 ? 'danger-soft' : 'warn-soft', `${days} days left`, 'clock') : chip('ok-soft', 'Valid', 'check')}
      ${days <= 30 ? `<button class="btn btn--sm ${tr[n] ? 'btn--ghost' : 'btn--outline'}" data-train="${esc(n)}">${tr[n] ? 'Change' : 'Schedule'}</button>` : ''}</div></div>`).join('')}
  </section>`;
}
function scheduleTraining(name) {
  sheet(`<h2 class="t-h3">Schedule recertification</h2><p class="t-sm t-muted" style="margin:4px 0 14px">${esc(name)} · 2-hour session at Back Bay depot. It shows up in their app.</p>
    <div class="stack" style="--gap:10px">${['Thu · 7:00 AM (before shift)', 'Fri · 3:30 PM (after shift)', 'Sat · 9:00 AM'].map((o, i) => `<label class="choice"><input type="radio" name="slot" value="${o}" ${i === 0 ? 'checked' : ''}><span class="t-title grow">${o}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
    <button class="btn btn--lg btn--block" data-ok>Schedule & notify</button></div>`, (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => {
    const slot = el.querySelector('input[name=slot]:checked').value.split(' (')[0];
    store.update((s) => { s.training = { ...(s.training || {}), [name]: slot }; });
    if (name === 'Miguel Sorano') actions.dispatch(`Miguel — sharps recertification booked for ${slot} at Back Bay depot.`);
    close(); toast(`Training booked · ${name.split(' ')[0]} notified`, 'calendar');
  }));
}
function sopTab() {
  return `<section class="card stack" style="--gap:16px">
    <div class="row row--between row--wrap" style="--gap:8px"><h2 class="t-h3">SOP adherence · last 30 days</h2><button class="btn btn--sm btn--outline" data-brief>${icon('send')}Send safety briefing</button></div>
    ${[['Pre-trip inspections completed', 98, 'ok', 'Driver app · pre-trip checklist'], ['PPE on route (photo audits)', 97, 'ok', 'Collector photo proof'], ['Recycling contamination < 5%', 91, 'ok', 'Collector compliance checks'], ['Hazmat handling protocol', 88, 'warn', '2 unlogged hazmat stops this month'], ['Certifications current', 94, 'warn', '3 expiring in 14 days']].map(([l, v, k, src]) => `<div class="stack" style="--gap:6px"><div class="row row--between t-sm"><span style="font-weight:600">${l}</span><strong class="t-num">${v}%</strong></div><div class="progress progress--${k}"><span style="width:${v}%"></span></div><p class="t-xs t-subtle">${src}</p></div>`).join('')}
  </section>`;
}

// ---------------------------------------------------------------------------
// Incident detail — triage → playbook → resolve. Each playbook step does real
// work in the shared store, so the crew and customer apps react.
const nowT = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const PB = {
  pull: { t: 'Pull truck from route', d: 'Marks it out of service so dispatch stops sending it.', log: 'Truck marked out of service' },
  spare: { t: 'Dispatch a spare truck', d: 'Spare Truck 0120 covers the remaining stops.', log: 'Spare Truck 0120 dispatched to cover remaining stops' },
  wo: { t: 'Book the shop', d: 'Opens a work order at Back Bay depot.', log: 'Work order WO-4471 opened at Back Bay shop', fx: (i) => bookService(i.from.replace('Truck ', '')) },
  eta: { t: 'Update affected customers', d: 'Sends new ETAs to customers still on the route.', log: 'Updated ETAs sent to 23 customers by SMS' },
  safe: { t: 'Confirm the crew is safe', d: 'Radio check-in before anything else.', log: 'Crew confirmed safe by radio' },
  closure: { t: 'Add a road closure to the map', d: 'Draws a closure here. Routes avoid it and crews get an alert.', log: 'Road closure added to operations map', fx: (i) => boxArea(i, 'closure') },
  zone: { t: 'Mark a hazard zone on the map', d: 'Crews see a warning and need hazmat PPE to enter.', log: 'Hazard zone added to operations map', fx: (i) => boxArea(i, 'hazmat') },
  city: { t: 'Report to Boston 311', d: 'Files a city service request.', log: 'Reported to Boston 311 · case #1047823' },
  reroute: { t: 'Re-optimize affected routes', d: 'Recalculates routes for nearby trucks.', log: 'Routes re-optimized for 3 trucks (+4 min avg.)' },
  hazmat: { t: 'Dispatch certified hazmat crew', d: 'Hazmat unit collects the item safely.', log: 'Hazmat unit H-2 dispatched · ETA 40 min', fx: () => actions.dispatch('Hazmat unit H-2 is on the way for the flagged item. Leave it in place and keep clear.') },
  dep: { t: 'Log for state reporting', d: 'Adds it to the MassDEP hazardous waste record.', log: 'Logged to MassDEP hazardous waste record' },
  contact: { t: 'Contact the customer', d: 'Sends an in-app message and SMS explaining what happened.', log: 'Customer contacted', fx: (i, s) => customerNote(i, s, 'message', 'About today’s pickup', `Our crew couldn’t complete your pickup (${i.type.toLowerCase()}). We’re arranging a fix and will confirm shortly.`) },
  reschedule: { t: 'Reschedule the pickup', d: 'Pick a new date — the customer sees it right away.', log: null, fx: (i) => reschedule(i) },
  credit: { t: 'Apply a service credit', d: '$12 credit on the next bill.', log: 'Applied $12 service credit', fx: (i, s) => customerNote(i, s, 'dollar', '$12 credit applied', 'Sorry about today — a $12 credit will appear on your next bill.') },
  back: { t: 'Send the crew back today', d: 'Puts the stop back in the crew’s queue as their next stop.', log: 'Stop re-queued · crew sent back', fx: (i) => sendBack(i) },
  educate: { t: 'Send recycling guidance', d: 'Explains what went wrong with a link to the guide.', log: 'Recycling guidance sent to customer', fx: (i, s) => customerNote(i, s, 'recycle', 'Recycling tip from your crew', 'Food waste and plastic bags can’t go in recycling. Open the recycling guide to see what goes where.') },
  tag: { t: 'Tag the bin with a notice', d: 'Collector leaves an “oops” tag on the lid.', log: 'Oops tag left on bin' },
  bulk: { t: 'Offer a bulk pickup', d: 'Sends a $35 bulk-pickup quote.', log: 'Bulk pickup quote sent ($35)', fx: (i, s) => customerNote(i, s, 'sofa', 'Bulk pickup available', 'Your extra items need a bulk pickup — book one for $35 from Request a pickup.') },
  bin: { t: 'Order a replacement bin', d: 'Delivered within 2 business days.', log: 'Replacement bin ordered', fx: (i, s) => customerNote(i, s, 'bin', 'New bin on the way', 'We’ve ordered a replacement bin. It arrives within 2 business days.') },
  photos: { t: 'Collect photos and statements', d: 'Asks the crew for photos and a short statement.', log: 'Crew asked for photos and statements', fx: () => actions.dispatch('When safe, please add photos and a short statement for the incident report.') },
  osha: { t: 'Record in OSHA 300 log', d: 'Required within 7 days if anyone was injured.', log: 'OSHA 300 log entry recorded' },
  drug: { t: 'Schedule post-accident test', d: 'DOT drug & alcohol test within 8 hours.', log: 'Post-accident DOT test scheduled' },
  investigate: { t: 'Investigate', d: 'Review telematics, photos and crew notes.', log: 'Investigation notes added' },
  crew: { t: 'Contact the crew', d: 'Message the driver and collector.', log: 'Crew contacted', fx: () => crewMessage() },
};
const PLAYBOOKS = {
  'Vehicle issue': ['pull', 'spare', 'wo', 'eta'],
  'Road hazard': ['safe', 'closure', 'city', 'reroute'],
  Accident: ['safe', 'photos', 'closure', 'drug', 'osha'],
  'Traffic delay': ['reroute', 'eta'],
  'Blocked access': ['contact', 'reschedule', 'credit', 'back'],
  'Bin not out': ['contact', 'reschedule', 'back'],
  'Contaminated recycling': ['educate', 'tag', 'reschedule'],
  'Hazardous item': ['safe', 'hazmat', 'zone', 'contact', 'dep'],
  'Overweight / overflow': ['contact', 'bulk', 'back'],
  'Damaged bin': ['bin', 'contact'],
};
const playbook = (i) => PLAYBOOKS[i.type] || ['crew', 'investigate'];
const CAUSES = ['Customer placement or behavior', 'Vehicle wear / overdue maintenance', 'Road or infrastructure', 'Crew procedure not followed', 'Weather', 'Other'];

const stopOf = (i, s) => (i.stopId ? s.route.stops.find((x) => x.id === i.stopId) : null);
function customerNote(i, s, ic, title, body) {
  if (stopOf(i, s)?.customer) actions.notifyCustomer(ic, title, body);
}
function boxArea(i, kind) {
  const d = 0.0011, e = 0.0015;
  const name = kind === 'closure' ? `Closure · ${i.title.replace(/^.*? on /, '')}` : `Hazard · ${i.title.split(' · ')[1] || i.from}`;
  actions.saveArea({ id: 'a' + Date.now(), kind, name, latlngs: [[i.lat + d, i.lng - e], [i.lat + d, i.lng + e], [i.lat - d, i.lng + e], [i.lat - d, i.lng - e]], notes: i.note, until: kind === 'closure' ? '14:00' : null, createdAt: new Date().toISOString(), incident: i.id });
}
function sendBack(i) {
  store.update((s) => {
    const st = stopOf(i, s); if (!st) return;
    st.status = 'pending'; st.problem = null; st.completedAt = null; st.resolution = null;
    // Move it to the crew's current position so it's their next stop
    s.route.stops.splice(s.route.stops.indexOf(st), 1);
    const cur = s.route.stops.findIndex((x) => x.status === 'pending');
    s.route.stops.splice(cur === -1 ? s.route.stops.length : cur, 0, st);
  });
  const st = stopOf(i, store.get());
  if (st) actions.dispatch(`Please go back to ${st.address} — ${i.type.toLowerCase()} is sorted. It's now your next stop.`);
  if (st?.customer) actions.notifyCustomer('truck', 'Crew is coming back today', 'Your pickup is back on today’s route. Track the truck from your home screen.');
}
function reschedule(i) {
  const days = [1, 2, 3].map((n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  sheet(`<h2 class="t-h3">Reschedule pickup</h2><p class="t-sm t-muted" style="margin:4px 0 14px">${esc(stopOf(i, store.get())?.address || '')}</p>
    <div class="stack" style="--gap:10px">${days.map((d, k) => `<label class="choice"><input type="radio" name="d" value="${iso(d)}" ${k === 0 ? 'checked' : ''}><span class="grow"><span class="t-title" style="display:block">${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span><span class="t-sm t-subtle">9 – 11 AM · Truck 0091</span></span><span class="choice__check">${icon('check')}</span></label>`).join('')}
    <button class="btn btn--lg btn--block" data-ok>Reschedule & notify customer</button></div>`, (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => {
    const date = el.querySelector('input[name=d]:checked').value;
    const label = fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' });
    actions.incident(i.id, (inc, s) => {
      inc.steps.reschedule = nowT();
      if (inc.status !== 'resolved') inc.status = 'in-progress';
      inc.owner = inc.owner || 'Lucas Pelligrino';
      const st = stopOf(inc, s);
      if (st) {
        st.resolution = { ...(st.resolution || {}), rescheduled: date, text: `Rescheduled to ${label}, 9 – 11 AM` };
        if (st.customer) s.pickups.push({ id: 'p' + Date.now(), date, window: '9 – 11 AM', kind: 'One-time', waste: 'Rescheduled pickup', price: 0, status: 'approved', truck: 'Truck 0091' });
      }
    }, `Pickup rescheduled to ${label}`);
    customerNote(i, store.get(), 'calendar', 'Pickup rescheduled', `New time: ${label}, 9 – 11 AM. Leave your bins out as usual.`);
    close(); toast('Rescheduled — customer notified', 'calendar');
  }));
}

const incidentScreen = {
  tab: 'compliance',
  render({ state, params }) {
    const i = state.incidents.find((x) => x.id === params[0]);
    if (!i) return shell('Incident', `<div class="card stack" style="--gap:12px"><p class="t-muted">This incident no longer exists.</p><a class="btn" href="${R}compliance">Back to incidents</a></div>`, state);
    const st = stopOf(i, state);
    const steps = playbook(i);
    const nDone = steps.filter((k) => i.steps[k]).length;
    const phase = INC_PHASES.indexOf(i.status);
    const d = sla(i);
    const own = i.from === 'Truck 0091';
    const reporter = i.role === 'System' ? 'CoCo telematics' : own ? (i.role === 'Driver' ? state.route.driver : state.route.collector) : `${i.from} crew`;
    const reporterImg = own ? (i.role === 'Driver' ? 'persona-driver.jpg' : 'persona-collector.jpg') : '';
    const photo = i.role === 'Collector' || i.stopId;
    return shell('Incident', `
      <a class="btn btn--sm btn--ghost" href="${R}compliance" style="align-self:flex-start;margin-left:-8px">${icon('chevron-left')}All incidents</a>
      <section class="card stack fm-inc-head" style="--gap:14px">
        <div class="row row--wrap" style="--gap:8px">${sevChip(i.severity)}${statusPill(i.status)}${d ? chip(d.kind, d.text, 'clock') : ''}<span class="chip chip--outline">${icon('flag')}${esc(i.type)}</span></div>
        <h2 class="t-h2">${esc(i.title)}</h2>
        <p class="t-sm t-muted" style="margin-top:-6px">${esc(i.from)} · reported by ${esc(reporter)} · ${i.at}</p>
        <ol class="fm-steps" aria-label="Incident progress">${INC_PHASES.map((p, k) => `<li class="${k < phase || (k === phase && p === 'resolved') ? 'is-done' : k === phase ? 'is-current' : ''}" ${k === phase ? 'aria-current="step"' : ''}><span>${k < phase || (k === phase && p === 'resolved') ? icon('check') : k + 1}</span>${STATUS_LABEL[p]}</li>`).join('')}</ol>
        <div class="fm-inc-actions">
          ${i.status === 'open' ? `<button class="btn" data-ack>${icon('check')}Acknowledge</button>` : ''}
          ${i.status !== 'resolved' ? `<label class="fm-owner"><span class="t-xs t-subtle">Owner</span><select class="select" data-owner aria-label="Assign owner"><option value="">Unassigned</option>${OWNERS.map(([n, r]) => `<option value="${esc(n)}" ${i.owner === n ? 'selected' : ''}>${esc(n)} · ${r}</option>`).join('')}</select></label>` : `<button class="btn btn--neutral" data-reopen>${icon('refresh')}Reopen</button>`}
          ${own ? `<button class="btn btn--neutral" data-msg>${icon('message')}Message crew</button>` : `<button class="btn btn--neutral" data-t="Calling ${esc(i.from)} crew…">${icon('phone')}Call crew</button>`}
        </div>
      </section>

      <div class="fm-inc-grid">
        <div class="stack" style="--gap:16px;min-width:0">
          <section class="card stack" style="--gap:10px"><h2 class="t-title">What was reported</h2>
            <p>${esc(i.note || 'No details added.')}</p>
            ${photo ? `<div class="fm-inc-photo"><img src="${img(/recycl/i.test(i.type) ? 'bin.jpg' : /access|bin not/i.test(i.type) ? 'house-bin.jpg' : 'house-bags.jpg')}" alt="Photo from the crew"><span class="chip chip--ok">${icon('camera')}Crew photo · ${i.at}</span></div>` : ''}
          </section>

          <section class="card stack" style="--gap:12px">
            <div class="row row--between"><h2 class="t-title">Response playbook</h2><span class="t-sm t-subtle t-num">${nDone}/${steps.length} done</span></div>
            <p class="t-sm t-muted" style="margin-top:-6px">Recommended steps for ${esc(i.type.toLowerCase())}. Each one updates the crew${st?.customer ? ' and customer' : ''} apps.</p>
            <ol class="fm-pb">${steps.map((k, n) => { const p = PB[k]; const done = i.steps[k]; return `<li class="fm-pb__item ${done ? 'is-done' : ''}">
              <span class="fm-pb__n">${done ? icon('check') : n + 1}</span>
              <div class="grow" style="min-width:0"><p class="t-title">${p.t}</p><p class="t-sm t-subtle">${done ? `Done at ${done}` : p.d}</p></div>
              ${done ? '' : `<button class="btn btn--sm ${n === nDone ? '' : 'btn--outline'}" data-step="${k}" ${i.status === 'resolved' ? 'disabled' : ''}>${k === 'reschedule' ? 'Choose date' : k === 'wo' ? 'Book' : 'Do it'}</button>`}
            </li>`; }).join('')}</ol>
          </section>

          ${i.status === 'resolved' ? `<section class="card stack fm-resolved" style="--gap:8px"><div class="row" style="--gap:10px">${icon('check-circle', 'ico--lg')}<h2 class="t-title">Resolved at ${i.resolution.at}</h2></div>
            <p><strong>Root cause:</strong> ${esc(i.resolution.cause)}</p><p>${esc(i.resolution.summary)}</p>
            ${i.resolution.prevent.length ? `<p class="t-sm t-muted">Prevention: ${i.resolution.prevent.map(esc).join(' · ')}</p>` : ''}</section>`
          : `<section class="card stack" style="--gap:14px" data-resolve-form>
            <h2 class="t-title">Resolve incident</h2>
            <div class="field"><label class="label" for="rs-cause">Root cause</label><select class="select" id="rs-cause">${CAUSES.map((c) => `<option ${(i.type === 'Vehicle issue' && /Vehicle/.test(c)) || (i.type === 'Road hazard' && /Road/.test(c)) || (/Contamin|access|Bin not/.test(i.type) && /Customer/.test(c)) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="rs-sum">What was done</label><textarea class="textarea" id="rs-sum" placeholder="Summarize the fix for the record">${esc(i.log.slice(1).map((l) => l.text).filter((t) => !/^(Acknowledged|Assigned|Owner|Reopened)/.test(t)).join('. '))}</textarea></div>
            <fieldset class="field" style="border:0;padding:0"><legend class="label" style="margin-bottom:6px">Prevent it happening again</legend>
              ${['Retrain crew on SOP', 'Adjust maintenance schedule', 'Send customer education', 'Update route or access notes'].map((t) => `<label class="check"><input type="checkbox" data-prev value="${t}"><span class="check__box">${icon('check')}</span>${t}</label>`).join('')}
            </fieldset>
            <label class="check"><input type="checkbox" data-notify checked><span class="check__box">${icon('check')}</span>Tell the crew${st?.customer ? ' and customer' : ''} it’s resolved</label>
            ${nDone < steps.length ? `<p class="t-xs t-subtle">${steps.length - nDone} playbook step${steps.length - nDone > 1 ? 's' : ''} not done. You can still resolve if they don’t apply.</p>` : ''}
            <button class="btn btn--lg btn--ok btn--block" data-resolve>${icon('check')}Resolve incident</button>
          </section>`}
        </div>

        <aside class="stack" style="--gap:16px;min-width:0">
          ${i.lat ? `<section class="card stack" style="--gap:10px"><div class="row row--between"><h2 class="t-title">Location</h2><a class="t-sm" href="${R}overview" style="font-weight:700">Open live map</a></div><div class="fm-inc-map">${staticMap(i.lat, i.lng, { tone: SEV[i.severity] === 'info' ? 'brand' : SEV[i.severity] })}</div>
            ${state.areas.filter((a) => a.incident === i.id).map((a) => `<p class="row t-sm" style="--gap:8px;color:var(--danger-soft-ink)">${icon(AREA_KINDS[a.kind].icon)}${AREA_KINDS[a.kind].label} on map · ${esc(a.name)}</p>`).join('')}</section>` : ''}
          <section class="card stack" style="--gap:12px"><h2 class="t-title">People</h2>
            <div class="row" style="--gap:12px">${avatar(reporterImg ? img(reporterImg) : '', reporter)}<div class="grow" style="min-width:0"><p style="font-weight:700">${esc(reporter)}</p><p class="t-xs t-subtle">Reported it · ${esc(i.role)}</p></div></div>
            ${st ? `<div class="row" style="--gap:12px">${avatar(st.customer ? img('persona-customer.jpg') : '', st.name)}<div class="grow" style="min-width:0"><p style="font-weight:700">${esc(st.name)}</p><p class="t-xs t-subtle">Customer · ${esc(st.address)}</p></div>${st.customer ? chip('info-soft', 'Uses app', 'phone') : ''}</div>` : ''}
            ${i.owner ? `<div class="row" style="--gap:12px">${avatar(i.owner === 'Lucas Pelligrino' ? img('persona-fleet-manager.jpg') : '', i.owner)}<div class="grow" style="min-width:0"><p style="font-weight:700">${esc(i.owner)}</p><p class="t-xs t-subtle">Owner</p></div></div>` : ''}
          </section>
          <section class="card stack" style="--gap:12px"><h2 class="t-title">Activity</h2>
            <ol class="timeline">${i.log.slice().reverse().map((l) => `<li class="timeline__item timeline__item--done"><span class="timeline__node">${icon('check')}</span><div class="timeline__body"><p class="timeline__title">${esc(l.text)}</p><p class="timeline__meta">${esc(l.who)} · ${l.at}</p></div></li>`).join('')}</ol>
          </section>
        </aside>
      </div>`, state);
  },
  mount(root, ctx) {
    mountShell(root, ctx);
    const id = ctx.params[0];
    const inc = () => store.get().incidents.find((x) => x.id === id);
    if (!inc()) return;
    on(root, '[data-ack]', 'click', () => {
      actions.incident(id, (i) => { i.status = 'acknowledged'; i.owner = i.owner || 'Lucas Pelligrino'; }, 'Acknowledged · owner Lucas Pelligrino');
      if (inc().from === 'Truck 0091') actions.dispatch(`Fleet acknowledged your report: ${inc().title}. Working on it.`);
      toast('Acknowledged — reporter notified');
    });
    on(root, '[data-owner]', 'change', (e, sel) => { actions.incident(id, (i) => { i.owner = sel.value || null; if (i.status === 'open' && sel.value) i.status = 'acknowledged'; }, sel.value ? `Assigned to ${sel.value}` : 'Owner removed'); });
    on(root, '[data-msg]', 'click', () => crewMessage(`Re: ${inc().title} — `));
    on(root, '[data-reopen]', 'click', () => actions.incident(id, (i) => { i.status = 'in-progress'; i.resolution = null; }, 'Reopened'));
    on(root, '[data-step]', 'click', (e, b) => {
      const k = b.dataset.step, p = PB[k], i = inc();
      if (p.log) actions.incident(id, (x) => { x.steps[k] = nowT(); if (x.status !== 'resolved') x.status = 'in-progress'; x.owner = x.owner || 'Lucas Pelligrino'; }, p.log);
      p.fx?.(i, store.get());
      if (p.log && k !== 'wo') toast(p.log, 'check-circle');
    });
    on(root, '[data-resolve]', 'click', () => {
      const f = root.querySelector('[data-resolve-form]');
      const r = { cause: f.querySelector('#rs-cause').value, summary: f.querySelector('#rs-sum').value.trim() || 'Resolved by fleet operations.', prevent: [...f.querySelectorAll('[data-prev]:checked')].map((c) => c.value), at: nowT() };
      const notify = f.querySelector('[data-notify]').checked;
      const i = inc();
      const st0 = stopOf(i, store.get());
      const custMsg = st0?.resolution?.rescheduled
        ? `All set — your pickup is confirmed for ${fmtDate(st0.resolution.rescheduled, { weekday: 'long', month: 'short', day: 'numeric' })}, 9 – 11 AM.`
        : 'Fleet operations has resolved the issue with today’s pickup. Thanks for your patience.';
      actions.incident(id, (x, s) => {
        x.status = 'resolved'; x.resolution = r; x.owner = x.owner || 'Lucas Pelligrino';
        const st = stopOf(x, s); if (st && st.status === 'issue') st.resolution = { ...(st.resolution || {}), text: st.resolution?.rescheduled ? st.resolution.text : custMsg, resolved: true };
        s.areas = s.areas.filter((a) => !(a.incident === id && a.kind === 'closure'));
      }, `Resolved · ${r.cause}`);
      if (notify) {
        if (i.from === 'Truck 0091') actions.dispatch(`Resolved: ${i.title}. Thanks for reporting it.`);
        customerNote(i, store.get(), 'check-circle', 'Issue resolved', custMsg);
      }
      toast('Incident resolved and logged');
    });
  },
};

export default {
  label: 'Fleet manager', product: 'Fleet operations',
  user: { name: 'Lucas Pelligrino', title: 'Fleet Manager · Boston', img: 'persona-fleet-manager.jpg' },
  theme: 'light',
  start: () => 'overview',
  tabs,
  index: [['Operations', 'overview'], ['Fleet table', 'fleet'], ['Truck detail (live)', 'truck/0091'], ['Scheduled customers', 'pickups'], ['Maintenance', 'maintenance'], ['Compliance & safety', 'compliance'], ['Incident', 'incident/i0']],
  screens: { overview, fleet, truck, pickups, maintenance, compliance, incident: incidentScreen },
};
