// elements.js — the HUD element catalog. Each type: { label, size (base height in % of stage),
// defaultOpts, render(node, el, state) }. `size` x el.scale x stage-height = the element font-size.
// One source of truth for both the overlay and the editor palette.
import {
  armorType, ARMOR_COLORS, ownedWeapons, activeWeaponId, powerups, mmss, WEAPONS,
} from './qw-constants.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// QuakeWorld player colours 0..13 (approx of the quake palette top-colour ramps).
const QW_PALETTE = [
  '#d8d8d8', '#a86a32', '#4f6f9f', '#3f9f4f', '#cf3f3f', '#bf8f3f',
  '#9f5fcf', '#cf8f5f', '#6f9fdf', '#dfdf5f', '#7fdf7f', '#df6f9f', '#5fdfdf', '#ff9f2f',
];
const teamColor = (i) => QW_PALETTE[(i | 0) % 14] || '#d8d8d8';

const AMMO_COLORS = { shells: '#ffd24a', nails: '#9fd0ff', rockets: '#ff7a4a', cells: '#c79fff' };

function healthColor(h) { return h <= 25 ? '#ff3030' : h <= 50 ? '#ffd24a' : '#ffffff'; }

// resolve the tracked player's display name + whether stats are meaningful
function trackedName(state) {
  return state?.me?.name || state?.spec?.tracking || '';
}

