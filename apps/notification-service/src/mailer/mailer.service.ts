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
 *  - "brevo": Brevo's transactional HTTP API (https://api.brevo.com, port
 *    443) with BREVO_API_KEY — for hosts that block outbound SMTP ports
 *    (Render's free tier blocks 25/465/587). Inline cid: images aren't
 *    sent inline there: they go as regular attachments and the <img> is
 *    replaced with a pointer to the attached file (see sendViaBrevo).
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
  private transporter?: nodemailer.Transporter; // unset for "brevo" — that one is plain fetch()
  private provider!: string;
  private from!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.from = this.config.get<string>("SMTP_FROM") ?? "no-reply@ticketbox.local";
    const provider = (this.config.get<string>("EMAIL_PROVIDER") ?? "smtp").toLowerCase();
    this.provider = provider;

    if (provider === "brevo") {
      if (!this.config.get<string>("BREVO_API_KEY")) {
        this.logger.warn("EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set — every send will fail");
      }
    } else {
      this.transporter =
        provider === "ses"
          ? nodemailer.createTransport({
              SES: {
                ses: new SESClient({ region: this.config.get<string>("AWS_REGION") ?? "us-east-1" }),
                aws: { SendRawEmailCommand },
              },
            })
          : this.smtpTransport();
    }
    this.logger.log(`Email provider: ${provider}`);
  }

  /**
   * Mailpit locally needs no auth; a real relay (Brevo, Gmail app password...)
   * does — SMTP_USER/SMTP_PASS are only sent when set. Port 465 is implicit
   * TLS; 587 upgrades via STARTTLS on its own with secure: false.
   */
  private smtpTransport() {
    const port = Number(this.config.get<string>("SMTP_PORT") ?? 1025);
    const user = this.config.get<string>("SMTP_USER");
    const pass = this.config.get<string>("SMTP_PASS");
    return nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST") ?? "localhost",
      port,
      secure: port === 465,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  async send(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<void> {
    try {
      if (this.provider === "brevo") {
        await this.sendViaBrevo(to, subject, html, attachments);
      } else {
        await this.transporter!.sendMail({ from: this.from, to, subject, html, attachments });
      }
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

  /** POST /v3/smtp/email — https://developers.brevo.com/reference/sendtransacemail */
  private async sendViaBrevo(to: string, subject: string, html: string, attachments: Attachment[]): Promise<void> {
    const byCid = new Map(attachments.map((a) => [a.cid, a.filename]));
    const htmlContent = html.replace(/<img[^>]*src=["']cid:([^"']+)["'][^>]*>/gi, (_tag, cid: string) => {
      const file = byCid.get(cid);
      return `<p style="margin:8px 0;color:#555"><em>Mã QR vé: xem file đính kèm${file ? ` <strong>${file}</strong>` : ""} hoặc mục "Vé của tôi" trên website.</em></p>`;
    });

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.config.get<string>("BREVO_API_KEY") ?? "",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseAddress(this.from),
        to: [{ email: to }],
        subject,
        htmlContent,
        ...(attachments.length > 0
          ? { attachment: attachments.map((a) => ({ name: a.filename, content: a.content.toString("base64") })) }
          : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Brevo API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }
}

/** "Ticketbox <a@b.com>" -> { name, email }; a bare address -> { email }. Brevo wants the parts separately. */
function parseAddress(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { ...(m[1] ? { name: m[1] } : {}), email: m[2].trim() } : { email: from.trim() };
}
