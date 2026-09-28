// CoCo platform shell — one responsive app per role.
// Phones: full-bleed screens + bottom tab bar.
// ≥900px: persistent sidebar navigation + wide layouts.
import { store, actions, currentStop } from './store.js';
import { prefs } from './prefs.js';
import { icon, esc, img, tabbar, sheet, toast } from './ui.js';

const ROLES = [
  { key: 'customer', label: 'Customer', product: 'Customer portal', img: 'persona-customer.jpg' },
  { key: 'driver', label: 'Driver', product: 'In-cab navigation', img: 'persona-driver.jpg' },
  { key: 'collector', label: 'Collector', product: 'Field app', img: 'persona-collector.jpg' },
  { key: 'fleet', label: 'Fleet manager', product: 'Fleet operations', img: 'persona-fleet-manager.jpg' },
];

let role, roleKey, el, current = { key: null, cleanup: null };

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  const [screen, ...params] = path.split('/').filter(Boolean);
  return { screen, params, query: new URLSearchParams(qs) };
}

export function go(href, { replace = false } = {}) {
  if (location.hash === href) return render({ force: true });
  if (replace) { history.replaceState(null, '', href); render({ force: true }); }
  else location.hash = href;
}

function sidebar(s, active) {
  const items = role.tabs(s);
  const fab = items.find((t) => t.fab);
  const u = role.user;
  return `<aside class="plat-side" aria-label="${esc(role.label)} navigation">
    <a class="logo" href="../"><span class="logo__mark">Co</span>CoCo</a>
    <button class="plat-switch" data-switch aria-haspopup="dialog">
      <span class="grow"><span class="plat-switch__k">App</span><span class="plat-switch__v">${esc(role.product)}</span></span>${icon('swap')}
    </button>
    ${fab ? `<a class="btn btn--block" href="${fab.href}">${icon(fab.icon)}${esc(fab.label)} pickup</a>` : ''}
    <nav class="plat-nav">${items.filter((t) => !t.fab).map((t) => `<a href="${t.href}" ${t.key === active ? 'aria-current="page"' : ''}>${icon(t.icon)}<span class="grow">${esc(t.label)}</span>${t.badge ? `<span class="badge">${t.badge}</span>` : ''}</a>`).join('')}</nav>
    <div class="plat-side__foot">
      <button class="plat-side__tool" data-settings>${icon('accessibility')}<span>Accessibility & display</span></button>
      <button class="plat-side__me" data-menu aria-label="Account menu"><span class="avatar avatar--sm"><img src="${img(u.img)}" alt=""></span><span class="grow" style="min-width:0"><span class="t-sm" style="display:block;font-weight:700">${esc(u.name)}</span><span class="t-xs t-subtle truncate" style="display:block">${esc(u.title)}</span></span>${icon('more')}</button>
    </div>
  </aside>`;
}

const roleTile = (r) => `<a class="role-tile" href="../${r.key}/" ${r.key === roleKey ? 'aria-current="true"' : ''}>
  <img src="${img(r.img)}" alt=""><span class="grow" style="min-width:0"><span class="role-tile__l">${esc(r.label)}</span><span class="role-tile__p truncate">${esc(r.product)}</span></span>
  ${r.key === roleKey ? `<span class="chip chip--info-soft">Current</span>` : icon('chevron-right', 'list-item__chev')}
</a>`;

function switchSheet() {
  sheet(`<h2 class="t-h3">Switch app</h2>
    <p class="t-sm t-muted" style="margin:4px 0 16px">Every app shares the same live data. Changes in one show up in the others.</p>
    <div class="role-tiles">${ROLES.map(roleTile).join('')}</div>
    <a class="btn btn--ghost btn--block" style="margin-top:12px" href="../login/">${icon('users')}Sign-in hub</a>`);
}

