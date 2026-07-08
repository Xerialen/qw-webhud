// qw-constants.js — QuakeWorld item/weapon constants + derivations.
// Single source of truth, shared by the BROWSER renderer and the SERVER-side mock feed
// (mock.js imports this same file). IT_* values from ezquake-source/src/common.h:107-132.

export const IT = {
  SHOTGUN: 1, SUPER_SHOTGUN: 2, NAILGUN: 4, SUPER_NAILGUN: 8,
  GRENADE_LAUNCHER: 16, ROCKET_LAUNCHER: 32, LIGHTNING: 64,
  SHELLS: 256, NAILS: 512, ROCKETS: 1024, CELLS: 2048,
  AXE: 4096,
  ARMOR1: 8192, ARMOR2: 16384, ARMOR3: 32768,
  SUPERHEALTH: 65536, KEY1: 131072, KEY2: 262144,
  INVISIBILITY: 524288,   // ring
  INVULNERABILITY: 1048576, // pent
  SUIT: 2097152,           // biosuit
  QUAD: 4194304,           // quad damage
};

// Weapon slots in HUD display order (axe -> lg). `bit` = the IT_ flag in STAT_ITEMS,
// `active` matches STAT_ACTIVEWEAPON. `ammo` = which ammo pool feeds it.
export const WEAPONS = [
  { id: 'axe', slot: 1, bit: IT.AXE,              label: 'axe', ammo: null     },
  { id: 'sg',  slot: 2, bit: IT.SHOTGUN,          label: 'SG',  ammo: 'shells' },
  { id: 'ssg', slot: 3, bit: IT.SUPER_SHOTGUN,    label: 'SSG', ammo: 'shells' },
  { id: 'ng',  slot: 4, bit: IT.NAILGUN,          label: 'NG',  ammo: 'nails'  },
  { id: 'sng', slot: 5, bit: IT.SUPER_NAILGUN,    label: 'SNG', ammo: 'nails'  },
  { id: 'gl',  slot: 6, bit: IT.GRENADE_LAUNCHER, label: 'GL',  ammo: 'rockets'},
  { id: 'rl',  slot: 7, bit: IT.ROCKET_LAUNCHER,  label: 'RL',  ammo: 'rockets'},
  { id: 'lg',  slot: 8, bit: IT.LIGHTNING,        label: 'LG',  ammo: 'cells'  },
];

const WEAPON_BY_BIT = new Map(WEAPONS.map(w => [w.bit, w]));

// armour colour role from the items bitmask (red > yellow > green).
export function armorType(items) {
  if (items & IT.ARMOR3) return 3;
  if (items & IT.ARMOR2) return 2;
  if (items & IT.ARMOR1) return 1;
  return 0;
}

export const ARMOR_COLORS = { 0: '#888', 1: '#2ecc40', 2: '#ffcc00', 3: '#ff4136' };

// weapon ids owned, in display order, from the items bitmask.
export function ownedWeapons(items) {
  return WEAPONS.filter(w => items & w.bit).map(w => w.id);
}

// the active weapon's short id, from the STAT_ACTIVEWEAPON bit.
export function activeWeaponId(weaponBit) {
  const w = WEAPON_BY_BIT.get(weaponBit);
  return w ? w.id : null;
}

export function powerups(items) {
  return {
    quad: !!(items & IT.QUAD),
    pent: !!(items & IT.INVULNERABILITY),
    ring: !!(items & IT.INVISIBILITY),
    suit: !!(items & IT.SUIT),
  };
}

// mm:ss from raw seconds.
export function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// raw QW obituary line -> { killer, victim }; chat ("name: msg") / engine prints / suicides -> null.
// Single source of truth for both the default and QHLAN killfeeds.
export function parseKill(line) {
  line = (line || '').trim();
  if (!line || /^\S+:\s/.test(line)) return null;                       // chat "para: lost..."
  let m = line.match(/^(.+?)\s+(?:was|were)\b.*?\bby\s+(.+?)[.!]?$/i);   // "VICTIM was ... by KILLER"
  if (m) return { killer: m[2].trim(), victim: m[1].trim() };
  m = line.match(/^(\S+)\b.*?\b([^\s']+)'s\b/);                         // "VICTIM <verb> KILLER's weapon"
  if (m && m[1] !== m[2]) return { killer: m[2].trim(), victim: m[1].trim() };
  return null;                                                          // suicide / unknown / noise
}

// events.messages[] -> deduped [{ killer, victim }] (collapse consecutive identical obituaries).
export function parseKillfeed(messages = []) {
  const kills = (messages || []).map(parseKill).filter(Boolean);
  return kills.filter((k, i) => i === 0 || k.killer !== kills[i - 1].killer || k.victim !== kills[i - 1].victim);
}

// build an items bitmask from a weapon-id list + flags (used by the mock feed).
export function makeItems(weaponIds = [], extra = {}) {
  let items = 0;
  for (const id of weaponIds) { const w = WEAPONS.find(x => x.id === id); if (w) items |= w.bit; }
  if (extra.armor === 1) items |= IT.ARMOR1;
  if (extra.armor === 2) items |= IT.ARMOR2;
  if (extra.armor === 3) items |= IT.ARMOR3;
  if (extra.quad) items |= IT.QUAD;
  if (extra.pent) items |= IT.INVULNERABILITY;
  if (extra.ring) items |= IT.INVISIBILITY;
  if (extra.suit) items |= IT.SUIT;
  return items;
}
