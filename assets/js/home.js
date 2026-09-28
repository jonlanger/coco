// CoCo homepage motion.
// Concept: "Every handoff, visible." Two set pieces carry the motion — the
// hero ops map and the scroll-driven story phone. Everything else is a single,
// quiet reveal. Beat = 500ms; entrances expo-out, exits expo-in. Respects
// reduced motion throughout.
import { ICONS, icon } from './icons.js';
import { routeMap } from './app/map.js';

const BEAT = 500;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- icons
function hydrate(scope = document) {
  $$('[data-i]', scope).forEach((el) => {
    if (el.className || el.tagName !== 'SPAN') el.innerHTML = icon(el.dataset.i);
    else el.outerHTML = icon(el.dataset.i);
  });
  $$('[data-ci]', scope).forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.ci)));
}
hydrate();

// ---------------------------------------------------------------- nav
const nav = $('[data-nav]');
const onScroll = () => nav.classList.toggle('is-solid', scrollY > 12);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
$('[data-burger]').addEventListener('click', (e) => {
  const open = nav.classList.toggle('is-open');
  e.currentTarget.setAttribute('aria-expanded', open);
  e.currentTarget.innerHTML = icon(open ? 'x' : 'menu');
});
$$('[data-sheet] a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('is-open'); $('[data-burger]').innerHTML = icon('menu'); }));

// ---------------------------------------------------------------- reveal
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
$$('[data-reveal], [data-hub], [data-insight]').forEach((el) => io.observe(el));

// ---------------------------------------------------------------- statement: scroll-linked word lighting
(() => {
  const sec = $('[data-statement]');
  const p = $('p', sec);
  const html = p.innerHTML.replace(/<span class="accent-group">(.*?)<\/span>/, (_, t) => t.split(' ').map((w) => `§${w}`).join(' '));
  p.innerHTML = html.split(' ').map((w) => w.startsWith('§') ? `<span class="wd accent">${w.slice(1)}</span>` : `<span class="wd">${w}</span>`).join(' ');
  const words = $$('.wd', p);
  const update = () => {
    const r = sec.getBoundingClientRect();
    const prog = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height * 0.9)));
    const n = reduce ? words.length : Math.round(prog * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  };
  addEventListener('scroll', update, { passive: true }); update();
})();

// ---------------------------------------------------------------- barcode
(() => {
  const bc = $('[data-barcode]'); if (!bc) return;
  const w = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 4, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 4, 1, 2];
  bc.innerHTML = w.map((x) => `<i style="width:${x}px"></i>`).join('');
})();

// ---------------------------------------------------------------- story: sticky phone
// Desktop: one phone stays pinned while the four steps scroll past. The HUD
// names the app holding the pickup, the progress bar tracks scroll exactly,
// and each change of hands drops a hand-off notice into the phone.
(() => {
  const stage = $('[data-stage]');
  const steps = $$('[data-step]');
  const who = $('[data-who]');
  const bars = $$('[data-prog] span');
  const handoff = $('[data-handoff]');
  // Driver mini map (real map renderer from the product)
  const stops = [[1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [4, 3], [5, 3], [5, 4]].map(([gx, gy], i) => ({ id: 's' + i, gx, gy, status: i < 2 ? 'done' : 'pending' }));
  $$('[data-minimap]').forEach((m) => { m.innerHTML = routeMap({ stops, current: 2, focus: 'current', zoom: 1.7, offsetY: 0.12 }); });

  steps.forEach((s) => { const mini = $('.phone > .mini', s); if (mini) stage.append(mini.cloneNode(true)); });
  const minis = $$('.mini', stage);
  const META = steps.map((s) => ({ img: $('.story__role img', s).getAttribute('src'), label: $('.story__role', s).textContent.trim() }));
  const HANDOFF = [null, 'Request approved · routed to Truck 0091', 'Truck at 185 Antonino St · collector notified', 'Photo proof sent to Meredith and fleet'];

  let cur = -1, leaveTimer;
  const setWho = (i, dir) => {
    const el = document.createElement('div');
    el.className = reduce ? '' : dir > 0 ? 'is-in' : 'is-out';
    el.innerHTML = `<img src="${META[i].img}" alt=""><span>${META[i].label}</span><em>0${i + 1} / 0${steps.length}</em>`;
    [...who.children].forEach((old) => { old.className = dir > 0 ? 'is-out' : 'is-in'; setTimeout(() => old.remove(), 600); });
    who.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.className = ''; }));
  };
  const activate = (i) => {
    if (i === cur) return;
    const dir = i > cur ? 1 : -1;
    steps.forEach((s, j) => s.classList.toggle('is-active', i === j));
    // Hold the outgoing screen under the incoming one until the cross-fade ends
    const prev = minis[cur];
    minis.forEach((m) => m.classList.remove('is-leaving'));
    if (prev && prev !== minis[i]) { prev.classList.remove('is-active'); prev.classList.add('is-leaving'); }
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => prev?.classList.remove('is-leaving'), 550);
    const m = minis[i];
    m.classList.remove('is-active'); void m.offsetWidth; m.classList.add('is-active'); // replay child beats
    setWho(i, dir);
    if (HANDOFF[i] && dir > 0 && !reduce) {
      handoff.innerHTML = `${icon('check-circle')}<span>${HANDOFF[i]}</span>`;
      handoff.classList.remove('is-on'); void handoff.offsetWidth; handoff.classList.add('is-on');
    }
    cur = i;
  };
  const sio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); activate(steps.indexOf(e.target)); }
  }), { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => sio.observe(s));

  // Scroll-linked progress: each segment fills as its step crosses mid-screen
  let ticking = false;
  const progress = () => {
    ticking = false;
    const mid = innerHeight / 2;
    steps.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      bars[i].style.setProperty('--p', Math.min(1, Math.max(0, (mid - r.top) / r.height)).toFixed(3));
    });
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(progress); } }, { passive: true });
  progress();

  // Mobile: animate the inline phone when it scrolls into view
  const mio = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.closest('[data-step]').classList.add('is-in'); }), { threshold: 0.3 });
  steps.forEach((s) => { const ph = $('.phone', s); if (ph) mio.observe(ph); });
  activate(0);
})();

