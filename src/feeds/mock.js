// mock.js — synthetic state snapshots over UDP, so the whole web side works without the engine.
// Simulates a 4on4 dm3 fight: damage/regen, armour decay, firing/pickups, weapon swaps, frags,
// the occasional quad, and a rotating teammate panel. Emits the PROTOCOL.md shape at ~60 Hz.
//
//   node src/feeds/mock.js            # standalone -> 127.0.0.1:27999
//   (bridge.js --mock imports start())
import dgram from 'node:dgram';
import { makeItems, IT } from '../public/js/qw-constants.js';

const rand = (a, b) => a + Math.random() * (b - a);
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function start({ port = 27999, host = '127.0.0.1', hz = 60 } = {}) {
  const sock = dgram.createSocket('udp4');
  const t0 = Date.now();
  let seq = 0;

  // --- simulated player ---
  let health = 100, armor = 150, armorKind = 2;          // yellow
  let ammo = { shells: 40, nails: 120, rockets: 12, cells: 60 };
  let ownedWeapons = ['axe', 'sg', 'ssg', 'ng', 'rl', 'lg'];
  let weaponId = 'rl';
  let frags = 14, deaths = 8;
  let quadUntil = 0, pentUntil = 0;
  let lastDamage = { health: 0, armor: 0, at: -100 };
  let nextEventAt = 1.5;
  let centerprint = '', centerUntil = 0;

  const teams = [{ name: '-fu-', frags: 39, color: 4 }, { name: 'GoF!', frags: 43, color: 13 }];
  const mates = [
    { slot: 1, name: 'sail',  loc: 'rl',   health: 100, armor: 150, armortype: 2, weapon: IT.ROCKET_LAUNCHER, ammo: 10 },
    { slot: 2, name: 'milton',loc: 'quad', health: 84,  armor: 200, armortype: 3, weapon: IT.LIGHTNING,       ammo: 95 },
    { slot: 3, name: 'draqz', loc: 'ya',   health: 47,  armor: 60,  armortype: 1, weapon: IT.SUPER_SHOTGUN,   ammo: 3  },
  ];
  const locs = ['rl', 'quad', 'ya', 'ra', 'pent', 'mh', 'gl', 'sng', 'big', 'low', 'tele'];

  const WEAPON_AMMO = { rl: 'rockets', lg: 'cells', sg: 'shells', ssg: 'shells', ng: 'nails' };

  const tick = () => {
    const t = (Date.now() - t0) / 1000;

    // scripted-ish events
    if (t >= nextEventAt) {
      nextEventAt = t + rand(0.6, 2.4);
      const roll = Math.random();
      if (roll < 0.45) { // take damage
        const dmg = Math.round(rand(8, 55));
        const toArmor = Math.min(armor, Math.round(dmg * 0.6));
        const toHealth = dmg - toArmor;
        armor = clamp(armor - toArmor, 0, 250);
        health = clamp(health - toHealth, -19, 250);
        lastDamage = { health: toHealth, armor: toArmor, at: t };
        if (armor === 0) armorKind = 0;
        if (health <= 0) { // died -> respawn shortly
          deaths++;
          centerprint = 'You died'; centerUntil = t + 1.5;
        }
      } else if (roll < 0.62) { // armour pickup
        armorKind = choice([2, 3]); armor = armorKind === 3 ? 200 : 150;
      } else if (roll < 0.78) { // health pickup
        health = clamp(health + choice([15, 25, 100]), 0, 250);
      } else if (roll < 0.9) { // frag
        frags++; teams[0].frags++;
      } else if (roll < 0.96) { // quad
        quadUntil = t + 30; centerprint = 'QUAD DAMAGE'; centerUntil = t + 2;
      } else { // weapon swap
        weaponId = choice(ownedWeapons.filter(w => w !== 'axe'));
      }
    }

    // respawn if dead
    if (health <= 0 && t - lastDamage.at > 1.4) {
      health = 100; armor = 0; armorKind = 0;
      ammo = { shells: 25, nails: 0, rockets: 0, cells: 0 };
      ownedWeapons = ['axe', 'sg']; weaponId = 'sg';
    }

    // continuous: "firing" the current weapon drains its ammo a touch, regen back over time
    const pool = WEAPON_AMMO[weaponId];
    if (pool && Math.random() < 0.25) ammo[pool] = clamp(ammo[pool] - 1, 0, 200);
    if (Math.random() < 0.08) { const k = choice(['shells', 'nails', 'rockets', 'cells']); ammo[k] = clamp(ammo[k] + Math.round(rand(1, 6)), 0, 200); }
    if (health > 0 && health < 100 && Math.random() < 0.05) health = clamp(health + 1, 0, 100); // rot toward 100

    // mates drift a bit
    if (Math.random() < 0.05) {
      const m = choice(mates);
      m.health = clamp(m.health + Math.round(rand(-30, 30)), 1, 250);
      m.armor = clamp(m.armor + Math.round(rand(-25, 25)), 0, 200);
      m.loc = choice(locs);
    }

    const quad = t < quadUntil, pent = t < pentUntil;
    const items = makeItems(ownedWeapons, { armor: armorKind, quad, pent });
    if (centerprint && t > centerUntil) centerprint = '';

    const snap = {
      v: 1, seq: seq++, t_engine: t, src: 'mock', mvd: false, alive: health > 0,
      me: {
        name: 'X-ray', team: '-fu-',
        health: Math.round(health), armor: Math.round(armor), armortype: armorKind,
        ammo: { ...ammo },
        weapon: makeItems([weaponId]), // active-weapon bit (single-bit mask for this weapon)
        weapon_ammo: ammo[WEAPON_AMMO[weaponId]] ?? 0,
        items,
        frags, deaths, ping: 25 + Math.round(rand(-4, 6)),
        speed: Math.round(Math.abs(Math.sin(t * 1.7)) * 480),
      },
      match: { map: 'dm3', gametime: t, timelimit: 1200, standby: false, countdown: false },
      teams: teams.map(x => ({ ...x })),
      teaminfo: mates.map(m => ({ ...m, stale: false })),
      events: {
        centerprint,
        last_damage: { ...lastDamage },
      },
    };
    const buf = Buffer.from(JSON.stringify(snap));
    sock.send(buf, port, host);
  };

  const timer = setInterval(tick, 1000 / hz);
  return { stop: () => { clearInterval(timer); sock.close(); } };
}

// run standalone
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('feeds/mock.js')) {
  const port = Number(process.env.HUD_UDP_PORT || 27999);
  start({ port });
  console.log(`[mock] emitting synthetic snapshots -> 127.0.0.1:${port}`);
}