function accountSheet() {
  const u = role.user;
  const items = role.tabs(store.get()).filter((t) => !t.fab);
  sheet(`<div class="row" style="--gap:12px;margin-bottom:18px"><span class="avatar avatar--lg"><img src="${img(u.img)}" alt=""></span><div><p class="t-h3">${esc(u.name)}</p><p class="t-sm t-subtle">${esc(u.title)}</p></div></div>
    <p class="sheet-label">Switch app</p>
    <div class="role-tiles role-tiles--compact" style="margin-bottom:16px">${ROLES.map(roleTile).join('')}</div>
    <div class="list" style="margin-bottom:12px">
      <button class="list-item" data-settings data-close><span class="list-item__icon">${icon('accessibility')}</span><span class="list-item__body"><span class="list-item__title" style="display:block">Accessibility & display</span><span class="list-item__meta">Text size, contrast, motion, theme</span></span>${icon('chevron-right', 'list-item__chev')}</button>
    </div>
    <p class="sheet-label">Demo controls</p>
    <div class="row" style="--gap:8px;margin-bottom:16px">
      <button class="btn btn--secondary grow" data-advance data-close>${icon('truck')}Advance crew</button>
      <button class="btn btn--neutral grow" data-reset-demo data-close>${icon('refresh')}Reset data</button>
    </div>
    <div class="list hide-desktop" style="margin-bottom:12px">${items.map((t) => `<a class="list-item" href="${t.href}" data-close><span class="list-item__icon">${icon(t.icon)}</span><span class="list-item__body list-item__title">${esc(t.label)}</span>${icon('chevron-right', 'list-item__chev')}</a>`).join('')}</div>
    <div class="list">
      <a class="list-item" href="../"><span class="list-item__icon">${icon('home')}</span><span class="list-item__body list-item__title">CoCo website</span></a>
      <a class="list-item" href="../login/"><span class="list-item__icon" style="background:var(--danger-soft);color:var(--danger-soft-ink)">${icon('logout')}</span><span class="list-item__body list-item__title">Sign out</span></a>
    </div>`);
}

const seg = (name, value, opts) => `<div class="segmented" role="radiogroup" aria-label="${esc(name)}">${opts.map(([v, l]) => `<button type="button" role="radio" data-pref="${name}" data-v="${v}" aria-checked="${v === value}" aria-selected="${v === value}">${l}</button>`).join('')}</div>`;
const tog = (name, title, sub, ic, on) => `<label class="list-item pref-row"><span class="list-item__icon">${icon(ic)}</span><span class="list-item__body"><span class="list-item__title" style="display:block">${title}</span><span class="list-item__meta">${sub}</span></span><span class="toggle"><input type="checkbox" role="switch" data-pref="${name}" ${on ? 'checked' : ''}><span></span></span></label>`;

function settingsSheet() {
  const p = prefs.get();
  const def = defaultTheme();
  sheet(`<div class="row row--between" style="margin-bottom:4px"><h2 class="t-h3">Accessibility & display</h2><button class="icon-btn icon-btn--ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <p class="t-sm t-muted" style="margin-bottom:18px">Saved on this device and applied to every CoCo app.</p>
    <div class="stack" style="--gap:18px">
      <div class="field"><span class="label" id="pl-theme">Appearance · ${esc(role.label)} app</span>
        ${seg('appearance', p.appearance[roleKey] || 'auto', [['auto', `Default (${def})`], ['light', 'Light'], ['dark', 'Dark']])}
        <span class="hint t-xs t-subtle">${def === 'dark' ? 'Field apps default to dark to cut glare in the cab and at night.' : 'Light is easiest to read indoors and in daylight.'}</span></div>
      <div class="field"><span class="label">Text size</span>
        ${seg('text', p.text, [['md', '<span style="font-size:14px">Aa</span> Default'], ['lg', '<span style="font-size:17px">Aa</span> Large'], ['xl', '<span style="font-size:20px">Aa</span> Largest']])}
        <p class="pref-preview">Truck 0091 is 2 stops away · ETA 10:05 AM</p></div>
      <div class="list">
        ${tog('contrast', 'High contrast', 'Darker text, visible borders, bolder focus rings', 'contrast', p.contrast)}
        ${tog('motion', 'Reduce motion', 'Stop animations and transitions', 'pause', p.motion === 'reduce')}
        ${tog('targets', 'Larger touch targets', '56px buttons and rows, easier with gloves', 'hand', p.targets)}
        ${tog('underline', 'Underline links', 'Don’t rely on color to spot links', 'link', p.underline)}
      </div>
      <button class="btn btn--neutral btn--block" data-reset-prefs>${icon('refresh')}Reset to defaults</button>
    </div>`, (el, close) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pref]');
      if (b) {
        const k = b.dataset.pref, v = b.dataset.v;
        prefs.set(k === 'appearance' ? { appearance: { [roleKey]: v } } : { [k]: v });
        el.querySelectorAll(`button[data-pref="${k}"]`).forEach((x) => { x.setAttribute('aria-checked', x === b); x.setAttribute('aria-selected', x === b); });
      }
      if (e.target.closest('[data-reset-prefs]')) { prefs.reset(); close(); settingsSheet(); }
    });
    el.addEventListener('change', (e) => {
      const i = e.target.closest('input[data-pref]'); if (!i) return;
      const k = i.dataset.pref;
      prefs.set({ [k]: k === 'motion' ? (i.checked ? 'reduce' : 'system') : i.checked });
    });
  });
}

