// Design system page: renders specimens, swatches and token tables from the
// live CSS so the documentation can never drift from the implementation.
import { ICONS, icon } from './icons.js';

const root = document.documentElement;
const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

function hydrateIcons(scope) {
  scope.querySelectorAll('i[data-i]').forEach((el) => { el.outerHTML = icon(el.dataset.i, el.className); });
  scope.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });
  scope.querySelectorAll('[data-ci]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.ci)));
}

// ---- Specimens: render each template in light + field-dark panes
document.querySelectorAll('[data-spec]').forEach((spec) => {
  const tpl = spec.querySelector('template');
  ['light', 'dark'].forEach((theme) => {
    const pane = document.createElement('div');
    pane.className = 'spec__pane';
    pane.dataset.theme = theme;
    pane.dataset.label = theme === 'light' ? 'Light' : 'Field dark';
    pane.append(tpl.content.cloneNode(true));
    spec.append(pane);
  });
  tpl.remove();
});
hydrateIcons(document);

// Interactive bits inside specimens
document.addEventListener('click', (e) => {
  const seg = e.target.closest('.segmented button');
  if (seg) seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b === seg));
  const a = e.target.closest('.spec a[href="#lists"], .mini-device a');
  if (a) e.preventDefault();
});

// ---- Color scales
function hexContrast(hex) {
  const L = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '';
  const l = L(hex);
  const w = (1.05) / (l + 0.05), b = (l + 0.05) / 0.05;
  return w >= b ? `${w.toFixed(1)}:1 white` : `${b.toFixed(1)}:1 black`;
}
document.querySelectorAll('[data-scale]').forEach((el) => {
  const [hue, steps] = el.dataset.scale.split(':');
  el.innerHTML = steps.split(',').map((s) => {
    const name = `--${hue}-${s}`;
    const val = css(root, name);
    const brand = name === '--blue-500';
    return `<div class="sw"><div class="sw__chip" style="background:var(${name})"></div><div class="sw__meta"><b>${hue === 'n' ? 'neutral' : hue}-${s}${brand ? ' <i>brand</i>' : ''}</b><span>${val}</span><span>${hexContrast(val)}</span></div></div>`;
  }).join('');
});

// ---- Semantic tokens (resolved live in both themes)
const probe = document.createElement('div');
probe.dataset.theme = 'dark';
probe.hidden = true;
document.body.append(probe);
const SEM = [
  ['--bg', 'App background'], ['--surface', 'Cards, sheets'], ['--surface-2', 'Sunken areas, neutral buttons'], ['--border', 'Dividers, input borders'],
  ['--text', 'Primary text'], ['--text-2', 'Secondary text'], ['--text-3', 'Captions, meta'],
  ['--brand', 'Logo, display, map routes'], ['--primary', 'Primary buttons, selection'], ['--accent-text', 'Key-fact headlines, links'],
  ['--ok', 'Complete, ready'], ['--warn', 'Schedule risk, due soon'], ['--danger', 'Delayed, issue, destructive'], ['--info', 'In progress, en route'],
];
document.querySelector('[data-semantic] tbody').innerHTML = SEM.map(([t, use]) => {
  const l = css(root, t), d = css(probe, t);
  return `<tr><td><code>${t.slice(2)}</code></td><td><span class="mini" style="background:${l}"></span><span class="t-mono t-xs">${l}</span></td><td><span class="mini" style="background:${d}"></span><span class="t-mono t-xs">${d}</span></td><td class="hide-mobile t-muted">${use}</td></tr>`;
}).join('');

// ---- Status map
const STATUS = [
  ['Scheduled', 'info-soft', 'calendar', 'Customer · Fleet'],
  ['Crew en route', 'info', 'truck', 'Customer'],
  ['Ready for pick up', 'ok', 'check', 'Driver · Collector'],
  ['Pick up complete', 'ok', 'check', 'All roles'],
  ['In compliance', 'ok-soft', 'shield-check', 'Collector · Fleet'],
  ['Schedule risk', 'warn', 'clock', 'Fleet'],
  ['Delayed', 'danger', 'alert', 'Customer · Fleet'],
  ['Needs attention', 'danger', 'alert', 'Customer · Collector · Fleet'],
];
document.querySelector('[data-status]').innerHTML = STATUS.map(([l, k, ic, who]) => `<tr><td><strong>${l}</strong></td><td><span class="chip chip--${k}">${icon(ic)}${l}</span> <code class="tok">.chip--${k}</code></td><td class="hide-mobile t-muted">${who}</td></tr>`).join('');

// ---- Spacing
document.querySelector('[data-space]').innerHTML = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => {
  const v = css(root, `--sp-${n}`);
  return `<div class="row" style="--gap:14px"><code class="tok" style="width:84px">sp-${n}</code><span class="t-xs t-subtle t-num" style="width:36px">${v}</span><div class="space-bar" style="width:${v}"></div></div>`;
}).join('');

// ---- Icons
document.querySelector('[data-icons]').innerHTML = Object.keys(ICONS).map((n) => `<button class="icon-cell" data-copy="${n}" title="Copy “${n}”">${icon(n)}<span>${n}</span></button>`).join('');
document.querySelector('[data-icons]').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); } catch { /* clipboard unavailable */ }
  const s = b.querySelector('span'); const t = s.textContent; s.textContent = 'copied'; setTimeout(() => { s.textContent = t; }, 900);
});

// ---- TOC active state
const links = [...document.querySelectorAll('[data-toc] a')];
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
    const act = links.find((a) => a.classList.contains('is-active'));
    if (act && innerWidth < 1000) act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
}, { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('.ds-sec').forEach((s) => io.observe(s));
