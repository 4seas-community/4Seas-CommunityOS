/**
 * Promote a member to community admin — the cold-start escape hatch.
 *
 * The audit (docs/10 §2.1) found that no API could grant roles, so on a fresh
 * deployment nobody could reach the console. Run this once against the target
 * database, then use /admin → Members for everything else.
 *
 *   pnpm tsx scripts/make-admin.ts you@example.com
 *   pnpm tsx scripts/make-admin.ts --list        # show current admins
 */
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/lib/db';
import { members } from '../src/modules/people/schema';

interface RoleEntry {
  scope: string;
  role: string;
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === '--list') {
    const rows = await db.select().from(members);
    const admins = rows.filter((m) => (m.roles as RoleEntry[]).some((r) => r.role === 'admin'));
    console.log('members:', rows.length, '| admins:', admins.length);
    for (const a of admins) console.log('  admin:', a.email, JSON.stringify(a.roles));
    await pool.end();
    return;
  }

  const email = arg.trim().toLowerCase();
  const [member] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  if (!member) {
    console.error('no member with email ' + email + ' — they must register first');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const roles = member.roles as RoleEntry[];
  if (roles.some((r) => r.role === 'admin' && r.scope === 'community:*')) {
    console.log(email + ' is already a community admin');
    await pool.end();
    return;
  }

  const next = [...roles, { scope: 'community:*', role: 'admin' }];
  await db.update(members).set({ roles: next, updatedAt: new Date() }).where(eq(members.id, member.id));
  console.log('✓ ' + email + ' is now a community admin');
  console.log('  roles:', JSON.stringify(next));
  await pool.end();
}

main().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});
