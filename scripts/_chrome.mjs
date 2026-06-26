// _chrome.mjs -- resolve a Chrome/Chromium executable + a writable profile dir for headless CDP,
// cross-platform. Override the binary with the CHROME env var; otherwise probe the usual paths.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A user-data-dir that works everywhere, including snap-confined chromium on Linux: snap's `home`
// interface blocks /tmp AND hidden ($HOME dot-) dirs, so use a NON-hidden $HOME dir there; on
// Windows/macOS os.tmpdir() is fine. Caller passes a unique leaf name (include process.pid).
export function profileDir(name) {
  const base = process.platform === 'linux' ? path.join(os.homedir(), 'qw-cdp') : os.tmpdir();
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
       'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
       '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
       '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return candidates[0]; // let spawn fail with a clear, platform-appropriate path
}