function defaultTheme() {
  return typeof role.theme === 'function' ? role.theme(store.get()) : role.theme;
}
function currentTheme() {
  const a = prefs.get().appearance[roleKey];
  return a === 'light' || a === 'dark' ? a : defaultTheme();
}
export function toggleTheme() {
  prefs.set({ appearance: { [roleKey]: currentTheme() === 'dark' ? 'light' : 'dark' } });
}

function render({ force = false } = {}) {
  const r = parse();
  const s = store.get();
  const screenKey = r.screen && role.screens[r.screen] ? r.screen : null;
  if (!screenKey) { history.replaceState(null, '', `#/${role.start(s)}`); return render({ force: true }); }
  const scr = role.screens[screenKey];
  const key = location.hash;

  // Don't clobber a form in progress when data changes elsewhere
  if (!force && key === current.key && scr.live === false) return;

  const same = key === current.key;
  const prevScroll = same ? el.querySelector('.screen')?.scrollTop : 0;
  // Live re-render of the same screen: keep anything the user has typed or ticked
  const fields = same ? [...el.querySelectorAll('.screen [id]')].filter((f) => /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName) && (f.tagName === 'SELECT' ? f.value !== ([...f.options].find((o) => o.defaultSelected) || f.options[0])?.value : f.value !== f.defaultValue || f.checked !== f.defaultChecked || f === document.activeElement)).map((f) => [f.id, f.value, f.checked, f === document.activeElement]) : [];
  const overlays = [...el.querySelectorAll(key === current.key ? '.toast, .sheet-scrim, .sheet' : '.toast')];
  current.cleanup?.();

  const theme = currentTheme();
  const full = scr.tabs === false;
  const ctx = { state: s, params: r.params, query: r.query, go, role: roleKey };

  el.dataset.theme = theme;
  el.className = `device plat plat--${roleKey} ${full ? 'plat--full' : ''}`;
  el.innerHTML = `${full ? '' : sidebar(s, scr.tab)}
    <main class="plat-main"><div class="screen ${key !== current.key ? 'screen--enter' : ''}" id="screen" data-screen="${screenKey}">${scr.render(ctx)}</div></main>
    ${full ? '' : tabbar(role.tabs(s), scr.tab)}`;
  el.append(...overlays);

  const screenEl = el.querySelector('.screen');
  const bar = !full && screenEl.querySelector('.appbar');
  if (bar && !bar.querySelector('[data-menu]')) {
    bar.insertAdjacentHTML('beforeend', `<button class="appbar__me hide-desktop" data-menu aria-label="Account, switch app and settings"><span class="avatar avatar--sm"><img src="${img(role.user.img)}" alt=""></span></button>`);
  }
  screenEl.scrollTop = prevScroll || 0;
  fields.forEach(([id, v, c, focused]) => {
    const f = screenEl.querySelector('#' + CSS.escape(id)); if (!f) return;
    if (f.type === 'checkbox' || f.type === 'radio') f.checked = c; else f.value = v;
    if (focused) f.focus({ preventScroll: true });
  });
  const cleanup = scr.mount?.(screenEl, ctx);
  current = { key, cleanup: typeof cleanup === 'function' ? cleanup : null };
  document.title = `${scr.title || role.label} · CoCo`;
  setThemeColor(theme);
}

function setThemeColor(t) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0E0E0F' : '#F6F7F9');
}

export function boot(key, module) {
  roleKey = key; role = module;
  el = document.getElementById('app');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-menu]')) { e.preventDefault(); accountSheet(); }
    else if (e.target.closest('[data-advance]')) {
      const s = store.get();
      const next = s.route.acknowledged ? currentStop() : null;
      actions.advance();
      toast(!s.route.acknowledged ? 'Route acknowledged — crew is rolling' : next ? `Crew completed ${next.address}` : 'Route already complete', 'truck');
    }
    else if (e.target.closest('[data-reset-demo]')) { store.reset(); toast('Demo data reset', 'refresh'); }
    else if (e.target.closest('[data-switch]')) { e.preventDefault(); switchSheet(); }
    else if (e.target.closest('[data-settings]')) { e.preventDefault(); setTimeout(settingsSheet); }
  });
  window.addEventListener('hashchange', () => render({ force: true }));
  store.subscribe(() => render());
  prefs.subscribe(() => {
    const t = currentTheme();
    if (el.dataset.theme === t) return;
    const scr = role.screens[parse().screen];
    if (scr && scr.live === false) { el.dataset.theme = t; setThemeColor(t); } // keep forms intact
    else render({ force: true });
  });
  render({ force: true });
}
