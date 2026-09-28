// Procedural, token-themed SVG maps. No tiles or API keys — the street grid
// is drawn from the same grid coordinates the route stops use.
import { ICONS } from '../icons.js';

const CELL = 70, OX = 40, OY = 40, ANGLE = -24, CX = 320, CY = 280;
const STREETS = ['BEACON ST', 'MARLBOROUGH ST', 'COMMONWEALTH AVE', 'NEWBURY ST', 'BOYLSTON ST', 'ST JAMES AVE', 'HUNTINGTON AVE', 'TREMONT ST'];
const CROSS = ['ARLINGTON', 'BERKELEY', 'CLARENDON', 'DARTMOUTH', 'EXETER', 'FAIRFIELD', 'GLOUCESTER', 'HEREFORD', 'MASS AVE'];

export const gpt = (gx, gy) => [OX + gx * CELL, OY + gy * CELL];

function rot([x, y]) {
  const a = (ANGLE * Math.PI) / 180;
  const dx = x - CX, dy = y - CY;
  return [CX + dx * Math.cos(a) - dy * Math.sin(a), CY + dx * Math.sin(a) + dy * Math.cos(a)];
}

function baseLayer() {
  let s = '';
  // blocks
  for (let gx = -4; gx < 13; gx++) {
    for (let gy = -4; gy < 12; gy++) {
      const [x, y] = gpt(gx, gy);
      const park = (gx === 1 && gy === 4) || (gx === 2 && gy === 4) || (gx === 8 && gy === 1);
      s += `<rect x="${x + 9}" y="${y + 9}" width="${CELL - 18}" height="${CELL - 18}" rx="4" fill="var(${park ? '--map-park' : '--map-block'})"/>`;
      if (!park && (gx + gy) % 3 === 0) s += `<rect x="${x + 16}" y="${y + 16}" width="${CELL / 2 - 16}" height="${CELL / 2 - 16}" rx="2" fill="var(--map-land)" opacity=".7"/>`;
    }
  }
  // river
  s += `<path d="M-300 -130 C 100 -60, 300 -110, 900 -40" stroke="var(--map-water)" stroke-width="90" fill="none"/>`;
  // streets
  for (let gy = -4; gy < 12; gy++) {
    const y = OY + gy * CELL;
    const w = gy === 2 ? 16 : 10;
    s += `<line x1="-400" y1="${y}" x2="1000" y2="${y}" stroke="var(--map-road)" stroke-width="${w}"/>`;
  }
  for (let gx = -4; gx < 13; gx++) {
    const x = OX + gx * CELL;
    s += `<line x1="${x}" y1="-400" x2="${x}" y2="1000" stroke="var(--map-road)" stroke-width="10"/>`;
  }
  // labels
  STREETS.forEach((n, gy) => {
    const y = OY + gy * CELL + 3.5;
    s += `<text x="${OX + 1.5 * CELL + (gy % 2) * CELL}" y="${y}" font-size="9" font-weight="700" letter-spacing="1" fill="var(--map-label)">${n}</text>`;
  });
  CROSS.forEach((n, gx) => {
    const x = OX + gx * CELL + 3.5;
    s += `<text transform="translate(${x} ${OY + 3.5 * CELL}) rotate(90)" font-size="8" font-weight="700" letter-spacing="1" fill="var(--map-label)">${n}</text>`;
  });
  return s;
}

