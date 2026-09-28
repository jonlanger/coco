// Street routing for the driver's in-cab navigation — offline, no services.
//
// assets/map/backbay-roads.json is a drivable road graph of the route area,
// extracted from the same Protomaps tiles the basemap draws (so the route line
// sits exactly on the streets you see, and turn-by-turn uses the real street
// names). Regenerate it with scripts/extract-roads.js if the tiles or the
// route area change.
//
// Routes respect one-way streets, prefer through streets over alleys, go
// around road closures the fleet manager draws, and avoid hazard zones when
// there's another way.

const GRAPH = new URL('../../map/backbay-roads.json', import.meta.url).href;

const ONEWAY = 1, SERVICE = 2;
const KX = 82000, KY = 111320; // metres per degree (lng, lat) at Boston's latitude
const dist = ([x1, y1], [x2, y2]) => Math.hypot((x2 - x1) * KX, (y2 - y1) * KY);
const bearing = ([x1, y1], [x2, y2]) => (Math.atan2((x2 - x1) * KX, (y2 - y1) * KY) * 180) / Math.PI;

let G = null;
export function loadRoads() {
  G ??= fetch(GRAPH).then((r) => { if (!r.ok) throw new Error('roads'); return r.json(); }).then((g) => {
    g.len = g.edges.map(([a, b]) => dist(g.nodes[a], g.nodes[b]));
    g.out = g.nodes.map(() => []); // node → [edge index, forward?]
    g.edges.forEach(([a, b, , f], i) => { g.out[a].push([i, true]); g.out[b].push([i, false]); });
    return g;
  });
  G.catch(() => { G = null; });
  return G;
}

// Ray-cast point-in-polygon. `pts` is [[lat, lng], …] as the store keeps areas.
function inside([ln, la], pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ai, bi] = pts[i], [aj, bj] = pts[j];
    if ((bi > ln) !== (bj > ln) && la < ((aj - ai) * (ln - bi)) / (bj - bi) + ai) c = !c;
  }
  return c;
}

// Nearest point on any edge → { edge, t (0..1 along a→b), p [lng, lat] }
function snap(g, p) {
  let best = null, bd = Infinity;
  g.edges.forEach(([a, b], i) => {
    const A = g.nodes[a], B = g.nodes[b];
    const ax = (A[0] - p[0]) * KX, ay = (A[1] - p[1]) * KY, dx = (B[0] - A[0]) * KX, dy = (B[1] - A[1]) * KY;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    // Alleys only if nothing better is close by
    const w = d + (g.edges[i][3] & SERVICE ? 25 : 0);
    if (w < bd) { bd = w; best = { edge: i, t, p: [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])] }; }
  });
  return best;
}

/**
 * Shortest drivable path between two [lng, lat] points.
 * @param {Array} avoid areas from the store ({ kind, latlngs }) — closures are
 *   impassable, hazard zones are heavily penalised.
 * @returns {{ coords: Array, names: Array, length: number }} names[i] is the
 *   street name of the segment coords[i] → coords[i + 1].
 */
export function shortest(g, from, to, avoid = []) {
  const closed = avoid.filter((a) => a.kind === 'closure'), hazard = avoid.filter((a) => a.kind === 'hazmat');
  const cost = g.edges.map(([a, b, , f], i) => {
    const A = g.nodes[a], B = g.nodes[b], mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let k = f & SERVICE ? 3 : 1;
    if (closed.some((z) => inside(mid, z.latlngs) || inside(A, z.latlngs) || inside(B, z.latlngs))) k *= 1e4;
    else if (hazard.some((z) => inside(mid, z.latlngs))) k *= 20;
    return g.len[i] * k;
  });
  const s = snap(g, from), e = snap(g, to);
  const N = g.nodes.length, S = N, T = N + 1; // virtual start / end nodes
  const D = new Float64Array(N + 2).fill(Infinity), prev = new Int32Array(N + 2).fill(-1), via = new Int32Array(N + 2).fill(-1);
  const done = new Uint8Array(N + 2);
  // Driving the wrong way down a one-way street is allowed only as a last resort
  const step = (i, fwd) => cost[i] * (!fwd && g.edges[i][3] & ONEWAY ? 50 : 1);

  // Leave the start point along its edge in either direction
  const [sa, sb] = g.edges[s.edge];
  const relax = (u, v, c, edge) => { if (D[u] + c < D[v]) { D[v] = D[u] + c; prev[v] = u; via[v] = edge; } };
  D[S] = 0;
  relax(S, sb, step(s.edge, true) * (1 - s.t), s.edge);
  relax(S, sa, step(s.edge, false) * s.t, s.edge);
  const [ea, eb] = g.edges[e.edge];
  if (s.edge === e.edge) relax(S, T, step(s.edge, e.t >= s.t) * Math.abs(e.t - s.t), s.edge);

  // Dijkstra — the graph is small (≈1.4k nodes), a linear scan is plenty fast
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < N + 2; i++) if (!done[i] && D[i] < best) { best = D[i]; u = i; }
    if (u === -1 || u === T) break;
    done[u] = 1;
    if (u === ea) relax(u, T, step(e.edge, true) * e.t, e.edge);
    if (u === eb) relax(u, T, step(e.edge, false) * (1 - e.t), e.edge);
    if (u >= N) continue;
    for (const [i, fwd] of g.out[u]) {
      const [a, b] = g.edges[i];
      relax(u, fwd ? b : a, step(i, fwd), i);
    }
  }
  if (prev[T] === -1) return { coords: [from, to], names: [''], length: dist(from, to) };

  const coords = [], names = [];
  for (let v = T; v !== -1; v = prev[v]) {
    coords.unshift(v === T ? e.p : v === S ? s.p : g.nodes[v]);
    if (prev[v] !== -1) names.unshift(g.names[g.edges[via[v]][2]]);
  }
  coords.unshift(from); names.unshift(names[0] || '');
  coords.push(to); names.push(names.at(-1) || '');
  let length = 0;
  for (let i = 1; i < coords.length; i++) length += dist(coords[i - 1], coords[i]);
  return { coords, names, length };
}

