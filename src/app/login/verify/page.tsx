import Link from 'next/link';
import { AutoSubmit } from '../../../components/auto-submit';

export const dynamic = 'force-dynamic';

const FORM_ID = 'magic-link-form';

/**
 * Magic-link landing page.
 *
 * It posts the token from the browser instead of fetching the API on the server:
 * the session cookie belongs on the API response, so it has to travel back to the
 * browser. The previous version called the API server-side, which consumed the
 * one-time token and dropped the Set-Cookie — visitors ended up on the sign-in
 * form being asked for the email the link already identified.
 *
 * Posting a form (rather than letting the API consume a plain GET) also means a
 * mail scanner that merely fetches this page cannot burn the token; a real
 * browser submits it automatically, so it stays one click.
 */
export default async function LoginVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h1>Sign in</h1>
        <div className="notice notice-warn">This link is missing its token — it may have been truncated by your mail client.</div>
        <Link className="btn btn-primary" href="/me">
          Send me a new link
        </Link>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 480 }}>
      <h1>Signing you in…</h1>
      <p className="page-sub">One moment. If nothing happens, press the button below.</p>
      <form method="post" action="/api/auth/login/verify" id={FORM_ID}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Sign in
        </button>
      </form>
      <AutoSubmit formId={FORM_ID} />
    </section>
  );
}
