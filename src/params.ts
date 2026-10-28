// Enclosure parameters, defaults and JSON (de)serialisation.
// All dimensions are millimetres. Coordinate system used by the geometry:
//   x: along the rail (width), centred on 0
//   y: across the rail (height), centred on the rail axis, +y = top
//   z: away from the mounting plate, z = 0 is the back of the enclosure
//      (it rests on the front face of the rail flanges)

export type ClipType = 'spring' | 'fixed' | 'none';
export type Construction = 'two-part' | 'side-lid';
export type HoleShape = 'round' | 'square';
export type TerminalStyle = 'holes' | 'slot';
export type ConnectionType = 'screw' | 'rj45';
export type CutoutFace = 'front' | 'shoulder' | 'top' | 'bottom' | 'left' | 'right';
export type CutoutShape = 'circle' | 'rect';

export interface TerminalRow {
  enabled: boolean;
  type: ConnectionType;
  count: number;
  pitch: number;
  offsetX: number;
  style: TerminalStyle;
  wireShape: HoleShape;
  wireSize: number;
  wireZ: number;
  slotHeight: number;
  screwHoles: boolean;
  screwDia: number;
  screwInset: number;
  rj45Count: number;
  rj45Pitch: number;
  rj45Width: number;
  rj45Height: number;
  rj45Z: number;
  housing: boolean;
  blockDepth: number;
  blockHeight: number;
  wireHeight: number;
  housingWall: number;
  housingClearance: number;
  pinSlot: number;
}

export interface Cutout {
  face: CutoutFace;
  shape: CutoutShape;
  u: number;
  v: number;
  w: number;
  h: number;
}

export interface Params {
  body: {
    modules: number;
    modulePitch: number;
    widthClearance: number;
    height: number;
    shoulderDepth: number;
    neck: boolean;
    neckHeight: number;
    totalDepth: number;
    wall: number;
    floor: number;
    edgeRadius: number;
  };
  rail: {
    depth: number;
    flangeThickness: number;
    clip: ClipType;
    clearance: number;
    hookEngage: number;
    hookThickness: number;
    beamThickness: number;
    beamGap: number;
    pullTab: number;
  };
  construction: {
    type: Construction;
    side: 'left' | 'right';
    splitDepth: number;
    lipHeight: number;
    lipThickness: number;
    fitClearance: number;
    snapRidges: boolean;
    screws: boolean;
    postDia: number;
    pilotDia: number;
    clearanceDia: number;
    headDia: number;
  };
  terminalsTop: TerminalRow;
  terminalsBottom: TerminalRow;
  front: {
    window: boolean;
    windowWidth: number;
    windowHeight: number;
    windowOffsetY: number;
    windowRadius: number;
    windowRecess: boolean;
    recessLedge: number;
    recessDepth: number;
    leds: boolean;
    ledCount: number;
    ledDia: number;
    ledSpacing: number;
    ledOffsetX: number;
    ledOffsetY: number;
    label: boolean;
    labelWidth: number;
    labelHeight: number;
    labelOffsetY: number;
    labelDepth: number;
  };
  vents: {
    sides: boolean;
    sideCount: number;
    sideWidth: number;
    sideLength: number;
    sideSpacing: number;
    sideZ: number;
    sideOffsetY: number;
    topBottom: boolean;
    tbWidth: number;
    tbLength: number;
    tbSpacing: number;
    tbZ: number;
  };
  pcb: {
    standoffs: boolean;
    autoSize: boolean;
    boardWidth: number;
    boardHeight: number;
    holeInset: number;
    height: number;
    outerDia: number;
    holeDia: number;
  };
  cutouts: Cutout[];
}

// IEC 60715 TH35 rail
export const RAIL_WIDTH = 35;
export const RAIL_INNER_OPENING = 25;

const terminalDefaults = (): TerminalRow => ({
  enabled: true,
  type: 'screw',
  count: 4,
  pitch: 5.08,
  offsetX: 0,
  style: 'holes',
  wireShape: 'square',
  wireSize: 3.6,
  wireZ: 27,
  slotHeight: 8,
  screwHoles: true,
  screwDia: 3.5,
  screwInset: 5,
  // Panel cut-out of a common PCB-mount RJ45 jack (about 16 × 13.5 mm) plus clearance.
  rj45Count: 1,
  rj45Pitch: 18,
  rj45Width: 16.2,
  rj45Height: 13.8,
  rj45Z: 28,
  // Pocket for a 5.08 mm PCB terminal block (e.g. KF301 / DG301: 7.6 deep, 10 high).
  housing: false,
  blockDepth: 7.6,
  blockHeight: 10,
  wireHeight: 4,
  housingWall: 1.6,
  housingClearance: 0.3,
  pinSlot: 3,
});

