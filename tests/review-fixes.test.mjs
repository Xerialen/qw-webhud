import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QHLAN_ELEMENTS } from '../src/public/js/qhlan-elements.js';
import { makeItems, parseKillfeed } from '../src/public/js/qw-constants.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('QHLAN health treats missing health as critical zero instead of white/NaN', () => {
  const node = { innerHTML: '' };

  QHLAN_ELEMENTS.bigstat.render(node, { opts: { kind: 'health' } }, { me: { health: null } });

  assert.match(node.innerHTML, /is-crit/);
  assert.match(node.innerHTML, /v-crit/);
  assert.match(node.innerHTML, />0<\/div>/);
  assert.doesNotMatch(node.innerHTML, /NaN/);
});

test('QHLAN teaminfo ignores null and stale entries', () => {
  const node = { innerHTML: '' };

  QHLAN_ELEMENTS.teaminfo.render(
    node,
    { opts: {} },
    {
      me: { team: 'red', name: 'tracked' },
      teaminfo: [
        null,
        { stale: true, name: 'oldmate', health: 100, armor: 200, weapon: 128 },
        { name: 'freshmate', health: null, armor: 0, weapon: 128, loc: 'ra' },
      ],
    },
  );

  assert.match(node.innerHTML, /freshmate/);
  assert.doesNotMatch(node.innerHTML, /oldmate/);
  assert.match(node.innerHTML, /v-crit/);
});

test('editor drag math uses the scaled fixed-stage rect when present', () => {
  const source = text('src/public/js/editor.js');

  assert.match(source, /querySelector\(['"]\.hud-stage['"]\) \|\| \$\(['"]stage['"]\)/);
  assert.match(source, /stageNode\.getBoundingClientRect\(\)/);
});

test('QHLAN game clock shows remaining time under "TIME LEFT" during live play', () => {
  const node = { innerHTML: '' };
  // live play: countdown false, gametime 496 of a 1200s (20:00) limit -> 11:44 remaining.
  QHLAN_ELEMENTS.gameclock.render(node, { opts: {} }, {
    match: { map: 'dm3', gametime: 496, timelimit: 1200, countdown: false },
  });
  assert.match(node.innerHTML, /11:44/);          // remaining, not the 8:16 elapsed
  assert.doesNotMatch(node.innerHTML, /8:16/);
  assert.match(node.innerHTML, /TIME LEFT/);
});

test('QHLAN game clock falls back to elapsed "TIME" when no timelimit is known', () => {
  const node = { innerHTML: '' };
  QHLAN_ELEMENTS.gameclock.render(node, { opts: {} }, {
    match: { map: 'dm3', gametime: 496, timelimit: 0, countdown: false },
  });
  assert.match(node.innerHTML, /8:16/);
  assert.match(node.innerHTML, />(?:[^<]*·\s*)?TIME<\/span>/); // caption is TIME, not TIME LEFT
  assert.doesNotMatch(node.innerHTML, /TIME LEFT/);
});

test('QHLAN team score marks neither side as leading on an exact tie', () => {
  const node = { innerHTML: '' };
  QHLAN_ELEMENTS.teamscore.render(node, { opts: {} }, {
    teams: [{ name: 'A', frags: 5, color: 4 }, { name: 'B', frags: 5, color: 13 }],
  });
  assert.doesNotMatch(node.innerHTML, /is-lead/);
});

test('QHLAN team score marks only the higher-frag side as leading', () => {
  const node = { innerHTML: '' };
  QHLAN_ELEMENTS.teamscore.render(node, { opts: {} }, {
    teams: [{ name: 'A', frags: 8, color: 4 }, { name: 'B', frags: 3, color: 13 }],
  });
  const leads = node.innerHTML.match(/is-lead/g) || [];
  assert.equal(leads.length, 1);
  // the is-lead class sits on the "8" cell, not the "3" cell
  assert.match(node.innerHTML, /is-lead">8</);
});

test('QHLAN ammo bigstat shows a dash for the axe, never a stray shells count', () => {
  const node = { innerHTML: '' };
  QHLAN_ELEMENTS.bigstat.render(node, { opts: { kind: 'ammo' } }, {
    me: { weapon: makeItems(['axe']), ammo: { shells: 25, nails: 0, rockets: 0, cells: 0 } },
  });
  assert.match(node.innerHTML, /AXE/);
  assert.doesNotMatch(node.innerHTML, /SHELLS/);
  assert.doesNotMatch(node.innerHTML, />25</);   // the shells count must not leak through
});

test('shared parseKillfeed parses obituaries, drops chat, and dedups repeats', () => {
  const kills = parseKillfeed([
    'thunda was railed by lakerman',
    'thunda was railed by lakerman',   // consecutive duplicate -> collapsed
    'xerial: gg wp',                    // chat -> ignored
  ]);
  assert.deepEqual(kills, [{ killer: 'lakerman', victim: 'thunda' }]);
});

test('both killfeed registries use the shared parseKillfeed helper (no copy-paste)', () => {
  assert.match(text('src/public/js/elements.js'), /parseKillfeed\(state\?\.events\?\.messages\)/);
  assert.match(text('src/public/js/qhlan-elements.js'), /parseKillfeed\(state\?\.events\?\.messages\)/);
  // the old inline parser must be gone from both
  assert.doesNotMatch(text('src/public/js/qhlan-elements.js'), /function parseKill\(/);
});

test('overlay scripts guard process-level registrations', () => {
  assert.match(text('extras/overlay-window/play-quake.ps1'), /if \(-not \("Fg" -as \[type\]\)\)/);
  assert.match(text('extras/overlay-window/shoot-desktop.ps1'), /if \(-not \("Dpi" -as \[type\]\)\)/);

  const main = text('extras/overlay-window/main.js');
  assert.match(main, /const registered = globalShortcut\.register/);
  assert.match(main, /failed to register panic-close shortcut/);
});
