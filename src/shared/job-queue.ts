import { randomUUID } from 'crypto';

type Job<T> = {
  id: string;
  payload: T;
  attempts: number;
};

export interface JobQueueOptions<T> {
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: number;
  onError?: (error: unknown, job: Job<T>) => void;
  onAttemptFailure?: (error: unknown, job: Job<T>) => void;
}

const defaultOptions = {
  concurrency: 1,
  maxAttempts: 3,
  backoffMs: 1000,
} satisfies Required<Omit<JobQueueOptions<unknown>, 'onError' | 'onAttemptFailure'>>;

export class JobQueue<T> {
  private readonly handler: (payload: T) => Promise<void> | void;

  private readonly options: Required<typeof defaultOptions> & Pick<JobQueueOptions<T>, 'onError' | 'onAttemptFailure'>;

  private readonly queue: Job<T>[] = [];

  private activeCount = 0;

  private idleResolvers: Array<() => void> = [];

  private pendingRetryCount = 0;

  constructor(handler: (payload: T) => Promise<void> | void, options?: JobQueueOptions<T>) {
    this.handler = handler;
    this.options = {
      ...defaultOptions,
      ...options,
    };
  }

  enqueue(payload: T): string {
    const job: Job<T> = {
      id: randomUUID(),
      payload,
      attempts: 0,
    };

    this.queue.push(job);
    this.process();
    return job.id;
  }

  async onIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeCount === 0 && this.pendingRetryCount === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  private process() {
    while (this.activeCount < this.options.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }
      this.execute(job);
    }

    this.maybeResolveIdle();
  }

  private execute(job: Job<T>) {
    this.activeCount += 1;

    Promise.resolve()
      .then(() => this.handler(job.payload))
      .then(() => {
        this.activeCount -= 1;
        this.process();
      })
      .catch((error) => {
        this.activeCount -= 1;
        job.attempts += 1;

        const invokeAttemptFailure = () => {
          if (this.options.onAttemptFailure) {
            try {
              this.options.onAttemptFailure(error, job);
            } catch {
              // ignore errors thrown by attempt failure handler
            }
          }
        };

        if (job.attempts < this.options.maxAttempts) {
          invokeAttemptFailure();
          this.pendingRetryCount += 1;
          setTimeout(() => {
            this.pendingRetryCount -= 1;
            this.queue.push(job);
            this.process();
          }, this.options.backoffMs);
        } else {
          invokeAttemptFailure();
          if (this.options.onError) {
            try {
              this.options.onError(error, job);
            } catch {
              // ignore errors thrown by onError handler
            }
          }
        }

        this.process();
      });
  }

  private maybeResolveIdle() {
    if (this.queue.length === 0 && this.activeCount === 0 && this.pendingRetryCount === 0) {
      while (this.idleResolvers.length > 0) {
        const resolve = this.idleResolvers.shift();
        resolve?.();
      }
    }
  }
}

