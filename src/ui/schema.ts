import { boardSize, enclosureWidth, type Params } from '../params';

export type Field =
  | {
      kind: 'number';
      path: string;
      label: string;
      unit?: string;
      min?: number;
      max?: number;
      step?: number;
      suggestions?: number[];
      help?: string;
      visible?: (p: Params) => boolean;
    }
  | {
      kind: 'select';
      path: string;
      label: string;
      options: { value: string | number; label: string }[];
      help?: string;
      visible?: (p: Params) => boolean;
    }
  | { kind: 'toggle'; path: string; label: string; help?: string; visible?: (p: Params) => boolean }
  | { kind: 'info'; text: (p: Params) => string; visible?: (p: Params) => boolean }
  | { kind: 'heading'; label: string; visible?: (p: Params) => boolean };

export interface Section {
  id: string;
  title: string;
  open?: boolean;
  fields: Field[];
}

const mm = 'mm';
const PITCHES = [3.5, 3.81, 5, 5.08, 7.5, 7.62, 10, 10.16];

function terminalFields(key: 'terminalsTop' | 'terminalsBottom'): Field[] {
  const enabled = (p: Params) => p[key].enabled;
  const on = (p: Params) => enabled(p) && p[key].type === 'screw';
  const rj45 = (p: Params) => enabled(p) && p[key].type === 'rj45';
  const holes = (p: Params) => on(p) && p[key].style === 'holes';
  return [
    { kind: 'toggle', path: `${key}.enabled`, label: 'Openings' },
    {
      kind: 'select', path: `${key}.type`, label: 'Connection type', visible: enabled,
      options: [
        { value: 'screw', label: 'Screw terminal' },
        { value: 'rj45', label: 'RJ45 jack' },
      ],
    },
    { kind: 'number', path: `${key}.rj45Count`, label: 'Number of jacks', min: 1, max: 24, step: 1, visible: rj45 },
    { kind: 'number', path: `${key}.rj45Pitch`, label: 'Jack spacing', unit: mm, min: 5, max: 60, step: 0.5, help: 'Centre distance between neighbouring jacks.', visible: (p) => rj45(p) && p[key].rj45Count > 1 },
    { kind: 'number', path: `${key}.offsetX`, label: 'Horizontal offset', unit: mm, min: -200, max: 200, step: 0.5, visible: rj45 },
    { kind: 'number', path: `${key}.rj45Width`, label: 'Hole width', unit: mm, min: 5, max: 40, step: 0.1, visible: rj45 },
    { kind: 'number', path: `${key}.rj45Height`, label: 'Hole height', unit: mm, min: 5, max: 40, step: 0.1, help: 'Size along the enclosure depth.', visible: rj45 },
    { kind: 'number', path: `${key}.rj45Z`, label: 'Hole depth position', unit: mm, min: 2, max: 200, step: 0.5, help: 'Centre of the hole, measured from the back of the enclosure.', visible: rj45 },
    { kind: 'number', path: `${key}.count`, label: 'Number of poles', min: 1, max: 48, step: 1, visible: on },
    { kind: 'number', path: `${key}.pitch`, label: 'Pitch', unit: mm, min: 2, max: 20, step: 0.01, suggestions: PITCHES, help: 'Centre distance between poles of the terminal block (5.08 mm is the most common).', visible: on },
    { kind: 'number', path: `${key}.offsetX`, label: 'Horizontal offset', unit: mm, min: -200, max: 200, step: 0.5, visible: on },
    {
      kind: 'select', path: `${key}.style`, label: 'Wire opening', visible: on,
      options: [
        { value: 'holes', label: 'One hole per pole' },
        { value: 'slot', label: 'Single slot (pluggable blocks)' },
      ],
    },
    { kind: 'select', path: `${key}.wireShape`, label: 'Hole shape', visible: holes, options: [{ value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }] },
    { kind: 'number', path: `${key}.wireSize`, label: 'Hole size', unit: mm, min: 1, max: 15, step: 0.1, visible: holes },
    { kind: 'number', path: `${key}.slotHeight`, label: 'Slot height', unit: mm, min: 2, max: 40, step: 0.5, visible: (p) => on(p) && p[key].style === 'slot' },
    { kind: 'number', path: `${key}.wireZ`, label: 'Wire entry depth', unit: mm, min: 2, max: 200, step: 0.5, help: 'Centre of the wire openings, measured from the back of the enclosure.', visible: on },
    { kind: 'toggle', path: `${key}.screwHoles`, label: 'Screwdriver holes on shoulder', visible: on },
    { kind: 'number', path: `${key}.screwDia`, label: 'Screwdriver hole Ø', unit: mm, min: 1, max: 10, step: 0.1, visible: (p) => on(p) && p[key].screwHoles },
    { kind: 'number', path: `${key}.screwInset`, label: 'Distance from wall', unit: mm, min: 1, max: 40, step: 0.5, help: 'Distance of the screw centres from the inside of the top/bottom wall.', visible: (p) => on(p) && p[key].screwHoles },
  ];
}

