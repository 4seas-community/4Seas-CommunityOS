import { apiGet } from '../../../lib/api-client';

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  eventType: string;
  status: string;
  visibility: string;
  maxCapacity: number | null;
  entryRequirements: string | null;
  transportInfo: string | null;
  tags: string[];
  venue: { id: string; name: string; building: { name: string } | null } | null;
  host: { id: string; displayName: string | null; email: string } | null;
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev: EventDetail | null = null;
  let error: string | null = null;
  try {
    ev = await apiGet<EventDetail>('/api/events/' + id);
  } catch (e) {
    error = (e as Error).message;
  }
  if (error || !ev) {
    return (
      <section>
        <h1>Event not found</h1>
        <p className="muted">{error}</p>
      </section>
    );
  }
  return (
    <section>
      <h1>{ev.title}</h1>
      <p className="muted">
        {new Date(ev.startAt).toLocaleString('en-GB')} → {new Date(ev.endAt).toLocaleString('en-GB')} ({ev.timezone})
      </p>
      <div className="card">
        <div className="muted">
          {ev.eventType} · {ev.venue ? ev.venue.name + ' · ' + (ev.venue.building?.name ?? '') : 'External / online'} ·
          hosted by {ev.host?.displayName ?? ev.host?.email ?? '—'}
        </div>
        {ev.maxCapacity && <div className="muted">Capacity: {ev.maxCapacity}</div>}
      </div>
      {ev.description && <p style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</p>}
      {ev.transportInfo && (
        <div className="card">
          <strong>Getting there</strong>
          <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{ev.transportInfo}</p>
        </div>
      )}
      {ev.entryRequirements && (
        <div className="card">
          <strong>Entry requirements</strong>
          <p className="muted">{ev.entryRequirements}</p>
        </div>
      )}
      <RegisterForm eventId={ev.id} />
    </section>
  );
}

function RegisterForm({ eventId }: { eventId: string }) {
  return (
    <div className="card">
      <strong>Register</strong>
      <p className="muted">Registration opens a magic-link email if you are not signed in yet.</p>
      <form method="get" action={'/api/events/' + eventId + '/registrations'}>
        <input type="hidden" name="eventId" value={eventId} />
        <button type="submit">Register (API)</button>
      </form>
    </div>
  );
}
