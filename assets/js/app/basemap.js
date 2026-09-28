// Basemap — vector map of Boston styled from design tokens.
//
// Everything is served from this repo: MapLibre GL (renderer), a Protomaps
// extract of Boston (assets/map/boston.pmtiles, read by byte range) and
// Plus Jakarta Sans for labels. No API keys and no tile servers.
//
// The cartography comes from Protomaps' basemap layers; every color in it is
// taken from the --map-* tokens in tokens.css, read off the element the map
// sits in. So light/dark theme and the high-contrast setting restyle the map
// the same way they restyle the rest of the UI.

const V = new URL('../../vendor/', import.meta.url).href;
const TILES = new URL('../../map/boston.pmtiles', import.meta.url).href;
const FONT = (w) => `${V}fonts/plus-jakarta-sans-latin-${w}-normal.woff2`;
const LATIN = ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC', 'U+2000-206F', 'U+20AC', 'U+2122', 'U+2191', 'U+2193', 'U+2212', 'U+2215', 'U+FEFF', 'U+FFFD'];
const REGULAR = 'Plus Jakarta Sans Medium', BOLD = 'Plus Jakarta Sans Bold', SEMI = 'Plus Jakarta Sans SemiBold';

export const BOUNDS = [[-71.19, 42.30], [-70.98, 42.42]]; // extent of the tile extract
export const ATTRIBUTION = '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Layers that need a sprite sheet (shields, one-way arrows) or add clutter the
// fleet view doesn't need.
const DROP = new Set(['roads_shields', 'roads_oneway', 'address_label', 'places_country', 'places_region', 'boundaries_country', 'boundaries']);

