// Rebuilds assets/map/backbay-roads.json — the drivable road graph the driver's
// navigation routes on (see assets/js/app/routing.js).
//
// It reads the roads straight out of assets/map/boston.pmtiles, so the route
// always lines up with the basemap. Run it in the browser:
//   1. npm run dev, open http://localhost:5173/driver/
//   2. In the devtools console:  (await import('/scripts/extract-roads.js')).download()
//   3. Move the downloaded backbay-roads.json to assets/map/.
//
// Widen BBOX if the route area changes.

const BBOX = [-71.093, 42.342, -71.065, 42.3575]; // [west, south, east, north]
const SNAP_M = 6; // join dead ends this close together (tiles split roads at their edges)

export async function build() {
const B = await import('/assets/js/app/basemap.js');
const ml = await B.loadMapLibre();
const host = Object.assign(document.createElement('div'), { style: 'position:fixed;left:0;top:0;width:1200px;height:900px;z-index:9999' });
document.body.append(host);
const map = new ml.Map({ container: host, style: B.mapStyle(document.getElementById('app') || document.body), bounds: [[BBOX[0], BBOX[1]], [BBOX[2], BBOX[3]]], zoom: 15 });
await map.once('idle');

const drivable = (p) => (p.kind === 'major_road' || p.kind === 'minor_road') && !p.is_tunnel;
const inBox = ([x, y]) => x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3];
const nodes = [], nodeIx = new Map(), names = [], nameIx = new Map(), edges = new Map();
const node = ([x, y]) => {
  const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
  if (!nodeIx.has(k)) { nodeIx.set(k, nodes.length); nodes.push([Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]); }
  return nodeIx.get(k);
};
for (const f of map.querySourceFeatures('pm', { sourceLayer: 'roads' })) {
  const p = f.properties; if (!drivable(p)) continue;
  const nm = p.name || '';
  if (!nameIx.has(nm)) { nameIx.set(nm, names.length); names.push(nm); }
  const flags = (p.oneway === 'yes' ? 1 : 0) | (p.kind_detail === 'service' ? 2 : 0) | (p.kind === 'major_road' ? 4 : 0) | (p.is_bridge ? 8 : 0);
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    if (!inBox(l[i - 1]) && !inBox(l[i])) continue;
    const a = node(l[i - 1]), b = node(l[i]);
    if (a !== b && !edges.has(`${a}-${b}`) && !edges.has(`${b}-${a}`)) edges.set(`${a}-${b}`, [a, b, nameIx.get(nm), flags]);
  }
}

