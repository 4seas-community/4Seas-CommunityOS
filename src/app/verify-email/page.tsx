import { apiSend } from '../../lib/api-client';

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <section>
        <h1>Verify email</h1>
        <p className="muted">Open the link from your verification email.</p>
      </section>
    );
  }
  try {
    const res = await apiSend<{ verified: boolean; email: string }>('POST', '/api/auth/verify-email', { token });
    return (
      <section>
        <h1>Email verified</h1>
        <p>
          {res.email} is now a verified community member. <a href="/me">Go to your dashboard</a>.
        </p>
      </section>
    );
  } catch (e) {
    return (
      <section>
        <h1>Verification failed</h1>
        <p className="muted">{(e as Error).message}</p>
      </section>
    );
  }
}
