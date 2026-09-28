# CoCo — Combination Collection Services (v2)

Homepage, design system and a full interactive prototype for CoCo, a fleet and waste-management platform for four users: **customers, drivers, collectors and fleet managers**.

Case study: https://jonlanger.vercel.app/projects/coco
Source research & v1 assets: `~/Documents/Projects/Waste Collection Digital Services`

## Run it

```bash
npm run dev          # → http://localhost:5173 (no-cache static server)
```

It's plain HTML/CSS/ES modules with no build step or dependencies. Deploy the folder as-is to any static host, such as Vercel.

| Page | Path |
| --- | --- |
| Homepage | `/` |
| Sign-in hub | `/login/` |
| Customer portal | `/customer/` (hash routes, e.g. `/customer/#/track`) |
| Driver app | `/driver/` |
| Collector app | `/collector/` |
| Fleet operations | `/fleet/` |
| Design system (internal reference, not linked from the site nav) | `/design-system/` |

## Structure

```
index.html                 Homepage
design-system/index.html   Tokens, components, guidance (rendered from live CSS)
login/index.html           Sign-in hub (links to every role)
{customer,driver,collector,fleet}/index.html   One app per role
assets/
  css/tokens.css           Primitives → semantic tokens (light + field-dark)
  css/base.css             Reset, type + layout utilities
  css/components.css       Buttons, chips, cards, forms, timeline, tabbar…
  css/app.css              Prototype shell + role layouts (mobile-first)
  css/site.css, ds.css     Homepage + docs layout
  js/icons.js              24px stroke icon set
  js/ds.js                 Design-system page renderer
  js/app/platform.js       App shell: routing, sidebar/tab bar, account menu,
                           app switcher, accessibility & display settings
  js/app/prefs.js          Per-device accessibility prefs (text size, contrast,
                           motion, touch targets, link underlines, theme)
  js/app/store.js          Shared data layer (localStorage, cross-tab sync),
                           incidents, areas, notices and cross-role actions
  js/app/fleetmap.js       Ops map with area drawing/editing + static map thumbnails
  js/app/basemap.js        Vector basemap: loads MapLibre, builds the style from --map-* tokens
  js/app/navmap.js         Driver navigation map: route briefing + heading-up turn-by-turn
  js/app/routing.js        Offline street routing (one-ways, closures) and maneuvers
  map/boston.pmtiles       Protomaps vector tile extract of Boston (OpenStreetMap data)
  map/backbay-roads.json   Drivable road graph of the route area, extracted from the tiles
  vendor/                  MapLibre GL, PMTiles, Protomaps basemap layers, label font
  js/app/map.js            Procedural SVG route + territory maps
  js/app/{customer,driver,collector,fleet}.js   Role apps
  img/                     Optimized imagery from the v1 asset library
scripts/serve.py           Dev server (no-cache, supports HTTP Range for the tiles)
scripts/extract-roads.js   Rebuilds map/backbay-roads.json from the tiles (run in the browser)
```

## The shared data layer

All four apps read and write one store, persisted to `localStorage` and synced across browser tabs:

1. **Customer** requests a pickup → it appears in the fleet manager's *Pickups* view.
2. **Driver** acknowledges the route and taps *Arrived* → the collector's queue shows "Truck is at stop".
3. **Collector** scans the bin, completes the compliance checklist and adds photo proof → the stop completes.
4. **Customer** tracking updates (stops away → ETA → collected with photo). **Fleet** progress and incidents update live.

Tip: open the customer and the collector in two side-by-side windows. To run the demo solo, open the account menu (avatar or ☰ on phones, your name in the sidebar on desktop) and use **Advance crew** / **Reset data**.

## How the roles connect

Each app is built around its role's jobs to be done, from the v1 journey maps. Every hand-off goes through the shared store, so an action in one app shows up in the others straight away.

| When… | …this happens |
| --- | --- |
| The customer books a pickup | It lands in Fleet → **Pickups** to approve and assign a truck. The customer gets an "approved" notice. |
| The driver taps **Arrived at stop** | The collector sees "Truck is at stop". The customer sees "Crew is here". |
| The collector scans the bin and completes the checks | The driver's crew tracker moves through Arrived → Scanned → Checks done. The customer's tracker updates too. |
| The collector flags a problem | A new incident opens in Fleet → **Safety** with a response playbook. The customer is told the crew hit a snag. |
| Fleet works an incident | Playbook steps do real work: contact the customer, reschedule, apply a credit, send the crew back, pull the truck, or draw a closure or hazard zone on the map. The crew and customer apps react to each one. |
| Fleet draws a road closure or hazard zone | Crews get a dispatch alert. The driver's briefing and nav show it, and so does the collector's queue. |
| The driver tips at the transfer station and ends the shift | The truck's load resets. The scale ticket and shift report show up on the fleet truck page. |
| Fleet books a recertification | The collector sees it on their performance screen. |

