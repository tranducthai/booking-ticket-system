import { BadRequestException, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IMAGE_EXTENSIONS, sniffImageType, SupabaseStorage } from "@booking-ticket-system/object-storage";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What an image is for — becomes the top-level folder, so the bucket stays browsable. */
export const MEDIA_KINDS = ["banner", "logo", "zone-map", "avatar", "artist", "content"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export interface UploadedImageFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * Public images (banners, logos, zone maps, avatars...) on Supabase Storage.
 * The DB keeps storing a plain URL in bannerUrl / avatarUrl / ..., exactly as
 * when organizers pasted links — so pasted URLs keep working and nothing
 * downstream changes.
 *
 * Without Supabase credentials a non-production run falls back to files on
 * the local disk (`uploads/`, served by MediaController.file()) so image
 * upload works in development. Never in production: an app host's disk is
 * ephemeral, so there it stays "disabled" until storage is configured.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly storage: SupabaseStorage | null;
  private readonly bucket: string;
  private readonly localDir: string | null;
  private readonly localBaseUrl: string;

  constructor(config: ConfigService) {
    this.storage = SupabaseStorage.fromEnv((k) => config.get<string>(k));
    this.bucket = config.get<string>("SUPABASE_MEDIA_BUCKET") ?? "media";
    this.localDir = !this.storage && process.env.NODE_ENV !== "production" ? join(process.cwd(), "uploads") : null;
    // Public URL prefix of GET /media/files (through the api-gateway in dev).
    this.localBaseUrl = (config.get<string>("MEDIA_LOCAL_BASE_URL") ?? "http://localhost:4000/event/media/files").replace(/\/$/, "");
  }

  /** Absolute directory the local fallback writes to (null when Supabase is used or in production). */
  get localRoot(): string | null {
    return this.localDir;
  }

  async onModuleInit() {
    if (!this.storage) {
      this.logger.warn(
        this.localDir
          ? `SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — storing uploads on local disk (${this.localDir}), development only`
          : "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — image upload disabled (pasting URLs still works)",
      );
      return;
    }
    try {
      await this.storage.ensureBucket(this.bucket, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: Object.keys(IMAGE_EXTENSIONS),
      });
    } catch (err) {
      // Don't take the service down over it — uploads will surface the real error.
      this.logger.error(`Could not ensure bucket "${this.bucket}": ${(err as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.storage !== null || this.localDir !== null;
  }

  async uploadImage(userId: string, kind: MediaKind, file: UploadedImageFile | undefined) {
    if (!this.enabled) throw new ServiceUnavailableException("Chưa cấu hình lưu trữ ảnh — hãy dán đường dẫn ảnh");
    if (!file) throw new BadRequestException("Thiếu tệp ảnh (field \"file\")");
    if (!MEDIA_KINDS.includes(kind)) throw new BadRequestException("Loại ảnh không hợp lệ");
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException("Ảnh vượt quá 5MB");
    const mime = sniffImageType(file.buffer);
    if (!mime) throw new BadRequestException("Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF");

    const key = `${kind}/${userId}/${randomUUID()}.${IMAGE_EXTENSIONS[mime]}`;
    if (!this.storage) {
      const path = join(this.localDir!, key);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, file.buffer);
      return { url: `${this.localBaseUrl}/${key}`, key, mimeType: mime, sizeBytes: file.size };
    }
    await this.storage.upload(this.bucket, key, file.buffer, mime);
    return { url: this.storage.publicUrl(this.bucket, key), key, mimeType: mime, sizeBytes: file.size };
  }
}
