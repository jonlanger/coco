// Collector app — in-the-moment guidance: right items, right location,
// compliance confirmed, without slowing the truck down.
import { store, actions, currentStop, currentStopIndex, stopById, doneCount } from './store.js';
import { icon, esc, img, chip, statusChip, appbar, stepper, avatar, greeting, toast, on } from './ui.js';
import { miniMap } from './map.js';
import { messagesScreen } from './shared.js';

const R = '#/';

const tabs = (s) => [
  { key: 'queue', href: R + 'queue', icon: 'list', label: 'Queue' },
  { key: 'scan', href: R + 'scan/' + (currentStop(s)?.id || ''), icon: 'scan', label: 'Scan' },
  { key: 'messages', href: R + 'messages', icon: 'message', label: 'Crew', badge: s.unread.collector || 0 },
  { key: 'me', href: R + 'me', icon: 'award', label: 'Me' },
];

// ---------------------------------------------------------------------------
// Onboarding: info → compliance → collection info → field ready
// ---------------------------------------------------------------------------
const OB = ['Personal information', 'Compliance & safety', 'Collection info'];
const onboard = {
  tabs: false, live: false,
  render({ params }) {
    const n = Math.max(1, Math.min(3, +params[0] || 1));
    const body = [
      `<div class="row" style="--gap:14px">${avatar(img('persona-collector.jpg'), 'Miguel Sorano', 'lg')}<button class="btn btn--sm btn--outline" type="button">${icon('camera')}Update photo</button></div>
       <div class="field"><label class="label" for="c1">Full name</label><input class="input" id="c1" value="Miguel Sorano"></div>
       <div class="field"><label class="label" for="c2">Employee ID</label><input class="input" id="c2" value="C-31188"></div>
       <div class="field"><label class="label" for="c3">Emergency contact</label><input class="input" id="c3" value="Ana Sorano · (617) 555-0199"></div>`,
      `<p class="t-muted">Confirm your certifications. Expired items block hazardous stops until renewed.</p>
       <div class="stack" style="--gap:10px">
        ${[['PPE issued — gloves, vest, boots', 'hardhat', 'ok'], ['Safe lifting & ergonomics', 'weight', 'ok'], ['Hazardous materials awareness', 'alert-octagon', 'ok'], ['Sharps & needle handling', 'shield', 'warn']].map(([t, ic, st]) => `<label class="choice"><input type="checkbox" ${st === 'ok' ? 'checked' : ''}><span class="choice__icon">${icon(ic)}</span><span class="grow"><span class="t-title" style="display:block">${t}</span><span class="t-xs" style="color:var(--${st}-soft-ink)">${st === 'ok' ? 'Valid through Mar 2027' : 'Renewal due in 14 days'}</span></span><span class="choice__check">${icon('check')}</span></label>`).join('')}
       </div>`,
      `<div class="field"><label class="label" for="c4">Home territory</label><select class="select" id="c4"><option>Back Bay</option><option>Beacon Hill</option><option>South Boston</option></select></div>
       <div class="field"><label class="label" for="c5">Default truck</label><select class="select" id="c5"><option>Truck 0091 · Stan Pietro</option></select></div>
       <div class="field"><span class="label">Shift</span><div class="segmented"><button type="button" aria-selected="true">Early 6–2</button><button type="button" aria-selected="false">Day 7:30–4</button></div></div>`,
    ][n - 1];
    return `<div class="f-page">
      <div class="row" style="--gap:12px;padding-top:8px"><a class="icon-btn icon-btn--ghost" href="${n === 1 ? '../login/' : R + 'onboard/' + (n - 1)}" aria-label="Back">${icon('chevron-left')}</a><div class="grow">${stepper(n, 3)}</div><span class="t-sm t-subtle t-num">${n}/3</span></div>
      <p class="t-eyebrow" style="margin-top:24px;color:var(--accent-text)">Collector onboarding</p>
      <h1 class="t-h1" style="margin:6px 0 20px">${OB[n - 1]}</h1>
      <form class="stack" style="--gap:18px" data-form>${body}<button class="btn btn--field btn--block" style="margin-top:8px">${n === 3 ? 'Finish' : 'Continue'}</button></form>
    </div>`;
  },
  mount(root, { params, go }) {
    const n = +params[0] || 1;
    on(root, '.segmented button', 'click', (e, b) => b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)));
    root.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      if (n < 3) go(R + 'onboard/' + (n + 1));
      else { store.update((s) => { s.onboarded.collector = true; }, { silent: true }); go(R + 'ready'); }
    });
  },
};

