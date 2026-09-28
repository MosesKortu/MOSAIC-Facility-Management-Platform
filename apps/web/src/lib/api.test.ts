import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api.ts';

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers },
  })));
}

describe('apiFetch', () => {
  it('returns parsed JSON and sends credentials with a JSON body', async () => {
    respond(200, { ok: true });
    await expect(apiFetch('/auth/me', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/me');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"a":1}' });
  });

  it('returns undefined for 204', async () => {
    respond(204);
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns the error envelope into a typed ApiError', async () => {
    respond(402, { error: { code: 'INSUFFICIENT_GRANT_BALANCE', message: 'Not enough', details: { shortfall: '30.00' } }, request_id: 'r-1' });
    const error = await apiFetch('/bookings').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INSUFFICIENT_GRANT_BALANCE', status: 402, details: { shortfall: '30.00' }, requestId: 'r-1' });
  });

  it('treats a response without an envelope as an internal error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 502 });
  });

  it('reports network failures distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
