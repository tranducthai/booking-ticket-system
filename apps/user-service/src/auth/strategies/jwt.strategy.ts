import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { revokedError, SessionService } from "../../sessions/session.service";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

/**
 * user-service is the one service that still reads the Bearer token itself
 * (JwtAuthGuard on /users/*, /activity). The gateway already rejects tokens
 * of revoked sessions, but this service also has a public URL, so the same
 * session check is repeated here — a logged-out token must not work by
 * calling user-service directly either.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessions: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET") ?? "",
      algorithms: ["HS256"], // never let the token header choose
    });
  }

  // Whatever this returns becomes `req.user` for guarded routes.
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (typeof payload.sid !== "string" || !(await this.sessions.isActive(payload.sid))) {
      throw revokedError(undefined);
    }
    return payload;
  }
}
