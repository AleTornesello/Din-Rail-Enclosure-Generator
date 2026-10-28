import type { Cutout, CutoutFace, Params } from '../params';
import { getPath, SECTIONS, setPath, type Field } from './schema';

type Row = { el: HTMLElement; field: Field; sync?: () => void };

const FACE_LABELS: Record<CutoutFace, string> = {
  front: 'Front face',
  shoulder: 'Shoulder (terminal side)',
  top: 'Top wall',
  bottom: 'Bottom wall',
  left: 'Left side',
  right: 'Right side',
};

const FACE_AXES: Record<CutoutFace, [string, string]> = {
  front: ['X from centre', 'Y from centre'],
  shoulder: ['X from centre', 'Y from centre'],
  top: ['X from centre', 'Depth from back'],
  bottom: ['X from centre', 'Depth from back'],
  left: ['Depth from back', 'Y from centre'],
  right: ['Depth from back', 'Y from centre'],
};

let uid = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Builds the settings panel from the schema and keeps it in sync with the params. */
export class Panel {
  private rows: Row[] = [];
  private cutoutList!: HTMLElement;

  constructor(
    private host: HTMLElement,
    private getParams: () => Params,
    private onChange: () => void,
  ) {
    this.render();
  }

  private render(): void {
    this.host.replaceChildren();
    this.rows = [];
    for (const section of SECTIONS) {
      const det = el('details', 'section');
      det.open = !!section.open;
      det.append(el('summary', undefined, section.title));
      const body = el('div', 'section-body');
      for (const field of section.fields) {
        const row = this.renderField(field);
        body.append(row.el);
        this.rows.push(row);
      }
      det.append(body);
      this.host.append(det);
    }
    const det = el('details', 'section');
    det.append(el('summary', undefined, 'Custom cut-outs'));
    const body = el('div', 'section-body');
    body.append(el('p', 'help', 'Add holes for connectors, buttons, displays or glands on any face.'));
    this.cutoutList = el('div', 'cutouts');
    const add = el('button', 'btn small', '+ Add cut-out');
    add.type = 'button';
    add.onclick = () => {
      this.getParams().cutouts.push({ face: 'front', shape: 'circle', u: 0, v: 0, w: 6, h: 6 });
      this.renderCutouts();
      this.onChange();
    };
    body.append(this.cutoutList, add);
    det.append(body);
    this.host.append(det);
    this.renderCutouts();
    this.refresh();
  }

  private renderField(field: Field): Row {
    const p = () => this.getParams();
    if (field.kind === 'heading') return { el: el('h4', 'sub', field.label), field };
    if (field.kind === 'info') {
      const e = el('div', 'info');
      return { el: e, field, sync: () => (e.textContent = field.text(p())) };
    }
    const row = el('label', 'row');
    const id = `f${uid++}`;
    row.htmlFor = id;
    const name = el('span', 'name', field.label);
    if (field.help) {
      const h = el('span', 'hint', '?');
      h.title = field.help;
      name.append(h);
    }
    row.append(name);

    if (field.kind === 'toggle') {
      row.classList.add('toggle');
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.onchange = () => {
        setPath(p(), field.path, input.checked);
        this.onChange();
      };
      row.append(input);
      return { el: row, field, sync: () => (input.checked = !!getPath(p(), field.path)) };
    }

    if (field.kind === 'select') {
      const select = el('select');
      select.id = id;
      for (const o of field.options) {
        const opt = el('option', undefined, o.label);
        opt.value = String(o.value);
        select.append(opt);
      }
      const numeric = typeof field.options[0].value === 'number';
      select.onchange = () => {
        setPath(p(), field.path, numeric ? Number(select.value) : select.value);
        this.onChange();
      };
      row.append(select);
      return { el: row, field, sync: () => (select.value = String(getPath(p(), field.path))) };
    }

    const wrap = el('span', 'num');
    const input = el('input');
    input.type = 'number';
    input.id = id;
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    input.step = String(field.step ?? 0.1);
    if (field.suggestions) {
      const list = el('datalist');
      list.id = `${id}-list`;
      for (const s of field.suggestions) {
        const o = el('option');
        o.value = String(s);
        list.append(o);
      }
      input.setAttribute('list', list.id);
      wrap.append(list);
    }
    const commit = () => {
      let v = Number(input.value);
      if (input.value === '' || !Number.isFinite(v)) return;
      if (field.min !== undefined) v = Math.max(field.min, v);
      if (field.max !== undefined) v = Math.min(field.max, v);
      if (field.step === 1) v = Math.round(v);
      setPath(p(), field.path, v);
      this.onChange();
    };
    input.oninput = commit;
    input.onchange = () => {
      commit();
      input.value = String(getPath(p(), field.path));
    };
    wrap.append(input);
    if (field.unit) wrap.append(el('span', 'unit', field.unit));
    row.append(wrap);
    return {
      el: row,
      field,
      sync: () => {
        if (document.activeElement !== input) input.value = String(getPath(p(), field.path));
      },
    };
  }

