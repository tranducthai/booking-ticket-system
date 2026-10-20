import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageError, SupabaseStorage } from "@booking-ticket-system/object-storage";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { access, mkdir, writeFile } from "fs/promises";
import { dirname, resolve, sep } from "path";
import { Readable } from "stream";

/** What multer's memory storage hands a controller — declared locally instead of pulling in @types/multer for four fields. */
export interface UploadedEvidenceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

/**
 * Content sniffing, NOT the client-supplied mimetype or extension — a
 * renamed .exe must not land in an organizer's browser as "proof.pdf"
 * (docs/spec/13-refund-and-anti-fraud-design.md §2.2 "evidence").
 */
export function sniffEvidenceType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export interface StoredEvidence {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Refund evidence store. Supabase Storage (a PRIVATE bucket) when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set — required on hosts with
 * an ephemeral disk such as Render, where local files vanish on every deploy.
 * Otherwise local disk (EVIDENCE_STORAGE_DIR, a volume in Swarm). Either way
 * files are only ever served back through the authorization-checked
 * GET /refunds/:id/evidence/:evidenceId — never from a public URL.
 */
@Injectable()
export class EvidenceStorageService implements OnModuleInit {
  private readonly logger = new Logger(EvidenceStorageService.name);
  private readonly root: string;
  private readonly remote: SupabaseStorage | null;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>("EVIDENCE_STORAGE_DIR") ?? "storage/refund-evidence");
    this.remote = SupabaseStorage.fromEnv((k) => config.get<string>(k));
    this.bucket = config.get<string>("SUPABASE_EVIDENCE_BUCKET") ?? "refund-evidence";
  }

  async onModuleInit() {
    if (!this.remote) return;
    try {
      await this.remote.ensureBucket(this.bucket, { public: false, fileSizeLimit: MAX_EVIDENCE_BYTES });
    } catch (err) {
      this.logger.error(`Could not ensure bucket "${this.bucket}": ${(err as Error).message}`);
    }
  }

  validate(files: UploadedEvidenceFile[]): void {
    if (files.length > MAX_EVIDENCE_FILES) {
      throw new BadRequestException(`Tối đa ${MAX_EVIDENCE_FILES} tệp minh chứng`);
    }
    for (const file of files) {
      if (file.size > MAX_EVIDENCE_BYTES) {
        throw new BadRequestException(`Tệp "${file.originalname}" vượt quá 10MB`);
      }
      if (!sniffEvidenceType(file.buffer)) {
        throw new BadRequestException(`Tệp "${file.originalname}" không phải ảnh (JPG/PNG/WEBP) hoặc PDF`);
      }
    }
  }

  async put(refundId: string, evidenceId: string, file: UploadedEvidenceFile): Promise<StoredEvidence> {
    const storageKey = `${refundId}/${evidenceId}`;
    const mimeType = sniffEvidenceType(file.buffer)!;
    if (this.remote) {
      await this.remote.upload(this.bucket, storageKey, file.buffer, mimeType);
    } else {
      const path = this.pathFor(storageKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.buffer);
    }
    return {
      storageKey,
      fileName: file.originalname.slice(0, 200),
      mimeType,
      sizeBytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
    };
  }

  async open(storageKey: string): Promise<Readable> {
    if (this.remote) {
      try {
        return Readable.from(await this.remote.download(this.bucket, storageKey));
      } catch (err) {
        if (!(err instanceof StorageError && err.status === 404)) throw err;
        // Fall through: evidence uploaded before the switch to Supabase is still on local disk.
      }
    }
    const path = this.pathFor(storageKey);
    try {
      await access(path);
    } catch {
      throw new NotFoundException("Evidence file is missing from storage");
    }
    return createReadStream(path);
  }

  private pathFor(storageKey: string): string {
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(this.root + sep)) {
      throw new BadRequestException("Invalid storage key"); // keys are server-generated, but never trust a path join
    }
    return path;
  }
}
