import { apiSend } from '../../lib/api-client';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h1>Verify your email</h1>
        <div className="notice notice-warn">Open the link from your verification email to finish signing up.</div>
      </section>
    );
  }
  try {
    const res = await apiSend<{ verified: boolean; email: string }>('POST', '/api/auth/verify-email', { token });
    return (
      <section style={{ maxWidth: 480 }}>
        <h1>Email verified ✓</h1>
        <div className="notice notice-info">
          <strong>{res.email}</strong> is now a verified community member — you can create events and book venues.
        </div>
        <a href="/me" className="btn btn-primary">
          Go to your dashboard
        </a>
      </section>
    );
  } catch (e) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h1>Verification failed</h1>
        <div className="notice notice-error">{(e as Error).message}</div>
        <a href="/me" className="btn btn-ghost">
          Request a new link
        </a>
      </section>
    );
  }
}
