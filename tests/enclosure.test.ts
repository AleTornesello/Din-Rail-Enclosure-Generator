import { describe, expect, it, beforeAll } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { buildEnclosure, type MeshData } from '../src/geometry/enclosure';
import { defaultParams, normalizeParams, parseSettings, serializeParams, type Params } from '../src/params';

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await Module();
  M.setup();
});

function bbox(m: MeshData) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return { min, max };
}

// Every directed edge of a closed, consistently oriented mesh has exactly one
// opposite twin.
function isWatertight(m: MeshData) {
  const edges = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${m.indices[t + k]},${m.indices[t + ((k + 1) % 3)]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of edges) {
    const [a, b] = key.split(',');
    if (n !== 1 || edges.get(`${b},${a}`) !== 1) return false;
  }
  return m.indices.length > 0;
}

function variant(fn: (p: Params) => void): Params {
  const p = defaultParams();
  fn(p);
  return p;
}

describe('enclosure geometry', () => {
  it('builds the default two-part enclosure', () => {
    const r = buildEnclosure(M, defaultParams());
    expect(r.parts.map((p) => p.id)).toEqual(['base', 'cover']);
    for (const part of r.parts) {
      expect(part.volume).toBeGreaterThan(1000);
      expect(isWatertight(part)).toBe(true);
    }
    expect(r.warnings).toEqual([]);
    const base = bbox(r.parts[0]);
    const cover = bbox(r.parts[1]);
    // width = 4 modules * 17.5 - 0.5 clearance
    expect(base.max[0] - base.min[0]).toBeCloseTo(69.5, 3);
    // hooks reach behind the rail flanges (z < 0); front at total depth
    expect(base.min[2]).toBeLessThan(-2);
    expect(cover.max[2]).toBeCloseTo(58, 3);
    // the neck is 44.5 mm high
    expect(r.dims).toEqual({ width: 69.5, height: 90, depth: 58 });
  });

  it('builds a 1-module flat enclosure with fixed hooks and a right side lid', () => {
    const r = buildEnclosure(M, variant((p) => {
      p.body.modules = 1;
      p.body.neck = false;
      p.rail.clip = 'fixed';
      p.construction.type = 'side-lid';
      p.terminalsTop.count = 2;
      p.terminalsBottom.count = 2;
      p.front.window = false;
      p.front.ledCount = 1;
      p.pcb.standoffs = false;
    }));
    expect(r.parts.map((p) => p.id)).toEqual(['body', 'lid']);
    for (const part of r.parts) expect(isWatertight(part)).toBe(true);
    const lid = bbox(r.parts[1]);
    // the lid is the right wall (x = W/2) plus a lip reaching into the body
    expect(lid.max[0]).toBeCloseTo(r.dims.width / 2, 3);
    expect(lid.min[0]).toBeCloseTo(r.dims.width / 2 - 2 - 3, 3);
    expect(lid.min[2]).toBeGreaterThanOrEqual(0);
    expect(r.parts[1].printFace).toBe('xmax');
  });

  it('builds a left side lid with screws and snap ridges', () => {
    const r = buildEnclosure(M, variant((p) => {
      p.construction.type = 'side-lid';
      p.construction.side = 'left';
      p.construction.screws = true;
    }));
    expect(r.warnings).toEqual([]);
    for (const part of r.parts) expect(isWatertight(part)).toBe(true);
    expect(bbox(r.parts[1]).min[0]).toBeCloseTo(-r.dims.width / 2, 3);
    expect(r.parts[0].printFace).toBe('xmax');
  });

  it('builds a wide enclosure with screws, slots, vents and custom cutouts', () => {
    const r = buildEnclosure(M, variant((p) => {
      p.body.modules = 12;
      p.construction.screws = true;
      p.terminalsTop.style = 'slot';
      p.terminalsTop.count = 10;
      p.terminalsBottom.wireShape = 'round';
      p.vents.topBottom = true;
      p.front.label = true;
      p.cutouts = [
        { face: 'front', shape: 'rect', u: 0, v: 0, w: 10, h: 5 },
        { face: 'left', shape: 'circle', u: 30, v: 0, w: 6, h: 0 },
        { face: 'top', shape: 'rect', u: 60, v: 40, w: 8, h: 4 },
      ];
    }));
    for (const part of r.parts) expect(isWatertight(part)).toBe(true);
  });

  it('reports a warning when the split is out of range', () => {
    const r = buildEnclosure(M, variant((p) => { p.construction.splitDepth = 100; }));
    expect(r.warnings.some((w) => w.includes('Split depth'))).toBe(true);
  });
});

describe('settings', () => {
  it('round-trips through JSON', () => {
    const p = variant((q) => { q.body.modules = 6; q.cutouts = [{ face: 'right', shape: 'rect', u: 1, v: 2, w: 3, h: 4 }]; });
    expect(parseSettings(serializeParams(p))).toEqual(p);
  });
  it('ignores unknown keys and wrong types', () => {
    const p = normalizeParams({ body: { modules: '7', height: 80, bogus: 1 }, cutouts: [{ face: 'nope', w: 9 }] });
    expect(p.body.modules).toBe(4);
    expect(p.body.height).toBe(80);
    expect(p.cutouts[0]).toMatchObject({ face: 'front', w: 9 });
  });
  it('falls back to the default construction for the removed single-piece type', () => {
    expect(normalizeParams({ construction: { type: 'single' } }).construction.type).toBe('two-part');
  });
});
