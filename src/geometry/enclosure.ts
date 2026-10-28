import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { boardSize, enclosureWidth, RAIL_INNER_OPENING, RAIL_WIDTH, type Params, type TerminalRow } from '../params';

export interface MeshData {
  id: string;
  name: string;
  /** Side wall that goes on the print bed when the part is laid on its side. */
  printFace?: 'xmin' | 'xmax';
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
}

export interface BuildResult {
  parts: MeshData[];
  rail: MeshData;
  warnings: string[];
  dims: { width: number; height: number; depth: number };
}

const BIG = 2000;
const EPS = 0.01;

type Box3 = [number, number, number, number, number, number];

/** Small wrapper that tracks every WASM object so it can be freed in one go. */
class Ctx {
  private objs: { delete(): void }[] = [];
  constructor(public M: ManifoldToplevel) {}

  t<T extends { delete(): void }>(o: T): T {
    this.objs.push(o);
    return o;
  }

  dispose(): void {
    for (const o of this.objs) o.delete();
    this.objs = [];
  }

  segs(d: number): number {
    return Math.min(96, Math.max(16, Math.ceil((Math.PI * d) / 0.5)));
  }

  empty(): Manifold {
    return this.t(this.M.Manifold.cube([0, 0, 0]));
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Manifold {
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
    if (bx - ax <= 0 || by - ay <= 0 || bz - az <= 0) return this.empty();
    const c = this.t(this.M.Manifold.cube([bx - ax, by - ay, bz - az]));
    return this.t(c.translate([ax, ay, az]));
  }

  boxOf(b: Box3): Manifold {
    return this.box(...b);
  }

  /** Cylinder along Z. */
  cylZ(x: number, y: number, z0: number, z1: number, d: number): Manifold {
    if (d <= 0 || z1 <= z0) return this.empty();
    const c = this.t(this.M.Manifold.cylinder(z1 - z0, d / 2, d / 2, this.segs(d)));
    return this.t(c.translate([x, y, z0]));
  }

  /** Cylinder along Y. */
  cylY(x: number, z: number, y0: number, y1: number, d: number): Manifold {
    const [a, b] = y0 < y1 ? [y0, y1] : [y1, y0];
    if (d <= 0 || b <= a) return this.empty();
    const c = this.t(this.M.Manifold.cylinder(b - a, d / 2, d / 2, this.segs(d)));
    const r = this.t(c.rotate([-90, 0, 0])); // z -> +y
    return this.t(r.translate([x, a, z]));
  }

  /** Cylinder along X. */
  cylX(y: number, z: number, x0: number, x1: number, d: number): Manifold {
    const [a, b] = x0 < x1 ? [x0, x1] : [x1, x0];
    if (d <= 0 || b <= a) return this.empty();
    const c = this.t(this.M.Manifold.cylinder(b - a, d / 2, d / 2, this.segs(d)));
    const r = this.t(c.rotate([0, 90, 0])); // z -> +x
    return this.t(r.translate([a, y, z]));
  }

  rect2(a0: number, a1: number, b0: number, b1: number): CrossSection {
    const s = this.t(this.M.CrossSection.square([a1 - a0, b1 - b0]));
    return this.t(s.translate([a0, b0]));
  }

  poly2(pts: [number, number][]): CrossSection {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      area += x0 * y1 - x1 * y0;
    }
    const ordered = area < 0 ? [...pts].reverse() : pts;
    return this.t(this.M.CrossSection.ofPolygons([ordered]));
  }

  roundedRect2(cx: number, cy: number, w: number, h: number, r: number): CrossSection {
    const rr = Math.max(0, Math.min(r, w / 2 - EPS, h / 2 - EPS));
    if (rr <= 0) return this.rect2(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2);
    const core = this.rect2(cx - w / 2 + rr, cx + w / 2 - rr, cy - h / 2 + rr, cy + h / 2 - rr);
    return this.t(core.offset(rr, 'Round', 2, this.segs(rr * 2) * 2));
  }

