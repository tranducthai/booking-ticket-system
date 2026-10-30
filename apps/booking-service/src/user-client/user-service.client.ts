import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Asks user-service (internal lookup) whether a buyer has a CCCD on file — it is printed in the ticket QR. */
@Injectable()
export class UserServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("USER_SERVICE_URL") ?? "http://localhost:3001";
    this.internalToken = config.get<string>("INTERNAL_TOKEN") || undefined;
  }

  /** Fails closed: if user-service can't be asked, the hold is refused rather than selling a ticket that can't carry a CCCD. */
  async assertHasNationalId(userId: string): Promise<void> {
    let nationalId: string | null | undefined;
    try {
      const res = await fetch(`${this.baseUrl}/internal/users/${userId}`, {
        headers: this.internalToken ? { "x-internal-token": this.internalToken } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      nationalId = ((await res.json()) as { nationalId?: string | null }).nationalId;
    } catch {
      throw new ServiceUnavailableException("Không kiểm tra được thông tin tài khoản — vui lòng thử lại");
    }
    if (!nationalId) {
      throw new BadRequestException({
        statusCode: 400,
        code: "NATIONAL_ID_REQUIRED",
        message: "Vui lòng cập nhật số CCCD trong Thông tin tài khoản trước khi mua vé",
        error: "Bad Request",
      });
    }
  }
}
