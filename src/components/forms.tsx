'use client';

/**
 * Interactive forms as client components: the server-rendered <form> versions
 * posted url-encoded bodies at JSON-only endpoints, so every submission failed
 * (flagged blocking in review). These call the API with JSON and then navigate.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function useSubmit() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: string, body: unknown, okMessage: string, redirectTo?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? 'Request failed (' + res.status + ')');
      setNotice(okMessage);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { send, error, notice, busy };
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <div className="notice notice-error">{error}</div>;
  if (notice) return <div className="notice notice-info">{notice}</div>;
  return null;
}

/** Sign-in: requests a magic link (or, in dev, reports the console token). */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const { send, error, notice, busy } = useSubmit();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await send('/api/auth/login/request', { email }, 'Check your inbox for the login link.');
      }}
    >
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <Feedback error={error} notice={notice} />
      <div style={{ marginTop: 18 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send login link'}
        </button>
      </div>
    </form>
  );
}

/** Quick event creation (title + time + venue). */
export function CreateEventForm({ venues }: { venues: Array<{ id: string; name: string; building: string | null }> }) {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [venueId, setVenueId] = useState('');
  const [tags, setTags] = useState('');
  const { send, error, notice, busy } = useSubmit();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { title, startAt, endAt };
        if (venueId) body.venueId = venueId;
        if (tags.trim()) body.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
        await send('/api/events', body, 'Draft created — publish it from the event page when you are ready.');
        setTitle('');
      }}
    >
      <label htmlFor="title">Title</label>
      <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Language Corner" />

      <label htmlFor="startAt">Starts (ISO, e.g. 2026-10-01T10:00:00+07:00)</label>
      <input id="startAt" required value={startAt} onChange={(e) => setStartAt(e.target.value)} placeholder="2026-10-01T10:00:00+07:00" />

      <label htmlFor="endAt">Ends</label>
      <input id="endAt" required value={endAt} onChange={(e) => setEndAt(e.target.value)} placeholder="2026-10-01T12:00:00+07:00" />

      <label htmlFor="venueId">Venue</label>
      <select id="venueId" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
        <option value="">— online / external location —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.building ? ' · ' + v.building : ''}
          </option>
        ))}
      </select>

      <label htmlFor="tags">Tags (comma separated)</label>
      <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="workshop, community" />

      <Feedback error={error} notice={notice} />
      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create draft'}
        </button>
        <a href="/events" className="btn btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  );
}

/** Register the signed-in member for an event (POST, not the host-only GET). */
export function RegisterButton({ eventId }: { eventId: string }) {
  const { send, error, notice, busy } = useSubmit();
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => send('/api/events/' + eventId + '/registrations', { answers: {} }, 'You are registered. See you there!')}
      >
        {busy ? 'Registering…' : 'Register for this event'}
      </button>
      <Feedback error={error} notice={notice} />
      <p className="muted" style={{ marginTop: 8 }}>
        Sign in first — we email you a one-time link, no password needed.
      </p>
    </div>
  );
}
