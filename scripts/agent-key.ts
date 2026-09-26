/**
 * Mint an agent API key (operator tool).
 *
 *   pnpm tsx scripts/agent-key.ts "claude-desktop" "events:read,events:write"
 *
 * The secret is printed once; only its SHA-256 lives in the database.
 */
import { createHash, randomBytes } from 'node:crypto';
import { db, pool } from '../src/lib/db';
import { agentKeys } from '../src/modules/agent/schema';

async function main() {
  const name = process.argv[2] ?? 'agent';
  const scopes = (process.argv[3] ?? 'venues:read,events:read,events:write,bookings:write').split(',').map((s) => s.trim());
  const secret = 'cos_ak_' + randomBytes(24).toString('base64url');
  const keyHash = createHash('sha256').update(secret).digest('hex');
  const [row] = await db.insert(agentKeys).values({ name, keyHash, scopes }).returning();
  console.log('agent key created');
  console.log('  key_id :', row.id);
  console.log('  name   :', row.name);
  console.log('  scopes :', scopes.join(', '));
  console.log('  secret :', secret);
  console.log('\nStore the secret now — it cannot be recovered.');
  await pool.end();
}

main().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});
