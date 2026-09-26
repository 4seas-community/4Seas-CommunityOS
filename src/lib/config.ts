/**
 * Environment configuration (docs/04, docs/06 conventions).
 */
function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export const config = {
  databaseUrl: str('DATABASE_URL', 'postgres://community:community@127.0.0.1:5433/communityos'),
  appUrl: str('APP_URL', 'http://localhost:3000'),
  defaultTimezone: str('DEFAULT_TIMEZONE', 'Asia/Bangkok'),
  sessionSecret: str('SESSION_SECRET', 'dev-only-session-secret-change-me'),
  emailBackend: str('EMAIL_BACKEND', 'console'),
  telegramBotToken: str('TELEGRAM_BOT_TOKEN'),
  lumaApiKey: str('LUMA_API_KEY'),
  lumaEnabled: bool('LUMA_ENABLED', false),
  socialLayerApiUrl: str('SOCIAL_LAYER_API_URL', 'https://api.sola.day/api/v1'),
  socialLayerToken: str('SOCIAL_LAYER_TOKEN'),
  socialLayerEnabled: bool('SOCIAL_LAYER_ENABLED', false),
  casApiUrl: str('CAS_API_URL'),
  casServiceKey: str('CAS_SERVICE_KEY'),
  botFeedToken: str('BOT_FEED_TOKEN', 'dev-bot-feed-token'),
  /** V2 points charging is off by default (docs/02 D6, docs/03 §4.3). */
  pointsEnabled: bool('POINTS_ENABLED', false),
  /** Default TTL for rotating check-in QR tokens (seconds). */
  checkinTokenTtlSeconds: Number(str('CHECKIN_TOKEN_TTL_SECONDS', '300')),
} as const;

/** True when a real CAS deployment is configured; otherwise the mock client is used. */
export function isCasHttpConfigured(): boolean {
  return config.casApiUrl !== '' && config.casServiceKey !== '';
}