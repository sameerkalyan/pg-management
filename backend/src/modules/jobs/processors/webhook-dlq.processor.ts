import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * Processor for the webhook-dlq (Dead Letter Queue).
 *
 * When webhook processing exhausts all retry attempts, the job lands here for
 * manual inspection. This processor logs the failure details so operators can
 * investigate and re-process if needed.
 */
@Processor('webhook-dlq')
export class WebhookDlqProcessor {
  private readonly logger = new Logger(WebhookDlqProcessor.name);

  @Process()
  async processDlq(job: Job) {
    this.logger.error({
      message: 'Webhook failed after all retries — moved to DLQ',
      jobId: job.id,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
    });

    // TODO: Send alert (email, Slack, Sentry) when a webhook lands in the DLQ

    return { handled: true };
  }
}
