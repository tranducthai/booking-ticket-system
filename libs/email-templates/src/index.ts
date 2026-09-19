/**
 * Shared email content — subject + HTML per notification type, previously
 * hardcoded inline in notification-service's consumers. Provider-agnostic:
 * these just produce { subject, html }, unrelated to whether the send goes
 * out over SMTP (Mailpit locally) or AWS SES (production) — see
 * apps/notification-service/src/mailer/mailer.module.ts.
 */
export * from "./escape-html";
export * from "./types";
export * from "./order-paid";
export * from "./ticket-issued";
export * from "./event-reminder";
