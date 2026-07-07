import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QHLAN_ELEMENTS } from '../src/public/js/qhlan-elements.js';

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

test('overlay scripts guard process-level registrations', () => {
  assert.match(text('extras/overlay-window/play-quake.ps1'), /if \(-not \("Fg" -as \[type\]\)\)/);
  assert.match(text('extras/overlay-window/shoot-desktop.ps1'), /if \(-not \("Dpi" -as \[type\]\)\)/);

  const main = text('extras/overlay-window/main.js');
  assert.match(main, /const registered = globalShortcut\.register/);
  assert.match(main, /failed to register panic-close shortcut/);
});