  roundConvex(cs: CrossSection, r: number): CrossSection {
    if (r <= 0) return cs;
    const a = this.t(cs.offset(-r, 'Round'));
    return this.t(a.offset(r, 'Round', 2, this.segs(r * 2) * 2));
  }

  union2(list: CrossSection[]): CrossSection {
    return this.t(this.M.CrossSection.union(list));
  }

  /** Extrude a 2D section given in (y, z) coordinates along X, between x0 and x1. */
  extrudeYZ(cs: CrossSection, x0: number, x1: number): Manifold {
    if (x1 <= x0) return this.empty();
    const e = this.t(cs.extrude(x1 - x0));
    const r1 = this.t(e.rotate([90, 0, 0])); // (a,b,c) -> (a,-c,b)
    const r2 = this.t(r1.rotate([0, 0, 90])); // -> (c,a,b)
    return this.t(r2.translate([x0, 0, 0]));
  }

  /** Extrude a 2D section given in (x, y) coordinates along Z, between z0 and z1. */
  extrudeXY(cs: CrossSection, z0: number, z1: number): Manifold {
    if (z1 <= z0) return this.empty();
    const e = this.t(cs.extrude(z1 - z0));
    return this.t(e.translate([0, 0, z0]));
  }

  union(list: Manifold[]): Manifold {
    const items = list.filter((m) => !m.isEmpty());
    if (items.length === 0) return this.empty();
    if (items.length === 1) return items[0];
    return this.t(this.M.Manifold.union(items));
  }

  sub(a: Manifold, b: Manifold): Manifold {
    if (b.isEmpty()) return a;
    return this.t(a.subtract(b));
  }

  add(a: Manifold, b: Manifold): Manifold {
    if (b.isEmpty()) return a;
    return this.t(a.add(b));
  }

  inter(a: Manifold, b: Manifold): Manifold {
    return this.t(a.intersect(b));
  }
}

function toMesh(m: Manifold, id: string, name: string, printFace?: 'xmin' | 'xmax'): MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { id, name, printFace, positions, indices: new Uint32Array(mesh.triVerts), volume: m.volume() };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildEnclosure(M: ManifoldToplevel, p: Params): BuildResult {
  const g = new Ctx(M);
  const warnings: string[] = [];
  try {
    return build(g, p, warnings);
  } finally {
    g.dispose();
  }
}

