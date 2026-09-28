// Customer app — the pickup loop: request → confirm → track → complete.
import { store, actions, customerPickupState, currentStopIndex } from './store.js';
import { icon, esc, img, chip, statusChip, appbar, stepper, avatar, fmtDate, isToday, greeting, toast, sheet, on } from './ui.js';
import { routeMap, miniMap } from './map.js';

const R = '#/';

// Request-flow draft (in-memory; resets on each new request)
let draft = null;
const newDraft = () => ({ kind: 'One-time', waste: 'general', bins: 1, photo: false, notes: '', date: null, window: 'Morning', placement: 'Curbside' });

const WASTE = {
  general: { label: 'General home trash', icon: 'trash', price: 0 },
  recycling: { label: 'Recycling', icon: 'recycle', price: 0 },
  bulk: { label: 'Bulk item', icon: 'sofa', price: 35 },
  yard: { label: 'Yard waste', icon: 'leaf', price: 15 },
  ewaste: { label: 'Electronics', icon: 'battery', price: 20 },
  hazard: { label: 'Hazardous', icon: 'alert-octagon', price: 45 },
};
const WINDOWS = { Morning: '7 – 11 AM', Midday: '11 AM – 3 PM', Afternoon: '3 – 6 PM' };

const tabs = (active) => [
  { key: 'home', href: R + 'home', icon: 'home', label: 'Home' },
  { key: 'pickups', href: R + 'pickups', icon: 'calendar', label: 'Pickups' },
  { key: 'request', href: R + 'request/1', icon: 'plus', label: 'Request', fab: true },
  { key: 'track', href: R + 'track', icon: 'pin', label: 'Track' },
  { key: 'account', href: R + 'account', icon: 'user', label: 'Account' },
];

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------
const welcome = {
  tabs: false,
  render: () => `
    <div class="c-welcome">
      <div class="c-welcome__top">
        <div class="c-welcome__mark">CoCo</div>
        <p class="c-welcome__tag">Combination<br>Collection<br>Services</p>
      </div>
      <img class="c-welcome__art" src="${img('truck-iso.jpg')}" alt="">
      <div class="c-welcome__actions stack" style="--gap:12px">
        <a class="btn btn--lg btn--block c-btn-white" href="${R}onboard/1">Let's get started</a>
        <a class="btn btn--lg btn--block c-btn-glass" href="${R}home" data-signin>Sign in</a>
        <p class="t-xs" style="opacity:.8;text-align:center">All services comply with state and local regulations.</p>
      </div>
    </div>`,
  mount(root) {
    on(root, '[data-signin]', 'click', () => store.update((s) => { s.onboarded.customer = true; }));
  },
};

const ONBOARD_TITLES = ['Create your account', 'Where do we pick up?', 'Choose your service', 'Payment'];