function iconG(name, size = 18, color = 'currentColor') {
  const k = size / 24;
  return `<g transform="translate(${-size / 2} ${-size / 2}) scale(${k})" fill="none" stroke="${color}" stroke-width="${2.2 / k > 3 ? 2.4 : 2.2}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;
}

/**
 * Route map.
 * @param {object} o
 * @param {Array} o.stops   stops with gx, gy, status, customer
 * @param {number} o.current index of the current stop
 * @param {string} o.focus  'route' | 'current' | stop id
 * @param {number} o.zoom
 * @param {string} o.homeId  highlight a customer's stop as a home pin
 * @param {boolean} o.labels show stop numbers
 */
export function routeMap({ stops = [], current = 0, focus = 'route', zoom = 1, homeId = null, labels = true, truck = true, fullRoute = true, offsetY = 0 } = {}) {
  const pts = [[0, 1], ...stops.map((s) => [s.gx, s.gy])].map(([gx, gy]) => gpt(gx, gy));
  const cur = Math.min(current, stops.length);
  const truckPt = pts[cur]; // truck sits at last reached point (depot = 0)

  const donePath = pts.slice(0, cur + 1).map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  const todoPath = pts.slice(cur).map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

  let pins = '';
  stops.forEach((s, i) => {
    const [x, y] = gpt(s.gx, s.gy);
    const counter = `rotate(${-ANGLE})`;
    if (s.id === homeId) {
      pins += `<g transform="translate(${x} ${y}) ${counter}"><circle r="20" fill="#fff" stroke="var(--blue-500)" stroke-width="4"/>${iconG('home', 20, 'var(--blue-600)')}</g>`;
      return;
    }
    const done = s.status === 'done', issue = s.status === 'issue', isCur = i === cur;
    const fill = done ? 'var(--ok)' : issue ? 'var(--danger)' : isCur ? 'var(--primary)' : 'var(--surface)';
    const stroke = done ? 'var(--ok)' : issue ? 'var(--danger)' : 'var(--primary)';
    const txt = done ? 'var(--ok-ink)' : issue ? 'var(--danger-ink)' : isCur ? 'var(--primary-ink)' : 'var(--text)';
    const r = isCur ? 14 : 11;
    pins += `<g transform="translate(${x} ${y}) ${counter}"><circle r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>${labels ? `<text y="4" text-anchor="middle" font-size="${isCur ? 12 : 10}" font-weight="800" fill="${txt}">${i + 1}</text>` : ''}</g>`;
  });

  // Viewbox focus
  let fpt, fitW = 0, fitH = 0;
  if (focus === 'route') {
    const xs = pts.map((p) => rot(p)[0]), ys = pts.map((p) => rot(p)[1]);
    fpt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    fitW = Math.max(...xs) - Math.min(...xs) + 70;
    fitH = Math.max(...ys) - Math.min(...ys) + 70;
  } else if (focus === 'current') {
    fpt = rot(truckPt);
  } else {
    const s = stops.find((x) => x.id === focus);
    fpt = rot(s ? gpt(s.gx, s.gy) : truckPt);
  }
  // 'route' fits the whole route (meet); other focuses crop to fill (slice)
  const W = fitW ? fitW / zoom : 560 / zoom, H = fitH ? fitH / zoom : 560 / zoom;
  const vb = `${fpt[0] - W / 2} ${fpt[1] - H / 2 + offsetY * H} ${W} ${H}`;
  const par = fitW ? 'xMidYMid meet' : 'xMidYMid slice';
  const [tx, ty] = truckPt;

  return `<svg viewBox="${vb}" preserveAspectRatio="${par}" role="img" aria-label="Route map">
    <rect x="-2000" y="-2000" width="5000" height="5000" fill="var(--map-land)"/>
    <g transform="rotate(${ANGLE} ${CX} ${CY})">
      ${baseLayer()}
      ${fullRoute ? `<path d="${todoPath}" fill="none" stroke="var(--blue-500)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>` : ''}
      <path d="${donePath}" fill="none" stroke="var(--blue-300)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 12" opacity=".9"/>
      ${pins}
      ${truck ? `<g class="map-truck" style="transform: translate(${tx}px, ${ty}px)"><g transform="rotate(${-ANGLE})"><circle r="26" fill="var(--blue-500)" opacity=".2"><animate attributeName="r" values="18;30;18" dur="2.4s" repeatCount="indefinite"/></circle><circle r="17" fill="var(--blue-500)" stroke="#fff" stroke-width="3"/>${iconG('truck', 18, '#fff')}</g></g>` : ''}
    </g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Fleet territory map — status-coloured zones (matches the v1 manager view).
// ---------------------------------------------------------------------------
export const ZONES = [
  { id: 'north-end', name: 'North End', pts: '250,20 330,10 380,60 350,110 280,100', lx: 312, ly: 58 },
  { id: 'west-end', name: 'West End', pts: '170,30 250,20 280,100 210,115 160,80', lx: 215, ly: 68 },
  { id: 'beacon-hill', name: 'Beacon Hill', pts: '110,90 160,80 210,115 200,165 120,160', lx: 160, ly: 128 },
  { id: 'downtown', name: 'Downtown', pts: '210,115 280,100 350,110 330,180 250,190 200,165', lx: 268, ly: 148 },
  { id: 'back-bay', name: 'Back Bay', pts: '20,150 120,160 200,165 190,230 90,240 30,220', lx: 105, ly: 198 },
  { id: 'chinatown', name: 'Chinatown', pts: '200,165 250,190 260,240 190,230', lx: 225, ly: 210 },
  { id: 'seaport', name: 'Seaport', pts: '330,180 390,170 400,250 320,265 260,240 250,190', lx: 325, ly: 222 },
  { id: 'south-boston', name: 'South Boston', pts: '90,240 190,230 260,240 320,265 300,300 60,300', lx: 190, ly: 272 },
];
const ZC = {
  ok: ['var(--green-400)', 'var(--green-900)'],
  warn: ['var(--yellow-400)', 'var(--n-900)'],
  danger: ['var(--red-400)', '#fff'],
  info: ['var(--blue-400)', 'var(--blue-900)'],
};

export function zoneMap(statusByZone = {}, trucks = []) {
  let streets = '';
  for (let i = -20; i < 50; i++) {
    streets += `<line x1="${i * 14}" y1="0" x2="${i * 14 - 120}" y2="320" stroke="var(--map-road)" stroke-width="1.2" opacity=".7"/>`;
    streets += `<line x1="0" y1="${i * 12}" x2="420" y2="${i * 12 - 60}" stroke="var(--map-road)" stroke-width="1.2" opacity=".7"/>`;
  }
  const zones = ZONES.map((z) => {
    const st = statusByZone[z.id] || 'info';
    const [fill] = ZC[st];
    return `<a href="#/fleet?zone=${z.id}" aria-label="${z.name}"><polygon points="${z.pts}" fill="${fill}" fill-opacity=".38" stroke="${fill}" stroke-width="3" stroke-linejoin="round"/></a>`;
  }).join('');
  const labels = ZONES.map((z) => {
    const st = statusByZone[z.id] || 'info';
    const [bg, ink] = ZC[st];
    const w = z.name.length * 5.6 + 14;
    return `<g transform="translate(${z.lx} ${z.ly})" pointer-events="none"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="5" fill="${bg}"/><text y="3.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="${ink}">${z.name}</text></g>`;
  }).join('');
  const dots = trucks.map((t) => `<circle cx="${t.x}" cy="${t.y}" r="3.2" fill="var(--n-900)" stroke="#fff" stroke-width="1.5"/>`).join('');
  return `<svg viewBox="0 0 420 310" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Territory status map">
    <rect width="420" height="310" fill="var(--map-land)"/>
    <path d="M0 -10 C 120 20, 200 -5, 430 40 L430 -10 Z" fill="var(--map-water)"/>
    <path d="M380 110 C 400 150, 430 160, 430 170 L430 110 Z" fill="var(--map-water)"/>
    ${streets}
    ${zones}${dots}${labels}
  </svg>`;
}

// Simple static location thumbnail (customer profile, address previews)
export function miniMap(gx = 4, gy = 3) {
  return routeMap({ stops: [{ id: 'x', gx, gy, status: 'pending' }], current: 0, focus: 'x', zoom: 2.2, homeId: 'x', truck: false, fullRoute: false, labels: false });
}
