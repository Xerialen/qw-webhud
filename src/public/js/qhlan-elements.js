// qhlan-elements.js — the QHLAN theme render registry (spec.meta.theme === "qhlan").
// A vanilla port of the Claude Design handoff renderer (bundle hud_pieces.jsx), bound to
// qw-webhud's LIVE state via a small adapter that reuses qw-constants.js. Same
// { label, size, defaultOpts, render(node, el, state) } shape as elements.js, so the Stage
// and editor treat it uniformly. It renders under the Stage's FIXED-1080 mode (render.js):
// each element's content node lives inside a 1920x1080 stage scaled as a whole, so the
// QHLAN CSS's fixed-px sizes are resolution-independent.
//
// Colour stays bound to QW's fixed semantics (health white/gold/red, armor green/gold/red by
// type, per-pool ammo colours, powerup colours, team palette colour); the QHLAN CSS supplies
// the actual colours via classes + a few inline CSS vars (--tc, var(--armor-*)).
import {
  armorType, ownedWeapons, activeWeaponId, powerups as powerupBits, WEAPONS,
} from './qw-constants.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// QuakeWorld player colours 0..13 (same ramp as elements.js).
const QW_PALETTE = [
  '#d8d8d8', '#a86a32', '#4f6f9f', '#3f9f4f', '#cf3f3f', '#bf8f3f',
  '#9f5fcf', '#cf8f5f', '#6f9fdf', '#dfdf5f', '#7fdf7f', '#df6f9f', '#5fdfdf', '#ff9f2f',
];
const teamColor = (i) => QW_PALETTE[(i | 0) % 14] || '#d8d8d8';

// weapon strip (no axe), in HUD order; abbreviations come from WEAPONS.label (SG..LG).
const STRIP = WEAPONS.filter(w => w.id !== 'axe');
const POOLS = [
  { id: 'shells', k: 'SH' }, { id: 'nails', k: 'NA' },
  { id: 'rockets', k: 'RO' }, { id: 'cells', k: 'CE' },
];
const POOL_COLOR = { shells: 'var(--pool-shells)', nails: 'var(--pool-nails)', rockets: 'var(--pool-rockets)', cells: 'var(--pool-cells)' };
const POOL_NAME = { shells: 'SHELLS', nails: 'NAILS', rockets: 'ROCKETS', cells: 'CELLS' };

const healthClass = (h) => {
  const v = h ?? 0;
  return v <= 25 ? 'v-crit' : v <= 50 ? 'v-warn' : 'v-white';
};
const armorTierName = (t) => (t === 3 ? 'red' : t === 2 ? 'yellow' : 'green'); // 1/0 -> green
const mmss = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };

// match clock as the design reads it: remaining when counting down, else elapsed.
function matchClock(state) {
  const m = state?.match; if (!m) return 0;
  let secs = m.gametime || 0;
  if (m.countdown && m.timelimit) secs = Math.max(0, m.timelimit - secs);
  return secs;
}

// active weapon's pool + ammo count + abbreviation, from the STAT_ACTIVEWEAPON bit.
function activeAmmo(me) {
  const id = activeWeaponId(me.weapon);
  const w = STRIP.find(x => x.id === id);
  const pool = w?.ammo || 'shells';
  return { pool, count: (me.ammo?.[pool]) | 0, ab: w?.label || '' };
}

