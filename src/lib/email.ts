/**
 * Transactional email sender.
 *
 * Dev default is the console backend: messages are logged, not delivered, so
 * local runs and tests never touch a real inbox (same approach as CAS).
 * Production: set EMAIL_BACKEND=smtp and configure SMTP_* in the environment.
 */
import { config } from './config';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

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

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (config.emailBackend === 'smtp') {
    // SMTP delivery is intentionally not bundled in the MVP skeleton; wire your
    // provider (SES/Resend/Postmark) here when deploying to production.
    console.log('[email:smtp] not configured, falling back to console:', msg.subject, '->', msg.to);
    return;
  }
  consoleOutbox.push(msg);
  console.log('[email:console] to=%s subject=%s body=%s', msg.to, msg.subject, msg.body);
}