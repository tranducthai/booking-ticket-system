import { api } from "./client";

export type MediaKind = "banner" | "logo" | "zone-map" | "avatar" | "artist" | "content";

export const mediaApi = {
  config: () => api.get<{ uploadEnabled: boolean; maxBytes: number }>("/event/media/config").then((r) => r.data),

  /** Uploads to Supabase Storage via event-service; resolves to the public CDN URL. */
  uploadImage: (file: File, kind: MediaKind) => {
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    return api.post<{ url: string }>("/event/media/images", body).then((r) => r.data.url);
  },
};
