/**
 * Supabase Storage over its plain REST API (no SDK — four calls don't justify
 * supabase-js and its realtime/auth baggage). Server-side only: authenticates
 * with the project's service_role key, which bypasses bucket RLS, so it must
 * never reach a browser.
 *
 * Two kinds of bucket are used:
 *   - public  — event banners, organizer logos, zone maps, avatars; served
 *               straight from Supabase's CDN via publicUrl().
 *   - private — refund evidence; only ever streamed back through an
 *               authorization-checked endpoint via download().
 */
export interface SupabaseStorageConfig {
  /** https://<project-ref>.supabase.co */
  url: string;
  /** Project Settings → API → service_role key. */
  serviceKey: string;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class SupabaseStorage {
  private readonly base: string;

  constructor(private readonly config: SupabaseStorageConfig) {
    this.base = `${config.url.replace(/\/+$/, "")}/storage/v1`;
  }

  /** Builds a client from SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, or null when either is unset. */
  static fromEnv(get: (key: string) => string | undefined): SupabaseStorage | null {
    const url = get("SUPABASE_URL");
    const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
    return url && serviceKey ? new SupabaseStorage({ url, serviceKey }) : null;
  }

  /** Creates the bucket if it doesn't exist yet — safe to call on every boot. */
  async ensureBucket(bucket: string, opts: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] }): Promise<void> {
    const res = await this.request("GET", `/bucket/${encodeURIComponent(bucket)}`);
    if (res.ok) return;
    const created = await this.request("POST", "/bucket", {
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: opts.public,
        file_size_limit: opts.fileSizeLimit,
        allowed_mime_types: opts.allowedMimeTypes,
      }),
      contentType: "application/json",
    });
    // 409 = another instance created it between our GET and POST.
    if (!created.ok && created.status !== 409) throw await this.fail(created, `create bucket ${bucket}`);
  }

  async upload(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await this.request("POST", `/object/${encodeURIComponent(bucket)}/${encodePath(key)}`, {
      body,
      contentType,
      headers: { "cache-control": "31536000", "x-upsert": "false" }, // keys are random → immutable, cache for a year
    });
    if (!res.ok) throw await this.fail(res, `upload ${bucket}/${key}`);
  }

  /** Fetches an object from a private bucket. Throws StorageError(404) when it's gone. */
  async download(bucket: string, key: string): Promise<Buffer> {
    const res = await this.request("GET", `/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(key)}`);
    if (!res.ok) throw await this.fail(res, `download ${bucket}/${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(bucket: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const res = await this.request("DELETE", `/object/${encodeURIComponent(bucket)}`, {
      body: JSON.stringify({ prefixes: keys }),
      contentType: "application/json",
    });
    if (!res.ok) throw await this.fail(res, `remove from ${bucket}`);
  }

  /** CDN URL of an object in a public bucket — no request made. */
  publicUrl(bucket: string, key: string): string {
    return `${this.base}/object/public/${encodeURIComponent(bucket)}/${encodePath(key)}`;
  }

  private request(
    method: string,
    path: string,
    opts: { body?: Buffer | string; contentType?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.serviceKey}`,
        apikey: this.config.serviceKey,
        ...(opts.contentType ? { "content-type": opts.contentType } : {}),
        ...opts.headers,
      },
      body: opts.body,
      signal: AbortSignal.timeout(30_000),
    });
  }

  private async fail(res: Response, what: string): Promise<StorageError> {
    const text = await res.text().catch(() => "");
    // Supabase reports a missing object as 400 {"statusCode":"404",...} on some versions.
    const status = res.status === 400 && /"statusCode"\s*:\s*"404"|not.?found/i.test(text) ? 404 : res.status;
    return new StorageError(`Supabase storage ${what} failed (${res.status}): ${text.slice(0, 300)}`, status);
  }
}

function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Content sniffing for the image formats we accept — the client-supplied
 * mimetype/extension is never trusted (a renamed .exe must not land on the CDN).
 */
export function sniffImageType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
