// Per-device display & accessibility preferences, shared by every CoCo app.
// Kept apart from the demo data store so "Reset demo data" never wipes them.
// Applied as attributes on <html>; see the "Accessibility preferences" block
// in tokens.css for what each one changes.

const KEY = 'coco-prefs-v1';
const DEFAULTS = { text: 'md', contrast: false, motion: 'system', targets: false, underline: false, appearance: {} };

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw, appearance: { ...(raw.appearance || {}) } };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS, appearance: {} };
}

export function applyPrefs(p = state) {
  const r = document.documentElement;
  r.dataset.text = p.text;
  r.toggleAttribute('data-contrast', p.contrast);
  r.toggleAttribute('data-underline', p.underline);
  r.toggleAttribute('data-targets', p.targets);
  if (p.motion === 'reduce') r.dataset.motion = 'reduce'; else delete r.dataset.motion;
}

export const reducedMotion = () => state.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export const prefs = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch, appearance: { ...state.appearance, ...(patch.appearance || {}) } };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
    applyPrefs();
    subs.forEach((f) => f(state));
  },
  reset() { state = { ...DEFAULTS, appearance: {} }; prefs.set({}); },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = load(); applyPrefs(); subs.forEach((f) => f(state));
});

applyPrefs();
