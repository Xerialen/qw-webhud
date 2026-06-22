// qw-webhud overlay window — the no-OBS "live, on top of the game" path.
// A frameless, TRANSPARENT, always-on-top, click-through Electron window that fills one monitor and
// renders overlay.html. Run ezQuake BORDERLESS-windowed (not exclusive fullscreen) on the same monitor,
// native HUD off + cl_hudexport on, and the HTML HUD composites directly over the game on screen.
//
//   OVERLAY_URL=http://localhost:7777/overlay.html?spec=demoshots \
//   QW_DISPLAY=0 \                       # which monitor (index into screen.getAllDisplays()); default primary
//   npx electron .                       # or: npm start
//
// Panic-close: Ctrl+Alt+Q  (the window is click-through + non-focusable, so you can't close it normally).
const { app, BrowserWindow, screen, globalShortcut } = require('electron');

const URL = process.env.OVERLAY_URL || 'http://localhost:7777/overlay.html?spec=demoshots';
const DISPLAY_IDX = process.env.QW_DISPLAY != null && process.env.QW_DISPLAY !== ''
  ? Number(process.env.QW_DISPLAY) : null;

// Transparent windows can render black on some Windows GPU paths unless transparent visuals are forced.
app.commandLine.appendSwitch('enable-transparent-visuals');

let win;
function pickDisplay() {
  const all = screen.getAllDisplays();
  if (DISPLAY_IDX != null && all[DISPLAY_IDX]) return all[DISPLAY_IDX];
  return screen.getPrimaryDisplay();
}

function createWindow() {
  const d = pickDisplay();
  const b = d.bounds; // {x,y,width,height} in DIP — Electron maps to the monitor regardless of scaling
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    show: false,                 // show without focus once ready (don't yank focus off the game)
    transparent: true,
    frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, thickFrame: false,
    backgroundColor: '#00000000',
    webPreferences: { backgroundThrottling: false }, // keep the HUD updating while unfocused/behind
  });
  win.setIgnoreMouseEvents(true);                          // clicks pass through to the game
  win.setAlwaysOnTop(true, 'screen-saver');                // float above the borderless game window
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(URL);
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('did-fail-load', (_e, code, desc) =>
    console.error('[overlay] load failed', code, desc, '— is the bridge on 7777?'));
  console.log(`[overlay] monitor bounds ${JSON.stringify(b)}  url ${URL}`);
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('Control+Alt+Q', () => app.quit()); // panic-close
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