const ready = {
  tabs: false,
  render: () => `<div class="f-page c-success">
    <div class="c-success__badge">${icon('shield-check', 'ico--xl')}</div>
    <h1 class="t-h1">Field ready</h1>
    <p class="t-muted">You're certified for residential, commercial and bulk stops. Sharps renewal is due in 14 days — we'll remind you.</p>
    <div class="card stack" style="--gap:10px;width:100%;text-align:left"><p class="t-eyebrow">Rewards</p><p class="t-title">Earn 10 points per compliant pickup</p><p class="t-sm t-subtle">Bonus for zero-incident weeks. Redeem for PTO hours and gear.</p></div>
    <a class="btn btn--field btn--block" href="${R}queue">See today's queue</a>
  </div>`,
};

// ---------------------------------------------------------------------------
const queue = {
  tab: 'queue',
  render({ state }) {
    const r = state.route;
    const idx = currentStopIndex(state);
    const st = currentStop(state);
    const done = doneCount(state);
    const truckHere = st && r.arrivedAt === st.id;
    return `${appbar({ menu: true, logo: true, right: `<span class="chip chip--info-soft">${icon('star')}${state.points}</span>` })}
    <div class="f-page stack" style="--gap:18px">
      <div><p class="t-muted">${greeting()},</p><h1 class="t-h1">Miguel</h1></div>
      <div class="card stack" style="--gap:12px">
        <div class="row row--between"><span class="t-title">${r.truck} · ${r.territory}</span><span class="t-sm t-subtle t-num">${done}/${r.stops.length}</span></div>
        <div class="progress progress--ok"><span style="width:${(done / r.stops.length) * 100}%"></span></div>
        <div class="row row--between t-sm t-subtle"><span>${r.acknowledged ? 'Route in progress' : 'Waiting for driver to start'}</span><span>Driver: ${esc(r.driver)}</span></div>
      </div>
      <div class="f-duo"><div class="stack" style="--gap:18px">
      ${state.areas.filter((a) => a.kind === 'hazmat' || a.kind === 'closure').map((a) => `<div class="alert alert--${a.kind === 'hazmat' ? 'warn' : 'danger'}">${icon(a.kind === 'hazmat' ? 'alert-octagon' : 'x')}<div><strong>${a.kind === 'hazmat' ? 'Hazard zone' : 'Road closure'} · ${esc(a.name)}</strong>${a.kind === 'hazmat' ? 'Hazmat PPE required. Do not handle unknown containers.' : 'Your driver has the updated route.'}</div></div>`).join('')}
      ${truckHere ? `<div class="alert alert--ok f-pulse">${icon('truck')}<div><strong>Truck is at stop ${idx + 1}</strong>${esc(st.address)} — scan the bin to confirm.</div></div>` : ''}
      ${st ? `
        <a class="card card--interactive f-next" href="${R}stop/${st.id}">
          <div class="row row--between"><span class="t-eyebrow">Next stop · ${idx + 1}</span>${statusChip(truckHere ? 'here' : 'ready', '', truckHere ? 'Truck here' : undefined)}</div>
          <p class="t-muted" style="margin-top:12px">${esc(st.name)}</p>
          <p class="f-next__addr">${esc(st.address)}</p>
          <div class="row row--wrap" style="--gap:8px">${chip('outline', st.bin + ' · ' + st.size, 'check')}${st.extra ? chip('warn-soft', st.extra, 'box') : ''}${st.type === 'recycling' ? chip('info-soft', 'Recycling', 'recycle') : ''}</div>
          <div class="row" style="--gap:10px;margin-top:16px"><span class="btn btn--field grow">${icon('scan')}Scan bin</span></div>
        </a>` : `<div class="card stack center" style="--gap:10px;text-align:center;padding:32px"><span class="f-empty" style="background:var(--ok);color:var(--ok-ink)">${icon('check', 'ico--xl')}</span><p class="t-h3">Queue complete</p><p class="t-muted">${done} pickups · +${done * 10} points today</p></div>`}
      </div>
      <section class="stack" style="--gap:12px"><h2 class="t-title">Full collection queue</h2>
        <ol class="timeline">
          ${r.stops.map((s, i) => {
            const k = s.status === 'done' ? 'done' : s.status === 'issue' ? 'issue' : i === idx ? 'current' : 'todo';
            return `<li class="timeline__item timeline__item--${k}"><span class="timeline__node">${k === 'done' ? icon('check') : k === 'issue' ? icon('alert') : i + 1}</span><a class="timeline__body f-stop" href="${R}stop/${s.id}"><span class="timeline__title">${esc(s.address)}</span><span class="timeline__meta">${esc(s.name)} · ${s.bin}${s.completedAt ? ' · ' + s.completedAt : ''}</span></a></li>`;
          }).join('')}
        </ol>
      </section></div>
    </div>`;
  },
};

