// specs.js — built-in HUD-spec presets + a frozen sample state for the editor.
// DEFAULT_SPEC ("hub") reproduces the hub.quakeworld.nu layout (score bar top-centre, teammate
// panel right, bottom status row); positions are % of the stage (resolution-independent), matching
// the measured reference targets from the qw-cfg work. Also the overlay's fallback when the server
// has no saved spec.
import { makeItems } from './qw-constants.js';

export const DEFAULT_SPEC = {
  meta: {
    name: 'hub',
    baseW: 640, baseH: 360,
    notes: 'hub.quakeworld.nu look: score bar top-center, teaminfo right, bottom health/armor/ammo row.',
  },
  elements: [
    { id: 'score',       type: 'teamscore',   x: 50, y: 4,  anchor: 'ct', scale: 1.0, z: 5 },
    { id: 'clock',       type: 'gameclock',   x: 50, y: 11, anchor: 'ct', scale: 1.0, z: 5 },
    { id: 'teaminfo',    type: 'teaminfo',    x: 99, y: 50, anchor: 'rc', scale: 1.0, z: 4, opts: { align: 'right' } },
    { id: 'killfeed',    type: 'killfeed',    x: 99, y: 17, anchor: 'rt', scale: 1.0, z: 4, opts: { align: 'right', keep: 5 } },
    { id: 'tracking',    type: 'tracking',    x: 50, y: 85, anchor: 'cb', scale: 1.0, z: 3 },
    { id: 'powerups',    type: 'powerups',    x: 50, y: 79, anchor: 'cc', scale: 1.0, z: 3 },
    { id: 'armor',       type: 'bigstat',     x: 38, y: 94, anchor: 'cb', scale: 1.0, z: 3, opts: { kind: 'armor' } },
    { id: 'health',      type: 'bigstat',     x: 50, y: 94, anchor: 'cb', scale: 1.0, z: 3, opts: { kind: 'health' } },
    { id: 'ammo',        type: 'bigstat',     x: 62, y: 94, anchor: 'cb', scale: 1.0, z: 3, opts: { kind: 'ammo' } },
    { id: 'ammocounts',  type: 'ammocounts',  x: 88, y: 97, anchor: 'rb', scale: 1.0, z: 2 },
    { id: 'weapons',     type: 'weapons',     x: 50, y: 99, anchor: 'cb', scale: 1.0, z: 2 },
    { id: 'centerprint', type: 'centerprint', x: 50, y: 40, anchor: 'cc', scale: 1.0, z: 6 },
    { id: 'crosshair',   type: 'crosshair',   x: 50, y: 50, anchor: 'cc', scale: 1.0, z: 1 },
  ],
};

// A representative frozen snapshot the editor shows when live preview is OFF (stable for dragging).
export const SAMPLE_STATE = {
  v: 1, seq: 0, t_engine: 0, src: 'sample', mvd: false, alive: true,
  me: {
    name: 'X-ray', team: '-fu-', health: 100, armor: 150, armortype: 2,
    ammo: { shells: 25, nails: 0, rockets: 8, cells: 40 },
    weapon: makeItems(['rl']), weapon_ammo: 8,
    items: makeItems(['axe', 'sg', 'ssg', 'ng', 'rl', 'lg'], { armor: 2, quad: true }),
    powerup_timers: { quad: 18, pent: 0, ring: 0, suit: 0 },
    frags: 17, deaths: 9, ping: 25, speed: 320,
  },
  match: { map: 'dm3', gametime: 496, timelimit: 1200, standby: false, countdown: false },
  teams: [{ name: '-fu-', frags: 84, color: 4 }, { name: 'GoF!', frags: 51, color: 13 }],
  teaminfo: [
    { slot: 1, name: 'sail',   loc: 'rl',   health: 100, armor: 150, armortype: 2, weapon: makeItems(['rl']), ammo: 10 },
    { slot: 2, name: 'milton', loc: 'quad', health: 84,  armor: 200, armortype: 3, weapon: makeItems(['lg']), ammo: 95 },
    { slot: 3, name: 'draqz',  loc: 'ya',   health: 47,  armor: 60,  armortype: 1, weapon: makeItems(['ssg']), ammo: 3 },
  ],
  events: {
    // raw QW obituary lines — what the engine ships and the killfeed elements parse.
    messages: [
      'mix was railed by X-ray',
      'low was zapped by sail',
      'volkov was melted by milton',
      'draqz was gibbed by lakso',
    ],
    centerprint: '', last_damage: { health: 0, armor: 0, at: -100 },
  },
};