let lib = null;
function script(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
}
/** Load MapLibre + PMTiles + Protomaps layers once. Resolves to the maplibregl module. */
export function loadMapLibre() {
  lib ??= (async () => {
    if (!document.querySelector('link[data-maplibre]')) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${V}maplibre/maplibre-gl.css`; css.dataset.maplibre = ''; document.head.append(css);
    }
    const [ml] = await Promise.all([import(`${V}maplibre/maplibre-gl.mjs`), window.pmtiles || script(`${V}pmtiles.js`), window.basemaps || script(`${V}protomaps-basemaps.js`)]);
    const protocol = new window.pmtiles.Protocol();
    ml.addProtocol('pmtiles', protocol.tile);
    return ml;
  })();
  lib.catch(() => { lib = null; });
  return lib;
}

// ---------------------------------------------------------------- tokens → style
const TOKENS = ['land', 'block', 'building', 'road', 'road-major', 'road-casing', 'rail', 'park', 'water', 'label', 'label-strong', 'label-halo'];
export function readTokens(el) {
  const cs = getComputedStyle(el);
  return Object.fromEntries(TOKENS.map((k) => [k, cs.getPropertyValue(`--map-${k}`).trim()]));
}
/** A string that changes whenever the map's tokens do (theme, contrast). */
export const tokenKey = (t) => TOKENS.map((k) => t[k]).join('|');

function flavor(t) {
  const f = { ...window.basemaps.namedFlavor('light') };
  // Start from all-land, then paint only what a dispatcher needs to read.
  for (const k of Object.keys(f)) if (typeof f[k] === 'string') f[k] = t.land;
  Object.assign(f, {
    background: t.land, earth: t.land,
    park_a: t.park, park_b: t.park, wood_a: t.park, wood_b: t.park, zoo: t.park, scrub_a: t.park, scrub_b: t.park,
    hospital: t.block, industrial: t.block, school: t.block, pedestrian: t.block, military: t.block, aerodrome: t.block, beach: t.block, sand: t.block, pier: t.block, runway: t.road, glacier: t.land,
    water: t.water, buildings: t.building, railway: t.rail,
    other: t.road, minor_service: t.road, minor_a: t.road, minor_b: t.road, link: t.road_major, major: t.road_major, highway: t.road_major,
    minor_service_casing: t.road_casing, minor_casing: t.road_casing, link_casing: t.road_casing, major_casing_early: t.road_casing, major_casing_late: t.road_casing, highway_casing_early: t.road_casing, highway_casing_late: t.road_casing,
    bridges_other: t.road, bridges_minor: t.road, bridges_link: t.road_major, bridges_major: t.road_major, bridges_highway: t.road_major,
    bridges_other_casing: t.road_casing, bridges_minor_casing: t.road_casing, bridges_link_casing: t.road_casing, bridges_major_casing: t.road_casing, bridges_highway_casing: t.road_casing,
    tunnel_other: t.road, tunnel_minor: t.road, tunnel_link: t.road, tunnel_major: t.road, tunnel_highway: t.road,
    tunnel_other_casing: t.road_casing, tunnel_minor_casing: t.road_casing, tunnel_link_casing: t.road_casing, tunnel_major_casing: t.road_casing, tunnel_highway_casing: t.road_casing,
    roads_label_minor: t.label, roads_label_minor_halo: t.label_halo, roads_label_major: t.label_strong, roads_label_major_halo: t.label_halo,
    ocean_label: t.label_strong, subplace_label: t.label_strong, subplace_label_halo: t.label_halo, city_label: t.label_strong, city_label_halo: t.label_halo,
    state_label: t.label, state_label_halo: t.label_halo, country_label: t.label, address_label: t.label, address_label_halo: t.label_halo,
    regular: REGULAR, bold: BOLD, italic: REGULAR,
    landcover: { barren: t.land, farmland: t.land, forest: t.park, glacier: t.land, grassland: t.park, scrub: t.park, urban_area: t.land },
  });
  delete f.pois; // no POI icons: they compete with trucks and incidents
  return f;
}

function basemapLayers(tokens) {
  const t = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k.replace(/-/g, '_'), v]));
  return window.basemaps.layers('pm', flavor(t), { lang: 'en' })
    .filter((l) => !DROP.has(l.id))
    .map((l) => {
      if (l.id === 'places_subplace') l.layout = { ...l.layout, 'text-font': [SEMI], 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 };
      if (l.id === 'buildings') l.paint = { ...l.paint, 'fill-opacity': 1 };
      return l;
    });
}

/** Full MapLibre style for the basemap, colored from the tokens on `el`. */
export function mapStyle(el) {
  return {
    version: 8,
    'font-faces': {
      [REGULAR]: [{ url: FONT(500), 'unicode-range': LATIN }],
      [SEMI]: [{ url: FONT(600), 'unicode-range': LATIN }],
      [BOLD]: [{ url: FONT(700), 'unicode-range': LATIN }],
    },
    sources: { pm: { type: 'vector', url: `pmtiles://${TILES}`, attribution: ATTRIBUTION } },
    layers: basemapLayers(readTokens(el)),
  };
}

/** Recolor a live map in place (no reload, keeps overlays and camera). */
export function restyle(map, el) {
  for (const l of basemapLayers(readTokens(el))) {
    if (!map.getLayer(l.id)) continue;
    for (const [k, v] of Object.entries(l.paint || {})) map.setPaintProperty(l.id, k, v);
  }
}

// ---------------------------------------------------------------- snapshots
// Static thumbnails (truck and incident detail) are rendered once by a single
// offscreen map and cached as images, so lists and detail views don't each
// spin up a WebGL context.
const shots = new Map();
let shooter = null, queue = Promise.resolve();

async function getShooter(ml, el) {
  if (shooter) return shooter;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:512px;pointer-events:none;visibility:hidden';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  const map = new ml.Map({ container: host, style: mapStyle(el), interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, pixelRatio: Math.min(2, devicePixelRatio || 1) });
  await map.once('load');
  shooter = { map, key: tokenKey(readTokens(el)) };
  return shooter;
}

/** Render (or reuse) an image of the basemap around a point. `el` supplies the theme tokens. */
export function snapshot(el, lng, lat, zoom) {
  const tokens = readTokens(el), tk = tokenKey(tokens);
  const key = `${lng.toFixed(5)},${lat.toFixed(5)},${zoom},${tk}`;
  if (shots.has(key)) return shots.get(key);
  const p = queue = queue.catch(() => {}).then(async () => {
    const ml = await loadMapLibre();
    const s = await getShooter(ml, el);
    if (s.key !== tk) { restyle(s.map, el); s.key = tk; }
    s.map.jumpTo({ center: [lng, lat], zoom });
    s.map.triggerRepaint();
    await Promise.race([s.map.once('idle'), new Promise((r) => setTimeout(r, 5000))]);
    return s.map.getCanvas().toDataURL('image/webp', 0.9);
  });
  shots.set(key, p);
  p.catch(() => shots.delete(key));
  return p;
}