// ---------------------------------------------------------------------------
const stop = {
  tabs: false,
  render({ state, params }) {
    const s = stopById(params[0], state) || currentStop(state);
    if (!s) return '';
    const done = s.status === 'done', issue = s.status === 'issue';
    const truckHere = state.route.arrivedAt === s.id;
    return `${appbar({ back: R + 'queue', logo: true })}
    <div class="f-page stack" style="--gap:16px">
      <div class="card card--xl stack" style="--gap:12px">
        ${done ? chip('ok', 'Collection Pick Up Success', 'check', 'lg') : issue ? chip('danger', s.problem, 'alert', 'lg') : truckHere ? chip('info', 'Truck at stop', 'truck', 'lg') : chip('ok', 'Ready for Pick Up', 'check', 'lg')}
        <p class="t-title">${esc(s.name)}</p>
        <p class="f-next__addr" style="font-size:1.875rem">${esc(s.address)}</p>
        <div class="map f-profile-map">${miniMap(s.gx, s.gy)}</div>
      </div>
      <div class="card stack" style="--gap:12px">
        <p class="t-title">Key items</p>
        <div class="row" style="--gap:12px"><img class="f-thumb" src="${img(s.bin === 'Dumpster' ? 'dumpster.jpg' : 'bin.jpg')}" alt=""><div class="grow"><p class="t-title">${s.bin}</p><p class="t-sm t-subtle">${s.size} · ${s.barcode}</p></div>${chip('outline', 'Tagged', 'check')}</div>
        ${s.extra ? `<div class="row" style="--gap:12px"><img class="f-thumb" src="${img('house-bags.jpg')}" alt=""><div class="grow"><p class="t-title">Bulk add-on</p><p class="t-sm t-subtle">${esc(s.extra)} · customer photo</p></div>${chip('warn-soft', 'Extra', 'box')}</div>` : ''}
        ${s.notes ? `<div class="alert">${icon('info')}<div>${esc(s.notes)}</div></div>` : ''}
      </div>
      ${!done && !issue ? `
        <div class="f-cta stack" style="--gap:10px">
          <a class="btn btn--field btn--block" href="${R}scan/${s.id}">${icon('scan')}Scan bin barcode</a>
          <a class="btn btn--field btn--block btn--outline" href="${R}problem/${s.id}">${icon('alert')}Report a problem</a>
        </div>` : ''}
      <section class="stack" style="--gap:8px"><p class="t-title">Pickup history at this address</p>
        <div class="list">${[['Last week', '31 lbs · photo on file', true], ['2 weeks ago', '28 lbs · photo on file', true], ['3 weeks ago', s.customer ? 'Gate locked · credited' : '33 lbs · photo on file', !s.customer]].map(([d, m, ok]) => `<div class="list-item"><span class="list-item__icon" style="${ok ? 'background:var(--ok-soft);color:var(--ok-soft-ink)' : 'background:var(--danger-soft);color:var(--danger-soft-ink)'}">${icon(ok ? 'check' : 'alert')}</span><span class="list-item__body"><span class="list-item__title" style="display:block">${d}</span><span class="list-item__meta">${m}</span></span></div>`).join('')}</div>
      </section>
    </div>`;
  },
};

