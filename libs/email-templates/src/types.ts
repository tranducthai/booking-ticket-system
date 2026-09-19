/** What every template function below produces — handed straight to MailerService.send(to, subject, html). */
export interface EmailContent {
  subject: string;
  html: string;
}
