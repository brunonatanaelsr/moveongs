'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

type QueryParams = Record<string, unknown>;

function buildUrl(path: string, params: QueryParams = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return `${API_URL}${path}${query ? `?${query}` : ''}`;
}

async function parseResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function buildHeaders(token?: string | null, extra: HeadersInit = {}) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  } as HeadersInit;
}

export async function fetchJson(path: string, params: QueryParams = {}, token?: string | null) {
  const url = buildUrl(path, params);
  const response = await fetch(url, {
    headers: buildHeaders(token),
    credentials: 'include',
  });

  return parseResponse(response);
}

type RequestJsonOptions = {
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
};

export async function requestJson(path: string, options: RequestJsonOptions, token?: string | null) {
  const { method, body, params } = options;
  const url = buildUrl(path, params);
  const headers = buildHeaders(token);
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  return parseResponse(response);
}

export async function downloadFile(path: string, params: Record<string, unknown>, token: string, filename: string) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const url = `${API_URL}${path}${search.toString() ? `?${search.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
