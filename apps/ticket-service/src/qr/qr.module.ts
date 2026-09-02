import { Global, Module } from "@nestjs/common";
import { QrSignerService } from "./qr-signer.service";

@Global()
@Module({
  providers: [QrSignerService],
  exports: [QrSignerService],
})
export class QrModule {}
