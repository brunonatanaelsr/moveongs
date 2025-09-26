import { performance } from 'node:perf_hooks';
import type { NotificationChannel } from '../types';
import { NotificationMetrics } from '../metrics';

export abstract class BaseNotificationAdapter<TPayload> {
  protected constructor(
    protected readonly channel: NotificationChannel,
    private readonly metrics: NotificationMetrics,
  ) {}

  protected async executeWithMetrics<TResult>(handler: () => Promise<TResult>): Promise<TResult> {
    const start = performance.now();
    try {
      const result = await handler();
      const durationMs = performance.now() - start;
      this.metrics.recordSuccess(this.channel, durationMs);
      return result;
    } catch (error) {
      this.metrics.recordFailure(this.channel);
      throw error;
    }
  }
}