export const ELEMENTS = {
  bigstat: {
    label: 'Big stat (health / armour / ammo)',
    size: 5.5,
    defaultOpts: { kind: 'health', icon: false },
    render(node, el, state) {
      const me = state?.me;
      const kind = el.opts?.kind || 'health';
      if (!me) { node.innerHTML = ''; return; }
      let val = 0, color = '#fff';
      if (kind === 'health') { val = me.health; color = healthColor(me.health); }
      else if (kind === 'armor') { val = me.armor; color = ARMOR_COLORS[me.armortype ?? armorType(me.items)]; }
      else if (kind === 'ammo') { val = me.weapon_ammo; color = '#fff'; }
      const c = el.color || color;
      node.innerHTML = `<span class="bs-val" style="color:${c}">${val | 0}</span>`;
    },
  },

  ammocounts: {
    label: 'Ammo counts (shells/nails/rockets/cells)',
    size: 2.6,
    defaultOpts: {},
    render(node, el, state) {
      const me = state?.me; if (!me?.ammo) { node.innerHTML = ''; return; }
      const active = activeWeaponId(me.weapon);
      const pool = WEAPONS.find(w => w.id === active)?.ammo;
      node.innerHTML = ['shells', 'nails', 'rockets', 'cells'].map(k =>
        `<span class="ac-item ${k === pool ? 'ac-active' : ''}" style="color:${AMMO_COLORS[k]}">${me.ammo[k] | 0}</span>`
      ).join('');
    },
  },

  weapons: {
    label: 'Weapons owned',
    size: 2.6,
    defaultOpts: {},
    render(node, el, state) {
      const me = state?.me; if (!me) { node.innerHTML = ''; return; }
      const owned = new Set(ownedWeapons(me.items));
      const active = activeWeaponId(me.weapon);
      node.innerHTML = WEAPONS.filter(w => w.id !== 'axe').map(w => {
        const has = owned.has(w.id);
        const cls = 'wp' + (has ? ' wp-have' : ' wp-miss') + (w.id === active ? ' wp-active' : '');
        return `<span class="${cls}">${w.label}</span>`;
      }).join('');
    },
  },

  powerups: {
    label: 'Powerups (quad/pent/ring/suit)',
    size: 3.2,
    defaultOpts: {},
    render(node, el, state) {
      const me = state?.me; if (!me) { node.innerHTML = ''; return; }
      const p = powerups(me.items);
      const tm = me.powerup_timers || {};
      const out = [];
      const add = (on, key, label, color) => { if (on) out.push(`<span class="pu" style="color:${color}">${label}${tm[key] ? ' ' + Math.ceil(tm[key]) : ''}</span>`); };
      add(p.quad, 'quad', 'QUAD', '#6f9fff');
      add(p.pent, 'pent', 'PENT', '#ff4136');
      add(p.ring, 'ring', 'RING', '#dfdf5f');
      add(p.suit, 'suit', 'SUIT', '#3f9f4f');
      node.innerHTML = out.join('');
    },
  },

  teamscore: {
    label: 'Team score bar',
    size: 3.6,
    defaultOpts: {},
    render(node, el, state) {
      const teams = state?.teams || [];
      if (teams.length < 1) { node.innerHTML = ''; return; }
      const cell = (t) => `<span class="ts-box" style="background:${teamColor(t.color)}"></span><span class="ts-name">${esc(t.name)}</span><span class="ts-frags">${t.frags | 0}</span>`;
      if (teams.length >= 2) {
        node.innerHTML = `<span class="ts-side ts-left">${cell(teams[0])}</span><span class="ts-sep">:</span><span class="ts-side ts-right">${cell(teams[1])}</span>`;
      } else {
        node.innerHTML = `<span class="ts-side">${cell(teams[0])}</span>`;
      }
    },
  },

  gameclock: {
    label: 'Game clock',
    size: 3.0,
    defaultOpts: {},
    render(node, el, state) {
      const m = state?.match; if (!m) { node.textContent = ''; return; }
      let secs = m.gametime || 0;
      if (m.countdown && m.timelimit) secs = Math.max(0, m.timelimit - secs);
      node.textContent = mmss(secs);
    },
  },

  teaminfo: {
    label: 'Teammate panel (right)',
    size: 2.4,
    defaultOpts: {},
    render(node, el, state) {
      const list = (state?.teaminfo || []).filter(t => !t.stale);
      if (!list.length) { node.innerHTML = ''; return; }
      node.innerHTML = list.map(t => {
        const ac = ARMOR_COLORS[t.armortype ?? 0];
        const wid = activeWeaponId(t.weapon);
        const wl = WEAPONS.find(w => w.id === wid)?.label || '';
        return `<div class="ti-row">
          <span class="ti-loc">${esc(t.loc || '')}</span>
          <span class="ti-name">${esc(t.name || '')}</span>
          <span class="ti-h" style="color:${healthColor(t.health)}">${t.health | 0}</span>
          <span class="ti-a" style="color:${ac}">${t.armor | 0}</span>
          <span class="ti-w">${wl}</span>
        </div>`;
      }).join('');
    },
  },

  tracking: {
    label: 'Tracking line',
    size: 2.8,
    defaultOpts: {},
    render(node, el, state) {
      const name = trackedName(state);
      node.innerHTML = name ? `<span class="trk">&#9654; ${esc(name)}</span>` : '';
    },
  },

  killfeed: {
    label: 'Kill feed',
    size: 2.2,
    defaultOpts: { keep: 5 },
    render(node, el, state) {
      // engine ships events.messages as raw QW obituaries + chat; parse the kills into compact
      // "killer -> victim" (r_tracker style). Non-kills (chat "name: msg", engine prints) yield null.
      const parseKill = (line) => {
        line = (line || '').trim();
        if (!line || /^\S+:\s/.test(line)) return null;                       // chat "para: lost..."
        let m = line.match(/^(.+?)\s+(?:was|were)\b.*?\bby\s+(.+?)[.!]?$/i);    // "VICTIM was ... by KILLER"
        if (m) return { killer: m[2].trim(), victim: m[1].trim() };
        m = line.match(/^(\S+)\b.*?\b([^\s']+)'s\b/);                          // "VICTIM <verb> KILLER's weapon"
        if (m && m[1] !== m[2]) return { killer: m[2].trim(), victim: m[1].trim() };
        return null;                                                          // suicide / unknown / noise
      };
      let kills = (state?.events?.messages || []).map(parseKill).filter(Boolean);
      kills = kills.filter((k, i) => i === 0 || k.killer !== kills[i - 1].killer || k.victim !== kills[i - 1].victim);
      const keep = el.opts?.keep ?? 5;
      node.innerHTML = kills.slice(0, keep).map(k =>
        `<div class="kf-row"><span class="kf-k">${esc(k.killer)}</span> <span class="kf-w">»</span> <span class="kf-v">${esc(k.victim)}</span></div>`
      ).join('');
    },
  },

  centerprint: {
    label: 'Center print',
    size: 4.5,
    defaultOpts: {},
    render(node, el, state) {
      node.textContent = state?.events?.centerprint || '';
    },
  },

  crosshair: {
    label: 'Crosshair',
    size: 2.5,
    defaultOpts: { char: '+' },
    render(node, el) {
      if (node.dataset.drawn === '1') return; // static
      node.textContent = el.opts?.char || '+';
      node.dataset.drawn = '1';
    },
  },

  playername: {
    label: 'Player name',
    size: 2.6,
    defaultOpts: {},
    render(node, el, state) { node.textContent = trackedName(state); },
  },

  speed: {
    label: 'Speedometer (ups)',
    size: 2.6,
    defaultOpts: {},
    render(node, el, state) {
      const v = state?.me?.speed; node.textContent = (v == null) ? '' : `${v | 0}`;
    },
  },

  text: {
    label: 'Static text',
    size: 2.6,
    defaultOpts: { text: 'TEXT' },
    render(node, el) { node.textContent = el.opts?.text ?? ''; },
  },

  image: {
    label: 'Image / icon (from /img)',
    size: 6,
    defaultOpts: { src: '', alt: '' },
    render(node, el) {
      // <img> height tracks the element font-size (size x scale x stage-height) so it stays
      // resolution-independent; width auto-keeps aspect. Rebuild only when the source changes, so
      // live state frames don't reload/flicker the image every tick.
      const src = el.opts?.src || '';
      if (node.dataset.imgsrc === src) return;
      node.dataset.imgsrc = src;
      node.innerHTML = src ? `<img class="hud-img" src="${esc(src)}" alt="${esc(el.opts?.alt || '')}">` : '';
    },
  },
};

// list for the editor palette
export const PALETTE = Object.entries(ELEMENTS).map(([type, def]) => ({ type, label: def.label }));
