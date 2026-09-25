import { redirect } from 'next/navigation';
import { apiSend } from '../../../lib/api-client';

export const dynamic = 'force-dynamic';

export default async function LoginVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect('/me');
  try {
    await apiSend('POST', '/api/auth/login/verify', { token });
  } catch {
    // fall through to /me, which shows the login form with an error hint
  }
  redirect('/me');
}
