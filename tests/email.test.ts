/**
 * Email sender contract.
 *
 * The console backend must never touch the network (dev + tests), the Resend
 * backend must post the shared iDoris identity (hello@idoris.ai) with both a text
 * and an HTML part, and the outcome must separate 'rejected' (safe to retry) from
 * 'unknown' (the request died in flight, so the mail may already be on its way).
 */
import { describe, expect, it } from 'vitest';
import { consoleEmails, renderEmailHtml, sendEmail, sendViaResend } from '../src/lib/email';

const message = {
  to: 'member@test.dev',
  subject: 'Verify your 4Seas account',
  body: 'Welcome to 4Seas.\n\nConfirm: https://4seas-communityos.pages.dev/verify-email?token=abc',
};

const options = {
  apiKey: 're_test_key',
  from: 'iDoris AI <hello@idoris.ai>',
  replyTo: 'hello@idoris.ai',
};

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('resend backend', () => {
  it('sends from the shared iDoris identity with text and html', async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }));

    const outcome = await sendViaResend(message, options, impl);

    expect(outcome).toEqual({ ok: true, backend: 'resend', id: 'msg_123' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    const payload = JSON.parse(String(calls[0].init.body)) as Record<string, string>;
    expect(payload.from).toBe('iDoris AI <hello@idoris.ai>');
    expect(payload.reply_to).toBe('hello@idoris.ai');
    expect(payload.to).toBe('member@test.dev');
    expect(payload.text).toContain('token=abc');
    expect(payload.html).toContain('verify-email?token=abc');
    expect(payload.html).toContain('hello@idoris.ai');
  });

  it('reports a rejected send as safe to retry', async () => {
    const { impl } = fakeFetch(() => new Response('domain not verified', { status: 403 }));
    const outcome = await sendViaResend(message, options, impl);
    expect(outcome).toEqual({ ok: false, backend: 'resend', error: 'send_failed', delivered: 'rejected' });
  });

  it('reports a connection failure as unknown, never as rejected', async () => {
    const impl = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const outcome = await sendViaResend(message, options, impl);
    expect(outcome).toEqual({ ok: false, backend: 'resend', error: 'send_unknown', delivered: 'unknown' });
  });

  it('fails fast when the api key is missing instead of posting an empty bearer', async () => {
    const { impl, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    const outcome = await sendViaResend(message, { ...options, apiKey: '' }, impl);
    expect(outcome).toMatchObject({ ok: false, error: 'resend_not_configured' });
    expect(calls).toHaveLength(0);
  });
});

describe('html shell', () => {
  it('escapes body text and linkifies URLs', () => {
    const html = renderEmailHtml({ to: 'x@test.dev', subject: 'Hi', body: '<script>alert(1)</script> https://4seas-communityos.pages.dev/' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://4seas-communityos.pages.dev/"');
  });

  it('carries the iDoris wordmark and the 4Seas context line', () => {
    const html = renderEmailHtml(message);
    expect(html).toContain('DORIS.AI');
    expect(html).toContain('4Seas CommunityOS');
  });
});

describe('console backend (what tests and dev use)', () => {
  it('never hits the network and lands in the console outbox', async () => {
    const before = consoleEmails().length;
    const outcome = await sendEmail({ to: 'outbox@test.dev', subject: 'Hi', body: 'body' });
    expect(outcome).toEqual({ ok: true, backend: 'console', id: null });
    expect(consoleEmails().length).toBe(before + 1);
    expect(consoleEmails().at(-1)?.to).toBe('outbox@test.dev');
  });
});
