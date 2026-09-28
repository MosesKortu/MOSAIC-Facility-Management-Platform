import { isErrorCode, type ErrorCode } from '@mosaic/contracts';

/** Server catalog codes plus the one failure only the client can observe. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId: string | undefined;

  constructor(code: ClientErrorCode, message: string, status: number, details: Record<string, unknown> = {}, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** The only way the web app calls the API: same-origin, cookie session, error envelope → ApiError. */
export async function apiFetch<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('NETWORK_ERROR', 'MOSAIC could not be reached. Check your connection.', 0);
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) return payload as T;

  const envelope = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> }; request_id?: string } | undefined);
  const code = envelope?.error?.code;
  if (code && isErrorCode(code)) {
    throw new ApiError(code, envelope.error?.message ?? code, response.status, envelope.error?.details, envelope.request_id);
  }
  throw new ApiError('INTERNAL_ERROR', 'MOSAIC returned an unexpected response.', response.status);
}