const onboard = {
  tabs: false, live: false,
  render({ params, state }) {
    const n = Math.max(1, Math.min(4, +params[0] || 1));
    const c = state.customer;
    let body = '';
    if (n === 1) body = `
      <div class="field"><label class="label" for="f-name">Full name</label><input class="input" id="f-name" value="${esc(c.name)}" autocomplete="name"></div>
      <div class="field"><label class="label" for="f-email">Email</label><input class="input" id="f-email" type="email" value="${esc(c.email)}" autocomplete="email"></div>
      <div class="field"><label class="label" for="f-phone">Mobile number</label><input class="input" id="f-phone" type="tel" value="${esc(c.phone)}" autocomplete="tel"><span class="hint">We text you when the truck is nearby — nothing else.</span></div>`;
    if (n === 2) body = `
      <div class="field"><label class="label" for="f-addr">Service address</label>
        <div class="input-group">${icon('search')}<input class="input" id="f-addr" value="${esc(c.address + ', ' + c.city)}" autocomplete="street-address"></div></div>
      <div class="map c-mini-map">${miniMap()}</div>
      <fieldset class="stack" style="--gap:10px;border:0;padding:0"><legend class="label" style="margin-bottom:10px">Where will your bins be?</legend>
        <div class="choice-grid">
          ${['Curbside', 'Side gate', 'Driveway', 'Alley'].map((p) => `<label class="choice"><input type="radio" name="place" value="${p}" ${p === c.placement ? 'checked' : ''}><span class="t-title">${p}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
        </div></fieldset>
      <div class="field"><label class="label" for="f-gate">Access notes <span class="t-subtle">(optional)</span></label><input class="input" id="f-gate" value="Gate code 2140"></div>`;
    if (n === 3) body = `
      <div class="stack" style="--gap:10px">
        ${[['weekly', 'Weekly trash + recycling', 'Thursdays · 2 bins included', '$38/mo', true], ['trash', 'Weekly trash only', 'Thursdays · 1 bin', '$26/mo'], ['ondemand', 'On-demand only', 'Book pickups as you need them', 'from $18']].map(([v, t, d, p, ch]) => `
          <label class="choice"><input type="radio" name="plan" value="${v}" ${ch ? 'checked' : ''}>
            <span class="choice__icon">${icon(v === 'ondemand' ? 'calendar' : 'repeat')}</span>
            <span class="grow"><span class="t-title" style="display:block">${t}</span><span class="t-sm t-subtle">${d}</span></span>
            <span class="t-sm" style="font-weight:700">${p}</span></label>`).join('')}
      </div>
      <div class="card card--sunken stack" style="--gap:12px">
        <p class="label">Bins</p>
        ${[['Trash · 96 gal', 1], ['Recycling · 64 gal', 1]].map(([l, q]) => `
          <div class="row row--between"><span class="row" style="--gap:10px">${icon(l.startsWith('T') ? 'bin' : 'recycle')} ${l}</span>
            <span class="c-qty"><button class="icon-btn icon-btn--sm" data-qty="-1" aria-label="Fewer">${icon('minus')}</button><output>${q}</output><button class="icon-btn icon-btn--sm" data-qty="1" aria-label="More">${icon('plus')}</button></span></div>`).join('')}
        <p class="hint">Each bin has a CoCo barcode so your crew can confirm the right pickup.</p>
      </div>`;
    if (n === 4) body = `
      <div class="stack" style="--gap:10px">
        <label class="choice"><input type="radio" name="pay" checked><span class="choice__icon">${icon('card')}</span><span class="grow"><span class="t-title" style="display:block">Visa •••• 6411</span><span class="t-sm t-subtle">Expires 08/28</span></span><span class="choice__check">${icon('check')}</span></label>
        <button class="choice" type="button"><span class="choice__icon">${icon('plus')}</span><span class="t-title">Add a payment method</span></button>
      </div>
      <div class="row row--between card card--flat"><span><span class="t-title" style="display:block">Autopay</span><span class="t-sm t-subtle">Billed on the 1st of each month</span></span><span class="toggle"><input type="checkbox" checked aria-label="Autopay"><span></span></span></div>
      <div class="card card--sunken stack" style="--gap:8px">
        <div class="row row--between t-sm"><span class="t-muted">Weekly trash + recycling</span><span>$38.00</span></div>
        <div class="row row--between t-sm"><span class="t-muted">Bin delivery</span><span class="t-accent" style="font-weight:700">Free</span></div>
        <hr class="divider"><div class="row row--between"><strong>Due today</strong><strong>$0.00</strong></div>
        <p class="hint">First charge on the 1st. Cancel anytime.</p>
      </div>`;
    return `
      <div class="c-page">
        <div class="row" style="--gap:12px;padding-top:8px">
          <a class="icon-btn icon-btn--ghost" href="${n === 1 ? R + 'welcome' : R + 'onboard/' + (n - 1)}" aria-label="Back">${icon('chevron-left')}</a>
          <div class="grow">${stepper(n, 4)}</div>
          <span class="t-sm t-subtle t-num">${n}/4</span>
        </div>
        <h1 class="t-h1 t-accent" style="margin:24px 0 20px">${ONBOARD_TITLES[n - 1]}</h1>
        <form class="stack" style="--gap:18px" data-form>
          ${body}
          <button class="btn btn--lg btn--block" type="submit" style="margin-top:8px">${n === 4 ? 'Start service' : 'Continue'}</button>
        </form>
      </div>`;
  },
  mount(root, { params, go }) {
    const n = +params[0] || 1;
    on(root, '[data-qty]', 'click', (e, b) => {
      e.preventDefault();
      const o = b.parentElement.querySelector('output');
      o.textContent = Math.max(0, Math.min(4, +o.textContent + +b.dataset.qty));
    });
    root.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      if (n === 1) store.update((s) => { s.customer.name = root.querySelector('#f-name').value || s.customer.name; s.customer.first = s.customer.name.split(' ')[0]; }, { silent: true });
      if (n === 2) { const p = root.querySelector('input[name=place]:checked'); if (p) store.update((s) => { s.customer.placement = p.value; }, { silent: true }); }
      if (n < 4) go(R + 'onboard/' + (n + 1));
      else { store.update((s) => { s.onboarded.customer = true; }, { silent: true }); go(R + 'onboard-done'); }
    });
  },
};

const onboardDone = {
  tabs: false,
  render: ({ state }) => {
    const p = state.pickups[0];
    return `<div class="c-page c-success">
      <div class="c-success__badge">${icon('check', 'ico--xl')}</div>
      <h1 class="t-h1">You're all set, ${esc(state.customer.first)}.</h1>
      <p class="t-muted">Your bins arrive tomorrow. Your first pickup is already on the calendar — we'll remind you the night before.</p>
      <div class="card stack" style="--gap:12px;text-align:left;width:100%">
        <span class="t-eyebrow">First pickup</span>
        <div class="row row--between"><strong class="t-h3">${fmtDate(p.date, { weekday: 'long', month: 'long', day: 'numeric' })}</strong></div>
        <div class="row row--wrap" style="--gap:8px">${chip('ok', p.window, 'clock')}${chip('outline', 'Trash + Recycling', 'check')}</div>
      </div>
      <a class="btn btn--lg btn--block" href="${R}home">Go to my home</a>
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
const bell = (state) => `<a class="icon-btn icon-btn--ghost" href="${R}notifications" aria-label="Notifications${state.unread.customer ? `, ${state.unread.customer} new` : ''}" style="position:relative">${icon('bell')}${state.unread.customer ? `<span class="badge" style="position:absolute;top:4px;right:2px">${state.unread.customer}</span>` : ''}</a>`;

function pickupHero(state) {
  const ps = customerPickupState(state);
  const p = state.pickups.find((x) => x.id === 'p-today');
  const map = { scheduled: `Today, ${p.window.replace(/\s/g, '')}`, enroute: `${ps.away} stops away`, nearby: 'Next stop is you', here: 'Crew is at your address', collected: 'Picked up', issue: 'Needs attention', rescheduled: 'Rescheduled' };
  const sub = {
    scheduled: `Crew starts at 8:00 AM · Bins out by ${p.window.split('–')[0].trim()}`,
    enroute: `Estimated arrival ${ps.eta}`,
    nearby: 'Truck is one stop away — about 7 min',
    here: ps.phase === 'checked' ? 'Bin emptied · taking your photo proof' : ps.phase === 'scanned' ? 'Your bin has been scanned · emptying now' : 'Your crew has arrived',
    collected: `Collected at ${ps.at} · In compliance`,
    issue: ps.note ? ps.note : ps.problem ? `Crew flagged: ${ps.problem} · fleet operations is on it` : 'Your crew flagged an issue',
    rescheduled: ps.date ? `New time: ${fmtDate(ps.date, { weekday: 'long', month: 'short', day: 'numeric' })}, 9 – 11 AM` : '',
  }[ps.key];
  const total = 5;
  const prog = { scheduled: 0, enroute: 2, nearby: 3, here: ps.phase ? 4 : 3.5, collected: 5, issue: 4, rescheduled: 1 }[ps.key];
  const chipKey = ps.key === 'rescheduled' ? 'scheduled' : ps.key;
  return `<a class="card card--xl card--interactive c-hero ${ps.key === 'collected' ? 'is-done' : ''}" href="${R}track">
    <div class="row row--between"><span class="t-eyebrow">Today's pickup</span>${statusChip(chipKey, '', ps.key === 'rescheduled' ? 'Rescheduled' : undefined)}</div>
    <p class="c-hero__big">${map[ps.key]}</p>
    <p class="t-muted">${sub}</p>
    <div class="c-hero__track" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="${i < prog ? 'on' : ''}"></span>`).join('')}</div>
    <div class="row row--between t-sm"><span class="row" style="--gap:6px">${icon('clock')} ${p.window}</span><span class="row t-accent" style="--gap:4px;font-weight:700">Track ${icon('arrow-right')}</span></div>
  </a>`;
}

const home = {
  tab: 'home',
  render({ state }) {
    const c = state.customer;
    const next = state.pickups.filter((p) => p.id !== 'p-today' && p.status !== 'complete').slice(0, 3);
    return `
      ${appbar({ menu: true, logo: true, right: bell(state) })}
      <div class="c-page"><div class="c-home"><div class="c-home__main stack" style="--gap:20px">
        <div><p class="t-muted">${greeting()},</p><h1 class="t-h1">${esc(c.first)}</h1></div>
        ${state.unread.customer && state.notices[0] ? `<a class="c-notice" href="${R}notifications"><span class="list-item__icon">${icon(state.notices[0].icon)}</span><span class="grow" style="min-width:0"><span class="t-title" style="display:block">${esc(state.notices[0].title)}</span><span class="t-sm t-subtle">${esc(state.notices[0].body)}</span></span><span class="t-xs t-subtle" style="flex:none">${esc(state.notices[0].at)}</span></a>` : ''}
        ${pickupHero(state)}
        <section class="stack" style="--gap:12px">
          <h2 class="t-title">Quick actions</h2>
          <div class="c-actions">
            <a href="${R}request/1" class="c-action"><span>${icon('plus')}</span>Request pickup</a>
            <a href="${R}request/2?w=bulk" class="c-action"><span>${icon('sofa')}</span>Bulk item</a>
            <a href="${R}support?missed=1" class="c-action"><span>${icon('alert-circle')}</span>Report missed</a>
            <a href="${R}guide" class="c-action"><span>${icon('recycle')}</span>What goes where</a>
          </div>
        </section>
        </div><div class="c-home__side stack" style="--gap:20px">
        <section class="stack" style="--gap:12px">
          <div class="row row--between"><h2 class="t-title">Coming up</h2><a class="t-sm" href="${R}pickups" style="font-weight:700">See all</a></div>
          <div class="list">
            ${next.map((p) => `<a class="list-item" href="${R}pickups"><span class="list-item__icon">${icon(p.kind === 'Recurring' ? 'repeat' : WASTE[p.wasteKey]?.icon || 'calendar')}</span><span class="list-item__body"><span class="list-item__title">${fmtDate(p.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span class="list-item__meta truncate" style="display:block">${esc(p.waste)} · ${p.window}</span></span>${p.status === 'scheduled' ? icon('chevron-right', 'list-item__chev') : statusChip(p.status, '', p.status === 'requested' ? 'Pending' : 'Approved')}</a>`).join('')}
          </div>
        </section>
        <section class="card card--brand c-tip">
          <div class="stack" style="--gap:8px">
            <span class="t-eyebrow" style="color:inherit;opacity:.8">Tip of the day</span>
            <p class="t-title">Pizza boxes with grease go in trash, not recycling.</p>
            <p class="t-sm" style="opacity:.85">Clean cardboard only — one greasy box can contaminate a whole load.</p>
          </div>
          <span class="c-tip__icon">${icon('recycle', 'ico--xl')}</span>
        </section>
        <section class="card row" style="--gap:16px">
          <span class="list-item__icon" style="background:var(--ok-soft);color:var(--ok-soft-ink)">${icon('leaf')}</span>
          <div class="grow"><p class="t-title">142 lbs diverted this year</p><p class="t-sm t-subtle">Your recycling rate is 38% — above your neighborhood average.</p></div>
        </section>
      </div></div></div>`;
  },
};

// ---------------------------------------------------------------------------
// Request flow (5 steps)
// ---------------------------------------------------------------------------
const REQ_TITLES = ['How often?', 'What are we picking up?', 'Show us what\'s going', 'When works?', 'Confirm Pick Up Request'];

function reqShell(n, body, { cta = 'Continue', disabled = false } = {}) {
  return `<div class="c-page c-page--flow">
    <div class="row" style="--gap:12px;padding-top:8px">
      <a class="icon-btn icon-btn--ghost" href="${n === 1 ? R + 'home' : R + 'request/' + (n - 1)}" aria-label="Back">${icon(n === 1 ? 'x' : 'chevron-left')}</a>
      <div class="grow">${stepper(n, 5)}</div>
      <span class="t-sm t-subtle t-num">${n}/5</span>
    </div>
    <h1 class="t-h1 t-accent" style="margin:24px 0 20px">${REQ_TITLES[n - 1]}</h1>
    <div class="stack" style="--gap:16px">${body}</div>
    <div class="c-flow-cta"><button class="btn btn--lg btn--block" data-next ${disabled ? 'disabled' : ''}>${cta}</button></div>
  </div>`;
}

function dates() {
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    return { iso: d.toISOString().slice(0, 10), dow: d.toLocaleDateString([], { weekday: 'short' }), day: d.getDate(), full: d };
  });
}

const request = {
  tabs: false, live: false,
  render({ params, query }) {
    const n = Math.max(1, Math.min(5, +params[0] || 1));
    if (!draft) draft = newDraft();
    if (query.get('w')) { draft.waste = query.get('w'); draft.kind = 'One-time'; }
    const w = WASTE[draft.waste];

    if (n === 1) return reqShell(1, `
      ${[['One-time', 'one-time', 'A single extra pickup — bulk items, overflow, a move.'], ['Recurring', 'repeat', 'Add a regular pickup to your weekly schedule.']].map(([k, ic, d]) => `
        <label class="choice c-choice-lg"><input type="radio" name="kind" value="${k}" ${draft.kind === k ? 'checked' : ''}><span class="choice__icon">${icon(ic)}</span><span class="grow"><span class="t-title" style="display:block">${k} pick up</span><span class="t-sm t-subtle">${d}</span></span><span class="choice__check">${icon('check')}</span></label>`).join('')}`);

    if (n === 2) return reqShell(2, `
      <div class="choice-grid">
        ${Object.entries(WASTE).map(([k, v]) => `<label class="choice choice--tile"><input type="radio" name="waste" value="${k}" ${draft.waste === k ? 'checked' : ''}><span class="choice__icon">${icon(v.icon)}</span><span class="t-title">${v.label}</span><span class="t-xs t-subtle">${v.price ? 'from $' + v.price : 'Included'}</span><span class="choice__check">${icon('check')}</span></label>`).join('')}
      </div>
      <div data-hazard ${draft.waste === 'hazard' ? '' : 'hidden'} class="alert alert--warn">${icon('alert')}<div><strong>Special handling required</strong>Paint, batteries, chemicals and propane are collected by a certified crew. We'll ask a few safety questions next.</div></div>
      <div class="card card--sunken row row--between"><span class="row" style="--gap:10px">${icon('bin')} <span><span class="t-title" style="display:block">Bins or bags</span><span class="t-xs t-subtle">Helps us size the truck</span></span></span>
        <span class="c-qty"><button class="icon-btn icon-btn--sm" data-qty="-1" aria-label="Fewer">${icon('minus')}</button><output data-bins>${draft.bins}</output><button class="icon-btn icon-btn--sm" data-qty="1" aria-label="More">${icon('plus')}</button></span></div>`);

    if (n === 3) return reqShell(3, `
      <p class="t-muted" style="margin-top:-8px">A photo lets us estimate size and weight and send the right truck. Optional for standard trash.</p>
      <button class="c-photo ${draft.photo ? 'has-photo' : ''}" data-photo type="button">
        ${draft.photo ? `<img src="${img('house-bags.jpg')}" alt="Three trash bags at the curb"><span class="chip chip--ok c-photo__chip">${icon('check')}Photo added</span>` : `<span class="c-photo__empty">${icon('camera', 'ico--xl')}<span class="t-title">Take or upload a photo</span><span class="t-sm t-subtle">JPG or PNG · up to 10 MB</span></span>`}
      </button>
      ${draft.photo ? `<div class="card row" style="--gap:14px"><span class="list-item__icon">${icon('sparkle')}</span><div class="grow"><p class="t-title">Estimated 3 bags · ~35 lbs</p><p class="t-sm t-subtle">Fits a standard pickup — no surcharge.</p></div></div>` : ''}
      <div class="field"><label class="label" for="r-notes">Notes for your crew</label><textarea class="textarea" id="r-notes" placeholder="e.g. Bags are by the side gate">${esc(draft.notes)}</textarea></div>`);

    if (n === 4) {
      const ds = dates();
      if (!draft.date) draft.date = ds[0].iso;
      const price = w.price + (draft.kind === 'One-time' && !w.price ? 18 : 0);
      return reqShell(4, `
        <div class="c-dates" role="radiogroup" aria-label="Pickup date">
          ${ds.map((d) => `<button type="button" role="radio" aria-checked="${draft.date === d.iso}" class="c-date" data-date="${d.iso}"><span class="t-xs">${d.dow}</span><strong>${d.day}</strong></button>`).join('')}
        </div>
        <fieldset class="stack" style="--gap:10px;border:0;padding:0"><legend class="label" style="margin-bottom:10px">Time window</legend>
          ${Object.entries(WINDOWS).map(([k, v]) => `<label class="choice"><input type="radio" name="win" value="${k}" ${draft.window === k ? 'checked' : ''}><span class="choice__icon">${icon(k === 'Morning' ? 'sun' : k === 'Midday' ? 'clock' : 'moon')}</span><span class="grow"><span class="t-title" style="display:block">${k}</span><span class="t-sm t-subtle">${v}</span></span>${k === 'Morning' ? chip('ok-soft', 'Crew nearby', '') : ''}<span class="choice__check">${icon('check')}</span></label>`).join('')}
        </fieldset>
        <div class="card card--sunken row row--between"><span class="t-muted">Estimated price</span><strong class="t-h3">${price ? '$' + price : 'Included'}</strong></div>`);
    }

    const price = w.price + (draft.kind === 'One-time' && !w.price ? 18 : 0);
    return reqShell(5, `
      <div class="row row--wrap" style="--gap:10px">
        ${chip('ok', 'My default address', 'check', 'lg')}
        ${chip('ok', draft.kind + ' pick up', 'check', 'lg')}
        ${chip('ok', fmtDate(draft.date, { month: '2-digit', day: '2-digit', year: 'numeric' }), 'check', 'lg')}
        ${chip('ok', w.label, 'check', 'lg')}
        ${chip('ok', WINDOWS[draft.window], 'check', 'lg')}
      </div>
      <div class="c-confirm-img"><img src="${img(draft.photo ? 'house-bags.jpg' : 'house-bin.jpg')}" alt=""></div>
      <div class="card card--flat stack" style="--gap:8px">
        <div class="row row--between t-sm"><span class="t-muted">Address</span><span>24 Commonwealth Ave</span></div>
        <div class="row row--between t-sm"><span class="t-muted">Charged to</span><span>Visa •••• 6411</span></div>
        <hr class="divider"><div class="row row--between"><strong>Total</strong><strong>${price ? '$' + price.toFixed(2) : 'Included'}</strong></div>
      </div>`, { cta: 'Confirm Pick Up' });
  },
  mount(root, { params, go }) {
    const n = +params[0] || 1;
    const sync = () => {
      const k = root.querySelector('input[name=kind]:checked'); if (k) draft.kind = k.value;
      const w = root.querySelector('input[name=waste]:checked'); if (w) draft.waste = w.value;
      const b = root.querySelector('[data-bins]'); if (b) draft.bins = +b.textContent;
      const t = root.querySelector('#r-notes'); if (t) draft.notes = t.value;
      const win = root.querySelector('input[name=win]:checked'); if (win) draft.window = win.value;
    };
    on(root, 'input[name=waste]', 'change', (e, i) => { root.querySelector('[data-hazard]').hidden = i.value !== 'hazard'; });
    on(root, '[data-qty]', 'click', (e, b) => { const o = b.parentElement.querySelector('output'); o.textContent = Math.max(1, Math.min(12, +o.textContent + +b.dataset.qty)); });
    on(root, '[data-photo]', 'click', () => { sync(); draft.photo = !draft.photo; go(R + 'request/3', { replace: true }); });
    on(root, '[data-date]', 'click', (e, b) => {
      draft.date = b.dataset.date;
      root.querySelectorAll('[data-date]').forEach((x) => x.setAttribute('aria-checked', x === b));
    });
    on(root, '[data-next]', 'click', () => {
      sync();
      if (n < 5) return go(R + 'request/' + (n + 1));
      const w = WASTE[draft.waste];
      const id = 'p' + Date.now();
      store.update((s) => {
        s.pickups.push({ id, date: draft.date, window: WINDOWS[draft.window], kind: draft.kind, waste: w.label, wasteKey: draft.waste, price: w.price, status: 'requested', notes: draft.notes, photo: draft.photo });
        s.pickups.sort((a, b) => a.date.localeCompare(b.date));
      });
      // Simulate dispatcher approval
      draft = null;
      go(R + 'request-done');
    });
  },
};

const requestDone = {
  tabs: false,
  render: ({ state }) => {
    const p = [...state.pickups].reverse().find((x) => x.status === 'requested' || x.status === 'approved') || state.pickups.at(-1);
    return `<div class="c-page c-success">
      <div class="c-success__badge">${icon('check', 'ico--xl')}</div>
      <h1 class="t-h1">Request sent</h1>
      <p class="t-muted">Fleet operations is assigning a truck. You'll get a notification here as soon as it's approved — usually within a few minutes.</p>
      <div class="card stack" style="--gap:12px;text-align:left;width:100%">
        <div class="row row--between"><span class="t-eyebrow">${esc(p.kind)} pick up</span>${statusChip(p.status)}</div>
        <p class="t-h3">${fmtDate(p.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p class="t-sm t-muted">${esc(p.waste)} · ${p.window}</p>
      </div>
      <div class="stack" style="--gap:10px;width:100%"><a class="btn btn--lg btn--block" href="${R}pickups">View my pickups</a><a class="btn btn--ghost btn--block" href="${R}home">Back to home</a></div>
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------
const track = {
  tab: 'track',
  render({ state }) {
    const ps = customerPickupState(state);
    const stops = state.route.stops;
    const cur = currentStopIndex(state);
    const steps = [
      ['Pickup scheduled', 'Bins out by 9 AM', 'done'],
      ['Crew on route', state.route.acknowledged ? `${state.route.truck} · started 8:00 AM` : 'Starts 8:00 AM', state.route.acknowledged ? 'done' : 'todo'],
      ['Truck nearby', ps.key === 'enroute' ? `${ps.away} stops away · ETA ${ps.eta}` : ps.key === 'nearby' ? 'Next stop is you' : '', ['nearby', 'here'].includes(ps.key) ? 'current' : ['collected', 'issue'].includes(ps.key) ? 'done' : ps.key === 'enroute' ? 'current' : 'todo'],
      [ps.key === 'issue' || ps.key === 'rescheduled' ? 'Issue flagged' : 'Collected', ps.key === 'collected' ? `${ps.at} · Photo confirmed` : ps.key === 'here' ? (ps.phase === 'checked' ? 'Bin emptied · photo being taken' : ps.phase === 'scanned' ? 'Bin scanned · emptying now' : 'Crew walking to your bin') : ps.problem || '', ps.key === 'collected' ? 'done' : ps.key === 'issue' || ps.key === 'rescheduled' ? 'issue' : ps.key === 'here' ? 'current' : 'todo'],
      ...(ps.key === 'rescheduled' ? [['Rescheduled', ps.note || '', 'current']] : []),
    ];
    if (['enroute', 'nearby', 'here', 'issue', 'rescheduled'].includes(ps.key)) steps[1][2] = 'done';
    if (ps.key === 'here') steps[2][2] = 'done';

    const headline = { scheduled: 'Scheduled for today', enroute: `${ps.away} stops away`, nearby: "You're next", here: 'Crew is here', collected: 'All done!', issue: 'We hit a snag', rescheduled: 'Rescheduled' }[ps.key];
    return `
      <div class="c-track">
        <div class="map c-track__map">${routeMap({ stops, current: cur, focus: ps.key === 'collected' ? state.customer.stopId : 'current', zoom: 1.5, offsetY: 0.08, homeId: state.customer.stopId, labels: false })}
          <div class="c-track__bar">${appbar({ back: R + 'home', transparent: true, title: '' })}</div>
        </div>
        <div class="c-sheet">
          <div class="sheet__grip"></div>
          <div class="row row--between row--top">
            <div><p class="t-eyebrow">Today · ${state.pickups[0].window}</p><h1 class="t-h1" style="margin-top:4px">${headline}</h1></div>
            ${ps.key === 'enroute' ? `<div class="c-eta"><strong class="t-num">${ps.eta}</strong><span class="t-xs">ETA</span></div>` : ''}
          </div>
          ${ps.key === 'issue' ? `<div class="alert alert--danger">${icon('alert')}<div><strong>${esc(ps.problem)}</strong>${ps.note ? esc(ps.note) : 'Your crew couldn’t complete this pickup. Fleet operations has been alerted and will update you here shortly.'}</div></div>` : ''}
          ${ps.key === 'rescheduled' ? `<div class="alert alert--ok">${icon('calendar')}<div><strong>New time: ${fmtDate(ps.date, { weekday: 'long', month: 'short', day: 'numeric' })}, 9 – 11 AM</strong>Today’s pickup couldn’t be completed (${esc(ps.problem)}). No action needed — leave your bins out as usual.</div></div>` : ''}
          ${ps.key === 'collected' ? `
            <div class="c-proof"><img src="${img('house-bin.jpg')}" alt="Photo of your emptied bin at the curb"><span class="chip chip--ok">${icon('camera')}Proof of pickup · ${ps.at}</span></div>
            <div class="row row--wrap" style="--gap:8px">${chip('outline', 'Standard Bin', 'check')}${chip('outline', 'In Compliance', 'check')}${chip('outline', '3 bulk bags', 'check')}</div>
            <div class="card card--sunken stack" style="--gap:10px;text-align:center"><p class="t-title">How did we do?</p><div class="c-stars" role="radiogroup" aria-label="Rate your pickup">${[1, 2, 3, 4, 5].map((i) => `<button role="radio" aria-checked="${state.customer.rating === i}" aria-label="${i} star${i > 1 ? 's' : ''}" data-rate="${i}" class="${i <= state.customer.rating ? 'on' : ''}">${icon('star')}</button>`).join('')}</div></div>` : ''}
          <ol class="timeline">
            ${steps.map(([t, m, st]) => `<li class="timeline__item timeline__item--${st}"><span class="timeline__node">${st === 'done' ? icon('check') : st === 'issue' ? icon('alert') : st === 'current' ? icon('truck') : ''}</span><div class="timeline__body"><p class="timeline__title">${t}</p>${m ? `<p class="timeline__meta">${esc(m)}</p>` : ''}</div></li>`).join('')}
          </ol>
          <div class="card card--flat row" style="--gap:12px">
            <div class="c-crew">${avatar(img('persona-driver.jpg'), 'Stan Pietro')}${avatar(img('persona-collector.jpg'), 'Miguel Sorano')}</div>
            <div class="grow"><p class="t-title">Stan & Miguel</p><p class="t-sm t-subtle">${state.route.truck} · ${state.route.territory}</p></div>
            <button class="icon-btn" data-crew aria-label="Message crew">${icon('message')}</button>
          </div>
          ${!['collected', 'issue', 'rescheduled'].includes(ps.key) ? `
          <div class="card card--flat stack" style="--gap:6px"><p class="t-title">Before the truck arrives</p>
            ${['Bins at the side gate, lids closed', 'Recycling rinsed and loose — no bags', 'Bulk bags tied, under 50 lbs each'].map((t, i) => `<label class="check"><input type="checkbox" ${i === 0 ? 'checked' : ''}><span class="check__box">${icon('check')}</span>${t}</label>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  },
  mount(root) {
    on(root, '[data-rate]', 'click', (e, b) => { store.update((s) => { s.customer.rating = +b.dataset.rate; }); toast('Thanks — your crew will see this.'); });
    on(root, '[data-crew]', 'click', () => sheet(`
      <h2 class="t-h3" style="margin-bottom:12px">Send a note to your crew</h2>
      <div class="stack" style="--gap:10px">${['Bins are at the side gate', 'Gate code is 2140', 'Please take the extra bags'].map((t) => `<button class="btn btn--neutral btn--block" data-close data-note="${t}">${t}</button>`).join('')}</div>`,
    (el) => on(el, '[data-note]', 'click', (e, b) => { actions.sendMessage('customer', `Meredith (24 Commonwealth): ${b.dataset.note}`); toast('Sent to your crew'); })));
  },
};

// ---------------------------------------------------------------------------
// Pickups (upcoming + history)
// ---------------------------------------------------------------------------
const pickups = {
  tab: 'pickups',
  render({ state, query }) {
    const tab = query.get('tab') || 'upcoming';
    const ps = customerPickupState(state);
    const up = state.pickups.filter((p) => p.status !== 'complete');
    const hist = [...(ps.key === 'collected' ? [{ id: 'today', date: state.pickups[0].date, kind: 'Recurring', waste: 'Trash + 3 bulk bags', weight: 44, status: 'complete' }] : []), ...state.history];
    return `
      ${appbar({ title: 'Pickups', right: `<a class="btn btn--sm" href="${R}request/1">${icon('plus')}New</a>` })}
      <div class="c-page stack" style="--gap:16px">
        <div class="segmented" role="tablist">
          <button role="tab" aria-selected="${tab === 'upcoming'}" data-tab="upcoming">Upcoming</button>
          <button role="tab" aria-selected="${tab === 'history'}" data-tab="history">History</button>
        </div>
        ${tab === 'upcoming' ? `
          <div class="stack" style="--gap:12px">
          ${up.map((p) => {
            const today = isToday(p.date) && p.id === 'p-today';
            const key = today ? (ps.key === 'scheduled' ? 'scheduled' : ps.key) : p.status;
            return `<a class="card card--interactive stack" style="--gap:10px" href="${today ? R + 'track' : '#'}" ${today ? '' : 'data-manage="' + p.id + '"'}>
              <div class="row row--between"><span class="t-eyebrow">${today ? 'Today' : fmtDate(p.date, { weekday: 'long' })}</span>${statusChip(key)}</div>
              <p class="t-h3">${fmtDate(p.date, { month: 'long', day: 'numeric' })} <span class="t-muted" style="font-weight:500">· ${p.window}</span></p>
              <div class="row row--wrap" style="--gap:8px">${chip('outline', p.kind, 'check')}${chip('outline', p.waste, 'check')}${p.extra ? chip('outline', p.extra.replace('+ ', ''), 'check') : ''}</div>
            </a>`;
          }).join('')}
          </div>
          <div class="card card--sunken row" style="--gap:12px">${icon('repeat')}<div class="grow"><p class="t-title">Weekly · Thursdays</p><p class="t-sm t-subtle">Trash + recycling, 2 bins</p></div><button class="btn btn--sm btn--outline" data-skip>Skip next</button></div>
        ` : `
          <ol class="timeline c-history">
            ${hist.map((h, i) => `<li class="timeline__item timeline__item--${h.status === 'missed' ? 'issue' : 'done'}">
              <span class="timeline__node" style="background:var(--primary);border-color:var(--primary);color:var(--primary-ink)">${hist.length - i + 12}</span>
              <div class="timeline__body card stack" style="--gap:10px;padding:16px">
                <p class="t-title">${fmtDate(h.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                ${statusChip(h.status === 'missed' ? 'missed' : 'complete', 'lg')}
                <div class="row row--wrap" style="--gap:8px">${chip('outline', h.waste, 'check')}${h.weight ? chip('outline', h.weight + ' lbs', 'check') : ''}${h.status !== 'missed' ? chip('outline', 'In Compliance', 'check') : ''}</div>
                ${h.note ? `<p class="t-sm t-muted">${esc(h.note)}</p>` : ''}
              </div></li>`).join('')}
          </ol>`}
      </div>`;
  },
  mount(root, { go }) {
    on(root, '[data-tab]', 'click', (e, b) => go(R + 'pickups?tab=' + b.dataset.tab, { replace: true }));
    on(root, '[data-skip]', 'click', () => sheet(`<h2 class="t-h3">Skip next Thursday?</h2><p class="t-muted" style="margin:8px 0 20px">You'll get a $4 credit. Your schedule resumes the following week.</p><div class="stack" style="--gap:10px"><button class="btn btn--block" data-close data-yes>Skip pickup</button><button class="btn btn--ghost btn--block" data-close>Keep it</button></div>`, (el) => on(el, '[data-yes]', 'click', () => toast('Next pickup skipped · $4 credit applied'))));
    on(root, '[data-manage]', 'click', (e, a) => {
      e.preventDefault();
      sheet(`<h2 class="t-h3" style="margin-bottom:16px">Manage pickup</h2><div class="list">
        <button class="list-item" data-close data-t="Reschedule options sent">${'<span class="list-item__icon">' + icon('calendar') + '</span>'}<span class="list-item__body list-item__title">Reschedule</span>${icon('chevron-right', 'list-item__chev')}</button>
        <button class="list-item" data-close data-t="Reminder set for the night before"><span class="list-item__icon">${icon('bell')}</span><span class="list-item__body list-item__title">Set reminder</span>${icon('chevron-right', 'list-item__chev')}</button>
        <button class="list-item" data-close data-cancel="${a.dataset.manage}"><span class="list-item__icon" style="background:var(--danger-soft);color:var(--danger-soft-ink)">${icon('x')}</span><span class="list-item__body list-item__title">Cancel pickup</span></button></div>`,
      (el) => {
        on(el, '[data-t]', 'click', (e, b) => toast(b.dataset.t));
        on(el, '[data-cancel]', 'click', (e, b) => { store.update((s) => { s.pickups = s.pickups.filter((p) => p.id !== b.dataset.cancel); }); toast('Pickup cancelled'); });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Account + sub pages
// ---------------------------------------------------------------------------
const li = (href, ic, title, meta = '') => `<a class="list-item" href="${href}"><span class="list-item__icon">${icon(ic)}</span><span class="list-item__body"><span class="list-item__title">${title}</span>${meta ? `<span class="list-item__meta">${meta}</span>` : ''}</span>${icon('chevron-right', 'list-item__chev')}</a>`;

const account = {
  tab: 'account',
  render: ({ state }) => {
    const c = state.customer;
    return `${appbar({ title: 'Account' })}
    <div class="c-page stack" style="--gap:20px">
      <div class="row" style="--gap:14px">${avatar(img('persona-customer.jpg'), c.name, 'lg')}<div><p class="t-h3">${esc(c.name)}</p><p class="t-sm t-subtle">${esc(c.address)}</p></div></div>
      <div class="card card--sunken row row--between"><div><p class="t-eyebrow">Plan</p><p class="t-title">${esc(c.plan)}</p></div><a class="btn btn--sm btn--outline" href="#" data-plan>Change</a></div>
      <div class="list">
        ${li(R + 'payments', 'card', 'Payments & billing', c.card + (c.autopay ? ' · Autopay on' : ''))}
        ${li(R + 'notifications', 'bell', 'Notifications', 'Truck nearby, pickup complete, delays')}
        ${li(R + 'preferences', 'sliders', 'Pickup preferences', 'Side gate · Gate code on file')}
      </div>
      <div class="list">
        ${li(R + 'guide', 'recycle', 'Recycling guide', 'What goes in which bin')}
        ${li(R + 'support', 'help', 'Help & support', 'Report a missed pickup, FAQs')}
      </div>
      <a class="btn btn--neutral btn--block" href="../login/">${icon('logout')}Sign out</a>
    </div>`;
  },
  mount(root) { on(root, '[data-plan]', 'click', (e) => { e.preventDefault(); toast('Plan changes take effect next billing cycle', 'info'); }); },
};

const payments = {
  render: ({ state }) => `${appbar({ title: 'Payments & billing', back: R + 'account' })}
    <div class="c-page stack" style="--gap:20px">
      <div class="card card--inverse c-card-visual"><div class="row row--between"><span class="logo" style="color:inherit">CoCo</span>${icon('card', 'ico--lg')}</div><p class="t-h3 t-num" style="letter-spacing:.08em">•••• •••• •••• 6411</p><div class="row row--between t-sm" style="opacity:.8"><span>${esc(state.customer.name)}</span><span>08/28</span></div></div>
      <div class="card card--flat row row--between"><span><span class="t-title" style="display:block">Autopay</span><span class="t-sm t-subtle">Next charge: $38.00 on the 1st</span></span><span class="toggle"><input type="checkbox" ${state.customer.autopay ? 'checked' : ''} data-autopay aria-label="Autopay"><span></span></span></div>
      <section class="stack" style="--gap:12px"><h2 class="t-title">Invoices</h2>
        <div class="list">${['Sep', 'Aug', 'Jul', 'Jun'].map((m, i) => `<button class="list-item" data-inv><span class="list-item__icon">${icon('file')}</span><span class="list-item__body"><span class="list-item__title">${m} 2026</span><span class="list-item__meta">${i === 1 ? '$73.00 · incl. bulk pickup' : '$38.00'} · Paid</span></span>${icon('download', 'list-item__chev')}</button>`).join('')}</div>
      </section>
      <button class="btn btn--outline btn--block">${icon('plus')}Add payment method</button>
    </div>`,
  mount(root) {
    on(root, '[data-autopay]', 'change', (e, i) => { store.update((s) => { s.customer.autopay = i.checked; }, { silent: true }); toast(i.checked ? 'Autopay on' : 'Autopay off'); });
    on(root, '[data-inv]', 'click', () => toast('Invoice PDF downloaded', 'download'));
  },
};

const notifications = {
  render: ({ state }) => {
    const n = state.customer.notify;
    const rows = [['dayBefore', 'Night-before reminder', 'Text at 7 PM the day before'], ['nearby', 'Truck is nearby', 'When your crew is 1–2 stops away'], ['complete', 'Pickup complete', 'With a photo of your bin'], ['delays', 'Delays & missed pickups', 'Always recommended'], ['tips', 'Recycling tips', 'Once a week']];
    return `${appbar({ title: 'Notifications', back: R + 'home' })}
    <div class="c-page stack" style="--gap:16px">
      <section class="stack" style="--gap:10px"><h2 class="t-title">Updates</h2>
        <div class="list">${state.notices.map((x, i) => `<div class="list-item ${i < state.unread.customer ? 'c-unread' : ''}"><span class="list-item__icon">${icon(x.icon)}</span><span class="list-item__body"><span class="list-item__title" style="display:block">${esc(x.title)}</span><span class="list-item__meta">${esc(x.body)}</span></span><span class="t-xs t-subtle" style="flex:none;align-self:flex-start">${esc(x.at)}</span></div>`).join('')}</div>
      </section>
      <h2 class="t-title">Settings</h2>
      <div class="alert">${icon('info')}<div>Most missed pickups happen because nobody knew about a delay. Keep <strong style="display:inline">Delays</strong> on so we can always reach you.</div></div>
      <div class="list">${rows.map(([k, t, d]) => `<label class="list-item"><span class="list-item__body"><span class="list-item__title">${t}</span><span class="list-item__meta">${d}</span></span><span class="toggle"><input type="checkbox" data-n="${k}" ${n[k] ? 'checked' : ''} aria-label="${t}"><span></span></span></label>`).join('')}</div>
      <div class="field"><span class="label">Deliver by</span><div class="segmented"><button aria-selected="true">Push</button><button aria-selected="true">SMS</button><button aria-selected="false">Email</button></div></div>
    </div>`;
  },
  mount(root) {
    if (store.get().unread.customer) setTimeout(() => store.update((s) => { s.unread.customer = 0; }, { silent: true }), 1500);
    on(root, '[data-n]', 'change', (e, i) => store.update((s) => { s.customer.notify[i.dataset.n] = i.checked; }, { silent: true }));
    on(root, '.segmented button', 'click', (e, b) => b.setAttribute('aria-selected', b.getAttribute('aria-selected') !== 'true'));
  },
};

const preferences = {
  live: false,
  render: ({ state }) => `${appbar({ title: 'Pickup preferences', back: R + 'account' })}
    <div class="c-page stack" style="--gap:18px">
      <div class="map c-mini-map">${miniMap()}</div>
      <div class="field"><label class="label" for="pp-addr">Address</label><input class="input" id="pp-addr" value="${esc(state.customer.address + ', ' + state.customer.city)}"></div>
      <div class="field"><label class="label" for="pp-place">Bin placement</label><select class="select" id="pp-place">${['Curbside', 'Side gate', 'Driveway', 'Alley'].map((p) => `<option ${p === state.customer.placement ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="pp-notes">Access notes</label><textarea class="textarea" id="pp-notes">Gate code 2140. Dog in yard is friendly.</textarea><span class="hint">Shown to your crew on arrival.</span></div>
      <button class="btn btn--lg btn--block" data-save>Save preferences</button>
    </div>`,
  mount(root, { go }) { on(root, '[data-save]', 'click', () => { store.update((s) => { s.customer.placement = root.querySelector('#pp-place').value; }, { silent: true }); toast('Preferences saved'); go(R + 'account'); }); },
};

const GUIDE = [
  ['recycle', 'Recycling', 'var(--info-soft)', ['Clean cardboard & paper', 'Plastic bottles & tubs #1–7', 'Glass jars & bottles', 'Metal cans & foil'], ['Plastic bags', 'Greasy pizza boxes', 'Garden hoses']],
  ['trash', 'Trash', 'var(--surface-2)', ['Food-soiled paper', 'Styrofoam', 'Diapers', 'Broken ceramics'], ['Batteries', 'Paint', 'Electronics']],
  ['leaf', 'Yard waste', 'var(--ok-soft)', ['Leaves & grass', 'Branches under 4"', 'Plants & flowers'], ['Soil & rocks', 'Pet waste']],
  ['alert-octagon', 'Hazardous', 'var(--danger-soft)', ['Book a special pickup for paint, batteries, chemicals, propane'], []],
];
const guide = {
  render: () => `${appbar({ title: 'Recycling guide', back: R + 'home' })}
    <div class="c-page stack" style="--gap:16px">
      <div class="input-group">${icon('search')}<input class="input" placeholder="Search an item, e.g. “pizza box”" data-q aria-label="Search items"></div>
      <div class="stack" style="--gap:12px" data-list>
      ${GUIDE.map(([ic, t, bg, yes, no]) => `<details class="card c-guide" ${t === 'Recycling' ? 'open' : ''}><summary class="row" style="--gap:12px"><span class="list-item__icon" style="background:${bg};color:var(--text)">${icon(ic)}</span><span class="t-title grow">${t}</span>${icon('chevron-down', 'c-guide__chev')}</summary>
        <div class="stack" style="--gap:8px;margin-top:14px">${yes.map((y) => `<p class="row t-sm" style="--gap:8px" data-item>${chip('ok-soft', '', 'check')}${y}</p>`).join('')}${no.map((y) => `<p class="row t-sm" style="--gap:8px" data-item>${chip('danger-soft', '', 'x')}${y}</p>`).join('')}</div></details>`).join('')}
      </div>
    </div>`,
  mount(root) {
    on(root, '[data-q]', 'input', (e, i) => {
      const q = i.value.toLowerCase();
      root.querySelectorAll('.c-guide').forEach((d) => { if (q) d.open = true; });
      root.querySelectorAll('[data-item]').forEach((p) => { p.hidden = q && !p.textContent.toLowerCase().includes(q); });
    });
  },
};

const support = {
  live: false,
  render: ({ query }) => `${appbar({ title: 'Help & support', back: R + 'account' })}
    <div class="c-page stack" style="--gap:18px">
      <div class="card stack" style="--gap:14px">
        <div class="row" style="--gap:12px"><span class="list-item__icon" style="background:var(--danger-soft);color:var(--danger-soft-ink)">${icon('alert-circle')}</span><p class="t-title">Report a missed pickup</p></div>
        <div class="field"><label class="label" for="s-date">Which pickup?</label><select class="select" id="s-date"><option>Today — Trash + bulk</option><option>Last Thursday — Trash + Recycling</option></select></div>
        <div class="field"><label class="label" for="s-note">What happened?</label><textarea class="textarea" id="s-note" placeholder="Bins were out by 8 AM…" ${query.get('missed') ? 'autofocus' : ''}></textarea></div>
        <button class="btn btn--block" data-report>Send report</button>
      </div>
      <h2 class="t-title">Common questions</h2>
      <div class="stack" style="--gap:10px">${[['What time should my bins be out?', 'By 7 AM on your pickup day. We send a reminder the night before.'], ['Can I add a bulk item to my regular pickup?', 'Yes — request a one-time bulk pickup for the same day and your crew will grab it.'], ['What if it snows?', 'We may shift pickups by one day. You\'ll get a push and SMS alert.']].map(([q, a]) => `<details class="card card--flat c-guide"><summary class="row row--between t-title">${q}${icon('chevron-down', 'c-guide__chev')}</summary><p class="t-muted t-sm" style="margin-top:10px">${a}</p></details>`).join('')}</div>
      <div class="row" style="--gap:10px"><a class="btn btn--neutral grow" href="#" data-t="Calling CoCo support…">${icon('phone')}Call</a><a class="btn btn--neutral grow" href="#" data-t="Chat opened">${icon('message')}Chat</a></div>
    </div>`,
  mount(root, { go }) {
    on(root, '[data-report]', 'click', () => { toast("Report sent — we'll follow up within 2 hours"); go(R + 'home'); });
    on(root, '[data-t]', 'click', (e, a) => { e.preventDefault(); toast(a.dataset.t, 'info'); });
  },
};

export default {
  label: 'Customer', product: 'Customer portal', theme: 'light',
  user: { name: 'Meredith Ferntov', title: '24 Commonwealth Ave', img: 'persona-customer.jpg' },
  start: (s) => (s.onboarded.customer ? 'home' : 'welcome'),
  tabs,
  index: [
    ['Welcome', 'welcome'], ['Onboarding', 'onboard/1'], ['Home', 'home'], ['Request pickup', 'request/1'], ['Confirm request', 'request/5'],
    ['Track pickup', 'track'], ['Pickups & history', 'pickups'], ['Account', 'account'], ['Payments', 'payments'], ['Notifications', 'notifications'], ['Recycling guide', 'guide'], ['Support', 'support'],
  ],
  screens: { welcome, onboard, 'onboard-done': onboardDone, home, request, 'request-done': requestDone, track, pickups, account, payments, notifications, preferences, guide, support },
};