// Make the network routable. The tiles simplify lines, which drops the vertex
// where a straight street passes through an intersection, and they clip roads
// a little past each tile edge. So: split roads wherever two cross at grade
// (bridges only meet bridges) and wherever a road ends on another one.
const m = ([x1, y1], [x2, y2]) => Math.hypot((x1 - x2) * 82000, (y1 - y2) * 111320);
const XY = ([x, y]) => [x * 82000, y * 111320];
let list = [...edges.values()];
const splits = list.map(() => []); // per edge: [t, node]
const CELL = 0.0006, grid = new Map();
list.forEach(([a, b], k) => {
  const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
  for (let gx = Math.floor(Math.min(x1, x2) / CELL); gx <= Math.floor(Math.max(x1, x2) / CELL); gx++)
    for (let gy = Math.floor(Math.min(y1, y2) / CELL); gy <= Math.floor(Math.max(y1, y2) / CELL); gy++)
      (grid.get(`${gx},${gy}`) || grid.set(`${gx},${gy}`, []).get(`${gx},${gy}`)).push(k);
});
const pairs = new Set();
for (const ks of grid.values()) for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) pairs.add(ks[i] < ks[j] ? `${ks[i]},${ks[j]}` : `${ks[j]},${ks[i]}`);
const onSeg = (p, A, B) => {
  const [px, py] = XY(p), [ax, ay] = XY(A), [bx, by] = XY(B), dx = bx - ax, dy = by - ay;
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1);
  return [Math.hypot(ax + t * dx - px, ay + t * dy - py), t];
};
for (const key of pairs) {
  const [i, j] = key.split(',').map(Number), [a, b, , fi] = list[i], [c, d, , fj] = list[j];
  if (a === c || a === d || b === c || b === d) continue;
  // A road that ends on the other one (T-junction, tile seam)
  for (const [n, e, other] of [[a, j, list[j]], [b, j, list[j]], [c, i, list[i]], [d, i, list[i]]]) {
    const [dd, t] = onSeg(nodes[n], nodes[other[0]], nodes[other[1]]);
    if (dd < 1.5 && t > 0.001 && t < 0.999) splits[e].push([t, n]);
  }
  if ((fi & 8) !== (fj & 8)) continue; // a bridge over a street doesn't meet it
  // Two roads crossing
  const [p1x, p1y] = XY(nodes[a]), [p2x, p2y] = XY(nodes[b]), [p3x, p3y] = XY(nodes[c]), [p4x, p4y] = XY(nodes[d]);
  const den = (p2x - p1x) * (p4y - p3y) - (p2y - p1y) * (p4x - p3x);
  if (Math.abs(den) < 1e-9) continue;
  const t = ((p3x - p1x) * (p4y - p3y) - (p3y - p1y) * (p4x - p3x)) / den;
  const u = ((p3x - p1x) * (p2y - p1y) - (p3y - p1y) * (p2x - p1x)) / den;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) continue;
  const A = nodes[a], B = nodes[b];
  const n = node([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
  splits[i].push([t, n]); splits[j].push([u, n]);
}
list = list.flatMap(([a, b, nm, f], k) => {
  const cuts = splits[k].sort((x, y) => x[0] - y[0]).map(([, n]) => n).filter((n, i, arr) => n !== a && n !== b && n !== arr[i - 1]);
  const seq = [a, ...cuts, b];
  return seq.slice(1).map((n, i) => [seq[i], n, nm, f]);
});
const deg = () => { const d = nodes.map(() => 0); list.forEach(([a, b]) => { d[a]++; d[b]++; }); return d; };
const par = nodes.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
const d2 = deg(); // join small gaps between dead ends
nodes.forEach((p, i) => {
  if (d2[i] !== 1) return;
  let best = -1, bd = SNAP_M;
  nodes.forEach((q, j) => { if (j !== i) { const d = m(p, q); if (d < bd) { bd = d; best = j; } } });
  if (best >= 0 && find(best) !== find(i)) par[find(i)] = find(best);
});
const merged = list.map(([a, b, n, f]) => [find(a), find(b), n, f]).filter(([a, b]) => a !== b);

// Keep the largest connected network (drops fragments cut off by the box edge)
const adj = new Map();
merged.forEach(([a, b]) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); });
let keep = new Set();
const seen = new Set();
for (const s of adj.keys()) {
  if (seen.has(s)) continue;
  const comp = [s]; seen.add(s);
  for (let k = 0; k < comp.length; k++) for (const w of adj.get(comp[k])) if (!seen.has(w)) { seen.add(w); comp.push(w); }
  if (comp.length > keep.size) keep = new Set(comp);
}
const ids = [...keep], re = new Map(ids.map((v, i) => [v, i]));
const outNames = [], outNameIx = new Map();
const outEdges = merged.filter(([a, b]) => keep.has(a) && keep.has(b)).map(([a, b, n, f]) => {
  if (!outNameIx.has(n)) { outNameIx.set(n, outNames.length); outNames.push(names[n]); }
  return [re.get(a), re.get(b), outNameIx.get(n), f];
});

const json = {
  about: 'Drivable road graph for the Back Bay route area, extracted from assets/map/boston.pmtiles (Protomaps, © OpenStreetMap contributors) by scripts/extract-roads.js. nodes: [lng, lat]. edges: [from, to, nameIndex, flags] with flags 1 = one-way (from → to), 2 = service road/alley, 4 = major road, 8 = bridge.',
  bbox: BBOX, names: outNames, nodes: ids.map((i) => nodes[i]), edges: outEdges,
};
map.remove(); host.remove();
console.log(`backbay-roads.json: ${json.nodes.length} nodes, ${json.edges.length} edges, ${json.names.length} street names`);
return json;
}

export async function download() {
  const json = await build();
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/json' })), download: 'backbay-roads.json' });
  a.click();
}
