// Driver app — in-cab, dark field mode. Read at a glance while moving:
// one instruction, one stop, one primary action, 56px targets.
// Journey: sign in → pre-trip → route briefing → drive & coordinate with the
// collector → tip at the transfer station → end-of-shift report.
import { store, actions, currentStop, currentStopIndex, doneCount, loadPct } from './store.js';
import { icon, esc, img, chip, statusChip, appbar, avatar, toast, sheet, on } from './ui.js';
import { mountNav, navInfo, turnInner, thenInner, etaInner, routeTotals } from './navmap.js';
import { messagesScreen } from './shared.js';

const R = '#/';

const tabs = (s) => [
  { key: 'drive', href: R + 'drive', icon: 'nav', label: 'Drive' },
  { key: 'stops', href: R + 'stops', icon: 'list', label: 'Stops' },
  { key: 'messages', href: R + 'messages', icon: 'message', label: 'Crew', badge: s.unread.driver || 0 },
  { key: 'vehicle', href: R + 'vehicle', icon: 'truck', label: 'Truck' },
];

const closures = (s) => s.areas.filter((a) => a.kind === 'closure' || a.kind === 'hazmat');
const lastDispatch = (s) => [...s.messages].reverse().find((m) => m.from === 'dispatch');
const binLine = (st) => [st.bin, st.size, st.type === 'recycling' && st.bin !== 'Recycling' ? 'Recycling' : st.type === 'bulk' ? 'Bulk' : null, st.extra].filter(Boolean).join(' · ');

// ---------------------------------------------------------------------------
const login = {
  tabs: false, live: false,
  render: () => `
    <div class="f-login">
      <img class="f-login__bg" src="${img('cab.jpg')}" alt="">
      <div class="f-login__body stack" style="--gap:20px">
        <span class="logo" style="font-size:2.25rem">CoCo</span>
        <div><p class="t-eyebrow" style="color:var(--accent-text)">Driver</p><h1 class="t-h1">Start your shift</h1></div>
        <div class="field"><label class="label" for="d-badge">Badge ID</label><input class="input" id="d-badge" value="D-20417" inputmode="numeric"></div>
        <div class="field"><label class="label" for="d-truck">Vehicle</label><select class="select" id="d-truck"><option>Truck 0091 · McNeilus Atlantic front loader</option><option>Truck 0083 · Autocar ACX side loader</option></select></div>
        <button class="btn btn--field btn--block" data-go>${icon('scan')}Tap badge to sign in</button>
        <p class="t-xs t-subtle" style="text-align:center">Shift 7:30 AM – 4:00 PM · Back Bay depot</p>
      </div>
    </div>`,
  mount(root, { go }) { on(root, '[data-go]', 'click', () => { store.update((s) => { s.onboarded.driver = true; }, { silent: true }); go(R + (store.get().route.preTrip ? 'route' : 'pretrip')); }); },
};

