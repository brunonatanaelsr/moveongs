import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
} from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import { getEnv } from '../config/env';
import { logger } from '../config/logger';

export interface ObservabilityController {
  shutdown(): Promise<void>;
  isEnabled: boolean;
}

let activeSdk: NodeSDK | null = null;

function buildSampler(strategy: string, argument?: string): Sampler {
  switch (strategy) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'traceidratio': {
      const ratio = argument ? Number(argument) : 1;
      return new TraceIdRatioBasedSampler(Number.isFinite(ratio) ? ratio : 1);
    }
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case 'parentbased_always_on':
    default:
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
  }
}

function parseHeaders(raw?: string): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, entry) => {
      const [key, value] = entry.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
      return headers;
    }, {});
}

function normalizeEndpoint(endpoint: string, signal: 'traces' | 'metrics'): string {
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  const path = signal === 'traces' ? '/v1/traces' : '/v1/metrics';
  return `${cleanEndpoint}${path}`;
}

export async function startObservability(): Promise<ObservabilityController> {
  const env = getEnv();
  const enabled = env.OTEL_ENABLED === 'true';

  if (!enabled) {
    logger.info('OpenTelemetry disabled');
    return {
      isEnabled: false,
      async shutdown() {
        // noop
      },
    };
  }

  if (activeSdk) {
    return { isEnabled: true, shutdown: () => activeSdk!.shutdown() };
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
  });

  const headers = parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);

  const traceExporter = new OTLPTraceExporter({
    url: normalizeEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'traces'),
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: normalizeEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'metrics'),
    headers,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: Number(env.OTEL_METRICS_EXPORT_INTERVAL_MS),
    exportTimeoutMillis: Number(env.OTEL_METRICS_EXPORT_TIMEOUT_MS),
  });

  const sampler = buildSampler(env.OTEL_TRACES_SAMPLER, env.OTEL_TRACES_SAMPLER_ARG);

  activeSdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook(request) {
            return request.url?.startsWith('/health') ?? false;
          },
        },
      }),
    ],
    traceSampler: sampler,
  });

  try {
    await activeSdk.start();
    logger.info('OpenTelemetry instrumentation initialised');
  } catch (error) {
    logger.error({ err: error }, 'failed to start OpenTelemetry SDK');
    throw error;
  }

  return {
    isEnabled: true,
    async shutdown() {
      if (!activeSdk) {
        return;
      }

      try {
        await activeSdk.shutdown();
        logger.info('OpenTelemetry instrumentation shutdown complete');
      } finally {
        activeSdk = null;
      }
    },
  };
}
