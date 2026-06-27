import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { makeCounterProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';

export const httpRequestsTotal = makeCounterProvider({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = makeGaugeProvider({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
});

export const paymentCounter = makeCounterProvider({
  name: 'payments_total',
  help: 'Total number of payments processed',
  labelNames: ['status'],
});

export const invoiceCounter = makeCounterProvider({
  name: 'invoices_total',
  help: 'Total number of invoices generated',
  labelNames: ['status'],
});

export const queueDepth = makeGaugeProvider({
  name: 'queue_depth',
  help: 'Number of jobs in queue',
  labelNames: ['queue_name'],
});

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [httpRequestsTotal, httpRequestDuration, paymentCounter, invoiceCounter, queueDepth],
  exports: [PrometheusModule],
})
export class MetricsModule {}