export const SECTIONS: Section[] = [
  {
    id: 'size',
    title: 'Size',
    open: true,
    fields: [
      { kind: 'number', path: 'body.modules', label: 'Width in modules', min: 1, max: 36, step: 1 },
      {
        kind: 'select', path: 'body.modulePitch', label: 'Module width',
        options: [
          { value: 17.5, label: '17.5 mm (DIN 43880)' },
          { value: 18, label: '18 mm (common)' },
        ],
      },
      { kind: 'number', path: 'body.widthClearance', label: 'Width clearance', unit: mm, min: 0, max: 3, step: 0.1, help: 'Subtracted from the total width so neighbouring devices do not touch.' },
      { kind: 'info', text: (p) => `Overall width: ${enclosureWidth(p).toFixed(2)} mm` },
      { kind: 'number', path: 'body.height', label: 'Height', unit: mm, min: 45, max: 250, step: 0.5, help: 'Top-to-bottom size. DIN 43880 devices are 90 mm.' },
      { kind: 'number', path: 'body.wall', label: 'Wall thickness', unit: mm, min: 0.8, max: 6, step: 0.1 },
      { kind: 'number', path: 'body.floor', label: 'Back thickness', unit: mm, min: 0.8, max: 6, step: 0.1 },
      { kind: 'number', path: 'body.edgeRadius', label: 'Edge rounding', unit: mm, min: 0, max: 5, step: 0.1 },
    ],
  },
  {
    id: 'profile',
    title: 'Front profile',
    fields: [
      { kind: 'toggle', path: 'body.neck', label: 'Stepped front (DIN 43880 neck)', help: 'A narrower front that fits through the 45 mm cut-out of a distribution board cover.' },
      { kind: 'number', path: 'body.neckHeight', label: 'Front height', unit: mm, min: 10, max: 200, step: 0.5, visible: (p) => p.body.neck },
      { kind: 'number', path: 'body.shoulderDepth', label: 'Shoulder depth', unit: mm, min: 10, max: 200, step: 0.5, help: 'From the back to the shoulder where the connections are.', visible: (p) => p.body.neck },
      { kind: 'number', path: 'body.totalDepth', label: 'Total depth', unit: mm, min: 15, max: 250, step: 0.5, help: 'From the back to the front face.' },
    ],
  },
  {
    id: 'rail',
    title: 'DIN rail clip',
    fields: [
      {
        kind: 'select', path: 'rail.clip', label: 'Clip type',
        options: [
          { value: 'spring', label: 'Snap-on (spring latch)' },
          { value: 'fixed', label: 'Slide-on (fixed hooks)' },
          { value: 'none', label: 'None (flat back)' },
        ],
      },
      {
        kind: 'select', path: 'rail.depth', label: 'Rail', visible: (p) => p.rail.clip !== 'none',
        options: [
          { value: 7.5, label: 'TH35 × 7.5 (IEC 60715)' },
          { value: 15, label: 'TH35 × 15 (IEC 60715)' },
        ],
      },
      { kind: 'number', path: 'rail.flangeThickness', label: 'Flange thickness', unit: mm, min: 0.5, max: 3, step: 0.1, visible: (p) => p.rail.clip !== 'none' },
      { kind: 'number', path: 'rail.clearance', label: 'Clip clearance', unit: mm, min: 0, max: 1.5, step: 0.05, visible: (p) => p.rail.clip !== 'none' },
      { kind: 'number', path: 'rail.hookEngage', label: 'Hook engagement', unit: mm, min: 0.5, max: 3.5, step: 0.1, visible: (p) => p.rail.clip !== 'none' },
      { kind: 'number', path: 'rail.hookThickness', label: 'Hook thickness', unit: mm, min: 0.8, max: 6, step: 0.1, visible: (p) => p.rail.clip !== 'none' },
      { kind: 'number', path: 'rail.beamThickness', label: 'Latch spring thickness', unit: mm, min: 0.8, max: 4, step: 0.1, help: 'Thinner is softer. 1.4–1.8 mm works well in PETG/PLA.', visible: (p) => p.rail.clip === 'spring' },
      { kind: 'number', path: 'rail.beamGap', label: 'Latch travel', unit: mm, min: 0.8, max: 5, step: 0.1, visible: (p) => p.rail.clip === 'spring' },
      { kind: 'number', path: 'rail.pullTab', label: 'Release tab length', unit: mm, min: 0, max: 15, step: 0.5, help: 'How far the release tab sticks out below the enclosure.', visible: (p) => p.rail.clip === 'spring' },
    ],
  },
  {
    id: 'construction',
    title: 'Construction',
    fields: [
      {
        kind: 'select', path: 'construction.type', label: 'Parts',
        options: [
          { value: 'two-part', label: 'Base + front cover' },
          { value: 'side-lid', label: 'Body + removable side lid' },
        ],
      },
      {
        kind: 'select', path: 'construction.side', label: 'Opening side', visible: (p) => p.construction.type === 'side-lid',
        options: [
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left' },
        ],
      },
      { kind: 'number', path: 'construction.splitDepth', label: 'Split depth', unit: mm, min: 3, max: 200, step: 0.5, help: 'Where the base ends and the cover begins, measured from the back.', visible: (p) => p.construction.type === 'two-part' },
      { kind: 'number', path: 'construction.lipHeight', label: 'Lip height', unit: mm, min: 1, max: 15, step: 0.5 },
      { kind: 'number', path: 'construction.lipThickness', label: 'Lip thickness', unit: mm, min: 0.6, max: 5, step: 0.1 },
      { kind: 'number', path: 'construction.fitClearance', label: 'Fit clearance', unit: mm, min: 0, max: 1, step: 0.05 },
      { kind: 'toggle', path: 'construction.snapRidges', label: 'Snap-fit ridges' },
      { kind: 'toggle', path: 'construction.screws', label: 'Corner screws' },
      { kind: 'number', path: 'construction.postDia', label: 'Post diameter', unit: mm, min: 3, max: 15, step: 0.1, visible: (p) => p.construction.screws },
      { kind: 'number', path: 'construction.pilotDia', label: 'Pilot hole Ø', unit: mm, min: 1, max: 6, step: 0.1, help: '2.5 mm for M3 self-tapping, or the outer Ø of a heat-set insert.', visible: (p) => p.construction.screws },
      { kind: 'number', path: 'construction.clearanceDia', label: 'Clearance hole Ø', unit: mm, min: 1, max: 8, step: 0.1, visible: (p) => p.construction.screws },
      { kind: 'number', path: 'construction.headDia', label: 'Screw head Ø', unit: mm, min: 2, max: 12, step: 0.1, help: 'Recessed into the front cover; with a side lid it only sizes the bosses.', visible: (p) => p.construction.screws },
    ],
  },
  { id: 'top', title: 'Top connections', fields: terminalFields('terminalsTop') },
  { id: 'bottom', title: 'Bottom connections', fields: terminalFields('terminalsBottom') },
  {
    id: 'front',
    title: 'Front panel',
    fields: [
      { kind: 'heading', label: 'Window' },
      { kind: 'toggle', path: 'front.window', label: 'Window opening', help: 'Off gives a closed front.' },
      { kind: 'number', path: 'front.windowWidth', label: 'Width', unit: mm, min: 2, max: 400, step: 0.5, visible: (p) => p.front.window },
      { kind: 'number', path: 'front.windowHeight', label: 'Height', unit: mm, min: 2, max: 200, step: 0.5, visible: (p) => p.front.window },
      { kind: 'number', path: 'front.windowOffsetY', label: 'Vertical offset', unit: mm, min: -100, max: 100, step: 0.5, visible: (p) => p.front.window },
      { kind: 'number', path: 'front.windowRadius', label: 'Corner radius', unit: mm, min: 0, max: 20, step: 0.5, visible: (p) => p.front.window },
      { kind: 'toggle', path: 'front.windowRecess', label: 'Recess for a clear pane', help: 'A ledge on the inside to glue a transparent pane or display bezel.', visible: (p) => p.front.window },
      { kind: 'number', path: 'front.recessLedge', label: 'Ledge width', unit: mm, min: 0.5, max: 10, step: 0.1, visible: (p) => p.front.window && p.front.windowRecess },
      { kind: 'number', path: 'front.recessDepth', label: 'Recess depth', unit: mm, min: 0.2, max: 5, step: 0.1, visible: (p) => p.front.window && p.front.windowRecess },
      { kind: 'heading', label: 'LEDs' },
      { kind: 'toggle', path: 'front.leds', label: 'LED holes' },
      { kind: 'number', path: 'front.ledCount', label: 'Count', min: 1, max: 40, step: 1, visible: (p) => p.front.leds },
      { kind: 'number', path: 'front.ledDia', label: 'Diameter', unit: mm, min: 1, max: 12, step: 0.1, suggestions: [3.2, 5.2], visible: (p) => p.front.leds },
      { kind: 'number', path: 'front.ledSpacing', label: 'Spacing', unit: mm, min: 2, max: 50, step: 0.5, visible: (p) => p.front.leds },
      { kind: 'number', path: 'front.ledOffsetX', label: 'Horizontal offset', unit: mm, min: -200, max: 200, step: 0.5, visible: (p) => p.front.leds },
      { kind: 'number', path: 'front.ledOffsetY', label: 'Vertical offset', unit: mm, min: -100, max: 100, step: 0.5, visible: (p) => p.front.leds },
      { kind: 'heading', label: 'Label' },
      { kind: 'toggle', path: 'front.label', label: 'Label recess' },
      { kind: 'number', path: 'front.labelWidth', label: 'Width', unit: mm, min: 2, max: 400, step: 0.5, visible: (p) => p.front.label },
      { kind: 'number', path: 'front.labelHeight', label: 'Height', unit: mm, min: 2, max: 100, step: 0.5, visible: (p) => p.front.label },
      { kind: 'number', path: 'front.labelOffsetY', label: 'Vertical offset', unit: mm, min: -100, max: 100, step: 0.5, visible: (p) => p.front.label },
      { kind: 'number', path: 'front.labelDepth', label: 'Depth', unit: mm, min: 0.1, max: 3, step: 0.1, visible: (p) => p.front.label },
    ],
  },
  {
    id: 'vents',
    title: 'Ventilation',
    fields: [
      { kind: 'toggle', path: 'vents.sides', label: 'Side slots' },
      { kind: 'number', path: 'vents.sideCount', label: 'Slots per side', min: 1, max: 40, step: 1, visible: (p) => p.vents.sides },
      { kind: 'number', path: 'vents.sideWidth', label: 'Slot width', unit: mm, min: 0.6, max: 10, step: 0.1, visible: (p) => p.vents.sides },
      { kind: 'number', path: 'vents.sideLength', label: 'Slot length', unit: mm, min: 1, max: 200, step: 0.5, visible: (p) => p.vents.sides },
      { kind: 'number', path: 'vents.sideSpacing', label: 'Spacing', unit: mm, min: 1, max: 50, step: 0.5, visible: (p) => p.vents.sides },
      { kind: 'number', path: 'vents.sideZ', label: 'Depth position', unit: mm, min: 0, max: 250, step: 0.5, visible: (p) => p.vents.sides },
      { kind: 'number', path: 'vents.sideOffsetY', label: 'Vertical offset', unit: mm, min: -100, max: 100, step: 0.5, visible: (p) => p.vents.sides },
      { kind: 'toggle', path: 'vents.topBottom', label: 'Top & bottom slots' },
      { kind: 'number', path: 'vents.tbWidth', label: 'Slot width', unit: mm, min: 0.6, max: 10, step: 0.1, visible: (p) => p.vents.topBottom },
      { kind: 'number', path: 'vents.tbLength', label: 'Slot length', unit: mm, min: 1, max: 200, step: 0.5, visible: (p) => p.vents.topBottom },
      { kind: 'number', path: 'vents.tbSpacing', label: 'Spacing', unit: mm, min: 1, max: 50, step: 0.5, visible: (p) => p.vents.topBottom },
      { kind: 'number', path: 'vents.tbZ', label: 'Depth position', unit: mm, min: 0, max: 250, step: 0.5, visible: (p) => p.vents.topBottom },
    ],
  },
  {
    id: 'pcb',
    title: 'PCB mounting',
    fields: [
      { kind: 'toggle', path: 'pcb.standoffs', label: 'PCB standoffs' },
      { kind: 'toggle', path: 'pcb.autoSize', label: 'Largest board that fits', visible: (p) => p.pcb.standoffs },
      { kind: 'info', text: (p) => { const b = boardSize(p); return `Board: ${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm`; }, visible: (p) => p.pcb.standoffs && p.pcb.autoSize },
      { kind: 'number', path: 'pcb.boardWidth', label: 'Board width', unit: mm, min: 5, max: 400, step: 0.5, visible: (p) => p.pcb.standoffs && !p.pcb.autoSize },
      { kind: 'number', path: 'pcb.boardHeight', label: 'Board height', unit: mm, min: 5, max: 250, step: 0.5, visible: (p) => p.pcb.standoffs && !p.pcb.autoSize },
      { kind: 'number', path: 'pcb.holeInset', label: 'Hole inset from edge', unit: mm, min: 1, max: 50, step: 0.5, visible: (p) => p.pcb.standoffs },
      { kind: 'number', path: 'pcb.height', label: 'Standoff height', unit: mm, min: 1, max: 100, step: 0.5, visible: (p) => p.pcb.standoffs },
      { kind: 'number', path: 'pcb.outerDia', label: 'Standoff Ø', unit: mm, min: 2, max: 15, step: 0.1, visible: (p) => p.pcb.standoffs },
      { kind: 'number', path: 'pcb.holeDia', label: 'Hole Ø', unit: mm, min: 0.5, max: 10, step: 0.1, visible: (p) => p.pcb.standoffs },
    ],
  },
];

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, obj as Record<string, unknown>);
  parent[last] = value;
}
