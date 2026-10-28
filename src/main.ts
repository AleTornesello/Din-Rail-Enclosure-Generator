import './style.css';
import { defaultParams, enclosureWidth, normalizeParams, parseSettings, serializeParams, type Params } from './params';
import type { BuildResult } from './geometry/enclosure';
import type { WorkerRequest, WorkerResponse } from './geometry/worker';
import { Panel } from './ui/panel';
import { Viewer } from './viewer';
import { download, layoutParts, to3MF, toSTL } from './export';

const STORAGE_KEY = 'din-enclosure-settings';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function loadStored(): Params {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseSettings(raw);
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return defaultParams();
}

let params = loadStored();
let result: BuildResult | null = null;

const viewer = new Viewer($('viewport'));
const status = $('status');
const warningsEl = $('warnings');

// ---------- geometry worker ----------
const worker = new Worker(new URL('./geometry/worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
let inFlight = false;
let pending = false;

function requestBuild(): void {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  pending = false;
  status.textContent = 'Generating…';
  status.className = 'status busy';
  worker.postMessage({ id: ++reqId, params: structuredClone(params) } satisfies WorkerRequest);
}

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  inFlight = false;
  const msg = ev.data;
  if (msg.ok) {
    result = msg.result;
    viewer.setResult(result, params.rail.depth);
    status.textContent = `Ready · ${msg.ms.toFixed(0)} ms`;
    status.className = 'status';
    showWarnings(result.warnings);
    updateDims();
    updateExportMenu();
  } else {
    status.textContent = 'Error';
    status.className = 'status error';
    showWarnings([`Could not generate the model: ${msg.error}`]);
  }
  if (pending) requestBuild();
};

function showWarnings(list: string[]): void {
  warningsEl.hidden = list.length === 0;
  warningsEl.replaceChildren(...list.map((w) => Object.assign(document.createElement('div'), { textContent: w })));
}

function updateDims(): void {
  if (!result) return;
  const d = result.dims;
  const vol = result.parts.reduce((s, p) => s + p.volume, 0) / 1000;
  $('dims').textContent = `${params.body.modules} module${params.body.modules > 1 ? 's' : ''} · ${d.width.toFixed(1)} × ${d.height.toFixed(1)} × ${d.depth.toFixed(1)} mm · ${vol.toFixed(1)} cm³`;
}

// ---------- settings panel ----------
let saveTimer = 0;
let buildTimer = 0;
const panel = new Panel($('panel'), () => params, () => {
  panel.refresh();
  clearTimeout(buildTimer);
  buildTimer = window.setTimeout(requestBuild, 120);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeParams(params));
    } catch {
      /* ignore */
    }
  }, 400);
});

function replaceParams(p: Params): void {
  params = p;
  panel.refresh(true);
  try {
    localStorage.setItem(STORAGE_KEY, serializeParams(params));
  } catch {
    /* ignore */
  }
  requestBuild();
}

// ---------- topbar ----------
const baseName = () => `din-enclosure-${params.body.modules}M-${enclosureWidth(params).toFixed(1).replace('.', '_')}mm`;

$('btn-reset').onclick = () => {
  if (confirm('Reset all settings to their defaults?')) replaceParams(defaultParams());
};
$('btn-export-settings').onclick = () => {
  download(new Blob([serializeParams(params)], { type: 'application/json' }), `${baseName()}.json`);
};
const fileInput = $<HTMLInputElement>('file-import');
$('btn-import').onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    replaceParams(parseSettings(await file.text()));
  } catch (err) {
    alert(`This file could not be read as enclosure settings.\n\n${err instanceof Error ? err.message : err}`);
  }
};

const menuBtn = $('btn-export-model');
const menu = $('export-menu');
const setMenu = (open: boolean) => {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuBtn.onclick = (e) => {
  e.stopPropagation();
  setMenu(menu.hidden !== false);
};
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target as Node)) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});

function updateExportMenu(): void {
  const host = $('export-parts');
  host.replaceChildren();
  if (!result || result.parts.length < 2) return;
  for (const part of result.parts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.export = `stl-${part.id}`;
    b.textContent = `STL – ${part.name.toLowerCase()} only`;
    host.append(b);
  }
}

menu.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-export]');
  if (!target || !result) return;
  const kind = target.dataset.export!;
  const orient = $<HTMLInputElement>('print-orient').checked;
  if (kind === 'stl-all') {
    download(toSTL(layoutParts(result.parts, orient)), `${baseName()}.stl`);
  } else if (kind === '3mf') {
    download(to3MF(layoutParts(result.parts, orient)), `${baseName()}.3mf`);
  } else {
    const id = kind.slice(4);
    const part = result.parts.find((p) => p.id === id);
    if (part) download(toSTL(layoutParts([part], orient)), `${baseName()}-${id}.stl`);
  }
  setMenu(false);
});

// ---------- view tools ----------
$<HTMLInputElement>('opt-rail').onchange = (e) => viewer.setShowRail((e.target as HTMLInputElement).checked);
$<HTMLInputElement>('opt-section').onchange = (e) => viewer.setSection((e.target as HTMLInputElement).checked);
$<HTMLInputElement>('opt-explode').oninput = (e) => viewer.setExplode(Number((e.target as HTMLInputElement).value));
document.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => {
  b.onclick = () => viewer.frame(b.dataset.view as 'iso' | 'front' | 'side' | 'top');
});

const panelWrap = $('panel-wrap');
const syncInset = () => viewer.setInsetLeft(panelWrap.hidden || window.innerWidth < 640 ? 0 : panelWrap.offsetWidth + 12);
$('btn-collapse').onclick = () => {
  panelWrap.hidden = true;
  $('btn-expand').hidden = false;
  syncInset();
};
$('btn-expand').onclick = () => {
  panelWrap.hidden = false;
  $('btn-expand').hidden = true;
  syncInset();
};
window.addEventListener('resize', syncInset);
if (window.innerWidth < 640) {
  panelWrap.hidden = true;
  $('btn-expand').hidden = false;
}
syncInset();

// Expose for debugging and automated tests.
Object.assign(window, { __enclosure: { viewer, get params() { return params; }, set: (p: unknown) => replaceParams(normalizeParams(p)) } });

requestBuild();
