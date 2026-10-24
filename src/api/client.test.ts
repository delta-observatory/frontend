import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function client(token: string | null) {
  vi.resetModules();
  const storage = { getItem: () => token, setItem: vi.fn(), removeItem: vi.fn() };
  const reload = vi.fn();
  const tabStorage={getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()};
  vi.stubGlobal('sessionStorage',tabStorage);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { reload });
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  return { ...(await import('./client')), storage, tabStorage, reload, fetcher };
}

it('routes anonymous API and artifact reads through the GUI channel without credentials', async () => {
  const c = await client(null);
  await c.apiFetch('/api/artifacts/example/content');
  const [url, init] = c.fetcher.mock.calls[0]!;
  expect(url).toBe('/gui-api/artifacts/example/content');
  expect(init.headers.has('Authorization')).toBe(false);
});

it('keeps authenticated API requests and explicit credentials on the API channel', async () => {
  const c = await client('dlt_test');
  await c.apiFetch('/api/runs');
  expect(c.fetcher.mock.calls[0]![0]).toBe('/api/runs');
  expect(c.fetcher.mock.calls[0]![1].headers.get('Authorization')).toBe('Bearer dlt_test');
  const guest = await client(null);
  await guest.apiFetch('/api/me', { headers: { Authorization: 'Bearer explicit' } });
  expect(guest.fetcher.mock.calls[0]![0]).toBe('/api/me');
});

it('reloads the document after sign-out to discard caches from the earlier client', async () => {
  const c = await client('dlt_test');
  c.session.set(null);
  expect(c.storage.removeItem).toHaveBeenCalledWith('delta.token');
  expect(c.reload).toHaveBeenCalledOnce();
  expect(c.session.token()).toBeNull();
});

it('keeps a new login in this tab unless remember is selected', async () => {
  const c=await client(null);
  c.session.set('dlt_session');
  expect(c.tabStorage.setItem).toHaveBeenCalledWith('delta.token','dlt_session');
  expect(c.storage.setItem).not.toHaveBeenCalled();
  c.session.set('dlt_remembered',true);
  expect(c.storage.setItem).toHaveBeenCalledWith('delta.token','dlt_remembered');
  expect(c.tabStorage.removeItem).toHaveBeenCalledWith('delta.token');
});

it('clears desktop authority before discarding the workspace token', async () => {
  const c=await client('dlt_owner');
  const signOut=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window',{deltaDesktop:{signOut}});
  await c.session.signOut();
  expect(signOut).toHaveBeenCalledOnce();
  expect(c.session.token()).toBeNull();
  expect(c.reload).toHaveBeenCalledOnce();
});

it('ends desktop authority after the API rejects a stored token', async () => {
  const c=await client('dlt_expired');
  const signOut=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window',{deltaDesktop:{signOut}});
  c.fetcher.mockResolvedValue(new Response('{}',{status:401}));
  await c.apiFetch('/api/me');
  expect(signOut).toHaveBeenCalledOnce();
  expect(c.session.token()).toBeNull();
});

it('clears browser credentials even when the desktop connection stops during sign-out', async () => {
  const c=await client('dlt_owner');
  vi.stubGlobal('window',{deltaDesktop:{signOut:vi.fn().mockRejectedValue(new Error('Host stopped'))}});
  await expect(c.session.signOut()).rejects.toThrow('Host stopped');
  expect(c.session.token()).toBeNull();
  expect(c.reload).toHaveBeenCalledOnce();
});
