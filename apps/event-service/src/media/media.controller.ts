import { Body, Controller, Get, NotFoundException, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { join } from "path";
import { Actor, CurrentActor } from "../auth/current-actor.decorator";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { MAX_IMAGE_BYTES, MEDIA_KINDS, MediaKind, MediaService, UploadedImageFile } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Lets the web hide the upload button when storage isn't configured. */
  @Get("config")
  config() {
    return { uploadEnabled: this.media.enabled, maxBytes: MAX_IMAGE_BYTES };
  }

  /**
   * Development only: serves what the local-disk fallback stored. The path
   * pieces are matched against strict patterns, so nothing outside uploads/
   * can be reached.
   */
  @Get("files/:kind/:userId/:file")
  file(@Param("kind") kind: string, @Param("userId") userId: string, @Param("file") file: string, @Res() res: Response) {
    const root = this.media.localRoot;
    if (!root || !(MEDIA_KINDS as readonly string[]).includes(kind) || !/^[A-Za-z0-9-]{1,64}$/.test(userId) || !/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(file)) {
      throw new NotFoundException();
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(join(root, kind, userId, file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }

  /** multipart/form-data: file=<image>, kind=banner|logo|zone-map|avatar|artist|content → { url } */
  @Post("images")
  @UseGuards(RequireAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(@CurrentActor() actor: Actor, @Body("kind") kind: MediaKind, @UploadedFile() file?: UploadedImageFile) {
    return this.media.uploadImage(actor.userId!, kind ?? "content", file);
  }
}
