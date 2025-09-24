import { AsyncLocalStorage } from 'node:async_hooks';

export type LogContext = Record<string, unknown>;

const storage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

export function setLogContext(context: LogContext): void {
  const store = storage.getStore();

  if (store) {
    Object.assign(store, context);
    return;
  }

  storage.enterWith({ ...context });
}

export function runWithLogContext<T>(context: LogContext, fn: () => Promise<T>): Promise<T>;
export function runWithLogContext<T>(context: LogContext, fn: () => T): T;
export function runWithLogContext<T>(context: LogContext, fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run({ ...context }, fn);
}