// ---------------------------------------------------------------- hero ops simulation
(() => {
  const root = $('[data-ops]'); if (!root) return;
  const svg = $('[data-ops-svg]', root);
  const feed = $('[data-ops-feed]', root);
  const countEl = $('[data-ops-count]', root);
  const barEl = $('[data-ops-bar]', root);
  const pauseBtn = $('[data-ops-pause]', root);

  const C = 80, O = 40, ROT = -16;
  const P = (c, r) => [O + c * C, O + r * C];
  const VERTS = [[0, 2], [2, 2], [2, 4], [4, 4], [4, 3], [6, 3], [6, 5], [8, 5], [8, 3]];

  // City layer
  let city = '';
  for (let c = -4; c < 12; c++) for (let r = -3; r < 10; r++) {
    const [x, y] = P(c, r);
    const park = (c === 3 && r === 2) || (c === 7 && r === 4) || (c === 1 && r === 5);
    city += `<rect x="${x + 9}" y="${y + 9}" width="${C - 18}" height="${C - 18}" rx="6" fill="${park ? '#16241B' : '#181B21'}"/>`;
    if (!park && (c * 3 + r) % 4 === 0) city += `<rect x="${x + 18}" y="${y + 18}" width="${C / 2 - 18}" height="${C / 2 - 18}" rx="3" fill="#1D2128"/>`;
  }
  for (let r = -3; r < 10; r++) city += `<line x1="-400" x2="1100" y1="${O + r * C}" y2="${O + r * C}" stroke="#22262D" stroke-width="${r === 3 ? 16 : 10}"/>`;
  for (let c = -4; c < 12; c++) city += `<line y1="-400" y2="1000" x1="${O + c * C}" x2="${O + c * C}" stroke="#22262D" stroke-width="10"/>`;
  city += `<path d="M-300 520 C 100 460, 300 640, 1000 560" stroke="#15233A" stroke-width="80" fill="none"/>`;

  const d = VERTS.map(([c, r], i) => `${i ? 'L' : 'M'}${P(c, r).join(' ')}`).join(' ');
  const stopsSvg = VERTS.slice(1).map(([c, r], i) => {
    const [x, y] = P(c, r);
    return `<g class="ops__stop" data-stop="${i}" transform="translate(${x} ${y})"><circle class="ripple" r="12"/><circle class="ring" r="12"/><g class="tick" transform="rotate(${-ROT}) translate(-8 -8) scale(.667)" fill="none" stroke="#0E2A0A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${ICONS.check}</g></g>`;
  }).join('');
  const truck = `<g data-truck><circle r="30" fill="rgb(0 122 255 / .22)"><animate attributeName="r" values="22;34;22" dur="2s" repeatCount="indefinite"/></circle><circle r="19" fill="#007AFF" stroke="#fff" stroke-width="3"/><g transform="rotate(${-ROT}) translate(-10 -10) scale(.833)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS.truck}</g></g>`;

  const ADDR = ['40 Appleton St', '185 Antonino St', '77 Clarendon St', '9 Berkeley St', '24 Commonwealth Ave', '310 Marlborough St', '58 Exeter St', '221 Newbury St'];
  const callouts = VERTS.slice(1).map(([c, r], i) => {
    const [x, y] = P(c, r); const w = ADDR[i].length * 6.3 + 30;
    return `<g transform="translate(${x} ${y}) rotate(${-ROT})"><g class="ops__callout" data-callout="${i}"><rect x="${-w / 2}" y="-52" width="${w}" height="26" rx="13"/><text x="${-w / 2 + 12}" y="-35">✓ ${ADDR[i]}</text></g></g>`;
  }).join('');
  // Other trucks in the fleet drift along nearby streets for context
  const GHOSTS = [{ row: -1, speed: 0.021, off: 0 }, { col: 7, speed: 0.017, off: 300 }, { row: 7, speed: -0.019, off: 600 }, { col: -1, speed: -0.015, off: 200 }];
  const ghosts = GHOSTS.map((_, i) => `<circle class="ops__ghost" r="7" data-ghost="${i}"/>`).join('');

  svg.innerHTML = `<g data-cam>
    ${city}${ghosts}
    <path class="ops__route-bg" d="${d}" data-bg/>
    <path class="ops__route" d="${d}" data-route/>
    ${stopsSvg}${truck}${callouts}
  </g>`;
  const cam = $('[data-cam]', svg);
  const ghostEls = $$('[data-ghost]', svg);

  const route = $('[data-route]', svg), bg = $('[data-bg]', svg), truckEl = $('[data-truck]', svg);
  const total = route.getTotalLength();
  route.style.strokeDasharray = `${total}`;
  route.style.strokeDashoffset = `${total}`;
  // Route "draws" in as the panel arrives
  bg.style.strokeDasharray = `${total}`; bg.style.strokeDashoffset = `${total}`;
  bg.animate([{ strokeDashoffset: total }, { strokeDashoffset: 0 }], { duration: reduce ? 1 : 1400, delay: reduce ? 0 : BEAT * 3, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });

  // Length along path at each vertex
  const segLen = VERTS.slice(1).map(([c, r], i) => { const [x1, y1] = P(...VERTS[i]); const [x2, y2] = P(c, r); return Math.hypot(x2 - x1, y2 - y1); });
  const at = segLen.reduce((a, l) => (a.push(a[a.length - 1] + l), a), [0]);
  const stopEls = $$('[data-stop]', svg);
  const N = stopEls.length;

  const ROLE = {
    Customer: ['var(--blue-50)', 'var(--blue-700)'], Driver: ['var(--n-900)', '#fff'],
    Collector: ['var(--green-400)', 'var(--green-900)'], Fleet: ['var(--yellow-100)', 'var(--yellow-700)'],
  };
  const EVENTS = [
    ['Customer', 'plus', 'Pickup requested', 'Bulk item · 3 bags · photo'],
    ['Driver', 'route', 'Route re-optimized', 'Boylston closed · −6 min'],
    ['Collector', 'scan', 'Bin verified', 'CC-204347 · 185 Antonino St'],
    ['Customer', 'bell', '“Your truck is 2 stops away”', 'ETA 10:05 AM'],
    ['Collector', 'shield-check', 'Compliance confirmed', '4 / 4 checks · photo proof'],
    ['Customer', 'check-circle', 'Pickup complete', 'Photo sent to Meredith'],
    ['Fleet', 'chart', 'Truck 0091 on schedule', '98% on time today'],
    ['Driver', 'fuel', 'Maintenance logged', 'Brake check due in 6 days'],
    ['Fleet', 'check-circle', 'Route complete', '8 stops · 0 incidents'],
  ];
  const push = (i) => {
    const [role, ic, title, sub] = EVENTS[i % EVENTS.length];
    const [bgc, fg] = ROLE[role];
    const el = document.createElement('div');
    el.className = 'evt';
    el.innerHTML = `<span class="evt__ic" style="background:${bgc};color:${fg}">${icon(ic)}</span><span><b>${title}</b><small>${sub}</small></span><span class="evt__role">${role}</span>`;
    [...feed.children].forEach((c) => c.classList.add('is-old'));
    feed.append(el);
    const live = [...feed.children].filter((c) => !c.classList.contains('is-gone'));
    if (live.length > 2) { const old = live[0]; old.classList.add('is-gone'); setTimeout(() => old.remove(), 260); }
  };
  const setCount = (n) => { countEl.textContent = `${n}/${N}`; barEl.style.width = `${(n / N) * 100}%`; };

  // Timeline: travel 2 beats per leg, hold 1.5 beats at each stop, 4-beat rest before loop.
  const TRAVEL = BEAT * 2, HOLD = BEAT * 1.5, REST = BEAT * 4;
  let leg = 0, phase = 'travel', tIn = 0, last = 0, paused = false, visible = true, started = false;

  // Camera: starts on the whole route, pushes in to follow the truck (aiming
  // a little ahead of it), then pulls back out to show the finished route.
  // ax/ay = where on screen the camera target sits; while following, keep the
  // truck up and left of the event feed (bottom-right, or full-width on phones).
  const OVERVIEW = { x: 355, y: 315, z: 0.9, ax: 320, ay: 270 };
  const anchor = () => (root.clientWidth >= 560 ? { ax: 250, ay: 230 } : { ax: 320, ay: 190 });
  const view = { ...OVERVIEW };
  let aim = { ...OVERVIEW }, truckLen = 0;
  const setCam = () => cam.setAttribute('transform', `translate(${view.ax.toFixed(2)} ${view.ay.toFixed(2)}) rotate(${ROT}) scale(${view.z.toFixed(4)}) translate(${(-view.x).toFixed(2)} ${(-view.y).toFixed(2)})`);
  const follow = () => {
    const p = route.getPointAtLength(Math.min(total, truckLen + 70));
    aim = { x: p.x, y: p.y, z: 1.38, ...anchor() };
  };
  const stepCam = (dt) => {
    const k = 1 - Math.exp(-dt / 520);
    for (const key of ['x', 'y', 'z', 'ax', 'ay']) view[key] += (aim[key] - view[key]) * k;
    setCam();
  };
  const moveGhosts = (t) => ghostEls.forEach((g, i) => {
    const G = GHOSTS[i];
    const along = ((t * G.speed + G.off) % 900 + 900) % 900 - 200;
    const [x, y] = G.row !== undefined ? [along, O + G.row * C] : [O + G.col * C, along];
    g.setAttribute('cx', x.toFixed(1)); g.setAttribute('cy', y.toFixed(1));
  });

  const place = (len) => {
    truckLen = len;
    const p = route.getPointAtLength(len);
    truckEl.setAttribute('transform', `translate(${p.x} ${p.y})`);
    route.style.strokeDashoffset = `${total - len}`;
  };
  const reset = () => {
    leg = 0; phase = 'travel'; tIn = 0;
    stopEls.forEach((s) => s.classList.remove('is-done', 'is-hit'));
    $$('.ops__callout', svg).forEach((c) => c.classList.remove('is-on'));
    [...feed.children].forEach((c) => { c.classList.add('is-gone'); setTimeout(() => c.remove(), 260); });
    setCount(0); place(0);
  };
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  const frame = (now) => {
    const dt = last ? Math.min(64, now - last) : 0; last = now;
    if (!paused && visible) {
      tIn += dt;
      if (phase === 'travel') {
        const k = Math.min(1, tIn / TRAVEL);
        place(at[leg] + segLen[leg] * easeInOut(k));
        if (k === 1) {
          const s = stopEls[leg];
          s.classList.add('is-done', 'is-hit');
          const co = $(`[data-callout="${leg}"]`, svg);
          co.classList.remove('is-on'); void co.getBoundingClientRect(); co.classList.add('is-on');
          push(leg + 1); setCount(leg + 1);
          phase = 'hold'; tIn = 0;
        }
      } else if (phase === 'hold' && tIn >= HOLD) {
        leg++; tIn = 0;
        phase = leg >= N ? 'rest' : 'travel';
      } else if (phase === 'rest' && tIn >= REST) { reset(); push(0); }
      if (phase === 'rest') aim = { ...OVERVIEW }; else follow();
      stepCam(dt);
      moveGhosts(now);
    }
    requestAnimationFrame(frame);
  };

  place(0); setCount(0); setCam(); moveGhosts(0);
  if (reduce) {
    // Static, informative end-state: route complete, three latest events
    place(total); stopEls.forEach((s) => s.classList.add('is-done')); setCount(N); [6, 7, 8].forEach(push);
    pauseBtn.hidden = true;
    return;
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  document.addEventListener('visibilitychange', () => { last = 0; });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.innerHTML = icon(paused ? 'play' : 'pause');
    pauseBtn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  });
  // Start after the panel lands and the route has drawn (≈ 6 beats)
  setTimeout(() => { if (!started) { started = true; push(0); requestAnimationFrame(frame); } }, BEAT * 6);
  // First event appears with the panel so the feed isn't empty; sim starts on leg 0.
})();