// ---------------------------------------------------------------------------
const scan = {
  tabs: false, live: false,
  render({ state, params }) {
    const s = stopById(params[0], state) || currentStop(state);
    if (!s) return `${appbar({ back: R + 'queue', title: 'Scan' })}<div class="f-page"><p class="t-muted">No stops left to scan.</p></div>`;
    return `<div class="f-scan">
      <img class="f-scan__cam" src="${img('bin-barcode.jpg')}" alt="Camera view of a bin lid barcode">
      <div class="f-scan__top">${appbar({ back: R + 'stop/' + s.id, transparent: true, title: '' })}</div>
      <div class="f-scan__frame" data-frame><span></span><i class="f-scan__line"></i></div>
      <div class="f-scan__panel stack" style="--gap:12px" data-panel>
        <p class="t-title row" style="--gap:10px"><span class="spinner" style="color:var(--accent-text)"></span>Align barcode inside the frame</p>
        <p class="t-sm t-subtle">Expecting ${s.barcode} · ${esc(s.address)}</p>
        <button class="btn btn--ghost" data-manual>Enter code manually</button>
      </div>
    </div>`;
  },
  mount(root, { params, go, state }) {
    const s = stopById(params[0], state) || currentStop(state);
    if (!s) return;
    const done = () => {
      root.querySelector('[data-frame]')?.classList.add('is-ok');
      root.querySelector('[data-panel]').innerHTML = `
        ${chip('ok', 'Bin verified', 'check', 'lg')}
        <p class="t-h3">${s.barcode}</p><p class="t-sm t-subtle">${esc(s.name)} · ${esc(s.address)} · ${s.bin} ${s.size}</p>
        <a class="btn btn--field btn--block" href="${R}confirm/${s.id}">Continue${icon('arrow-right')}</a>`;
      navigator.vibrate?.(40);
      actions.collectorPhase('scanned');
    };
    const t = setTimeout(done, 1800);
    on(root, '[data-manual]', 'click', () => { clearTimeout(t); done(); });
    return () => clearTimeout(t);
  },
};

const confirm = {
  tabs: false, live: false,
  render({ state, params }) {
    const s = stopById(params[0], state);
    const items = [['Correct bin for this address', true], ['No hazardous materials visible', false], [s.type === 'recycling' ? 'Recycling is not contaminated' : 'No loose overflow left behind', false], ['Bin returned upright, lid closed', false]];
    return `${appbar({ back: R + 'stop/' + s.id, title: 'Confirm pickup' })}
    <div class="f-page stack" style="--gap:16px">
      <div class="card row" style="--gap:12px"><span class="list-item__icon">${icon('pin')}</span><div class="grow"><p class="t-title">${esc(s.address)}</p><p class="t-sm t-subtle">${esc(s.name)}</p></div>${chip('ok-soft', 'Scanned', 'check')}</div>
      <div class="card stack" style="--gap:4px"><p class="t-title" style="margin-bottom:6px">Compliance checklist</p>
        ${items.map(([t, c]) => `<label class="check f-check-row"><input type="checkbox" data-c ${c ? 'checked' : ''}><span class="check__box">${icon('check')}</span>${t}</label>`).join('')}
      </div>
      <button class="c-photo f-photo" data-photo type="button"><span class="c-photo__empty">${icon('camera', 'ico--xl')}<span class="t-title">Photo proof</span><span class="t-sm t-subtle">Required · sent to customer</span></span></button>
      <div class="card card--flat row row--between"><span class="t-muted">Estimated weight</span><span class="row" style="--gap:8px"><strong class="t-h3 t-num">${s.extra ? 44 : 31} lbs</strong>${chip('ok-soft', 'Normal', '')}</span></div>
      <div class="f-cta stack" style="--gap:10px">
        <button class="btn btn--field btn--block btn--ok" data-done disabled>${icon('check')}Complete pickup</button>
        <a class="btn btn--ghost btn--block" href="${R}problem/${s.id}">Something's wrong</a>
      </div>
    </div>`;
  },
  mount(root, { params, go }) {
    const btn = root.querySelector('[data-done]');
    let photo = false;
    const upd = () => {
      btn.disabled = !(photo && [...root.querySelectorAll('[data-c]')].every((c) => c.checked));
      if (!btn.disabled && store.get().route.phase !== 'checked') actions.collectorPhase('checked');
    };
    on(root, '[data-c]', 'change', upd);
    on(root, '[data-photo]', 'click', (e, b) => { photo = true; b.classList.add('has-photo'); b.innerHTML = `<img src="${img('house-bin.jpg')}" alt="Proof photo"><span class="chip chip--ok c-photo__chip">${icon('check')}Photo captured</span>`; upd(); });
    on(root, '[data-done]', 'click', () => { actions.completeStop(params[0], { compliant: true }); go(R + 'success/' + params[0]); });
  },
};

