# DIN Rail Enclosure Generator

A browser app that generates 3D-printable enclosures for **IEC 60715 TH35** (35 mm top-hat) DIN rails. Configure the enclosure, look at it in 3D, and download STL or 3MF files for your slicer. Everything runs locally in the browser; nothing is uploaded.

## Using it

The page has three parts:

- **Top bar**: import settings (JSON), export settings (JSON), and export the model as STL (all parts, or one part) or 3MF (one object per part). By default the exported parts are laid on their side, which is the orientation that prints without supports.
- **Configuration panel** (left): every aspect of the enclosure, grouped in sections.
- **3D view** (centre): orbit with the mouse, toggle the rail and a section cut, explode the parts, and jump to front, side, top or 3D views.

Settings are saved in the browser automatically, and the JSON export lets you keep or share a design.

### What you can configure

| Section | Options |
| --- | --- |
| Size | width in modules (1–36), module width 17.5 mm (DIN 43880) or 18 mm, width clearance, height, wall and back thickness, edge rounding |
| Front profile | stepped DIN 43880 front (45 mm neck that fits distribution-board covers) or a flat front; neck height, shoulder depth, total depth |
| DIN rail clip | snap-on spring latch with release tab, slide-on fixed hooks, or none; TH35×7.5 or TH35×15 rail, flange thickness, clearance, hook engagement and thickness, latch spring thickness and travel |
| Construction | base + front cover (split depth) or body + removable side lid (left or right); lip height/thickness, fit clearance, snap-fit ridges, optional corner screws (post, pilot, clearance and head diameters) |
| Top / bottom screw terminals | number of poles, pitch (3.5–10.16 mm), offset, one hole per pole (round/square) or one slot for pluggable blocks, wire entry depth, screwdriver holes on the shoulder |
| Front panel | closed front or a window with rounded corners and an optional recess for a clear pane, a row of LED holes, a label recess |
| Ventilation | slots on the sides and on the top/bottom walls |
| PCB mounting | four corner standoffs for a board that fills the enclosure or has a custom size; height, diameter and screw hole |
| Custom cut-outs | any number of round or rectangular holes on the front, shoulder, top, bottom, left or right face |

The panel shows warnings when something does not fit (for example terminals wider than the enclosure, or a window larger than the front).

### Geometry notes

- **Rail (IEC 60715 TH35)**: 35 mm wide with 1 mm flanges (configurable). The back of the enclosure rests on the flanges; the hooks reach behind them.
- **Width**: `modules × module width − clearance`, e.g. 4 × 17.5 − 0.5 = 69.5 mm.
- **Spring latch**: the lower hook sits on a plate held by a beam cut free in the back wall. Pull the tab below the enclosure (a screwdriver fits in the slot) to release it. 1.4–1.8 mm beams work well in PETG or PLA.
- **Printing**: print each part on its side (the default export orientation). The profile is constant along the rail, so the hooks, latch, lip and shoulders all print without supports. With a side lid, the body stands on its closed side and the lid lies on its outer face.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev      # start the dev server
npm test         # geometry and export tests
npm run build    # production build in dist/
```

Stack: [Vite](https://vite.dev), TypeScript, [three.js](https://threejs.org) for the viewer, and [manifold-3d](https://github.com/elalish/manifold) (WebAssembly) for watertight CSG. The model is generated in a Web Worker so the page stays responsive.

| File | Purpose |
| --- | --- |
| `src/params.ts` | parameter types, defaults, JSON import/export |
| `src/geometry/enclosure.ts` | builds the enclosure parts and the rail with manifold-3d |
| `src/geometry/worker.ts` | runs the geometry in a Web Worker |
| `src/ui/schema.ts` | the configuration panel, declared as data |
| `src/ui/panel.ts` | renders the panel from the schema |
| `src/viewer.ts` | three.js scene |
| `src/export.ts` | STL and 3MF writers, print layout |

### Deployment

`.github/workflows/pages.yml` builds and publishes the site to GitHub Pages on every push to `main`. Enable it once under **Settings → Pages → Source: GitHub Actions**.