const CHECKS = [['Brakes & air pressure', 'gauge'], ['Lights & signals', 'zap'], ['Hydraulics & lift arm', 'wrench'], ['Tires & wheels', 'target'], ['Mirrors & backup camera', 'camera'], ['Fuel above ½ tank', 'fuel']];
const pretrip = {
  tabs: false, live: false,
  render: () => `${appbar({ title: 'Pre-trip inspection', back: R + 'login' })}
    <div class="f-page stack" style="--gap:16px">
      <div class="d-truckline">${icon('truck')}<div class="grow"><p class="t-title">Truck 0091</p><p class="t-sm t-subtle">48,212 mi · last inspected yesterday</p></div></div>
      <p class="t-muted">Walk around the vehicle and tap each item as it passes. Anything that fails goes straight to your fleet manager.</p>
      <div class="stack" style="--gap:10px">
        ${CHECKS.map(([t, ic]) => `<label class="choice f-check"><input type="checkbox" data-c><span class="choice__icon">${icon(ic)}</span><span class="t-title grow">${t}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
      </div>
      <div class="f-cta stack" style="--gap:8px">
        <button class="btn btn--field btn--block" data-go disabled>Complete inspection · <span data-n>0</span>/6</button>
        <button class="btn btn--ghost btn--block" data-issue>${icon('alert')}Something failed</button>
      </div>
    </div>`,
  mount(root, { go }) {
    const btn = root.querySelector('[data-go]');
    const upd = () => { const n = root.querySelectorAll('[data-c]:checked').length; root.querySelector('[data-n]').textContent = n; btn.disabled = n < 6; };
    on(root, '[data-c]', 'change', upd);
    on(root, '[data-go]', 'click', () => { store.update((s) => { s.route.preTrip = true; }); toast('Inspection logged · fleet notified'); go(R + 'route'); });
    on(root, '[data-issue]', 'click', () => go(R + 'report?type=Vehicle issue'));
  },
};

// ---------------------------------------------------------------------------
function noticeList(s) {
  const cl = closures(s);
  const d = lastDispatch(s);
  const items = [
    ...cl.map((a) => `<div class="d-notice d-notice--${a.kind === 'closure' ? 'danger' : 'warn'}">${icon(a.kind === 'closure' ? 'x' : 'alert-octagon')}<div><strong>${a.kind === 'closure' ? 'Road closure' : 'Hazard zone'} · ${esc(a.name)}</strong><span>${a.until ? `Until ${esc(a.until)} · ` : ''}${a.kind === 'closure' ? 'Route adjusted around it' : 'Hazmat PPE required to enter'}</span></div></div>`),
    d ? `<a class="d-notice" href="${R}messages">${icon('message')}<div><strong>Dispatch · ${d.at}</strong><span>${esc(d.text)}</span></div>${icon('chevron-right', 'list-item__chev')}</a>` : '',
  ].filter(Boolean);
  return items.length ? `<section class="stack" style="--gap:8px"><h2 class="d-label">Notices</h2>${items.join('')}</section>` : '';
}

const route = {
  tabs: false,
  render({ state }) {
    const r = state.route;
    const special = r.stops.filter((x) => x.notes || x.type === 'bulk' || x.bin === 'Dumpster');
    const tot = routeTotals(state);
    return `${appbar({ menu: true, logo: true })}
    <div class="f-page stack" style="--gap:18px">
      <div><p class="t-eyebrow" style="color:var(--accent-text)">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1 class="t-h1">Today's route</h1><p class="t-muted">${esc(r.truck)} · ${esc(r.territory)} · with ${esc(r.collector.split(' ')[0])}</p></div>
      <div class="f-duo">
        <div class="stack" style="--gap:14px">
          <div class="map f-route-map" data-nav-map></div>
          <div class="d-stats">
            <div><strong class="t-num">${r.stops.length}</strong><span>Stops</span></div>
            <div><strong class="t-num" data-nav-time>${tot?.time || '—'}</strong><span>Planned</span></div>
            <div><strong class="t-num" data-nav-miles>${tot ? tot.miles + ' mi' : '—'}</strong><span>Distance</span></div>
            <div><strong class="t-num">1</strong><span>Tip run</span></div>
          </div>
        </div>
        <div class="stack" style="--gap:18px">
          ${noticeList(state)}
          <section class="stack" style="--gap:8px"><h2 class="d-label">Your crew</h2>
            <div class="d-row">${avatar(img('persona-collector.jpg'), r.collector)}<div class="grow"><p class="t-title">${esc(r.collector)}</p><p class="t-sm t-subtle">Collector · hazmat certified</p></div>${chip('ok-soft', 'On the step', 'check')}</div>
          </section>
          ${special.length ? `<section class="stack" style="--gap:8px"><h2 class="d-label">Stops that need extra care</h2>
            <div class="d-list">${special.map((x) => `<div class="d-row"><span class="d-num">${r.stops.indexOf(x) + 1}</span><div class="grow" style="min-width:0"><p class="t-title">${esc(x.address)}</p><p class="t-sm t-subtle">${esc(x.notes || binLine(x))}</p></div></div>`).join('')}</div></section>` : ''}
          <div class="f-cta"><button class="btn btn--field btn--block" data-ack>${r.acknowledged ? 'Resume route' : 'Start route'}${icon('arrow-right')}</button></div>
        </div>
      </div>
    </div>`;
  },
  mount(root, { go }) {
    mountNav(root.querySelector('[data-nav-map]'), { view: 'brief' });
    on(root, '[data-ack]', 'click', () => {
      const first = !store.get().route.acknowledged;
      store.update((s) => { s.route.acknowledged = true; s.route.preTrip = true; s.onboarded.driver = true; });
      if (first) actions.sendMessage('driver', 'Route started. Heading to first stop.');
      go(R + 'drive');
    });
  },
};

// ---------------------------------------------------------------------------
const PHASES = [['arrived', 'Arrived'], ['scanned', 'Bin scanned'], ['checked', 'Checks done'], ['done', 'Complete']];

function crewTrack(state) {
  const r = state.route;
  const k = r.phase === 'checked' ? 2 : r.phase === 'scanned' ? 1 : 0;
  const msg = { 0: `${esc(r.collector.split(' ')[0])} is heading to the bin`, 1: `${esc(r.collector.split(' ')[0])} scanned the bin · running checks`, 2: 'Checks passed · photo taken · finishing up' }[k];
  return `<div class="d-crew" aria-live="polite">
    <ol class="d-crew__steps">${PHASES.map(([, l], i) => `<li class="${i < k + 1 ? 'is-done' : i === k + 1 ? 'is-current' : ''}"><span></span>${l}</li>`).join('')}</ol>
    <p class="d-crew__msg"><span class="spinner"></span>${msg}</p>
  </div>`;
}

const drive = {
  tab: 'drive',
  render({ state }) {
    const r = state.route;
    const idx = currentStopIndex(state);
    const st = currentStop(state);
    const load = loadPct(state);
    if (!r.acknowledged) return `${appbar({ menu: true, logo: true })}<div class="f-page stack center d-empty"><span class="f-empty">${icon('route', 'ico--xl')}</span><h1 class="t-h2">Route not started</h1><p class="t-muted">Review today's route and notices, then start driving.</p><a class="btn btn--field" href="${R}route">Today's route</a></div>`;
    if (!st) {
      const tipped = r.tips.length && r.tips.at(-1).done === doneCount(state);
      return `${appbar({ menu: true, logo: true })}<div class="f-page stack center d-empty"><span class="f-empty" style="background:var(--ok);color:var(--ok-ink)">${icon('check', 'ico--xl')}</span><h1 class="t-h2">Route complete</h1><p class="t-muted">${doneCount(state)} stops · ${r.stops.filter((x) => x.status === 'issue').length} flagged · load ${load}%</p>
        ${r.shift ? `<a class="btn btn--field btn--block" href="${R}shift">View shift report</a>` : tipped ? `<a class="btn btn--field btn--block" href="${R}shift">End shift</a>` : `<a class="btn btn--field btn--block" href="${R}unload">${icon('nav')}Drive to transfer station</a><a class="btn btn--ghost btn--block" href="${R}shift">Skip — end shift</a>`}</div>`;
    }
    const arrived = r.arrivedAt === st.id;
    const info = navInfo(state);
    const cl = closures(state).filter((a) => a.kind === 'closure');
    const next = r.stops[idx + 1];
    return `
      <div class="f-drive d-drive">
        <div class="f-drive__map" data-nav-map></div>
        <div class="d-panel">
          <div class="d-top" data-nav-inset>
            <div class="d-turn ${arrived ? 'is-arrived' : ''}${info?.arriving ? ' is-arriving' : ''}" aria-live="polite">
              <div class="d-turn__main" data-nav-turn>${turnInner(info, state)}</div>
              <button class="icon-btn icon-btn--lg d-turn__menu" data-menu aria-label="Menu">${icon('menu')}</button>
            </div>
            <div class="d-then" data-nav-then ${thenInner(info) ? '' : 'hidden'}>${thenInner(info)}</div>
            ${cl.length ? `<div class="d-banner" title="Your route avoids ${cl.length === 1 ? 'this closure' : 'these closures'}">${icon('x')}<span><strong>Closed</strong> · ${cl.map((a) => esc(a.name)).join(' · ')}</span></div>` : ''}
            <p class="d-reroute" data-nav-rerouted ${info?.rerouted ? '' : 'hidden'}>${icon('refresh')}Route updated for road changes</p>
          </div>
          <section class="d-sheet" data-nav-inset aria-label="Current stop">
            <div class="d-trip">
              <p class="d-trip__eta" data-nav-eta>${etaInner(info, state)}</p>
              <p class="d-trip__meta"><span>Stop <strong class="t-num">${idx + 1}</strong>/${r.stops.length}</span><span>Load <strong class="t-num ${load >= 85 ? 'd-warn' : ''}">${load}%</strong></span></p>
            </div>
            <div class="d-stop">
              <span class="d-stop__num">${idx + 1}</span>
              <div class="grow" style="min-width:0">
                <p class="d-stop__addr">${esc(st.address)}</p>
                <p class="t-sm t-subtle">${esc(st.name)} · ${esc(binLine(st))}</p>
              </div>
            </div>
            ${st.notes ? `<p class="d-note">${icon('info')}<span>${esc(st.notes)}</span></p>` : ''}
            ${load >= 85 && !arrived ? `<a class="d-note d-note--warn" href="${R}unload">${icon('weight')}<span><strong>Truck ${load}% full.</strong> Tip at the transfer station after this stop.</span>${icon('chevron-right')}</a>` : ''}
            ${arrived ? crewTrack(state) : ''}
            <div class="d-actions">
              ${arrived
                ? `<button class="btn btn--field btn--neutral grow" data-report>${icon('alert')}Problem</button><button class="btn btn--field btn--outline" data-override title="Use if the collector app is offline">Mark done</button>`
                : `<button class="btn btn--field grow${info?.arriving ? ' is-ready' : ''}" data-arrive>${icon('pin')}Arrived at stop</button><a class="icon-btn icon-btn--lg" href="${R}report" aria-label="Report a problem">${icon('alert')}</a>`}
            </div>
            <div class="d-upnext"><h2 class="d-label">Up next</h2>${r.stops.slice(idx + 1, idx + 5).map((x, k) => `<div class="d-upnext__row"><span class="d-num">${idx + k + 2}</span><div class="grow" style="min-width:0"><p class="t-sm" style="font-weight:700">${esc(x.address)}</p><p class="t-xs t-subtle truncate">${esc(x.notes || binLine(x))}</p></div></div>`).join('') || '<p class="t-sm t-subtle">Transfer station after this stop.</p>'}</div>
            <p class="d-next">${next ? `Next · ${esc(next.address)}` : 'Last stop · then transfer station'}<span>${doneCount(state)} done</span></p>
          </section>
        </div>
      </div>`;
  },
  mount(root, { go }) {
    const host = root.querySelector('[data-nav-map]');
    if (host) mountNav(host, { view: 'drive' });
    on(root, '[data-arrive]', 'click', () => { actions.driverArrived(); toast('Collector notified you’ve arrived', 'pin'); });
    on(root, '[data-report]', 'click', () => go(R + 'report'));
    on(root, '[data-override]', 'click', () => { const st = currentStop(); if (st) { actions.completeStop(st.id, { compliant: true }); toast('Stop marked complete'); } });
  },
};

// ---------------------------------------------------------------------------
const stops = {
  tab: 'stops',
  render({ state }) {
    const cur = currentStopIndex(state);
    const n = doneCount(state);
    return `${appbar({ title: 'Stops', right: `<span class="t-sm t-subtle t-num">${n}/${state.route.stops.length}</span>` })}
    <div class="f-page stack" style="--gap:16px">
      <div class="progress progress--ok"><span style="width:${(n / state.route.stops.length) * 100}%"></span></div>
      <ol class="timeline">
        ${state.route.stops.map((s, i) => {
          const st = s.status === 'done' ? 'done' : s.status === 'issue' ? 'issue' : i === cur ? 'current' : 'todo';
          return `<li class="timeline__item timeline__item--${st}"><span class="timeline__node">${st === 'done' ? icon('check') : st === 'issue' ? icon('alert') : i + 1}</span>
            <button class="timeline__body f-stop" data-stop="${s.id}"><span class="row row--between" style="--gap:8px"><span class="timeline__title">${esc(s.address)}</span>${s.completedAt ? `<span class="t-xs t-subtle">${s.completedAt}</span>` : i === cur ? chip('info', 'Next', '') : ''}</span><span class="timeline__meta">${esc(s.name)} · ${esc(binLine(s))}${s.problem ? ' · ' + esc(s.problem) : ''}</span></button></li>`;
        }).join('')}
      </ol>
    </div>`;
  },
  mount(root) {
    on(root, '[data-stop]', 'click', (e, b) => {
      const s = store.get().route.stops.find((x) => x.id === b.dataset.stop);
      sheet(`<p class="t-eyebrow">${esc(s.name)}</p><h2 class="t-h2 t-accent" style="margin:4px 0 12px">${esc(s.address)}</h2>
        <div class="row row--wrap" style="--gap:8px;margin-bottom:16px">${statusChip(s.status === 'done' ? 'complete' : s.status === 'issue' ? 'issue' : 'ready')}${chip('outline', binLine(s), 'bin')}</div>
        ${s.notes ? `<div class="alert" style="margin-bottom:16px">${icon('info')}<div>${esc(s.notes)}</div></div>` : ''}
        <p class="t-sm t-subtle" style="margin-bottom:16px">Bin tag ${s.barcode}</p>
        <button class="btn btn--field btn--block btn--neutral" data-close>Close</button>`);
    });
  },
};

// ---------------------------------------------------------------------------
const vehicle = {
  tab: 'vehicle',
  render({ state }) {
    const load = loadPct(state);
    const r = state.route;
    const gauge = (l, v, ic, k, sub) => `<div class="d-gauge"><span class="d-gauge__ic">${icon(ic)}</span><div class="grow" style="min-width:0"><div class="row row--between"><span class="t-title">${l}</span><strong class="t-num">${v}</strong></div><div class="progress ${k ? 'progress--' + k : ''}"><span style="width:${parseInt(v, 10) || 0}%"></span></div>${sub ? `<p class="t-xs t-subtle">${sub}</p>` : ''}</div></div>`;
    return `${appbar({ title: 'Truck 0091' })}
    <div class="f-page stack" style="--gap:18px">
      <div class="f-duo">
        <section class="stack" style="--gap:8px"><h2 class="d-label">Vehicle health</h2>
          <div class="d-list">
            ${gauge('Fuel', '62%', 'fuel', 'ok', '~180 mi range')}
            ${gauge('Load', load + '%', 'weight', load >= 85 ? 'warn' : '', load >= 85 ? 'Tip at transfer station soon' : `${r.tips.length} tip run${r.tips.length === 1 ? '' : 's'} today`)}
            ${gauge('Hydraulics', '94%', 'gauge', 'ok', 'Lift arm pressure normal')}
            ${gauge('Drive time', '2:14', 'clock', '', 'of 11:00 allowed today')}
          </div>
        </section>
        <div class="stack" style="--gap:18px">
          <section class="stack" style="--gap:8px"><h2 class="d-label">Break</h2>
            <div class="d-row"><span class="d-gauge__ic" style="background:var(--warn-soft);color:var(--warn-soft-ink)">${icon('coffee')}</span><div class="grow"><p class="t-title">${r.onBreak ? 'On break' : 'Break due in 45 min'}</p><p class="t-sm t-subtle">30 min required before 12:30 PM</p></div><button class="btn ${r.onBreak ? '' : 'btn--outline'}" data-break>${r.onBreak ? 'End' : 'Start'}</button></div>
          </section>
          <section class="stack" style="--gap:8px"><h2 class="d-label">Maintenance</h2>
            <div class="d-list">
              <div class="d-row"><span class="grow"><span class="t-title" style="display:block">Brake inspection</span><span class="t-sm t-subtle">${state.booked?.['0091'] ? 'Booked · ' + esc(state.booked['0091']) : 'Due in 6 days'}</span></span>${state.booked?.['0091'] ? chip('ok-soft', 'Booked', 'calendar') : chip('warn-soft', 'Soon', 'clock')}</div>
              <div class="d-row"><span class="grow"><span class="t-title" style="display:block">Oil & filter</span><span class="t-sm t-subtle">Due in 420 mi</span></span>${chip('ok-soft', 'OK', 'check')}</div>
              <div class="d-row"><span class="grow"><span class="t-title" style="display:block">Pre-trip inspection</span><span class="t-sm t-subtle">${r.preTrip ? 'Passed today' : 'Not completed'}</span></span>${r.preTrip ? chip('ok-soft', 'Passed', 'check') : chip('danger-soft', 'Required', 'alert')}</div>
            </div>
          </section>
        </div>
      </div>
      <div class="d-actions d-actions--split">
        <a class="btn btn--field btn--neutral" href="${R}report">${icon('alert')}Report a problem</a>
        <a class="btn btn--field ${currentStop(state) ? 'btn--outline' : ''}" href="${R}${load >= 60 && !r.shift ? 'unload' : 'shift'}">${icon(load >= 60 && !r.shift ? 'nav' : 'flag')}${load >= 60 && !r.shift ? 'Tip run' : 'End shift'}</a>
      </div>
    </div>`;
  },
  mount(root) {
    on(root, '[data-break]', 'click', () => {
      const b = !store.get().route.onBreak;
      store.update((s) => { s.route.onBreak = b; });
      actions.sendMessage('driver', b ? 'Starting 30 min break.' : 'Back from break — rolling.');
    });
  },
};

// ---------------------------------------------------------------------------
// Unloading — drive to the transfer station, weigh in, tip, weigh out.
const unload = {
  tabs: false, live: false,
  render({ state }) {
    const load = loadPct(state);
    const tons = (load * 0.1).toFixed(1);
    return `${appbar({ title: 'Tip run', back: R + 'drive' })}
    <div class="f-page stack" style="--gap:16px">
      <div class="d-row">${icon('building', 'ico--lg')}<div class="grow"><p class="t-title">Casella transfer station</p><p class="t-sm t-subtle">24 Bearfoot Rd · 4.2 mi · ~14 min · open until 6 PM</p></div></div>
      <ol class="d-flow" data-flow>
        <li class="is-current" data-s="0"><span>1</span><div><p class="t-title">Drive to the scale house</p><p class="t-sm t-subtle">Follow in-cab directions. Loads over 10 t use lane 2.</p></div></li>
        <li data-s="1"><span>2</span><div><p class="t-title">Weigh in & tip</p><p class="t-sm t-subtle">Separate recycling into bay C. Follow the spotter.</p></div></li>
        <li data-s="2"><span>3</span><div><p class="t-title">Log the scale ticket</p><div class="field" style="margin-top:8px"><label class="label" for="u-tons">Net weight (tons)</label><input class="input" id="u-tons" type="number" step="0.1" inputmode="decimal" value="${tons}"></div></div></li>
      </ol>
      <div class="f-cta"><button class="btn btn--field btn--block" data-next>${icon('pin')}Arrived at scale house</button></div>
    </div>`;
  },
  mount(root, { go }) {
    let step = 0;
    const labels = [`${icon('pin')}Arrived at scale house`, `${icon('check')}Tip complete`, `${icon('check')}Log ticket & continue`];
    const btn = root.querySelector('[data-next]');
    on(root, '[data-next]', 'click', () => {
      if (step < 2) {
        step++;
        root.querySelectorAll('[data-s]').forEach((li) => { const n = +li.dataset.s; li.className = n < step ? 'is-done' : n === step ? 'is-current' : ''; });
        btn.innerHTML = labels[step];
        return;
      }
      const t = parseFloat(root.querySelector('#u-tons').value) || 0;
      actions.tip(t.toFixed(1));
      toast(`Tipped ${t.toFixed(1)} t · logged for fleet`, 'check-circle');
      go(R + (currentStop() ? 'drive' : 'shift'));
    });
  },
};

// ---------------------------------------------------------------------------
// End of shift — planned vs actual, post-trip checks, notes → fleet manager.
const shift = {
  tabs: false, live: false,
  render({ state }) {
    const r = state.route;
    const n = doneCount(state);
    const flagged = r.stops.filter((x) => x.status === 'issue').length;
    const tons = r.tips.reduce((a, t) => a + parseFloat(t.tons), 0).toFixed(1);
    const reports = state.incidents.filter((i) => i.from === r.truck && i.role === 'Driver').length;
    if (r.shift) return `<div class="f-page c-success">
      <div class="c-success__badge">${icon('check', 'ico--xl')}</div>
      <h1 class="t-h1">Shift complete</h1>
      <p class="t-muted">Report sent to fleet operations at ${r.shift.at}. Thanks, ${esc(r.driver.split(' ')[0])} — drive home safe.</p>
      <div class="d-stats" style="width:100%"><div><strong class="t-num">${r.shift.stops}</strong><span>Stops</span></div><div><strong class="t-num">${r.shift.tons} t</strong><span>Tipped</span></div><div><strong class="t-num">${r.shift.actual}</strong><span>Route time</span></div></div>
      <a class="btn btn--field btn--block btn--neutral" href="../login/">${icon('logout')}Sign out</a>
    </div>`;
    return `${appbar({ title: 'End of shift', back: R + 'drive' })}
    <div class="f-page stack" style="--gap:18px">
      <section class="stack" style="--gap:8px"><h2 class="d-label">Today vs plan</h2>
        <div class="d-compare">
          ${[['Stops', `${n}/${r.stops.length}`, `${r.stops.length} planned`, n >= r.stops.length], ['Route time', '3h 34m', '3h 20m planned', false], ['Distance', '19.1 mi', '18.4 mi planned', false], ['Tipped', `${tons} t`, `${r.tips.length} run${r.tips.length === 1 ? '' : 's'}`, true]].map(([l, v, p, good]) => `<div><span class="t-xs t-subtle">${l}</span><strong class="t-num">${v}</strong><span class="t-xs ${good ? 'd-good' : 't-subtle'}">${p}</span></div>`).join('')}
        </div>
        ${flagged || reports ? `<p class="t-sm t-muted">${flagged} stop${flagged === 1 ? '' : 's'} flagged by the collector · ${reports} problem report${reports === 1 ? '' : 's'} from you. Fleet has these already.</p>` : ''}
      </section>
      <section class="stack" style="--gap:8px"><h2 class="d-label">Post-trip inspection</h2>
        ${['Truck cleaned & hopper empty', 'No new damage or warning lights', 'Parked, keys and tablet returned'].map((t, i) => `<label class="choice f-check"><input type="checkbox" data-c id="pt-${i}"><span class="choice__icon">${icon('check-circle')}</span><span class="t-title grow">${t}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
      </section>
      <div class="field"><label class="label" for="sh-notes">Notes for your fleet manager</label><textarea class="textarea" id="sh-notes" placeholder="Anything that slowed you down today? Tap the mic to dictate."></textarea></div>
      <div class="f-cta"><button class="btn btn--field btn--block" data-submit disabled>Submit shift report</button></div>
    </div>`;
  },
  mount(root) {
    const btn = root.querySelector('[data-submit]'); if (!btn) return;
    const upd = () => { btn.disabled = [...root.querySelectorAll('[data-c]')].some((c) => !c.checked); };
    on(root, '[data-c]', 'change', upd); upd();
    on(root, '[data-submit]', 'click', () => {
      const s = store.get();
      actions.endShift({ stops: doneCount(s), tons: s.route.tips.reduce((a, t) => a + parseFloat(t.tons), 0).toFixed(1), actual: '3h 34m', notes: root.querySelector('#sh-notes').value.trim() });
      toast('Shift report sent to fleet');
    });
  },
};

// ---------------------------------------------------------------------------
const PROBLEMS = [['Vehicle issue', 'wrench'], ['Blocked access', 'x'], ['Road hazard', 'alert'], ['Accident', 'alert-octagon'], ['Traffic delay', 'clock'], ['Other', 'more']];
const report = {
  tabs: false, live: false,
  render: ({ query, state }) => {
    const pre = query.get('type');
    const st = currentStop(state);
    return `${appbar({ title: 'Report a problem', back: R + 'drive' })}
    <div class="f-page stack" style="--gap:18px">
      <p class="t-muted">Goes straight to your fleet manager with your location${st ? ` near ${esc(st.address)}` : ''}.</p>
      <div class="choice-grid">${PROBLEMS.map(([t, ic]) => `<label class="choice choice--tile"><input type="radio" name="p" value="${t}" ${t === pre ? 'checked' : ''}><span class="choice__icon">${icon(ic)}</span><span class="t-title">${t}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}</div>
      <div class="field"><span class="label">How serious?</span><div class="segmented" role="radiogroup">${[['Low', 'Can wait'], ['Medium', 'Slowing us'], ['High', 'Unsafe / stopped']].map(([s, l], i) => `<button role="radio" aria-checked="${i === 1}" aria-selected="${i === 1}" data-sev="${s}">${l}</button>`).join('')}</div></div>
      <div class="field"><label class="label" for="rp-n">Details</label><textarea class="textarea" id="rp-n" placeholder="Tap the mic to dictate"></textarea></div>
      <button class="btn btn--neutral btn--block btn--field" data-photo>${icon('camera')}Add photo</button>
      <div class="f-cta"><button class="btn btn--field btn--block" data-send disabled>Send to fleet</button></div>
    </div>`;
  },
  mount(root, { go }) {
    const btn = root.querySelector('[data-send]');
    const upd = () => { btn.disabled = !root.querySelector('input[name=p]:checked'); };
    upd();
    on(root, 'input[name=p]', 'change', upd);
    on(root, '[data-photo]', 'click', (e, b) => { b.innerHTML = `${icon('check')}Photo attached`; b.classList.add('btn--ok'); });
    on(root, '[data-sev]', 'click', (e, b) => root.querySelectorAll('[data-sev]').forEach((x) => { x.setAttribute('aria-selected', x === b); x.setAttribute('aria-checked', x === b); }));
    on(root, '[data-send]', 'click', () => {
      const t = root.querySelector('input[name=p]:checked').value;
      const sev = root.querySelector('[data-sev][aria-selected=true]').dataset.sev;
      actions.report('Driver', t, sev, root.querySelector('#rp-n').value || `${t} reported from the cab.`);
      actions.sendMessage('driver', `Reported to fleet: ${t} (${sev}).`);
      toast('Sent — your fleet manager can see it now');
      go(R + 'drive');
    });
  },
};

export default {
  label: 'Driver', product: 'Driver · In-cab', theme: 'dark',
  user: { name: 'Stan Pietro', title: 'Driver · Truck 0091', img: 'persona-driver.jpg' },
  start: (s) => (!s.onboarded.driver ? 'login' : s.route.acknowledged ? 'drive' : 'route'),
  tabs,
  index: [['Sign in', 'login'], ['Pre-trip inspection', 'pretrip'], ['Route briefing', 'route'], ['Navigation', 'drive'], ['Stops', 'stops'], ['Crew channel', 'messages'], ['Truck & breaks', 'vehicle'], ['Tip run', 'unload'], ['End of shift', 'shift'], ['Report a problem', 'report']],
  screens: { login, pretrip, route, drive, stops, messages: messagesScreen('driver'), vehicle, unload, shift, report },
};