function build(g: Ctx, p: Params, warnings: string[]): BuildResult {
  const b = p.body;
  const W = Math.max(5, enclosureWidth(p));
  const H = Math.max(RAIL_WIDTH + 10, b.height);
  if (b.height < RAIL_WIDTH + 10) warnings.push(`Height raised to ${H} mm to fit the 35 mm rail clip.`);
  const t = clamp(b.wall, 0.8, Math.min(W, H) / 4);
  const fl = clamp(b.floor, 0.8, 10);
  const Dt = Math.max(fl + t + 5, b.totalDepth);
  const hasNeck = b.neck && b.neckHeight > 2 * t + 2 && b.neckHeight < H && b.shoulderDepth > fl + t + 2 && b.shoulderDepth < Dt - t;
  if (b.neck && !hasNeck) warnings.push('Front neck ignored: its height must be smaller than the body height and the shoulder depth smaller than the total depth.');
  const Hn = hasNeck ? b.neckHeight : H;
  const Ds = hasNeck ? b.shoulderDepth : Dt;
  const r = clamp(b.edgeRadius, 0, Math.min(t * 2, 5));

  // ---------- shell ----------
  const outerList = [g.rect2(-H / 2, H / 2, 0, Ds)];
  if (hasNeck) outerList.push(g.rect2(-Hn / 2, Hn / 2, 0, Dt));
  const outer = g.roundConvex(g.union2(outerList), r);
  const innerList = [g.rect2(-H / 2 + t, H / 2 - t, fl, Ds - t)];
  if (hasNeck) innerList.push(g.rect2(-Hn / 2 + t, Hn / 2 - t, fl, Dt - t));
  const inner = g.roundConvex(g.union2(innerList), Math.max(0, r - t));
  let body = g.sub(g.extrudeYZ(outer, -W / 2, W / 2), g.extrudeYZ(inner, -W / 2 + t, W / 2 - t));

  const adds: Manifold[] = [];
  const cuts: Manifold[] = [];

  // ---------- IEC 60715 TH35 rail clip ----------
  const rl = p.rail;
  const R = RAIL_WIDTH / 2;
  const f = clamp(rl.flangeThickness, 0.5, 3);
  const c = clamp(rl.clearance, 0, 2);
  const ht = clamp(rl.hookThickness, 0.8, Math.max(0.8, rl.depth - f - c - 0.5));
  const e = clamp(rl.hookEngage, 0.5, (RAIL_WIDTH - RAIL_INNER_OPENING) / 2 - 0.5);
  const zHold = -(f + c);
  const zDeep = -(f + c + ht);
  if (f + c + ht > rl.depth - 0.5) warnings.push('Rail hooks are deeper than the rail: they would touch the mounting plate.');
  const hookProfile = (s: 1 | -1) =>
    g.union2([
      g.rect2(s > 0 ? R + c : -(R + c + ht), s > 0 ? R + c + ht : -(R + c), zDeep, EPS),
      g.rect2(s > 0 ? R - e : -(R + c + ht), s > 0 ? R + c + ht : -(R - e), zDeep, zHold),
    ]);

  if (rl.clip !== 'none') {
    adds.push(g.extrudeYZ(hookProfile(1), -W / 2, W / 2));
  }
  if (rl.clip === 'fixed') {
    adds.push(g.extrudeYZ(hookProfile(-1), -W / 2, W / 2));
  } else if (rl.clip === 'spring') {
    // Bottom latch: a beam cut free in the floor (fixed at both ends) carries a
    // plate behind the floor. The plate ends in a ramped hook that snaps behind
    // the lower rail flange, and in a pull tab below the enclosure for release.
    const bt = clamp(rl.beamThickness, 0.8, 4);
    const gap = Math.max(rl.beamGap, e + 0.3);
    if (rl.beamGap < e + 0.3) warnings.push(`Latch gap raised to ${gap.toFixed(1)} mm so the hook can clear the rail flange.`);
    const Ls = W - 2 * t - 1;
    const yBeamTop = -(R + c);
    const yBeamBot = yBeamTop - bt;
    const tab = Math.max(0, rl.pullTab);
    const yEnd = -(H / 2 + tab);
    cuts.push(g.box(-Ls / 2, Ls / 2, yBeamTop, yBeamTop + 0.8, -0.5, fl + 0.1));
    cuts.push(g.box(-Ls / 2, Ls / 2, yBeamBot - gap, yBeamBot, -0.5, fl + 0.1));
    const cw = Math.min(6, Ls * 0.5);
    adds.push(g.box(-cw / 2, cw / 2, yBeamBot, yBeamTop, zDeep, 0.5));
    const plate = g.poly2([
      [-(R - e), zHold],
      [yEnd, zHold],
      [yEnd, zDeep],
      [-(R + c), zDeep],
    ]);
    adds.push(g.extrudeYZ(plate, -W / 2, W / 2));
    if (tab >= 3) {
      const sw = Math.min(8, W - 4);
      cuts.push(g.box(-sw / 2, sw / 2, yEnd + 1, yEnd + 2.5, zDeep - 1, zHold + 0.5));
    }
    if (W - 2 * t < 10) warnings.push('Very narrow enclosure: the spring latch will be stiff. Consider a fixed (slide-on) clip.');
  }

  // ---------- construction (split, screws) ----------
  const cn = p.construction;
  const twoPart = cn.type === 'two-part';
  const sideLid = cn.type === 'side-lid';
  // Side lid: s is the side that opens, xs the inner face of that side wall.
  const s = cn.side === 'left' ? -1 : 1;
  const xs = s * (W / 2 - t);
  const cc = clamp(cn.fitClearance, 0, 1);
  const lipH = clamp(cn.lipHeight, 1, 15);
  const lipT = clamp(cn.lipThickness, 0.6, 5);
  let split = cn.splitDepth;
  const splitMin = fl + lipH + 1;
  const splitMax = Ds - t - 1;
  if (twoPart && (split < splitMin || split > splitMax)) {
    split = clamp(split, splitMin, splitMax);
    warnings.push(`Split depth adjusted to ${split.toFixed(1)} mm (allowed ${splitMin.toFixed(1)}–${splitMax.toFixed(1)}).`);
  }

  const posts: { x: number; y: number }[] = [];
  const Dp = Math.max(cn.postDia, cn.headDia + 2.4);
  if (twoPart && cn.screws) {
    const px = W / 2 - t - Dp / 2 + 0.5;
    const py = H / 2 - t - Dp / 2 + 0.5;
    if (px < Dp / 2 + 0.5) {
      warnings.push('Screw posts do not fit in this width: screws disabled.');
    } else {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) posts.push({ x: sx * px, y: sy * py });
      for (const q of posts) {
        const inNeck = hasNeck && Math.abs(q.y) - Dp / 2 < Hn / 2 - t;
        const zTop = (inNeck ? Dt : Ds) - t + 0.3;
        adds.push(g.cylZ(q.x, q.y, fl - 0.3, zTop, Dp));
        cuts.push(g.cylZ(q.x, q.y, fl + 1.5, split + EPS, clamp(cn.pilotDia, 1, Dp - 1.6)));
        cuts.push(g.cylZ(q.x, q.y, split - EPS, zTop + t + 1, clamp(cn.clearanceDia, 1, Dp - 1.6)));
        cuts.push(g.cylZ(q.x, q.y, split + 3, zTop + t + 1, clamp(cn.headDia, 1, Dp - 1.2)));
      }
    }
  }

  // Side lid screws: bosses along X in the four corners of the shoulder area,
  // screwed from outside through the lid.
  const bosses: { y: number; z: number }[] = [];
  const bossLen = Math.min(10, W - 2 * t - 2);
  if (sideLid && cn.screws) {
    const py = H / 2 - t - Dp / 2 + 0.5;
    const zLo = fl + Dp / 2 - 0.5;
    const zHi = Ds - t - Dp / 2 + 0.5;
    if (zHi - zLo < Dp + 0.5 || bossLen < 4) {
      warnings.push('Screw bosses do not fit in this enclosure: screws disabled.');
    } else {
      for (const y of [-py, py]) for (const z of [zLo, zHi]) bosses.push({ y, z });
      for (const q of bosses) {
        adds.push(g.cylX(q.y, q.z, xs - s * bossLen, xs + s * 0.3, Dp));
        cuts.push(g.cylX(q.y, q.z, xs - s * (bossLen - 1.5), xs + s * EPS, clamp(cn.pilotDia, 1, Dp - 1.6)));
        cuts.push(g.cylX(q.y, q.z, xs - s * EPS, s * (W / 2 + 1), clamp(cn.clearanceDia, 1, Dp - 1.6)));
      }
    }
  }

  // ---------- PCB standoffs ----------
  const pcb = p.pcb;
  if (pcb.standoffs) {
    const board = boardSize(p);
    const sx = board.width / 2 - pcb.holeInset;
    const sy = board.height / 2 - pcb.holeInset;
    if (board.width > W - 2 * t || board.height > H - 2 * t) warnings.push('PCB is larger than the inside of the enclosure.');
    if (sx < pcb.outerDia / 2) warnings.push('PCB standoffs overlap: the board is too narrow for corner standoffs.');
    const top = fl + Math.max(0.5, pcb.height);
    if (twoPart && top > split) warnings.push('PCB standoffs are taller than the split depth: they will be cut by the split.');
    for (const x of [-sx, sx]) {
      for (const y of [-sy, sy]) {
        adds.push(g.cylZ(x, y, fl - 0.3, top, pcb.outerDia));
        cuts.push(g.cylZ(x, y, fl + 0.6, top + 0.1, Math.min(pcb.holeDia, pcb.outerDia - 1)));
      }
    }
  }

  // ---------- helpers for wall cuts ----------
  const topWallY = (z: number) => (hasNeck && z > Ds ? Hn / 2 : H / 2);
  const throughY = (s: number, z: number): [number, number] => {
    const yo = topWallY(z);
    return [s * (yo - t - 0.6), s * (yo + 0.5)];
  };

  // ---------- top / bottom connections ----------
  const terminals = (row: TerminalRow, s: 1 | -1, label: string) => {
    if (!row.enabled) return;
    if (row.type === 'rj45') {
      rj45Jacks(row, s, label);
      return;
    }
    if (row.count < 1) return;
    const n = Math.floor(row.count);
    const span = n * row.pitch;
    if (span > W - 2 * t) warnings.push(`${label} connections (${span.toFixed(1)} mm) are wider than the inside (${(W - 2 * t).toFixed(1)} mm).`);
    if (twoPart && Math.abs(row.wireZ - split) < (row.style === 'slot' ? row.slotHeight : row.wireSize) / 2 + 0.5)
      warnings.push(`${label} wire openings cross the split line; move them or the split depth.`);
    if (row.wireZ > Dt - t) warnings.push(`${label} wire openings are beyond the front of the enclosure.`);
    const [y0, y1] = throughY(s, row.wireZ);
    const xs = Array.from({ length: n }, (_, i) => row.offsetX + (i - (n - 1) / 2) * row.pitch);
    if (row.style === 'slot') {
      cuts.push(g.box(row.offsetX - span / 2, row.offsetX + span / 2, y0, y1, row.wireZ - row.slotHeight / 2, row.wireZ + row.slotHeight / 2));
    } else {
      for (const x of xs) {
        const d = row.wireSize;
        cuts.push(row.wireShape === 'round' ? g.cylY(x, row.wireZ, y0, y1, d) : g.box(x - d / 2, x + d / 2, y0, y1, row.wireZ - d / 2, row.wireZ + d / 2));
      }
    }
    if (row.screwHoles) {
      const ys = s * (H / 2 - t - row.screwInset);
      if (hasNeck && Math.abs(ys) - row.screwDia / 2 < Hn / 2) warnings.push(`${label} screw holes overlap the front neck; increase the body height or reduce the inset.`);
      for (const x of xs) cuts.push(g.cylZ(x, ys, Ds - t - 0.6, Ds + 0.5, row.screwDia));
    }
  };
  // RJ45 jacks: one rectangular hole per jack in the top/bottom wall.
  const rj45Jacks = (row: TerminalRow, s: 1 | -1, label: string) => {
    const n = Math.max(0, Math.floor(row.rj45Count));
    if (n < 1) return;
    const w = row.rj45Width;
    const h = row.rj45Height;
    const span = (n - 1) * row.rj45Pitch + w;
    if (span > W - 2 * t) warnings.push(`${label} RJ45 jacks (${span.toFixed(1)} mm) are wider than the inside (${(W - 2 * t).toFixed(1)} mm).`);
    if (n > 1 && row.rj45Pitch < w + 0.8) warnings.push(`${label} RJ45 holes overlap: increase the jack spacing.`);
    if (twoPart && Math.abs(row.rj45Z - split) < h / 2 + 0.5) warnings.push(`${label} RJ45 holes cross the split line; move them or the split depth.`);
    if (row.rj45Z + h / 2 > Dt - t) warnings.push(`${label} RJ45 holes are beyond the front of the enclosure.`);
    const [y0, y1] = throughY(s, row.rj45Z);
    for (let i = 0; i < n; i++) {
      const x = row.offsetX + (i - (n - 1) / 2) * row.rj45Pitch;
      cuts.push(g.box(x - w / 2, x + w / 2, y0, y1, row.rj45Z - h / 2, row.rj45Z + h / 2));
    }
  };
  terminals(p.terminalsTop, 1, 'Top');
  terminals(p.terminalsBottom, -1, 'Bottom');

  // ---------- front panel ----------
  const fr = p.front;
  const zF0 = Dt - t - 0.6;
  const zF1 = Dt + 0.5;
  const faceH = (hasNeck ? Hn : H) - 2 * t;
  const faceW = W - 2 * t;
  if (fr.window) {
    // Keep the window (and its recess) inside the front face so it never cuts the side walls.
    const l = fr.windowRecess ? Math.max(0, fr.recessLedge) : 0;
    const maxW = faceW - 2 * l - 1;
    const maxH = faceH - 2 * l - 1 - 2 * Math.abs(fr.windowOffsetY);
    const ww = Math.min(fr.windowWidth, maxW);
    const wh = Math.min(fr.windowHeight, maxH);
    if (ww < fr.windowWidth || wh < fr.windowHeight) warnings.push(`Front window reduced to ${Math.max(0, ww).toFixed(1)} × ${Math.max(0, wh).toFixed(1)} mm to fit the front face.`);
    if (ww > 1 && wh > 1) {
      cuts.push(g.extrudeXY(g.roundedRect2(0, fr.windowOffsetY, ww, wh, fr.windowRadius), zF0, zF1));
      if (fr.windowRecess) {
        const depth = clamp(fr.recessDepth, 0.2, t - 0.4);
        cuts.push(g.extrudeXY(g.roundedRect2(0, fr.windowOffsetY, ww + 2 * l, wh + 2 * l, fr.windowRadius + l), zF0, Dt - t + depth));
      }
    }
  }
  if (fr.leds && fr.ledCount > 0) {
    const n = Math.floor(fr.ledCount);
    for (let i = 0; i < n; i++) cuts.push(g.cylZ(fr.ledOffsetX + (i - (n - 1) / 2) * fr.ledSpacing, fr.ledOffsetY, zF0, zF1, fr.ledDia));
  }
  if (fr.label) {
    const d = clamp(fr.labelDepth, 0.1, t - 0.4);
    cuts.push(g.box(-fr.labelWidth / 2, fr.labelWidth / 2, fr.labelOffsetY - fr.labelHeight / 2, fr.labelOffsetY + fr.labelHeight / 2, Dt - d, zF1));
  }

  // ---------- ventilation ----------
  const v = p.vents;
  if (v.sides && v.sideCount > 0) {
    const n = Math.floor(v.sideCount);
    const sw = v.sideWidth;
    const half = Math.max(0, (v.sideLength - sw) / 2);
    for (const sx of [-1, 1]) {
      const x0 = sx * (W / 2 - t - 0.6);
      const x1 = sx * (W / 2 + 0.5);
      for (let k = 0; k < n; k++) {
        const y = v.sideOffsetY + (k - (n - 1) / 2) * v.sideSpacing;
        cuts.push(g.box(x0, x1, y - sw / 2, y + sw / 2, v.sideZ - half, v.sideZ + half));
        cuts.push(g.cylX(y, v.sideZ - half, x0, x1, sw));
        cuts.push(g.cylX(y, v.sideZ + half, x0, x1, sw));
      }
    }
  }
  if (v.topBottom) {
    const sw = v.tbWidth;
    const half = Math.max(0, (v.tbLength - sw) / 2);
    const avail = W - 2 * t - 4;
    const n = avail >= sw ? Math.floor((avail - sw) / Math.max(v.tbSpacing, sw + 0.4)) + 1 : 0;
    for (const s of [1, -1] as const) {
      const [y0, y1] = throughY(s, v.tbZ);
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * Math.max(v.tbSpacing, sw + 0.4);
        cuts.push(g.box(x - sw / 2, x + sw / 2, y0, y1, v.tbZ - half, v.tbZ + half));
        cuts.push(g.cylY(x, v.tbZ - half, y0, y1, sw));
        cuts.push(g.cylY(x, v.tbZ + half, y0, y1, sw));
      }
    }
  }

  // ---------- custom cutouts ----------
  for (const co of p.cutouts) {
    const { u, v: vv, w, h } = co;
    if (w <= 0 || (co.shape === 'rect' && h <= 0)) continue;
    const circle = co.shape === 'circle';
    switch (co.face) {
      case 'front':
      case 'shoulder': {
        const zf = co.face === 'front' ? Dt : Ds;
        const z0 = zf - t - 0.6;
        const z1 = zf + 0.5;
        cuts.push(circle ? g.cylZ(u, vv, z0, z1, w) : g.box(u - w / 2, u + w / 2, vv - h / 2, vv + h / 2, z0, z1));
        break;
      }
      case 'top':
      case 'bottom': {
        const [y0, y1] = throughY(co.face === 'top' ? 1 : -1, vv);
        cuts.push(circle ? g.cylY(u, vv, y0, y1, w) : g.box(u - w / 2, u + w / 2, y0, y1, vv - h / 2, vv + h / 2));
        break;
      }
      case 'left':
      case 'right': {
        const s = co.face === 'right' ? 1 : -1;
        const x0 = s * (W / 2 - t - 0.6);
        const x1 = s * (W / 2 + 0.5);
        cuts.push(circle ? g.cylX(vv, u, x0, x1, w) : g.box(x0, x1, vv - h / 2, vv + h / 2, u - w / 2, u + w / 2));
        break;
      }
    }
  }

  // ---------- assemble ----------
  body = g.add(body, g.union(adds));
  const cutAll = g.union(cuts);
  body = g.sub(body, cutAll);

  const parts: MeshData[] = [];
  if (sideLid) {
    // The side wall (without its share of the rail hooks) becomes the lid.
    const sideBox = s > 0 ? g.box(xs, BIG, -BIG, BIG, 0, BIG) : g.box(-BIG, xs, -BIG, BIG, 0, BIG);
    let lid = g.inter(body, sideBox);
    let main = s > 0 ? g.inter(body, g.box(-BIG, xs, -BIG, BIG, -BIG, BIG)) : g.inter(body, g.box(xs, BIG, -BIG, BIG, -BIG, BIG));
    // The split plane coincides with the inside face of the side wall, which can
    // leave a zero-thickness sheet over the opening. Clear the opening explicitly.
    const opening = g.extrudeYZ(inner, Math.min(xs - s * 0.01, xs + s), Math.max(xs - s * 0.01, xs + s));
    main = g.sub(main, opening);

    // Lip on the lid that follows the inside profile and slides into the body.
    const ringOuter = g.t(inner.offset(-cc, 'Round'));
    const ringInner = g.t(inner.offset(-(cc + lipT), 'Round'));
    const ring = g.t(ringOuter.subtract(ringInner));
    const x0 = xs - s * lipH;
    let lip = g.extrudeYZ(ring, Math.min(x0, xs + s * EPS), Math.max(x0, xs + s * EPS));
    const clear = bosses.map((q) => g.cylX(q.y, q.z, xs - s * (lipH + 1), xs + s * EPS, Dp + 2 * cc));
    lip = g.sub(lip, g.union(clear));

    if (cn.snapRidges) {
      const rr = 0.5;
      const z0 = fl + 2;
      const z1 = Ds - t - 2;
      const Lr = (z1 - z0) * 0.6;
      const zc = (z0 + z1) / 2;
      const xr = xs - s * lipH / 2;
      const ridges: Manifold[] = [];
      const grooves: Manifold[] = [];
      if (Lr > 2) {
        for (const sy of [1, -1]) {
          const y = sy * (H / 2 - t - cc);
          ridges.push(g.cylZ(xr, y, zc - Lr / 2, zc + Lr / 2, 2 * rr));
          grooves.push(g.cylZ(xr, y, zc - Lr / 2 - 0.5, zc + Lr / 2 + 0.5, 2 * (rr + 0.1)));
        }
      }
      lip = g.add(lip, g.union(ridges));
      main = g.sub(main, g.union(grooves));
    }
    lip = g.sub(lip, cutAll);
    lid = g.add(lid, lip);
    // Body prints standing on its closed side, the lid on its outer face.
    parts.push(toMesh(main, 'body', 'Body', s > 0 ? 'xmin' : 'xmax'));
    parts.push(toMesh(lid, 'lid', 'Side lid', s > 0 ? 'xmax' : 'xmin'));
  } else {
    let base = g.inter(body, g.box(-BIG, BIG, -BIG, BIG, -BIG, split));
    let cover = g.inter(body, g.box(-BIG, BIG, -BIG, BIG, split, BIG));

    // Lip on the cover that slides into the base.
    const ix = W / 2 - t;
    const iy = H / 2 - t;
    const lipOuter = g.box(-(ix - cc), ix - cc, -(iy - cc), iy - cc, split - lipH, split + EPS);
    const lipFuse = g.box(-(ix + 0.2), ix + 0.2, -(iy + 0.2), iy + 0.2, split, split + 1.2);
    const lipInner = g.box(-(ix - cc - lipT), ix - cc - lipT, -(iy - cc - lipT), iy - cc - lipT, split - lipH - 1, split + 2);
    let lip = g.sub(g.union([lipOuter, lipFuse]), lipInner);
    const clear: Manifold[] = posts.map((q) => g.cylZ(q.x, q.y, split - lipH - 1, split + EPS, Dp + 2 * cc));
    lip = g.sub(lip, g.union(clear));

    if (cn.snapRidges) {
      const rr = 0.5;
      const Lr = (W - 2 * t) * 0.6;
      const zr = split - lipH / 2;
      const ridges: Manifold[] = [];
      const grooves: Manifold[] = [];
      for (const s of [1, -1]) {
        const y = s * (iy - cc);
        ridges.push(g.cylX(y, zr, -Lr / 2, Lr / 2, 2 * rr));
        grooves.push(g.cylX(y, zr, -Lr / 2 - 0.5, Lr / 2 + 0.5, 2 * (rr + 0.1)));
      }
      lip = g.add(lip, g.union(ridges));
      base = g.sub(base, g.union(grooves));
    }
    lip = g.sub(lip, cutAll);
    cover = g.add(cover, lip);
    parts.push(toMesh(base, 'base', 'Base'));
    parts.push(toMesh(cover, 'cover', 'Cover'));
  }

  // ---------- rail (for the preview only) ----------
  const rd = Math.max(f + 1, rl.depth);
  const rs = 12.5; // half of the 25 mm opening between the flanges
  const railCs = g.union2([
    g.rect2(rs, R, -f, 0),
    g.rect2(-R, -rs, -f, 0),
    g.rect2(rs, rs + f, -rd, 0),
    g.rect2(-rs - f, -rs, -rd, 0),
    g.rect2(-rs - f, rs + f, -rd, -rd + f),
  ]);
  const railLen = W + 60;
  const rail = toMesh(g.extrudeYZ(railCs, -railLen / 2, railLen / 2), 'rail', 'TH35 rail');

  return {
    parts,
    rail,
    warnings,
    dims: { width: W, height: H, depth: Dt },
  };
}
