import { z } from 'zod';
import type { NotificationEvent } from './types';

const eventTypes = [
  'enrollment.created',
  'attendance.recorded',
  'attendance.low_attendance',
  'consent.recorded',
  'consent.updated',
] as const satisfies NotificationEvent['type'][];

export const createWebhookSchema = z.object({
  event: z.enum(eventTypes),
  url: z.string().url(),
  secret: z.string().max(256).optional(),
});

export const webhookIdParamSchema = z.object({
  id: z.string().uuid(),
});

