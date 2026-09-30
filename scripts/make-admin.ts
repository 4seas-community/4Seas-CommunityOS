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
import { closeDb, db } from '../src/lib/db';
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
    closeDb();
    return;
  }

  const email = arg.trim().toLowerCase();
  const [member] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  if (!member) {
    const roles: RoleEntry[] = [{ scope: 'community:*', role: 'admin' }];
    await db.insert(members).values({
      email,
      emailVerifiedAt: new Date(),
      roles,
    });
    console.log('✓ Created and promoted ' + email + ' to community admin');
    console.log('  roles:', JSON.stringify(roles));
    closeDb();
    return;
  }

  const roles = member.roles as RoleEntry[];
  if (roles.some((r) => r.role === 'admin' && r.scope === 'community:*')) {
    console.log(email + ' is already a community admin');
    closeDb();
    return;
  }

  const next = [...roles, { scope: 'community:*', role: 'admin' }];
  await db.update(members).set({ roles: next, updatedAt: new Date() }).where(eq(members.id, member.id));
  console.log('✓ ' + email + ' is now a community admin');
  console.log('  roles:', JSON.stringify(next));
  closeDb();
}

main().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});