const success = {
  tabs: false,
  render({ state, params }) {
    const s = stopById(params[0], state);
    const next = currentStop(state);
    return `<div class="f-page c-success">
      <div class="c-success__badge">${icon('check', 'ico--xl')}</div>
      ${chip('ok', 'Collection Pick Up Success', 'check', 'lg')}
      <p class="f-next__addr" style="text-align:center">${esc(s.address)}</p>
      <p class="t-muted">${s.customer ? 'Meredith just got a notification with your photo.' : 'Customer notified with photo proof.'}</p>
      <div class="card row" style="--gap:12px;width:100%"><span class="list-item__icon" style="background:var(--warn-soft);color:var(--warn-soft-ink)">${icon('star')}</span><div class="grow" style="text-align:left"><p class="t-title">+10 points</p><p class="t-sm t-subtle">${state.points} total · 7-day clean streak</p></div></div>
      ${next ? `<a class="btn btn--field btn--block" href="${R}stop/${next.id}">Next: ${esc(next.address)}${icon('arrow-right')}</a>` : `<a class="btn btn--field btn--block" href="${R}queue">Back to queue</a>`}
      <a class="btn btn--ghost btn--block" href="${R}queue">View queue</a>
    </div>`;
  },
};

const PROBLEMS = [['Contaminated recycling', 'recycle'], ['Hazardous item', 'alert-octagon'], ['Overweight / overflow', 'weight'], ['Bin not out', 'bin'], ['Blocked access', 'x'], ['Damaged bin', 'wrench']];
const problem = {
  tabs: false, live: false,
  render: ({ state, params }) => {
    const s = stopById(params[0], state);
    return `${appbar({ back: R + 'stop/' + s.id, title: 'Problem items' })}
    <div class="f-page stack" style="--gap:18px">
      <p class="t-muted">${esc(s.address)} · ${esc(s.name)}</p>
      <div class="choice-grid">${PROBLEMS.map(([t, ic]) => `<label class="choice choice--tile"><input type="radio" name="p" value="${t}"><span class="choice__icon">${icon(ic)}</span><span class="t-title">${t}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}</div>
      <div class="alert alert--warn" data-haz hidden>${icon('alert-octagon')}<div><strong>Do not handle</strong>Leave the item, photograph it, and step back. A certified hazmat crew will be dispatched.</div></div>
      <div class="field"><label class="label" for="pb-n">Notes</label><textarea class="textarea" id="pb-n" placeholder="What did you see?"></textarea></div>
      <button class="btn btn--neutral btn--block">${icon('camera')}Add photo</button>
      <div class="f-cta"><button class="btn btn--field btn--block btn--danger" data-send disabled>Flag & notify</button></div>
    </div>`;
  },
  mount(root, { params, go }) {
    const btn = root.querySelector('[data-send]');
    on(root, 'input[name=p]', 'change', (e, i) => { btn.disabled = false; root.querySelector('[data-haz]').hidden = i.value !== 'Hazardous item'; });
    on(root, '[data-send]', 'click', () => {
      const p = root.querySelector('input[name=p]:checked').value;
      actions.flagStop(params[0], p, root.querySelector('#pb-n').value);
      toast('Flagged — customer, driver and fleet notified');
      go(R + 'queue');
    });
  },
};

// ---------------------------------------------------------------------------
const me = {
  tab: 'me',
  render({ state }) {
    const done = doneCount(state);
    const lvl = Math.min(100, ((state.points % 500) / 500) * 100);
    return `${appbar({ title: 'My performance' })}
    <div class="f-page stack" style="--gap:16px">
      <div class="row" style="--gap:14px">${avatar(img('persona-collector.jpg'), 'Miguel Sorano', 'lg')}<div><p class="t-h3">Miguel Sorano</p><p class="t-sm t-subtle">Collector · Back Bay · Level 3</p></div></div>
      <div class="card card--brand stack" style="--gap:10px"><div class="row row--between"><span class="t-eyebrow" style="color:inherit;opacity:.85">Rewards</span>${icon('award', 'ico--lg')}</div><p class="t-metric">${state.points}</p><div class="progress" style="background:rgb(255 255 255 / .3)"><span style="width:${lvl}%;background:currentColor"></span></div><p class="t-sm" style="opacity:.85">${500 - (state.points % 500)} points to Level 4 · 4 PTO hours</p></div>
      <div class="f-gauges">
        <div class="card metric"><span class="metric__label">Pickups today</span><span class="metric__value">${done}</span></div>
        <div class="card metric"><span class="metric__label">Compliance</span><span class="metric__value">99%</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}2% vs last mo.</span></div>
        <div class="card metric"><span class="metric__label">Days incident-free</span><span class="metric__value">412</span></div>
        <div class="card metric"><span class="metric__label">Avg. stop time</span><span class="metric__value">1:48</span><span class="metric__delta metric__delta--up">${icon('arrow-up')}12s faster</span></div>
      </div>
      <h2 class="t-title">Certifications</h2>
      <div class="list">${[['PPE', 'ok'], ['Safe lifting', 'ok'], ['Hazmat awareness', 'ok'], ['Sharps handling', 'warn']].map(([t, k]) => `<div class="list-item"><span class="list-item__icon">${icon('shield-check')}</span><span class="list-item__body"><span class="list-item__title" style="display:block">${t}</span>${k === 'warn' ? `<span class="list-item__meta">${state.training?.['Miguel Sorano'] ? 'Recertification booked · ' + esc(state.training['Miguel Sorano']) + ', Back Bay depot' : 'Expires in 14 days — your manager will book a session'}</span>` : ''}</span>${k === 'ok' ? chip('ok-soft', 'Valid', 'check') : state.training?.['Miguel Sorano'] ? chip('ok-soft', 'Booked', 'calendar') : chip('warn-soft', 'Renew in 14d', 'clock')}</div>`).join('')}</div>
      <h2 class="t-title">My reports</h2>
      ${(() => { const mine = state.incidents.filter((i) => i.role === 'Collector' && i.from === state.route.truck); return mine.length ? `<div class="list">${mine.map((i) => `<div class="list-item"><span class="list-item__icon">${icon('flag')}</span><span class="list-item__body"><span class="list-item__title" style="display:block">${esc(i.title)}</span><span class="list-item__meta">${i.at} · ${i.status === 'resolved' ? 'Resolved by fleet' : i.status === 'open' ? 'Sent to fleet' : 'Fleet is working on it'}</span></span>${i.status === 'resolved' ? chip('ok-soft', 'Resolved', 'check') : chip('info-soft', i.status === 'open' ? 'Sent' : 'In progress', 'clock')}</div>`).join('')}</div>` : '<p class="t-sm t-subtle">Problems you flag at stops show up here with fleet’s response.</p>'; })()}
      <a class="btn btn--field btn--block btn--neutral" href="../login/">${icon('logout')}Sign out</a>
    </div>`;
  },
};

export default {
  label: 'Collector', product: 'Collector · Field', theme: 'dark',
  user: { name: 'Miguel Sorano', title: 'Collector · Back Bay', img: 'persona-collector.jpg' },
  start: (s) => (s.onboarded.collector ? 'queue' : 'onboard/1'),
  tabs,
  index: [['Onboarding', 'onboard/1'], ['Field ready', 'ready'], ['Collection queue', 'queue'], ['Customer profile', 'stop/s6'], ['Barcode scan', 'scan/s6'], ['Compliance confirm', 'confirm/s6'], ['Problem items', 'problem/s6'], ['Crew channel', 'messages'], ['Performance & rewards', 'me']],
  screens: { onboard, ready, queue, stop, scan, confirm, success, problem, messages: messagesScreen('collector'), me },
};