## Fleet operations map

The fleet home is a real, pannable vector map of Boston. Everything it needs ships in this repo, so there are no API keys and no tile servers:

- **Renderer:** [MapLibre GL JS](https://maplibre.org), vendored in `assets/vendor/`.
- **Tiles:** a [Protomaps](https://protomaps.com) extract of Boston in one static file, `assets/map/boston.pmtiles`. The browser reads it by byte range, so the host has to support HTTP Range requests. Vercel does, and so does `npm run dev`.
- **Styling:** `basemap.js` builds the map style from the `--map-*` tokens in `tokens.css`. Light and dark theme and the high-contrast setting restyle the map the same way they restyle the rest of the UI. Labels use Plus Jakarta Sans.

What you can do on the map:

- **Layers:** territories colored by status, live trucks, open incidents, and designated areas.
- **New area:** tap corners on the map, then save the shape as a service territory, road closure, hazard zone or staging area.
- **Existing areas:** tap one to see the trucks, stops and incidents inside it, to reshape its boundary by dragging corners, or to edit or delete it.
- **No WebGL:** if the renderer can't start, the map shows a notice instead.

Incident and truck pages show static thumbnails (`staticMap` in `fleetmap.js`). A single offscreen map renders them once and caches them as images.

To refresh or widen the tile extract, install the [pmtiles CLI](https://github.com/protomaps/go-pmtiles) (`brew install pmtiles`) and run:

```
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles assets/map/boston.pmtiles --bbox=-71.19,42.30,-70.98,42.42 --maxzoom=15
```

Daily builds are listed at https://maps.protomaps.com/builds. If you widen the bbox, update `BOUNDS` in `basemap.js` to match.

## Driver navigation

The driver's route briefing and in-cab navigation use the same self-hosted basemap as the fleet map, with street routing that runs in the browser:

- **Routing:** `routing.js` routes on `assets/map/backbay-roads.json`, a road graph extracted from the same tiles, so the route sits exactly on the streets you see. It respects one-way streets, prefers through streets over alleys, goes around road closures and avoids hazard zones where it can.
- **Turn-by-turn:** Maneuvers use the real street names ("Turn left onto Berkeley St") and a "Then…" hint when two turns come close together. Distance, arrival time and the trip summary come from the route itself.
- **Live changes:** When fleet draws or lifts a closure, the driver's route is replanned from where the truck is. The seeded Boylston St closure matches the 7:02 dispatch message.
- **Camera:** Heading-up and pitched, following the truck, with its padding worked out from the overlays on top of the map. The driver can pan away and tap **Re-center**, or switch to an overview of the rest of the route.
- **Demo drive:** On the drive screen the truck drives the current leg on its own, then prompts *Arrived at stop*.
- **Layouts:** Phones in portrait get a maneuver card and a compact stop sheet. Phones in landscape (dash-mounted) get one side panel, and the tab bar becomes a rail. Tablets in portrait get floating cards. At 900px and up there's a docked stop panel, and the driver app swaps the sidebar for an icon rail.

The fleet map draws the live truck's route with the same routing. To widen the routing area, update `BBOX` in `scripts/extract-roads.js`, then run it on the dev server:

```js
(await import('/scripts/extract-roads.js')).download()
```

## Switching apps & accessibility

Every app has the same account menu with a **Switch app** grid (customer, driver, collector, fleet) and **Accessibility & display** settings. The desktop sidebar also has an app switcher under the logo. Settings are saved per device (`coco-prefs-v1`), apply to every app, and survive **Reset data**:

- Appearance per app: default, light or dark (field apps default to dark)
- Text size: default, large (112.5%) or largest (125%)
- High contrast, reduce motion, larger (56px) touch targets and underlined links

## Mobile-first

Every surface is designed at 375px first and checked from 320px to 1440px. Phones get full-bleed screens and a bottom tab bar. From 900px up, each app switches to sidebar navigation with wide layouts: the fleet dashboard moves from cards to a data table, the driver's stop panel docks beside the map (with an icon rail instead of the sidebar), and flows like sign-in and scanning become centered panels.
# coco
