import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface UserView {
  id: string;
  email: string;
  fullName: string;
}

/** Resolves userId -> email/fullName via user-service's internal lookup (see apps/user-service/src/users/internal-users.controller.ts). */
@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("USER_SERVICE_URL") ?? "http://localhost:3001";
  }

  async findById(userId: string): Promise<UserView | null> {
    try {
      const res = await fetch(`${this.baseUrl}/internal/users/${userId}`);
      if (!res.ok) {
        this.logger.warn(`User Service returned ${res.status} for userId=${userId}`);
        return null;
      }
      return (await res.json()) as UserView;
    } catch (err) {
      this.logger.error(`User Service unreachable: ${(err as Error).message}`);
      return null;
    }
  }
}
