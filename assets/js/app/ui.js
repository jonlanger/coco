// Small rendering helpers shared by every role.
import { icon } from '../icons.js';

export { icon };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const img = (name) => `../assets/img/${name}`;

export function chip(kind, label, ic = 'check', size = '') {
  return `<span class="chip chip--${kind} ${size ? 'chip--' + size : ''}">${ic ? icon(ic) : ''}${esc(label)}</span>`;
}

// Canonical status → chip mapping, used identically in every role.
export const STATUS = {
  scheduled: { kind: 'info-soft', label: 'Scheduled', icon: 'calendar' },
  requested: { kind: 'info-soft', label: 'Awaiting approval', icon: 'clock' },
  approved: { kind: 'ok-soft', label: 'Approved for pick up', icon: 'check' },
  enroute: { kind: 'info', label: 'Crew en route', icon: 'truck' },
  nearby: { kind: 'info', label: 'Truck nearby', icon: 'truck' },
  here: { kind: 'info', label: 'Crew at your address', icon: 'pin' },
  collected: { kind: 'ok', label: 'Pick up complete', icon: 'check' },
  complete: { kind: 'ok', label: 'Pick up complete', icon: 'check' },
  ready: { kind: 'ok', label: 'Ready for pick up', icon: 'check' },
  issue: { kind: 'danger', label: 'Needs attention', icon: 'alert' },
  missed: { kind: 'danger', label: 'Missed', icon: 'alert' },
  risk: { kind: 'warn', label: 'Schedule risk', icon: 'clock' },
  delayed: { kind: 'danger', label: 'Delayed', icon: 'alert' },
  ontime: { kind: 'ok-soft', label: 'On schedule', icon: 'check' },
  compliant: { kind: 'ok-soft', label: 'In compliance', icon: 'shield-check' },
  noncompliant: { kind: 'danger-soft', label: 'Out of compliance', icon: 'alert' },
};
export const statusChip = (key, size = '', labelOverride) => {
  const s = STATUS[key] || STATUS.scheduled;
  return chip(s.kind, labelOverride || s.label, s.icon, size);
};

export function appbar({ title = '', back = null, menu = false, logo = false, right = '', transparent = false } = {}) {
  return `<header class="appbar ${transparent ? 'appbar--over' : ''}">
    ${back ? `<a class="icon-btn ${transparent ? '' : 'icon-btn--ghost'}" href="${back}" aria-label="Back">${icon('chevron-left')}</a>` : ''}
    ${menu ? `<button class="icon-btn icon-btn--brand" data-menu aria-label="Open menu">${icon('menu')}</button>` : ''}
    ${logo ? `<span class="logo appbar__title">CoCo</span>` : `<h1 class="appbar__title truncate">${esc(title)}</h1>`}
    ${right}
  </header>`;
}

export function tabbar(items, active) {
  return `<nav class="tabbar" aria-label="Primary">${items.map((t) => t.fab
    ? `<a class="tabbar__fab" href="${t.href}" aria-label="${esc(t.label)}"><span class="fab">${icon(t.icon)}</span></a>`
    : `<a href="${t.href}" ${t.key === active ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span>${t.badge ? `<span class="badge">${t.badge}</span>` : ''}</a>`).join('')}</nav>`;
}

export const stepper = (n, total) => `<div class="stepper" role="progressbar" aria-valuenow="${n}" aria-valuemin="1" aria-valuemax="${total}" aria-label="Step ${n} of ${total}">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'is-done' : ''}"></span>`).join('')}</div>`;

export function avatar(src, name = '', size = '') {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return `<span class="avatar ${size ? 'avatar--' + size : ''}">${src ? `<img src="${src}" alt="">` : esc(initials)}</span>`;
}

export function fmtDate(isoStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], opts);
}
export function isToday(isoStr) {
  const t = new Date();
  return isoStr === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------- Overlays (rendered inside the current device) ----------
function device() { return document.querySelector('.device'); }

export function toast(msg, ic = 'check-circle') {
  const d = device(); if (!d) return;
  d.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
  d.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

export function sheet(html, mount) {
  const d = device(); if (!d) return () => {};
  d.querySelectorAll('.sheet, .sheet-scrim').forEach((x) => x.remove()); // one dialog at a time
  const scrim = document.createElement('div'); scrim.className = 'sheet-scrim';
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="sheet__grip"></div>${html}`;
  const close = () => { scrim.remove(); el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  d.append(scrim, el);
  el.querySelector('button, a, input')?.focus({ preventScroll: true });
  mount?.(el, close);
  return close;
}

// Delegated event helper scoped to a screen root.
export function on(root, sel, evt, fn) {
  root.addEventListener(evt, (e) => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
}
