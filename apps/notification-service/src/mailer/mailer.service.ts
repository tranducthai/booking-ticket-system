import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface Attachment {
  filename: string;
  content: Buffer;
  cid: string;
}

/**
 * docs/spec/11-implementation-roadmap.md Phase 7: "Local dev: use Mailhog
 * or Ethereal instead of a real SMTP provider" — SMTP_HOST/PORT point at
 * the mailhog container from infra/docker-compose.yml by default. View
 * sent mail at http://localhost:8025.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: nodemailer.Transporter;
  private from!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.from = this.config.get<string>("SMTP_FROM") ?? "no-reply@ticketbox.local";
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST") ?? "localhost",
      port: Number(this.config.get<string>("SMTP_PORT") ?? 1025),
      secure: false,
    });
  }

  async send(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, attachments });
      this.logger.log(`Sent "${subject}" to ${to}`);
    } catch (err) {
      // Not rethrown as a hard failure of the whole consumer — a broker
      // redelivery would just resend the same email; logging here is the
      // baseline, a DLQ + alert is Phase 8c's job (docs/spec/12-resilience-and-failure-design.md).
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}
