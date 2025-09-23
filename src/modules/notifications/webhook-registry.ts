import { randomUUID } from 'crypto';
import type { NotificationEvent } from './types';

export type WebhookSubscription = {
  id: string;
  event: NotificationEvent['type'];
  url: string;
  secret: string | null;
  createdAt: string;
};

const registry = new Map<string, WebhookSubscription>();

export function addWebhookSubscription(params: {
  event: NotificationEvent['type'];
  url: string;
  secret?: string | null;
}): WebhookSubscription {
  const subscription: WebhookSubscription = {
    id: randomUUID(),
    event: params.event,
    url: params.url,
    secret: params.secret ?? null,
    createdAt: new Date().toISOString(),
  };

  registry.set(subscription.id, subscription);
  return subscription;
}

export function listWebhookSubscriptions(): WebhookSubscription[] {
  return Array.from(registry.values());
}

export function removeWebhookSubscription(id: string): boolean {
  return registry.delete(id);
}

export function getWebhooksForEvent(event: NotificationEvent['type']): WebhookSubscription[] {
  return listWebhookSubscriptions().filter((subscription) => subscription.event === event);
}

export function clearWebhookSubscriptions() {
  registry.clear();
}

