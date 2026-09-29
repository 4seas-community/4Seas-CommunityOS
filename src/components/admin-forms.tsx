'use client';

/**
 * Admin console interactive pieces (docs/10 batch 1). Each posts JSON to the
 * admin API and refreshes the server-rendered lists on success.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: string, path: string, body?: unknown, okMessage = 'Saved') {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? 'Request failed (' + res.status + ')');
      setOk(okMessage);
      router.refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { call, error, ok, busy };
}

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) return <div className="notice notice-error">{error}</div>;
  if (ok) return <div className="notice notice-info">{ok}</div>;
  return null;
}

/** Admin: create a building. */
export function CreateBuildingForm() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const { call, error, ok, busy } = useAction();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await call('POST', '/api/buildings', { name, address }, 'Building created');
        if (done) {
          setName('');
          setAddress('');
        }
      }}
    >
      <label htmlFor="b-name">Building name</label>
      <input id="b-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Building G" />
      <label htmlFor="b-address">Address</label>
      <input id="b-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Nimman, Chiang Mai" />
      <Feedback error={error} ok={ok} />
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Add building'}
        </button>
      </div>
    </form>
  );
}

/** Admin: add a floor to a building. */
export function CreateFloorForm({ buildings }: { buildings: Array<{ id: string; name: string }> }) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? '');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const { call, error, ok, busy } = useAction();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await call(
          'POST',
          '/api/floors',
          { buildingId, name, sortOrder: Number(sortOrder) || 0 },
          'Floor added',
        );
        if (done) setName('');
      }}
    >
      <label htmlFor="f-building">Building</label>
      <select id="f-building" value={buildingId} onChange={(e) => setBuildingId(e.target.value)} required>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <label htmlFor="f-name">Floor name</label>
      <input id="f-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="2nd Floor" />
      <label htmlFor="f-order">Sort order</label>
      <input id="f-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      <Feedback error={error} ok={ok} />
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy || !buildingId}>
          {busy ? 'Adding…' : 'Add floor'}
        </button>
      </div>
    </form>
  );
}

/** Admin: create a venue under a building (optionally on a floor). */
export function CreateVenueForm({
  buildings,
}: {
  buildings: Array<{ id: string; name: string; floors: Array<{ id: string; name: string }> }>;
}) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? '');
  const [floorId, setFloorId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [capacitySeated, setCapacitySeated] = useState('');
  const [capacityStanding, setCapacityStanding] = useState('');
  const { call, error, ok, busy } = useAction();

  const floors = buildings.find((b) => b.id === buildingId)?.floors ?? [];

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { buildingId, name, code };
        if (floorId) body.floorId = floorId;
        if (areaSqm) body.areaSqm = Number(areaSqm);
        if (capacitySeated) body.capacitySeated = Number(capacitySeated);
        if (capacityStanding) body.capacityStanding = Number(capacityStanding);
        const done = await call('POST', '/api/venues', body, 'Venue created — set its rules next');
        if (done) {
          setName('');
          setCode('');
        }
      }}
    >
      <label htmlFor="v-building">Building</label>
      <select
        id="v-building"
        value={buildingId}
        onChange={(e) => {
          setBuildingId(e.target.value);
          setFloorId('');
        }}
        required
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <label htmlFor="v-floor">Floor (optional)</label>
      <select id="v-floor" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
        <option value="">— none —</option>
        {floors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <label htmlFor="v-name">Venue name</label>
      <input id="v-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Event Space" />
      <label htmlFor="v-code">Code</label>
      <input id="v-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="F1-EVENT" />

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="v-area">Area (m²)</label>
          <input id="v-area" type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="v-seated">Seated</label>
          <input id="v-seated" type="number" value={capacitySeated} onChange={(e) => setCapacitySeated(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="v-standing">Standing</label>
          <input id="v-standing" type="number" value={capacityStanding} onChange={(e) => setCapacityStanding(e.target.value)} />
        </div>
      </div>

      <Feedback error={error} ok={ok} />
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={busy || !buildingId}>
          {busy ? 'Creating…' : 'Add venue'}
        </button>
      </div>
    </form>
  );
}

/** Admin: grant or revoke a role for a member. */
export function RoleEditor({
  memberId,
  roles,
  isAdmin,
}: {
  memberId: string;
  roles: Array<{ scope: string; role: string }>;
  isAdmin: boolean;
}) {
  const [role, setRole] = useState('venue_manager');
  const [scope, setScope] = useState('community:*');
  const { call, error, ok, busy } = useAction();
  const already = roles.some((r) => r.role === role && r.scope === scope);

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
          <option value="venue_manager">venue_manager</option>
          <option value="host">host</option>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <input
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="community:* or venue:<uuid>"
          style={{ width: 220 }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !isAdmin}
          onClick={() => call('POST', '/api/admin/members/' + memberId + '/roles', { role, scope }, 'Role granted')}
        >
          Grant
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !isAdmin || !already}
          onClick={() => call('DELETE', '/api/admin/members/' + memberId + '/roles', { role, scope }, 'Role revoked')}
        >
          Revoke
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

/** Admin: adjust a member's points (executed in CAS, mirrored locally). */
export function PointsAdjuster({ memberId, isAdmin }: { memberId: string; isAdmin: boolean }) {
  const [delta, setDelta] = useState('10');
  const [reason, setReason] = useState('manual_adjust');
  const { call, error, ok, busy } = useAction();
  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          style={{ width: 90 }}
          aria-label="Points delta"
        />
        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 160 }} aria-label="Reason" />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !isAdmin}
          onClick={() =>
            call('POST', '/api/admin/members/' + memberId + '/points', { delta: Number(delta), reason }, 'Points adjusted')
          }
        >
          Apply
        </button>
      </div>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

/** Admin/venue manager: decide a pending venue booking. */
export function BookingDecision({ bookingId, canDecide }: { bookingId: string; canDecide: boolean }) {
  const [note, setNote] = useState('');
  const { call, error, ok, busy } = useAction();
  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note (optional)"
          style={{ maxWidth: 240 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !canDecide}
          onClick={() => call('POST', '/api/bookings/' + bookingId + '/approve', { note: note || undefined }, 'Booking approved')}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || !canDecide}
          onClick={() => call('POST', '/api/bookings/' + bookingId + '/reject', { note: note || undefined }, 'Booking rejected')}
        >
          Reject
        </button>
      </div>
      {!canDecide && <div className="muted">You can see this request but not decide it.</div>}
      <Feedback error={error} ok={ok} />
    </div>
  );
}

/** Admin/venue manager: approve a pending_review event, which publishes it. */
export function EventApproval({ eventId }: { eventId: string }) {
  const { call, error, ok, busy } = useAction();
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => call('POST', '/api/events/' + eventId + '/approve', undefined, 'Event published')}
      >
        Approve &amp; publish
      </button>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

/** Admin: reset a failed notification outbox entry to pending. */
export function NotificationRetryButton({ id }: { id: string }) {
  const { call, error, ok, busy } = useAction();
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '4px 10px', fontSize: 13 }}
        disabled={busy}
        onClick={() => call('POST', '/api/admin/notifications/' + id + '/retry', undefined, 'Queued for retry')}
      >
        {busy ? 'Retrying…' : 'Retry'}
      </button>
      <Feedback error={error} ok={ok} />
    </div>
  );
}

