import type { NotificationChannel } from './types';

export type ChannelMetricSnapshot = {
  delivered: number;
  failed: number;
  duplicates: number;
  deadLettered: number;
  retries: number;
  averageProcessingTimeMs: number;
};

export type NotificationMetricsSnapshot = Record<NotificationChannel, ChannelMetricSnapshot>;

type ChannelMetricsState = {
  delivered: number;
  failed: number;
  duplicates: number;
  deadLettered: number;
  retries: number;
  totalProcessingTimeMs: number;
};

function createEmptyState(): ChannelMetricsState {
  return {
    delivered: 0,
    failed: 0,
    duplicates: 0,
    deadLettered: 0,
    retries: 0,
    totalProcessingTimeMs: 0,
  };
}

export class NotificationMetrics {
  private readonly state: Record<NotificationChannel, ChannelMetricsState> = {
    email: createEmptyState(),
    whatsapp: createEmptyState(),
    webhook: createEmptyState(),
  };

  recordSuccess(channel: NotificationChannel, durationMs: number) {
    const metrics = this.state[channel];
    metrics.delivered += 1;
    metrics.totalProcessingTimeMs += durationMs;
  }

  recordFailure(channel: NotificationChannel) {
    this.state[channel].failed += 1;
  }

  recordDuplicate(channel: NotificationChannel) {
    this.state[channel].duplicates += 1;
  }

  recordDeadLetter(channel: NotificationChannel) {
    this.state[channel].deadLettered += 1;
  }

  recordRetry(channel: NotificationChannel) {
    this.state[channel].retries += 1;
  }

  getSnapshot(): NotificationMetricsSnapshot {
    return {
      email: this.toSnapshot('email'),
      whatsapp: this.toSnapshot('whatsapp'),
      webhook: this.toSnapshot('webhook'),
    };
  }

  reset() {
    for (const channel of Object.keys(this.state) as NotificationChannel[]) {
      const metrics = this.state[channel];
      metrics.delivered = 0;
      metrics.failed = 0;
      metrics.duplicates = 0;
      metrics.deadLettered = 0;
      metrics.retries = 0;
      metrics.totalProcessingTimeMs = 0;
    }
  }

  private toSnapshot(channel: NotificationChannel): ChannelMetricSnapshot {
    const metrics = this.state[channel];
    const averageProcessingTimeMs = metrics.delivered > 0
      ? metrics.totalProcessingTimeMs / metrics.delivered
      : 0;

    return {
      delivered: metrics.delivered,
      failed: metrics.failed,
      duplicates: metrics.duplicates,
      deadLettered: metrics.deadLettered,
      retries: metrics.retries,
      averageProcessingTimeMs,
    };
  }
}
