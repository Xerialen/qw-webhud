// theme.js — per-spec theming, shared by the overlay and the editor.
// spec.meta.theme -> a <body> class + (on demand) a Google webfont and a theme CSS file, so the
// default HUD stays dependency-free. Returns the theme descriptor (or null) so callers can branch:
// the Stage's fixed-1080 mode keys off `fixedStage`, and render.js / editor.js read the optional
// `registry` + `palette` fields here (single source of truth) instead of hard-coding per theme.
import { QHLAN_ELEMENTS, QHLAN_PALETTE } from './qhlan-elements.js';

export const THEMES = {
  minecraft:   { cls: 'mc', font: 'Press+Start+2P' },                 // styling lives in hud.css (body.mc)
  bladerunner: { cls: 'br', font: 'Orbitron:wght@500;700;900' },      // styling lives in hud.css (body.br)
  qhlan: {
    cls: 'qhlan',
    font: 'Saira+Condensed:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700',
    css: '/css/qhlan.css',      // full QHLAN component styling, scoped under body.qhlan
    fixedStage: true,           // render on a 1920x1080 stage scaled as a whole (not the --u model)
    registry: QHLAN_ELEMENTS,   // rich theme: brings its own element registry + editor palette
    palette: QHLAN_PALETTE,
  },
};

// Apply spec.meta.theme to the document: swap the body theme class, lazy-load the webfont + theme
// CSS (each injected at most once). Idempotent and safe to call on every spec change.
export function applyTheme(spec, doc = document) {
  const name = spec?.meta?.theme;
  const theme = (name && THEMES[name]) || null;
  for (const t of Object.values(THEMES)) doc.body.classList.remove(t.cls); // drop any prior theme
  if (!theme) return null;
  doc.body.classList.add(theme.cls);

  const head = doc.head;
  const ensure = (sel, make) => { if (!head.querySelector(sel)) head.appendChild(make()); };
  if (theme.font) ensure(`link[data-theme-font="${name}"]`, () => {
    const l = doc.createElement('link');
    l.rel = 'stylesheet'; l.dataset.themeFont = name;
    l.href = 'https://fonts.googleapis.com/css2?family=' + theme.font + '&display=swap';
    return l;
  });
  if (theme.css) ensure(`link[data-theme-css="${name}"]`, () => {
    const l = doc.createElement('link');
    l.rel = 'stylesheet'; l.dataset.themeCss = name; l.href = theme.css;
    return l;
  });
  return theme;
}
