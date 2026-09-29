import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';

const env = readFileSync('/Users/jason/Dev/4Seas/4Seas-CommunityOS/.env', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.replace(/^"|"$/g, '');
const secret = new TextEncoder().encode(pick('SESSION_SECRET'));

const token = await new SignJWT({
  sub: process.env.MINT_SUB ?? '33333333-3333-4333-8333-333333333333',
  email: process.env.MINT_EMAIL ?? 'jhfnetboy@gmail.com',
  roles: [{ scope: 'community:*', role: 'admin' }],
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
  .sign(secret);

process.stdout.write(token);
