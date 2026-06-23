// render.js — the Stage. Builds a DOM node per HUD-spec element, positions it in %-space with an
// anchor, scales font-size to the stage height (resolution-independent), and on update() lets each
// element type redraw from the latest state snapshot. Shared by the overlay and the editor.
//
// Two render modes, picked from spec.meta.theme:
//   • default  — one node per element; font-size = stage-height% * size * scale (the --u model).
//   • fixed1080 — themes flagged fixedStage (e.g. qhlan) render on an inner 1920x1080 stage scaled
//     as a whole (transform: scale), with each element positioned + transform-scaled like the
//     design's reference renderer, so fixed-px theme CSS is resolution-independent.
import { ELEMENTS } from './elements.js';
import { QHLAN_ELEMENTS } from './qhlan-elements.js';
import { THEMES } from './theme.js';

// themes whose elements come from a non-default registry (and which render in fixed-1080 mode).
const THEMED_REGISTRY = { qhlan: QHLAN_ELEMENTS };

// Anchor is order-independent: l/r set the X axis, t/b set the Y axis, c (or an unset axis)
// means centred. So 'rt', 'tr', 'cr', 'rc', 'ct', 'cb', 'cc' all resolve correctly.
export function anchorTransform(anchor = 'cc') {
  let ax = null, ay = null;
  for (const ch of String(anchor).toLowerCase()) {
    if (ch === 'l') ax = '0%';
    else if (ch === 'r') ax = '-100%';
    else if (ch === 't') ay = '0%';
    else if (ch === 'b') ay = '-100%';
  }
  return `translate(${ax ?? '-50%'}, ${ay ?? '-50%'})`;
}

// transform-origin that matches anchorTransform, for the scaled inner wrapper in fixed-1080 mode.
function anchorOrigin(anchor = 'cc') {
  let ox = '50%', oy = '50%';
  for (const ch of String(anchor).toLowerCase()) {
    if (ch === 'l') ox = '0%';
    else if (ch === 'r') ox = '100%';
    else if (ch === 't') oy = '0%';
    else if (ch === 'b') oy = '100%';
  }
  return `${ox} ${oy}`;
}

export class Stage {
  constructor(root) {
    this.root = root;
    this.nodes = new Map();
    this.spec = null;
    this.reg = ELEMENTS;       // active element registry
    this.fixed = false;        // fixed-1080 mode?
    this.scaler = null;        // the 1920x1080 inner stage (fixed mode only)
    this._mountInto = root;
    this._ro = new ResizeObserver(() => this._unit());
    this._ro.observe(root);
    this._unit();
  }
  // 1 "u" = 1% of stage height. Element font-size = u * baseSize * scale -> HUD scales with the window.
  // In fixed-1080 mode also rescale the inner stage to fit (contain) the root.
  _unit() {
    this.root.style.setProperty('--u', (this.root.clientHeight / 100) + 'px');
    if (this.fixed && this.scaler) {
      const s = Math.min(this.root.clientWidth / 1920, this.root.clientHeight / 1080) || 1;
      this.scaler.style.transform = `translate(-50%, -50%) scale(${s})`;
    }
  }

  setSpec(spec) {
    this.spec = spec;
    const theme = spec?.meta?.theme;
    this.reg = THEMED_REGISTRY[theme] || ELEMENTS;
    this.fixed = !!(theme && THEMES[theme]?.fixedStage);
    this.root.innerHTML = '';
    this.nodes.clear();
    this.scaler = null;
    this._mountInto = this.root;
    if (this.fixed) {
      // a fixed 1920x1080 stage, centred and scaled as a whole; elements live inside it.
      const sc = document.createElement('div');
      sc.className = 'hud-stage';
      sc.style.position = 'absolute';
      sc.style.left = '50%';
      sc.style.top = '50%';
      this.root.appendChild(sc);
      this.scaler = sc;
      this._mountInto = sc;
    }
    for (const el of spec.elements || []) this._mount(el);
    this._unit();
  }

  _mount(el) {
    const parent = this._mountInto || this.root;
    if (this.fixed) {
      // outer .hud-el carries position+anchor; inner wrapper carries the per-element scale.
      const outer = document.createElement('div');
      outer.className = 'hud-el';
      outer.dataset.id = el.id;
      outer.dataset.type = el.type;
      outer.appendChild(document.createElement('div'));
      this.layout(outer, el);
      parent.appendChild(outer);
      this.nodes.set(el.id, outer);
      return outer;
    }
    const node = document.createElement('div');
    node.className = 'hel hel-' + el.type;
    node.dataset.id = el.id;
    this.layout(node, el);
    parent.appendChild(node);
    this.nodes.set(el.id, node);
    return node;
  }

  // (re)apply position/scale/colour from the spec entry (used on load + by the editor live).
  layout(node, el) {
    const def = this.reg[el.type] || {};
    node.style.left = (el.x ?? 50) + '%';
    node.style.top = (el.y ?? 50) + '%';
    node.style.transform = anchorTransform(el.anchor);
    node.style.zIndex = el.z ?? 1;
    node.style.display = el.show === false ? 'none' : '';
    if (this.fixed) {
      const inner = node.firstChild;
      if (inner) {
        inner.style.transform = `scale(${el.scale ?? 1})`;
        inner.style.transformOrigin = anchorOrigin(el.anchor);
        inner.style.color = el.color || '';
      }
    } else {
      node.style.fontSize = `calc(var(--u) * ${def.size ?? 3} * ${el.scale ?? 1})`;
      node.style.color = el.color || '';
    }
    if (el.opts?.align) node.style.setProperty('--align', el.opts.align);
  }

  update(state) {
    if (!this.spec || !state) return;
    for (const el of this.spec.elements || []) {
      const node = this.nodes.get(el.id);
      if (!node) continue;
      if (el.show === false) { node.style.display = 'none'; continue; }
      if (node.style.display === 'none') node.style.display = '';
      const def = this.reg[el.type];
      if (def?.render) {
        const target = this.fixed ? node.firstChild : node;
        try { def.render(target, el, state); } catch {}
      }
    }
  }

  getNode(id) { return this.nodes.get(id); }
}
