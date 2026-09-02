import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PaymentsService } from "./payments.service";

/** Runs PaymentsService.reconcilePending() on a schedule — see that method's doc comment. */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly staleAfterMs = 2 * 60 * 1000; // "PENDING payments older than ~2 min"

  constructor(private readonly payments: PaymentsService) {}

  @Cron("0 */2 * * * *") // every 2 minutes — CronExpression has no EVERY_2_MINUTES preset
  async run(): Promise<void> {
    const result = await this.payments.reconcilePending(this.staleAfterMs);
    if (result.checked > 0) {
      this.logger.log(`Reconciliation: checked ${result.checked}, resolved ${result.resolved}`);
    }
  }
}
