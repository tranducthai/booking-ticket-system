import { Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { MAX_IMAGE_BYTES, MediaKind, MediaService, UploadedImageFile } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Lets the web hide the upload button when storage isn't configured. */
  @Get("config")
  config() {
    return { uploadEnabled: this.media.enabled, maxBytes: MAX_IMAGE_BYTES };
  }

  /** multipart/form-data: file=<image>, kind=banner|logo|zone-map|avatar|artist|content → { url } */
  @Post("images")
  @UseGuards(RequireAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(@CurrentActor() actor: Actor, @Body("kind") kind: MediaKind, @UploadedFile() file?: UploadedImageFile) {
    return this.media.uploadImage(actor.userId!, kind ?? "content", file);
  }
}
