import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_URL, fetchJson, requestJson } from '../lib/api';

describe('api helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws when the response status is an error', async () => {
    const response = new Response(JSON.stringify({ error: 'fail' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('/test')).rejects.toThrow('Request failed: 500');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/test`,
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('serializes request payloads and forwards auth headers', async () => {
    const payload = { foo: 'bar' };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJson('/resource', { method: 'POST', body: payload }, 'token-123');

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/resource`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        }),
      }),
    );
    expect(result).toEqual({ success: true });
  });
});
