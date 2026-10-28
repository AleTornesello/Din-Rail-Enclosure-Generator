import { beforeAll, describe, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { unzipSync, strFromU8 } from 'fflate';
import { buildEnclosure, type BuildResult } from '../src/geometry/enclosure';
import { defaultParams } from '../src/params';
import { layoutParts, to3MF, toSTL } from '../src/export';

let M: ManifoldToplevel;
let r: BuildResult;
beforeAll(async () => {
  M = await Module();
  M.setup();
  r = buildEnclosure(M, defaultParams());
});

function bounds(pos: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i + k]);
    max[k] = Math.max(max[k], pos[i + k]);
  }
  return { min, max };
}

describe('export', () => {
  it('lays parts on their side, on the bed, without overlapping', () => {
    const parts = layoutParts(r.parts, true);
    const [a, b] = parts.map((p) => bounds(p.positions));
    expect(a.min[2]).toBeCloseTo(0, 5);
    expect(b.min[2]).toBeCloseTo(0, 5);
    // lying on the side: the part height on the bed equals the enclosure width
    expect(a.max[2]).toBeCloseTo(r.dims.width, 3);
    expect(b.min[0]).toBeGreaterThan(a.max[0]);
    // volume is preserved (rotation keeps the winding)
    const vol = (pos: Float32Array, idx: Uint32Array) => {
      let v = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const [i, j, k] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
        v += pos[i] * (pos[j + 1] * pos[k + 2] - pos[j + 2] * pos[k + 1])
           - pos[i + 1] * (pos[j] * pos[k + 2] - pos[j + 2] * pos[k])
           + pos[i + 2] * (pos[j] * pos[k + 1] - pos[j + 1] * pos[k]);
      }
      return v / 6;
    };
    expect(vol(parts[0].positions, parts[0].indices)).toBeCloseTo(r.parts[0].volume, 0);
  });

  it('writes a binary STL with the right triangle count', async () => {
    const blob = toSTL(r.parts);
    const buf = new DataView(await blob.arrayBuffer());
    const tris = r.parts.reduce((n, p) => n + p.indices.length / 3, 0);
    expect(buf.getUint32(80, true)).toBe(tris);
    expect(buf.byteLength).toBe(84 + 50 * tris);
  });

  it('writes a 3MF package with one object per part', async () => {
    const files = unzipSync(new Uint8Array(await to3MF(r.parts).arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model.match(/<item /g)).toHaveLength(2);
  });
});
