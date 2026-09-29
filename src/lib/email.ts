/**
 * Transactional email sender.
 *
 * Backends (EMAIL_BACKEND):
 *   console (default) — log to stdout and keep an in-memory outbox, never
 *     deliver anything; dev and tests read the links from there.
 *   resend — Resend HTTPS API, sent as `iDoris AI <hello@idoris.ai>` with
 *     reply-to hello@idoris.ai: the same provider and sender identity the
 *     PowerSalesMan worker uses, so all iDoris mail leaves from one place.
 *
 * The send outcome separates "definitely not sent" (rejected — safe to retry)
 * from "unknown" (the request died in flight — the mail may already be on its
 * way). Without that distinction a retry can double-send a login link.
 */
import { config } from './config';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text; the HTML alternative is generated from it. */
  body: string;
}

export type EmailBackend = 'console' | 'resend';

export type EmailSendOutcome =
  | { ok: true; backend: EmailBackend; id: string | null }
  | { ok: false; backend: EmailBackend; error: string; delivered: 'rejected' | 'unknown' };

/* ------------------------------------------------------------------ console */

/**
 * Console-mode outbox: keeps sent messages in memory so devs and tests can
 * read verification/login links without a real inbox.
 */
const consoleOutbox: EmailMessage[] = [];

export function consoleEmails(): readonly EmailMessage[] {
  return consoleOutbox;
}

export function lastConsoleEmailTo(to: string): EmailMessage | undefined {
  for (let i = consoleOutbox.length - 1; i >= 0; i--) {
    if (consoleOutbox[i].to === to) return consoleOutbox[i];
  }
  return undefined;
}

/** Extract the token=... value from a verification/login email body. */
export function tokenFromEmail(msg: EmailMessage | undefined): string {
  if (!msg) throw new Error('no console email found');
  const m = /token=([A-Za-z0-9_-]+)/.exec(msg.body);
  if (!m) throw new Error('no token in email body: ' + msg.body);
  return m[1];
}

/* --------------------------------------------------------------- html shell */

/**
 * 4Seas Community owns the message: its logo heads the card and its name signs
 * off in the footer. iDoris is only the delivery provider (the verified sending
 * domain), so it gets one small line at the bottom and nothing else.
 *
 * Mail clients only understand table layout plus inline styles — flex/grid and
 * <style> classes get dropped by Outlook and parts of Gmail — so this is tables
 * all the way down.
 */
const PAPER = '#EFEBE4';
const CARD = '#FFFFFF';
const INK = '#16161D';
const MUTED = '#8A8892';
const FAINT = '#A9A7AF';
const RULE = '#E2DBD0';
const ORANGE = '#E2762B';
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans Thai',Thonburi,sans-serif";
/** public/4seas-logo.png is 500x113; the header renders it at a fixed size. */
const LOGO_WIDTH = 150;
const LOGO_HEIGHT = 34;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Body text -> paragraphs with clickable links (escaping happens first). */
function bodyToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => esc(para.trim()).replace(/https?:\/\/[^\s<]+/g, (url) => {
      return '<a href="' + url + '" style="color:' + ORANGE + ';text-decoration:underline">' + url + '</a>';
    }))
    .map((para) => '<p style="margin:0 0 14px">' + para.replace(/\n/g, '<br>') + '</p>')
    .join('');
}

export function renderEmailHtml(message: EmailMessage): string {
  const site = config.emailBrandUrl.replace(/^https?:\/\//, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(message.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
<tr><td align="center" style="padding:28px 12px 40px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${CARD};border:1px solid ${RULE};border-radius:14px;overflow:hidden;font-family:${SANS}">
    <tr><td style="padding:22px 28px 16px;border-bottom:1px solid ${RULE}">
      <a href="${esc(config.emailBrandUrl)}" style="text-decoration:none">
        <img src="${esc(config.emailLogoUrl)}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${esc(config.emailBrandName)}" style="display:block;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0">
      </a>
    </td></tr>
    <tr><td style="padding:26px 28px 30px;font-size:15px;line-height:1.65;color:${INK}">
      ${bodyToHtml(message.body)}
    </td></tr>
  </table>
  <div style="padding-top:14px;font-size:11px;line-height:1.7;color:${MUTED};font-family:${SANS}">
    ${esc(config.emailBrandName)} &middot; <a href="${esc(config.emailBrandUrl)}" style="color:${MUTED}">${esc(site)}</a><br>
    Questions? Reply to <a href="mailto:${esc(config.emailReplyTo)}" style="color:${MUTED}">${esc(config.emailReplyTo)}</a> &mdash; that reaches a human.<br>
    <span style="color:${FAINT}">Delivered with ${esc(config.emailProviderName)}.</span>
  </div>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ resend */

export interface ResendOptions {
  apiKey: string;
  from: string;
  replyTo: string;
}

/**
 * Post one message to Resend. Kept separate (and injectable) so tests can pin
 * the exact payload and both failure branches without touching the network.
 */
export async function sendViaResend(
  message: EmailMessage,
  options: ResendOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailSendOutcome> {
  if (!options.apiKey) {
    console.error('[email:resend] skipped: RESEND_API_KEY is not configured');
    return { ok: false, backend: 'resend', error: 'resend_not_configured', delivered: 'rejected' };
  }

  let res: Response;
  try {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + options.apiKey, 'content-type': 'application/json' },
      // Resend takes both: plain-text clients and "show original" get the text,
      // everyone else gets the branded HTML.
      body: JSON.stringify({
        from: options.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
        html: renderEmailHtml(message),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });
  } catch (err) {
    // The connection broke mid-flight: the message may well be on its way.
    console.error('[email:resend] request failed in flight', err);
    return { ok: false, backend: 'resend', error: 'send_unknown', delivered: 'unknown' };
  }

  if (res.ok) {
    const id = await res
      .json()
      .then((body) => (body as { id?: string })?.id ?? null)
      .catch(() => null);
    console.log('[email:resend] accepted', id, '->', message.to, '|', message.subject.slice(0, 80));
    return { ok: true, backend: 'resend', id };
  }

  // A definite error response means Resend did not accept it, so retrying is safe.
  console.error('[email:resend] rejected', res.status, (await res.text().catch(() => '')).slice(0, 500));
  return { ok: false, backend: 'resend', error: 'send_failed', delivered: 'rejected' };
}

/* ---------------------------------------------------------------- dispatch */

export async function sendEmail(message: EmailMessage): Promise<EmailSendOutcome> {
  if (config.emailBackend === 'resend') {
    return sendViaResend(message, {
      apiKey: config.resendApiKey,
      from: config.emailFrom,
      replyTo: config.emailReplyTo,
    });
  }
  consoleOutbox.push(message);
  console.log('[email:console] to=%s subject=%s body=%s', message.to, message.subject, message.body);
  return { ok: true, backend: 'console', id: null };
}
