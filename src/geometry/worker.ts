import Module, { type ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildEnclosure } from './enclosure';
import type { Params } from '../params';

export type WorkerRequest = { id: number; params: Params };
export type WorkerResponse =
  | { id: number; ok: true; result: ReturnType<typeof buildEnclosure>; ms: number }
  | { id: number; ok: false; error: string };

let ready: Promise<ManifoldToplevel> | null = null;
function manifold(): Promise<ManifoldToplevel> {
  ready ??= Module({ locateFile: () => wasmUrl }).then((m) => {
    m.setup();
    return m;
  });
  return ready;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, params } = ev.data;
  try {
    const M = await manifold();
    const t0 = performance.now();
    const result = buildEnclosure(M, params);
    const ms = performance.now() - t0;
    const transfer = [...result.parts, result.rail].flatMap((m) => [m.positions.buffer, m.indices.buffer]);
    (self as unknown as Worker).postMessage({ id, ok: true, result, ms } satisfies WorkerResponse, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