export function defaultParams(): Params {
  return {
    body: {
      modules: 4,
      modulePitch: 17.5,
      widthClearance: 0.5,
      height: 90,
      shoulderDepth: 44,
      neck: true,
      neckHeight: 44.5,
      totalDepth: 58,
      wall: 2,
      floor: 2,
      edgeRadius: 1,
    },
    rail: {
      depth: 7.5,
      flangeThickness: 1,
      clip: 'spring',
      clearance: 0.3,
      hookEngage: 1.5,
      hookThickness: 2,
      beamThickness: 1.6,
      beamGap: 2,
      pullTab: 4,
    },
    construction: {
      type: 'two-part',
      side: 'right',
      splitDepth: 20,
      lipHeight: 3,
      lipThickness: 1.2,
      fitClearance: 0.2,
      snapRidges: true,
      screws: false,
      postDia: 6,
      pilotDia: 2.5,
      clearanceDia: 3.4,
      headDia: 6,
    },
    terminalsTop: terminalDefaults(),
    terminalsBottom: terminalDefaults(),
    front: {
      window: true,
      windowWidth: 40,
      windowHeight: 20,
      windowOffsetY: 4,
      windowRadius: 1,
      windowRecess: true,
      recessLedge: 1.5,
      recessDepth: 1,
      leds: true,
      ledCount: 2,
      ledDia: 3.2,
      ledSpacing: 8,
      ledOffsetX: 0,
      ledOffsetY: -13,
      label: false,
      labelWidth: 40,
      labelHeight: 8,
      labelOffsetY: -14,
      labelDepth: 0.4,
    },
    vents: {
      sides: true,
      sideCount: 4,
      sideWidth: 1.5,
      sideLength: 14,
      sideSpacing: 4,
      sideZ: 32,
      sideOffsetY: 0,
      topBottom: false,
      tbWidth: 1.5,
      tbLength: 8,
      tbSpacing: 4,
      tbZ: 38,
    },
    pcb: {
      standoffs: true,
      autoSize: true,
      boardWidth: 60,
      boardHeight: 70,
      holeInset: 3.5,
      height: 16,
      outerDia: 6,
      holeDia: 2.5,
    },
    cutouts: [],
  };
}

export const APP_ID = 'din-rail-enclosure-generator';
export const SETTINGS_VERSION = 1;

export function serializeParams(p: Params): string {
  return JSON.stringify({ app: APP_ID, version: SETTINGS_VERSION, params: p }, null, 2);
}

// Deep-merges an untrusted object onto the defaults, keeping only known keys
// and values of the right type, so that old or hand-edited files still load.
function mergeInto(target: Record<string, unknown>, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const s = src as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!(key in s)) continue;
    const tv = target[key];
    const sv = s[key];
    if (Array.isArray(tv)) continue; // arrays handled separately
    if (tv && typeof tv === 'object') mergeInto(tv as Record<string, unknown>, sv);
    else if (typeof tv === typeof sv && (typeof sv !== 'number' || Number.isFinite(sv))) target[key] = sv;
  }
}

const FACES: CutoutFace[] = ['front', 'shoulder', 'top', 'bottom', 'left', 'right'];

export function normalizeParams(raw: unknown): Params {
  const p = defaultParams();
  mergeInto(p as unknown as Record<string, unknown>, raw);
  // Values outside the known options (e.g. the removed single-piece type) fall back to defaults.
  const d = defaultParams();
  if (!['two-part', 'side-lid'].includes(p.construction.type)) p.construction.type = d.construction.type;
  if (!['left', 'right'].includes(p.construction.side)) p.construction.side = d.construction.side;
  if (!['spring', 'fixed', 'none'].includes(p.rail.clip)) p.rail.clip = d.rail.clip;
  for (const row of [p.terminalsTop, p.terminalsBottom]) if (!['screw', 'rj45'].includes(row.type)) row.type = 'screw';
  const rawCutouts = (raw as { cutouts?: unknown })?.cutouts;
  if (Array.isArray(rawCutouts)) {
    p.cutouts = rawCutouts
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => {
        const out: Cutout = { face: 'front', shape: 'circle', u: 0, v: 0, w: 5, h: 5 };
        if (FACES.includes(c.face as CutoutFace)) out.face = c.face as CutoutFace;
        if (c.shape === 'rect' || c.shape === 'circle') out.shape = c.shape;
        for (const k of ['u', 'v', 'w', 'h'] as const) {
          if (typeof c[k] === 'number' && Number.isFinite(c[k])) out[k] = c[k] as number;
        }
        return out;
      });
  }
  return p;
}

export function parseSettings(text: string): Params {
  const data = JSON.parse(text);
  if (data && typeof data === 'object' && 'params' in data) return normalizeParams(data.params);
  return normalizeParams(data);
}

export function enclosureWidth(p: Params): number {
  return p.body.modules * p.body.modulePitch - p.body.widthClearance;
}

/** Depth from the back of the shoulder face; the whole depth when the stepped front is off. */
export function shoulderDepth(p: Params): number {
  return p.body.neck ? p.body.shoulderDepth : p.body.totalDepth;
}

/**
 * Centre of the wire openings of a screw-terminal row. With a housing, the block
 * sits against the shoulder, so its wire entry fixes the openings.
 */
export function terminalWireZ(p: Params, row: TerminalRow): number {
  if (!row.housing) return row.wireZ;
  return shoulderDepth(p) - p.body.wall - row.housingClearance - row.blockHeight + row.wireHeight;
}

/** PCB size used for the standoffs: either the user's board or the largest that fits with 2 mm margin. */
export function boardSize(p: Params): { width: number; height: number } {
  if (!p.pcb.autoSize) return { width: p.pcb.boardWidth, height: p.pcb.boardHeight };
  const m = 2 * p.body.wall + 4;
  return { width: Math.max(5, enclosureWidth(p) - m), height: Math.max(5, p.body.height - m) };
}