// ---------------------------------------------------------------- guidance
const short = (n) => n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bRoad\b/, 'Rd').replace(/\bPlace\b/, 'Pl').replace(/\bBoulevard\b/, 'Blvd').replace(/\bSquare\b/, 'Sq');
export const streetLabel = (n) => (!n ? 'the road' : /^Public Alley/.test(n) ? 'the alley' : short(n));

function turnOf(delta) {
  const a = Math.abs(delta), side = delta > 0 ? 'right' : 'left';
  if (a < 25) return { verb: 'Continue', icon: 'arrow-up', side: null };
  if (a < 60) return { verb: `Bear ${side}`, icon: side === 'right' ? 'arrow-up-right' : 'arrow-up-left', side };
  if (a < 150) return { verb: `Turn ${side}`, icon: side === 'right' ? 'turn-right' : 'turn-left', side };
  return { verb: 'Make a U-turn', icon: 'u-turn', side };
}
// Heading of the path leaving (dir 1) or arriving at (dir -1) vertex i, measured over ~15 m
function headingAt(coords, i, dir) {
  let j = i, d = 0;
  while (d < 15 && j + dir >= 0 && j + dir < coords.length) { d += dist(coords[j], coords[j + dir]); j += dir; }
  return dir > 0 ? bearing(coords[i], coords[j]) : bearing(coords[j], coords[i]);
}

/**
 * Turn-by-turn steps for a path from `shortest`. Each step starts where the
 * street changes (or the road turns sharply) and runs to the next one.
 * @returns Array<{ at: metres from start, verb, icon, street, turn }>
 */
export function maneuvers({ coords, names }) {
  const steps = [];
  let along = 0, cur = names[1] || names[0];
  steps.push({ at: 0, verb: 'Head out', icon: 'arrow-up', street: cur });
  // Skip the first and last vertex: that's pulling away from / into the curb
  for (let i = 1; i < coords.length - 1; i++) {
    along += dist(coords[i - 1], coords[i]);
    if (i === 1 || i === coords.length - 2) continue;
    const next = names[i];
    const inH = headingAt(coords, i, -1), outH = headingAt(coords, i, 1);
    const delta = ((outH - inH + 540) % 360) - 180;
    const renamed = next && next !== cur;
    if (!renamed && Math.abs(delta) < 60) continue;
    const last = steps.at(-1);
    if (last.at > 0 && along - last.at < 20) {
      // Two bends in quick succession (divided avenues, jogs) read as one
      // maneuver: compare the heading into the first with the heading out of the second
      const turn = ((outH - last.inH + 540) % 360) - 180;
      Object.assign(last, turnOf(turn), { turn, street: next || last.street });
      if (renamed && !last.side) last.verb = 'Continue onto';
    } else {
      const t = turnOf(delta);
      steps.push({ at: along, ...t, verb: renamed && !t.side ? 'Continue onto' : t.verb, street: next || cur, turn: delta, inH });
    }
    if (next) cur = next;
  }
  // Keep only real maneuvers: a change of street, or a U-turn. Bends in the
  // road and crossing a divided avenue's median aren't instructions.
  const out = [steps[0]];
  for (const x of steps.slice(1)) {
    const same = x.street === out.at(-1).street;
    if (x.icon === 'u-turn' || (!same && (x.side || x.verb === 'Continue onto'))) out.push(x);
  }
  along += dist(coords.at(-2), coords.at(-1));
  out.push({ at: along, verb: 'Arrive', icon: 'pin', street: '' });
  return out;
}

/** Position at `d` metres along a path, heading toward the road ~12 m ahead (so short curb connectors and tile jogs don't swing it). */
export function pointAt(coords, d) {
  const here = locate(coords, d), ahead = locate(coords, d + 12);
  const heading = dist(here.p, ahead.p) > 2 ? bearing(here.p, ahead.p) : here.heading;
  return { ...here, heading };
}
function locate(coords, d) {
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = dist(coords[i - 1], coords[i]);
    if (acc + seg >= d || i === coords.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, (d - acc) / seg)) : 0;
      const A = coords[i - 1], B = coords[i];
      return { p: [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])], heading: bearing(A, B), i };
    }
    acc += seg;
  }
  return { p: coords[0], heading: 0, i: 0 };
}

/** The part of a path from `d0` to `d1` metres. */
export function slice(coords, d0, d1 = Infinity) {
  const out = [];
  let acc = 0;
  out.push(pointAt(coords, d0).p);
  for (let i = 1; i < coords.length; i++) {
    acc += dist(coords[i - 1], coords[i]);
    if (acc > d0 && acc < d1) out.push(coords[i]);
    if (acc >= d1) break;
  }
  if (d1 !== Infinity) out.push(pointAt(coords, d1).p);
  return out;
}

export function fmtDist(m) {
  const ft = m * 3.281;
  if (ft < 60) return 'Now';
  if (ft < 1000) return `${Math.round(ft / 50) * 50} ft`;
  const mi = m / 1609.34;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}