// raw QW obituary line -> { killer, victim } (same parser as elements.js killfeed); chat / prints -> null.
function parseKill(line) {
  line = (line || '').trim();
  if (!line || /^\S+:\s/.test(line)) return null;
  let m = line.match(/^(.+?)\s+(?:was|were)\b.*?\bby\s+(.+?)[.!]?$/i);
  if (m) return { killer: m[2].trim(), victim: m[1].trim() };
  m = line.match(/^(\S+)\b.*?\b([^\s']+)'s\b/);
  if (m && m[1] !== m[2]) return { killer: m[2].trim(), victim: m[1].trim() };
  return null;
}

export const QHLAN_ELEMENTS = {
  bigstat: {
    label: 'Big stat (health / armour / ammo)',
    size: 5.5,
    defaultOpts: { kind: 'health' },
    render(node, el, state) {
      const me = state?.me; const kind = el.opts?.kind || 'health';
      if (!me) { node.innerHTML = ''; return; }
      if (kind === 'health') {
        const hp = me.health ?? 0;
        const crit = hp <= 25;
        node.innerHTML =
          `<div class="hp bigstat bigstat--health${crit ? ' is-crit' : ''}">` +
            `<div class="bigstat__num ${healthClass(hp)}">${Math.max(0, Math.round(hp))}</div>` +
            `<div class="bigstat__lbl">HEALTH</div>` +
          `</div>`;
      } else if (kind === 'armor') {
        const tier = armorTierName(me.armortype ?? armorType(me.items));
        const has = me.armor > 0;
        node.innerHTML =
          `<div class="hp bigstat bigstat--armor">` +
            `<div class="bigstat__num" style="color:${has ? `var(--armor-${tier})` : 'var(--t4)'}">${Math.round(me.armor) | 0}</div>` +
            `<div class="bigstat__lbl">${has ? `<i class="armor armor--${tier}"></i>` : ''}ARMOR</div>` +
          `</div>`;
      } else {
        const a = activeAmmo(me);
        node.innerHTML =
          `<div class="hp bigstat bigstat--ammo">` +
            `<div class="bigstat__num v-white">${a.count}</div>` +
            `<div class="bigstat__lbl"><b>${esc(a.ab)}</b><span style="margin:0 .35em;color:var(--t4)">·</span>` +
              `<span style="color:${POOL_COLOR[a.pool]}">${POOL_NAME[a.pool]}</span></div>` +
          `</div>`;
      }
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
      const cells = STRIP.map(w => {
        const cls = w.id === active ? 'is-active' : owned.has(w.id) ? 'is-own' : 'is-missing';
        return `<div class="wep ${cls}">${esc(w.label)}</div>`;
      }).join('');
      node.innerHTML = `<div class="hp hp--bare weps">${cells}</div>`;
    },
  },

  ammocounts: {
    label: 'Ammo counts (shells/nails/rockets/cells)',
    size: 2.6,
    defaultOpts: { dir: 'row' },
    render(node, el, state) {
      const me = state?.me; if (!me?.ammo) { node.innerHTML = ''; return; }
      const dir = el.opts?.dir || 'row';
      const dcls = dir === 'col' ? ' pools--col' : dir === 'grid' ? ' pools--grid' : '';
      const active = activeAmmo(me).pool;
      const items = POOLS.map(p =>
        `<div class="pool pool--${p.id}${active === p.id ? ' is-active' : ''}">` +
          `<i class="pool__pip"></i>` +
          `<span class="pool__v">${me.ammo[p.id] | 0}</span>` +
          `<span class="pool__k">${p.k}</span>` +
        `</div>`).join('');
      node.innerHTML = `<div class="hp hp--bare pools${dcls}">${items}</div>`;
    },
  },

  powerups: {
    label: 'Powerups (quad/pent/ring/suit)',
    size: 3.2,
    defaultOpts: {},
    render(node, el, state) {
      const me = state?.me; if (!me) { node.innerHTML = ''; return; }
      const tm = me.powerup_timers || {};
      const bits = powerupBits(me.items);
      const order = [['quad', 'QUAD'], ['pent', 'PENT'], ['ring', 'RING'], ['suit', 'SUIT']];
      const out = [];
      for (const [k, lbl] of order) {
        const t = tm[k] || 0;
        if (!(t > 0 || bits[k])) continue;            // only active powerups
        const low = t > 0 && t <= 5;
        const timer = t > 0 ? `<span class="pup__t">${Math.ceil(t)}</span>` : '';
        out.push(`<div class="pup pup--${k}${low ? ' is-low' : ''}"><span class="pup__k">${lbl}</span>${timer}</div>`);
      }
      node.innerHTML = out.length ? `<div class="pups">${out.join('')}</div>` : '';
    },
  },

  teamscore: {
    label: 'Team score bar',
    size: 3.6,
    defaultOpts: {},
    render(node, el, state) {
      const teams = state?.teams || [];
      if (teams.length < 1) { node.innerHTML = ''; return; }
      const withClock = !!el.opts?.withClock;
      const cell = (t, side) => {
        const sq = `<span class="score__sq"></span>`;
        const tag = `<span class="score__tag">${esc(t.name)}</span>`;
        return `<div class="score__team" style="--tc:${teamColor(t.color)}">${side === 'left' ? sq + tag : tag + sq}</div>`;
      };
      const A = teams[0], B = teams[1];
      if (B) {
        const aLead = (A.frags | 0) >= (B.frags | 0);
        const clock = withClock ? `<span class="score__clock">${mmss(matchClock(state))}</span>` : '';
        node.innerHTML =
          `<div class="hp score">` +
            cell(A, 'left') +
            `<span class="score__f${aLead ? ' is-lead' : ''}">${A.frags | 0}</span>` +
            `<span class="score__sep">:</span>` +
            `<span class="score__f${!aLead ? ' is-lead' : ''}">${B.frags | 0}</span>` +
            cell(B, 'right') + clock +
          `</div>`;
      } else {
        node.innerHTML = `<div class="hp score">${cell(A, 'left')}<span class="score__f is-lead">${A.frags | 0}</span></div>`;
      }
    },
  },

  gameclock: {
    label: 'Game clock',
    size: 3.0,
    defaultOpts: {},
    render(node, el, state) {
      const m = state?.match; if (!m) { node.innerHTML = ''; return; }
      const map = (m.map || '').toUpperCase();
      node.innerHTML =
        `<div class="hp clock">` +
          `<span class="clock__t">${mmss(matchClock(state))}</span>` +
          `<span class="clock__k">${map ? `<b>${esc(map)}</b> · ` : ''}TIME LEFT</span>` +
        `</div>`;
    },
  },

  teaminfo: {
    label: 'Teammate panel (right)',
    size: 2.4,
    defaultOpts: {},
    render(node, el, state) {
      const list = (state?.teaminfo || []).filter(t => t && !t.stale);
      if (!list.length) { node.innerHTML = ''; return; }
      const team = state?.me?.team || '';
      const selfName = state?.me?.name;
      const rows = list.map(t => {
        const tier = armorTierName(t.armortype ?? 0);
        const has = t.armor > 0;
        const wl = STRIP.find(w => w.id === activeWeaponId(t.weapon))?.label || '';
        const self = selfName && t.name === selfName ? ' is-self' : '';
        return `<div class="tinfo__row${self}">` +
          `<span class="tinfo__loc">${esc(t.loc || '')}</span>` +
          `<span class="tinfo__name">${esc(t.name || '')}</span>` +
          `<span class="tinfo__hp ${healthClass(t.health)}">${t.health | 0}</span>` +
          `<span class="tinfo__ar" style="color:${has ? `var(--armor-${tier})` : 'var(--t4)'}">${has ? `<i class="armor armor--${tier}"></i>` : ''}${t.armor | 0}</span>` +
          `<span class="tinfo__wep">${esc(wl)}</span>` +
        `</div>`;
      }).join('');
      node.innerHTML = `<div class="hp tinfo"><div class="tinfo__hd">TEAM${team ? ` · <b>${esc(team)}</b>` : ''}</div>${rows}</div>`;
    },
  },

  killfeed: {
    label: 'Kill feed',
    size: 2.2,
    defaultOpts: { keep: 5 },
    render(node, el, state) {
      // mate = tracked player + teammates (by name); everyone else = enemy. The engine ships
      // text obituaries with no weapon, so the QHLAN weapon tag (.kf__w) is omitted live.
      const mates = new Set();
      if (state?.me?.name) mates.add(state.me.name);
      for (const t of (state?.teaminfo || [])) if (t?.name) mates.add(t.name);
      const side = (name) => (mates.has(name) ? 'is-mate' : 'is-enemy');
      let kills = (state?.events?.messages || []).map(parseKill).filter(Boolean);
      kills = kills.filter((k, i) => i === 0 || k.killer !== kills[i - 1].killer || k.victim !== kills[i - 1].victim);
      const keep = el.opts?.keep ?? 5;
      node.innerHTML = kills.slice(0, keep).map(k =>
        `<div class="kf"><span class="kf__k ${side(k.killer)}">${esc(k.killer)}</span>` +
        `<span class="kf__sep">»</span>` +
        `<span class="kf__v ${side(k.victim)}">${esc(k.victim)}</span></div>`
      ).join('');
    },
  },

  centerprint: {
    label: 'Center print',
    size: 4.5,
    defaultOpts: {},
    render(node, el, state) {
      const cp = state?.events?.centerprint || '';
      if (!cp) { node.innerHTML = ''; return; }
      node.innerHTML = `<div class="cprint${/quad/i.test(cp) ? ' cprint--quad' : ''}">${esc(cp)}</div>`;
    },
  },

  tracking: {
    label: 'Tracking line',
    size: 2.8,
    defaultOpts: {},
    render(node, el, state) {
      const name = state?.me?.name || state?.spec?.tracking || '';
      node.innerHTML = name
        ? `<div class="hp track"><span class="track__ar">&#9654;</span><span class="track__name">${esc(name)}</span><span class="track__k">POV</span></div>`
        : '';
    },
  },

  speed: {
    label: 'Speedometer (ups)',
    size: 2.6,
    defaultOpts: {},
    render(node, el, state) {
      const v = state?.me?.speed;
      if (v == null) { node.innerHTML = ''; return; }
      node.innerHTML = `<div class="hp speed${v >= 400 ? ' is-fast' : ''}"><span class="speed__v">${v | 0}</span><span class="speed__u">ups</span></div>`;
    },
  },

  panel: {
    label: 'Glass panel backing',
    size: 1,
    defaultOpts: { w: 600, h: 120, variant: 'bar' },
    render(node, el) {
      // w/h are 1920x1080 stage px (the whole stage is scaled in fixed-1080 mode).
      const w = el.opts?.w ?? 600, h = el.opts?.h ?? 120, variant = el.opts?.variant || 'bar';
      node.innerHTML = `<div class="hp hp--${esc(variant)}" style="width:${w | 0}px;height:${h | 0}px"></div>`;
    },
  },
};

// editor palette (mirrors PALETTE in elements.js)
export const QHLAN_PALETTE = Object.entries(QHLAN_ELEMENTS).map(([type, def]) => ({ type, label: def.label }));
