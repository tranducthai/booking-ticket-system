import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import * as nodemailer from "nodemailer";
import { MetricsService } from "../metrics/metrics.service";

export interface Attachment {
  filename: string;
  content: Buffer;
  cid: string;
}

/**
 * Transport is picked by EMAIL_PROVIDER, not hardcoded:
 *  - "smtp" (default — local dev): plain SMTP against Mailpit
 *    (infra/docker-compose.yml), via SMTP_HOST/PORT. View sent mail at
 *    http://localhost:8025.
 *  - "ses" (production): AWS SES via nodemailer's built-in SES transport —
 *    nodemailer reshapes the same sendMail() call into a
 *    SendRawEmailCommand, so attachments/cid images (ticket-issued.consumer.ts's
 *    QR PNGs) keep working unchanged. Credentials come from the standard
 *    AWS SDK chain (IAM role in production); nothing AWS-specific beyond
 *    AWS_REGION is configured here.
 * Either way, callers only ever see MailerService.send(...) below —
 * switching providers is a config change (EMAIL_PROVIDER=ses), not a code
 * change or a redeploy of a different image.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: nodemailer.Transporter;
  private from!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.from = this.config.get<string>("SMTP_FROM") ?? "no-reply@ticketbox.local";
    const provider = (this.config.get<string>("EMAIL_PROVIDER") ?? "smtp").toLowerCase();

    this.transporter =
      provider === "ses"
        ? nodemailer.createTransport({
            SES: {
              ses: new SESClient({ region: this.config.get<string>("AWS_REGION") ?? "us-east-1" }),
              aws: { SendRawEmailCommand },
            },
          })
        : nodemailer.createTransport({
            host: this.config.get<string>("SMTP_HOST") ?? "localhost",
            port: Number(this.config.get<string>("SMTP_PORT") ?? 1025),
            secure: false,
          });
    this.logger.log(`Email provider: ${provider}`);
  }

  async send(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, attachments });
      this.logger.log(`Sent "${subject}" to ${to}`);
      this.metrics.emailsSentTotal.inc();
    } catch (err) {
      // Not rethrown as a hard failure of the whole consumer — a broker
      // redelivery would just resend the same email; logging here is the
      // baseline, a DLQ + alert is Phase 8c's job (docs/spec/12-resilience-and-failure-design.md).
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(err as Error).message}`);
      this.metrics.emailsFailedTotal.inc();
      throw err;
    }
  }
}
