/**
 * Telegram WebApp initData verification (official algorithm).
 *
 * secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * check_hash = HMAC_SHA256(key=secret_key, msg=data_check_string).hexdigest()
 * data_check_string = sorted "key=value" pairs, excluding hash.
 *
 * Ported from the CAS implementation (Community-Account-System app/services/telegram.py)
 * so binding stays in this system; CAS keeps points/checkin/on-chain mapping.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

const MAX_AUTH_AGE_SECONDS = 24 * 3600;

export interface TelegramIdentity {
  telegramId: string;
  username: string | null;
}

export function verifyInitData(initData: string, maxAgeSeconds = MAX_AUTH_AGE_SECONDS): TelegramIdentity {
  const token = config.telegramBotToken;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }
  const pairs = new URLSearchParams(initData);
  const receivedHash = pairs.get('hash');
  if (!receivedHash) throw new Error('missing hash in init_data');

  const fields: string[] = [];
  for (const [k, v] of [...pairs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (k === 'hash') continue;
    fields.push(k + '=' + v);
  }
  const dataCheckString = fields.join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(receivedHash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('init_data signature mismatch');
  }

  const authDate = pairs.get('auth_date');
  if (authDate) {
    const age = Math.floor(Date.now() / 1000) - Number(authDate);
    if (age > maxAgeSeconds) throw new Error('init_data is stale');
  }
  const user = JSON.parse(pairs.get('user') ?? '{}') as { id?: number; username?: string };
  if (!user.id) throw new Error('init_data has no user');
  return { telegramId: String(user.id), username: user.username ?? null };
}
