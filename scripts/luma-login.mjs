#!/usr/bin/env node
/**
 * One-time Luma login helper — saves a browser session for the publisher script.
 *
 * Why: Luma's public API requires a paid Luma Plus subscription. Browser
 * automation against a normal (free) account is the only zero-cost way to
 * publish automatically, and it needs a logged-in session once.
 *
 *   node scripts/luma-login.mjs
 *
 * Opens a real Chromium window; log in (email code / Google) and press Enter in
 * the terminal when you can see your Luma home page. The session is stored at
 * ~/.4seas/luma-state.json (outside the repo, chmod 600) and reused by
 * scripts/luma-browser-publish.mjs until it expires.
 */
import { createInterface } from 'node:readline';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE_DIR = join(homedir(), '.4seas');
const STATE_FILE = join(STATE_DIR, 'luma-state.json');

async function loadPlaywright() {
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      return await import(spec);
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright not found. Install it with:  npm i -g playwright && playwright install chromium');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://lu.ma/signin', { waitUntil: 'domcontentloaded' });

console.log('\n→ Log in to Luma in the opened window.');
console.log('  When you can see your Luma home page, come back here and press Enter.\n');

await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Press Enter once logged in… ', () => {
    rl.close();
    resolve();
  });
});

await mkdir(STATE_DIR, { recursive: true });
await writeFile(STATE_FILE, JSON.stringify(await context.storageState(), null, 2), { mode: 0o600 });
await chmod(STATE_FILE, 0o600);
console.log('✓ Session saved to ' + STATE_FILE);
console.log('  (It expires like any browser session — re-run this if publishing starts failing.)');

await browser.close();
