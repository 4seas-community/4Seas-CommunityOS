#!/usr/bin/env node
/**
 * Obtain a Social Layer (sola.day) JWT for one-way publishing.
 *
 * There is no application or approval process: the API is undocumented but open
 * (the frontend at sociallayer-im/seastar-app is open source). Any account that
 * is a **manager of the 4seas group** can call it. The only thing needed is a
 * token, which this script fetches through the normal sign-in flow:
 *
 *   1. POST /auth/request_code {email}      → emails a one-time code
 *   2. POST /auth/verify_code  {email,code} → returns {token, user}
 *
 * Usage:
 *   node scripts/sola-token.mjs you@example.com            # prompts for the code
 *   SOLA_CODE=123456 node scripts/sola-token.mjs you@example.com   # non-interactive
 *   ... | node scripts/sola-token.mjs --write-env          # also update .env
 *
 * Notes
 *  - Use a dedicated mailbox (e.g. dev@4seas.xyz) that is a manager of the group.
 *  - The token is a normal session JWT and expires; re-run this to refresh it.
 *  - Two fully-automatable alternatives (no inbox needed):
 *      • SIWE wallet sign-in: bind a wallet to the account, then sign an EIP-4361
 *        message with that key (see packages/sola-sdk/src/auth/auth.ts).
 *      - copy the bearer token out of the browser devtools Network tab.
 */
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';

const API = (process.env.SOCIAL_LAYER_API_BASE ?? 'https://api.sola.day/api/v1').replace(/\/$/, '');
const email = process.argv.find((a) => a.includes('@'));
const writeEnv = process.argv.includes('--write-env');

if (!email) {
  console.error('usage: node scripts/sola-token.mjs <email> [--write-env]');
  process.exit(1);
}

async function json(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.error ?? data?.message ?? ('HTTP ' + res.status);
    throw new Error(path + ' failed: ' + message);
  }
  return data;
}

console.log('→ requesting a sign-in code for ' + email + ' …');
await json('/auth/request_code', { email });
console.log('  code sent — check the inbox (and spam) for that address.');

let code = process.env.SOLA_CODE;
if (!code) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  code = await new Promise((resolve) => rl.question('Enter the code from the email: ', (a) => { rl.close(); resolve(a.trim()); }));
}

const result = await json('/auth/verify_code', { email, code });
const token = result.token ?? result.data?.token;
if (!token) throw new Error('no token in response: ' + JSON.stringify(result).slice(0, 200));

console.log('\n✓ token acquired for ' + (result.user?.name ?? email));
console.log(token);
console.log('\nSet it in the environment:');
console.log('  SOCIAL_LAYER_ENABLED=true');
console.log('  SOCIAL_LAYER_TOKEN=' + token.slice(0, 12) + '…');

if (writeEnv) {
  const path = new URL('../.env', import.meta.url).pathname;
  let env = await readFile(path, 'utf8');
  env = env.replace(/^SOCIAL_LAYER_ENABLED=.*$/m, 'SOCIAL_LAYER_ENABLED=true');
  env = env.replace(/^SOCIAL_LAYER_TOKEN=.*$/m, 'SOCIAL_LAYER_TOKEN=' + token);
  await writeFile(path, env);
  console.log('\n✓ .env updated');
}
