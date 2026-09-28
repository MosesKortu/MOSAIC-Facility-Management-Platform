import type { SessionUser } from '@mosaic/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';

/** A session user for component tests. */
export function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    user_id: '00000000-0000-4000-8000-000000000001', email: 'anna@icfo.test', full_name: 'Anna Kowalski',
    role: 'standard_user', user_type: 'internal', groups: [], ...overrides,
  };
}

type StubResponse = readonly [number, unknown?];

/**
 * Stubs fetch with a tiny route table: "METHOD /path" → [status, body], or a function returning one
 * (to model server state that changes across requests). Unlisted requests fail the test loudly.
 */
export function stubApi(routes: Record<string, StubResponse | ((body: unknown) => StubResponse)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${requestPath(input)}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request in test: ${key}`);
    const [status, body] = typeof route === 'function' ? route(requestBody(init)) : route;
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestPath(input: RequestInfo | URL): string {
  return (input instanceof Request ? input.url : input.toString()).replace('/api/v1', '');
}

function requestBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

/** The requests a stubbed fetch received, as { method, path, body }. */
export function apiCalls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.map(([input, init]) => ({ method: init?.method ?? 'GET', path: requestPath(input), body: requestBody(init) }));
}

export function renderRoutes(routes: RouteObject[], initialPath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...view, router, client };
}

export function page(text: string): ReactNode {
  return <p>{text}</p>;
}