  private renderCutouts(): void {
    const list = this.getParams().cutouts;
    this.cutoutList.replaceChildren();
    list.forEach((c, i) => this.cutoutList.append(this.cutoutCard(c, i)));
  }

  private cutoutCard(c: Cutout, i: number): HTMLElement {
    const card = el('div', 'cutout');
    const head = el('div', 'cutout-head');
    head.append(el('strong', undefined, `Cut-out ${i + 1}`));
    const del = el('button', 'btn icon', '✕');
    del.type = 'button';
    del.title = 'Remove';
    del.onclick = () => {
      this.getParams().cutouts.splice(i, 1);
      this.renderCutouts();
      this.onChange();
    };
    head.append(del);
    card.append(head);

    const selRow = (label: string, value: string, opts: [string, string][], set: (v: string) => void) => {
      const row = el('label', 'row');
      row.append(el('span', 'name', label));
      const s = el('select');
      for (const [v, l] of opts) {
        const o = el('option', undefined, l);
        o.value = v;
        s.append(o);
      }
      s.value = value;
      s.onchange = () => {
        set(s.value);
        this.renderCutouts();
        this.onChange();
      };
      row.append(s);
      return row;
    };
    const numRow = (label: string, key: 'u' | 'v' | 'w' | 'h') => {
      const row = el('label', 'row');
      row.append(el('span', 'name', label));
      const wrap = el('span', 'num');
      const input = el('input');
      input.type = 'number';
      input.step = '0.5';
      input.value = String(c[key]);
      input.oninput = () => {
        const v = Number(input.value);
        if (input.value === '' || !Number.isFinite(v)) return;
        c[key] = v;
        this.onChange();
      };
      wrap.append(input, el('span', 'unit', 'mm'));
      row.append(wrap);
      return row;
    };
    card.append(
      selRow('Face', c.face, Object.entries(FACE_LABELS) as [string, string][], (v) => (c.face = v as CutoutFace)),
      selRow('Shape', c.shape, [['circle', 'Circle'], ['rect', 'Rectangle']], (v) => (c.shape = v as Cutout['shape'])),
      numRow(FACE_AXES[c.face][0], 'u'),
      numRow(FACE_AXES[c.face][1], 'v'),
      numRow(c.shape === 'circle' ? 'Diameter' : 'Width', 'w'),
    );
    if (c.shape === 'rect') card.append(numRow('Height', 'h'));
    return card;
  }

  /** Re-syncs every input with the params (after import/reset) and updates visibility. */
  refresh(full = false): void {
    if (full) this.renderCutouts();
    const p = this.getParams();
    for (const r of this.rows) {
      r.sync?.();
      const vis = 'visible' in r.field && r.field.visible ? r.field.visible(p) : true;
      r.el.hidden = !vis;
    }
  }
}
