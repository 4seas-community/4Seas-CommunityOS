#!/usr/bin/env node
/**
 * Publish a CommunityOS event to Luma **without Luma Plus** (no API).
 *
 * Luma gates its REST API behind the paid Plus plan. For low-volume communities
 * (a handful of events a day) browser automation on a normal free account is the
 * cheaper path — this script does exactly that, with two modes:
 *
 *   --assisted (default)  opens lu.ma/create, puts the event brief on the
 *                         clipboard and waits; you paste and click once.
 *                         Robust: Luma UI changes cannot break it.
 *   --auto                fills the form and submits with best-effort selectors.
 *                         Faster, but breaks when Luma changes its markup.
 *
 * Usage:
 *   node scripts/luma-browser-publish.mjs --event <communityos-event-id>
 *   node scripts/luma-browser-publish.mjs --file /tmp/event.json --auto
 *
 * Prerequisite: run scripts/luma-login.mjs once to save the browser session.
 *
 * The event brief is read from the CommunityOS API (APP_URL in .env) so the
 * payload is identical to what the API-based publisher would have sent.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE_FILE = join(homedir(), '.4seas', 'luma-state.json');
const args = process.argv.slice(2);
const mode = args.includes('--auto') ? 'auto' : 'assisted';
const eventId = valueOf('--event');
const filePath = valueOf('--file');

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

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

/** Read the event brief: from a JSON file, or from the CommunityOS API. */
async function loadBrief() {
  if (filePath) return JSON.parse(await readFile(filePath, 'utf8'));
  if (!eventId) throw new Error('pass --event <id> or --file <path>');

  const appUrl = (process.env.APP_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const res = await fetch(appUrl + '/api/events/' + encodeURIComponent(eventId));
  if (!res.ok) throw new Error('CommunityOS API ' + res.status + ' for event ' + eventId);
  const detail = await res.json();
  const ev = detail.event ?? detail;
  return {
    title: ev.title,
    description: ev.description ?? '',
    startAt: ev.startAt,
    endAt: ev.endAt,
    timezone: ev.timezone,
    location: detail.venue ? [detail.venue.name, detail.venue.building].filter(Boolean).join(' · ') : (ev.externalLocation ?? ''),
    transport: ev.transportInfo ?? '',
    requirements: ev.entryRequirements ?? '',
    tags: ev.tags ?? [],
    url: appUrl + '/events/' + ev.id,
  };
}

/** Human-readable brief for the clipboard (assisted mode) and for logs. */
function briefText(b) {
  const start = new Date(b.startAt);
  const end = new Date(b.endAt);
  return [
    'Title: ' + b.title,
    'When: ' + start.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }) +
      ' → ' + end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    'Where: ' + (b.location || '(online)'),
    '',
    b.description,
    b.transport ? '\nGetting there\n' + b.transport : '',
    b.requirements ? '\nEntry requirements\n' + b.requirements : '',
    b.tags.length ? '\n' + b.tags.map((t) => '#' + t).join(' ') : '',
    '\nMore info: ' + b.url,
  ]
    .filter(Boolean)
    .join('\n');
}

const brief = await loadBrief();
const text = briefText(brief);
console.log('--- Luma event brief -------------------------------------------');
console.log(text);
console.log('----------------------------------------------------------------');

const { chromium } = await loadPlaywright();
let storageState;
try {
  storageState = JSON.parse(await readFile(STATE_FILE, 'utf8'));
} catch {
  throw new Error('no saved Luma session. Run: node scripts/luma-login.mjs');
}

const browser = await chromium.launch({ headless: mode === 'auto' });
const context = await browser.newContext({ storageState });
const page = await context.newPage();
await page.goto('https://lu.ma/create', { waitUntil: 'domcontentloaded' });

if (mode === 'assisted') {
  // Put the brief on the clipboard so a single paste fills the description.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((payload) => navigator.clipboard.writeText(payload), text);
  console.log('\n→ lu.ma/create is open and the brief is on your clipboard.');
  console.log('  Fill the form (title / time / place) and paste into the description.');
  console.log('  Press Enter here when done; the page URL will be reported.\n');
  const { createInterface } = await import('node:readline');
  await new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Press Enter when the event is created… ', () => {
      rl.close();
      resolve();
    });
  });
  console.log('current URL: ' + page.url());
} else {
  // Best-effort form fill. Every step is defensive: Luma's markup changes often,
  // so we report which fields succeeded instead of failing the whole run.
  const filled = [];
  async function tryFill(name, selectors, value) {
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ state: 'visible', timeout: 4000 });
        await el.fill(value);
        filled.push(name);
        return;
      } catch {
        /* next selector */
      }
    }
    console.warn('! could not fill: ' + name);
  }

  await tryFill('title', ['input[placeholder*="Event Name" i]', 'input[name="name"]', 'textarea[placeholder*="Event Name" i]'], brief.title);

  const startLocal = new Date(brief.startAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const endLocal = new Date(brief.endAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  await tryFill('start', ['input[placeholder*="Start" i]', 'input[name="start_at"]'], startLocal);
  await tryFill('end', ['input[placeholder*="End" i]', 'input[name="end_at"]'], endLocal);
  await tryFill('location', ['input[placeholder*="Location" i]', 'input[name="location"]'], brief.location);

  // Description is a rich-text editor; typing is the most reliable interaction.
  for (const sel of ['div[contenteditable="true"]', 'div.tiptap', 'textarea[name="description"]']) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 4000 });
      await el.click();
      await page.keyboard.type(text, { delay: 1 });
      filled.push('description');
      break;
    } catch {
      /* next selector */
    }
  }

  console.log('filled fields: ' + (filled.join(', ') || 'none'));
  console.log('\n→ Auto mode stops before submitting so a human can review. Submit in the browser (or extend this script).');
  const { createInterface } = await import('node:readline');
  await new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Press Enter after you review/submit… ', () => {
      rl.close();
      resolve();
    });
  });
  console.log('current URL: ' + page.url());
}

await browser.close();
