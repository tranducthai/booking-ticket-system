import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SessionService } from "./session.service";

@Module({
  // Secrets are passed per call (access vs refresh differ) — see session.service.ts.
  imports: [JwtModule.register({})],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionsModule {}
