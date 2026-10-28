import { zipSync, strToU8 } from 'fflate';
import type { MeshData } from './geometry/enclosure';

const GAP = 10;

/**
 * Returns copies of the parts ready for slicing. In print orientation each part
 * lies on its side (the enclosure's left wall on the bed): every feature is an
 * extrusion of the side profile, so it prints without supports.
 */
export function layoutParts(parts: MeshData[], printOrientation: boolean): MeshData[] {
  let cursor = 0;
  return parts.map((part) => {
    const src = part.positions;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      if (printOrientation) {
        // (x, y, z) -> (y, z, x): a proper rotation, so winding is preserved.
        pos[i] = src[i + 1];
        pos[i + 1] = src[i + 2];
        pos[i + 2] = src[i];
      } else {
        pos[i] = src[i];
        pos[i + 1] = src[i + 1];
        pos[i + 2] = src[i + 2];
      }
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
    const dx = cursor - min[0];
    const dy = -min[1];
    const dz = -min[2];
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += dx;
      pos[i + 1] += dy;
      pos[i + 2] += dz;
    }
    cursor += max[0] - min[0] + GAP;
    return { ...part, positions: pos, indices: part.indices };
  });
}

export function toSTL(parts: MeshData[]): Blob {
  const triCount = parts.reduce((n, p) => n + p.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const header = 'DIN rail enclosure - IEC 60715 TH35 - units: mm';
  for (let i = 0; i < Math.min(80, header.length); i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triCount, true);
  let o = 84;
  for (const p of parts) {
    const P = p.positions;
    const I = p.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
      o += 12;
      for (const v of [a, b, c]) {
        view.setFloat32(o, P[v], true);
        view.setFloat32(o + 4, P[v + 1], true);
        view.setFloat32(o + 8, P[v + 2], true);
        o += 12;
      }
      view.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'model/stl' });
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmt = (n: number) => (Math.round(n * 1e5) / 1e5).toString();

export function to3MF(parts: MeshData[]): Blob {
  const objects = parts.map((p, idx) => {
    const verts: string[] = [];
    for (let i = 0; i < p.positions.length; i += 3) {
      verts.push(`<vertex x="${fmt(p.positions[i])}" y="${fmt(p.positions[i + 1])}" z="${fmt(p.positions[i + 2])}"/>`);
    }
    const tris: string[] = [];
    for (let t = 0; t < p.indices.length; t += 3) {
      tris.push(`<triangle v1="${p.indices[t]}" v2="${p.indices[t + 1]}" v3="${p.indices[t + 2]}"/>`);
    }
    return `<object id="${idx + 1}" name="${xmlEscape(p.name)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`;
  });
  const items = parts.map((_, idx) => `<item objectid="${idx + 1}"/>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">DIN Rail Enclosure Generator</metadata>
<resources>${objects.join('')}</resources>
<build>${items}</build>
</model>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const zip = zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  });
  return new Blob([zip], { type: 'model/3mf' });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
