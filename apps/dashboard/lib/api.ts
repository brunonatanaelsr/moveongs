'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function fetchJson(path: string, params: Record<string, unknown> = {}, token?: string | null) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else {
      search.set(key, String(value));
    }
  });

  const url = `${API_URL}${path}${search.toString() ? `?${search.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function requestJson(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
  token?: string | null,
) {
  const url = `${API_URL}${path}`;
  const body: BodyInit | undefined = (() => {
    if (options.body === undefined) {
      return undefined;
    }
    if (typeof options.body === 'string') {
      return options.body;
    }
    return JSON.stringify(options.body);
  })();
  const response = await fetch(url, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    credentials: 'include',
    body,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
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

export function postJson(path: string, body: unknown, token?: string | null) {
  return requestJson(
    path,
    {
      method: 'POST',
      body,
    },
    token,
  );
}
