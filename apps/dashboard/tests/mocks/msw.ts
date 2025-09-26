import { vi } from 'vitest';

type ResponseLike = Response | { status?: number; headers?: Record<string, string>; body?: BodyInit | null };

type ResolverArgs = {
  params: Record<string, string>;
  request: Request;
};

type Handler = {
  method: string;
  matcher: RegExp;
  paramNames: string[];
  resolver: (args: ResolverArgs) => ResponseLike | Promise<ResponseLike>;
};

function toRegExp(path: string) {
  const paramNames: string[] = [];
  const escaped = path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = escaped.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { matcher: new RegExp(`^${pattern}$`), paramNames };
}

function createHandler(method: string, path: string, resolver: Handler['resolver']): Handler {
  const { matcher, paramNames } = toRegExp(path);
  return { method: method.toUpperCase(), matcher, paramNames, resolver };
}

export const http = {
  get: (path: string, resolver: Handler['resolver']) => createHandler('GET', path, resolver),
  post: (path: string, resolver: Handler['resolver']) => createHandler('POST', path, resolver),
  put: (path: string, resolver: Handler['resolver']) => createHandler('PUT', path, resolver),
  patch: (path: string, resolver: Handler['resolver']) => createHandler('PATCH', path, resolver),
  delete: (path: string, resolver: Handler['resolver']) => createHandler('DELETE', path, resolver),
};

export const HttpResponse = {
  json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    return {
      status: init.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      body: JSON.stringify(data),
    } as ResponseLike;
  },
};

export function setupServer(...initialHandlers: Handler[]) {
  const handlers = [...initialHandlers];
  let defaultHandlers = [...initialHandlers];
  let originalFetch: typeof fetch | null = null;

  async function dispatchFetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = request.method.toUpperCase();
    const url = request.url;

    for (const handler of handlers) {
      if (handler.method !== method) continue;
      const match = handler.matcher.exec(url);
      if (!match) continue;
      const params: Record<string, string> = {};
      handler.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1] ?? '');
      });
      const result = await handler.resolver({ params, request });
      if (result instanceof Response) {
        return result;
      }
      const { status = 200, headers = {}, body = null } = result ?? {};
      return new Response(body, { status, headers });
    }

    if (originalFetch) {
      return originalFetch(input, init);
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  }

  return {
    listen: (_options?: { onUnhandledRequest?: 'error' | 'bypass' | ((req: Request) => void) }) => {
      if (!originalFetch) {
        originalFetch = global.fetch;
        global.fetch = dispatchFetch as typeof fetch;
      }
    },
    close: () => {
      if (originalFetch) {
        global.fetch = originalFetch;
        originalFetch = null;
      }
    },
    resetHandlers: (...next: Handler[]) => {
      if (next.length > 0) {
        handlers.splice(0, handlers.length, ...next);
      } else {
        handlers.splice(0, handlers.length, ...defaultHandlers);
      }
    },
    use: (...next: Handler[]) => {
      handlers.push(...next);
    },
  };
}
