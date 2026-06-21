// render.js — the Stage. Builds a DOM node per HUD-spec element, positions it in %-space with an
// anchor, scales font-size to the stage height (resolution-independent), and on update() lets each
// element type redraw from the latest state snapshot. Shared by the overlay and the editor.
import { ELEMENTS } from './elements.js';

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

export class Stage {
  constructor(root) {
    this.root = root;
    this.nodes = new Map();
    this.spec = null;
    this._ro = new ResizeObserver(() => this._unit());
    this._ro.observe(root);
    this._unit();
  }
  // 1 "u" = 1% of stage height. Element font-size = u * baseSize * scale -> HUD scales with the window.
  _unit() { this.root.style.setProperty('--u', (this.root.clientHeight / 100) + 'px'); }

  setSpec(spec) {
    this.spec = spec;
    this.root.innerHTML = '';
    this.nodes.clear();
    for (const el of spec.elements || []) this._mount(el);
    this._unit();
  }

  _mount(el) {
    const node = document.createElement('div');
    node.className = 'hel hel-' + el.type;
    node.dataset.id = el.id;
    this.layout(node, el);
    this.root.appendChild(node);
    this.nodes.set(el.id, node);
    return node;
  }

  // (re)apply position/scale/colour from the spec entry (used on load + by the editor live).
  layout(node, el) {
    const def = ELEMENTS[el.type] || {};
    node.style.left = (el.x ?? 50) + '%';
    node.style.top = (el.y ?? 50) + '%';
    node.style.transform = anchorTransform(el.anchor);
    node.style.fontSize = `calc(var(--u) * ${def.size ?? 3} * ${el.scale ?? 1})`;
    node.style.color = el.color || '';
    node.style.zIndex = el.z ?? 1;
    node.style.display = el.show === false ? 'none' : '';
    if (el.opts?.align) node.style.setProperty('--align', el.opts.align);
  }

  update(state) {
    if (!this.spec || !state) return;
    for (const el of this.spec.elements || []) {
      const node = this.nodes.get(el.id);
      if (!node) continue;
      if (el.show === false) { node.style.display = 'none'; continue; }
      if (node.style.display === 'none') node.style.display = '';
      const def = ELEMENTS[el.type];
      if (def?.render) { try { def.render(node, el, state); } catch {} }
    }
  }

  getNode(id) { return this.nodes.get(id); }
}
