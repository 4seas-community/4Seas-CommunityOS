/**
 * API error helpers. All errors render as { error: { code, message, details? } }.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) => new ApiError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown) => new ApiError(422, 'unprocessable', message, details);
export const tooMany = (message = 'Rate limit exceeded') => new ApiError(429, 'rate_limited', message);

export function errorBody(err: unknown): { status: number; body: unknown } {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details ?? null } },
    };
  }
  console.error('[api] unexpected error:', err);
  return { status: 500, body: { error: { code: 'internal', message: 'Internal server error' } } };
}

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
