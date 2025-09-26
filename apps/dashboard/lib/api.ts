'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

interface RequestOptions {
  params?: Record<string, unknown>;
  body?: unknown;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson(path: string, options: RequestOptions = {}, token?: string | null) {
  const { params = {}, body, method = 'GET' } = options;
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
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? '';
    let errorData: unknown;
    try {
      errorData = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
    } catch (e) {
      errorData = null;
    }
    throw new ApiError(`Request failed: ${response.status}`, response.status, errorData);
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function get<T = unknown>(
  path: string,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
  token?: string | null,
): Promise<T> {
  return requestJson(path, { ...options, method: 'GET' }, token);
}

export async function post<T = unknown>(
  path: string,
  options: Omit<RequestOptions, 'method'> = {},
  token?: string | null,
): Promise<T> {
  return requestJson(path, { ...options, method: 'POST' }, token);
}

export async function put<T = unknown>(
  path: string,
  options: Omit<RequestOptions, 'method'> = {},
  token?: string | null,
): Promise<T> {
  return requestJson(path, { ...options, method: 'PUT' }, token);
}

export async function patch<T = unknown>(
  path: string,
  options: Omit<RequestOptions, 'method'> = {},
  token?: string | null,
): Promise<T> {
  return requestJson(path, { ...options, method: 'PATCH' }, token);
}

export async function del<T = unknown>(
  path: string,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
  token?: string | null,
): Promise<T> {
  return requestJson(path, { ...options, method: 'DELETE' }, token);
}
