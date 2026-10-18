/**
 * "Có thể bạn cũng thích" — a small hybrid recommender, pure functions only
 * (no DB, no I/O) so the ranking is unit-testable. RecommendationsService
 * feeds it the candidate events and the favorites matrix.
 *
 *   score = 0.50 · content   TF-IDF cosine over weighted fields
 *         + 0.25 · collab    item-item cosine over who favorited what
 *         + 0.10 · sameCity
 *         + 0.10 · priceSim  1 - |log price ratio| (clamped)
 *         + 0.05 · soonness  sooner upcoming shows first
 *
 * then a light diversity pass so one organizer can't fill every slot.
 */

export interface RecItem {
  id: string;
  title: string;
  description: string | null;
  categorySlug: string | null;
  organizerId: string;
  artistNames: string[];
  city: string | null;
  minPrice: number | null;
  startTime: Date;
}

export const WEIGHTS = { content: 0.5, collab: 0.25, city: 0.1, price: 0.1, soon: 0.05 } as const;

/** Field weights for the content vector: a shared category or artist says far more than a shared word. */
const FIELD_WEIGHT = { category: 3, artist: 3, organizer: 1.5, city: 1, title: 2, description: 1 } as const;

const STOPWORDS = new Set(
  (
    "va cua cho voi cac nhung mot la co khong duoc trong tai tu den the nay do khi se da dang ve ra vao len theo " +
    "nguoi nam ngay thang gio chung toi se cung rat hon nhat moi tat ca hay hoac neu thi ma nen boi " +
    "the and of to in a an for with on at by from is are be this that live show"
  ).split(" "),
);

/** Lowercase, strip Vietnamese diacritics (đ -> d), drop markdown/punctuation, split, remove stopwords and 1-char tokens. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** "1 Tràng Tiền, Hoàn Kiếm, Hà Nội" -> "ha noi" (last address segment, normalized); also folds TP.HCM spellings. */
export function cityOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const last = address.split(",").pop()!.trim();
  const norm = tokenize(last).join(" ");
  if (/^(tp )?(hcm|ho chi minh|sai gon|saigon)/.test(norm) || norm.includes("ho chi minh")) return "ho chi minh";
  return norm || null;
}

type Vector = Map<string, number>;

function termCounts(item: RecItem): Vector {
  const v: Vector = new Map();
  const add = (term: string, w: number) => v.set(term, (v.get(term) ?? 0) + w);
  if (item.categorySlug) add(`cat:${item.categorySlug}`, FIELD_WEIGHT.category);
  for (const a of item.artistNames) add(`artist:${tokenize(a).join("_")}`, FIELD_WEIGHT.artist);
  add(`org:${item.organizerId}`, FIELD_WEIGHT.organizer);
  if (item.city) add(`city:${item.city}`, FIELD_WEIGHT.city);
  for (const t of tokenize(item.title)) add(t, FIELD_WEIGHT.title);
  for (const t of tokenize(item.description)) add(t, FIELD_WEIGHT.description);
  return v;
}

/** TF-IDF vectors for every item; IDF is computed over this same corpus (the candidate pool + the anchor). */
export function tfidfVectors(items: RecItem[]): Map<string, Vector> {
  const counts = new Map(items.map((it) => [it.id, termCounts(it)]));
  const df = new Map<string, number>();
  for (const v of counts.values()) for (const term of v.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const n = items.length;
  const out = new Map<string, Vector>();
  for (const [id, v] of counts) {
    const w: Vector = new Map();
    for (const [term, tf] of v) w.set(term, (1 + Math.log(tf)) * Math.log(1 + n / (df.get(term) ?? 1)));
    out.set(id, w);
  }
  return out;
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y !== undefined) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * Item-item collaborative signal from favorites: cosine between the two
 * events' sets of users = |A ∩ B| / sqrt(|A|·|B|). 0 when either has no fans.
 */
export function collabSimilarity(fansByEvent: Map<string, Set<string>>, a: string, b: string): number {
  const fa = fansByEvent.get(a);
  const fb = fansByEvent.get(b);
  if (!fa?.size || !fb?.size) return 0;
  let both = 0;
  for (const u of fa) if (fb.has(u)) both++;
  return both / Math.sqrt(fa.size * fb.size);
}

/** 1 for equal prices, falling to 0 at a 10x difference (log scale — 200k vs 300k is close, 200k vs 2M is not). */
export function priceSimilarity(a: number | null, b: number | null): number {
  if (!a || !b) return 0;
  return Math.max(0, 1 - Math.abs(Math.log10(a / b)));
}

/** 1 for a show today, decaying to ~0 three months out. */
export function soonness(start: Date, now: Date): number {
  const days = (start.getTime() - now.getTime()) / 86_400_000;
  return days < 0 ? 0 : Math.exp(-days / 30);
}

export interface Scored {
  id: string;
  score: number;
  parts: { content: number; collab: number; city: number; price: number; soon: number };
}

export function recommend(
  anchor: RecItem,
  candidates: RecItem[],
  fansByEvent: Map<string, Set<string>>,
  opts: { limit: number; now?: Date; maxPerOrganizer?: number },
): Scored[] {
  const now = opts.now ?? new Date();
  const pool = candidates.filter((c) => c.id !== anchor.id);
  const vectors = tfidfVectors([anchor, ...pool]);
  const av = vectors.get(anchor.id)!;

  const scored: (Scored & { organizerId: string })[] = pool.map((c) => {
    const parts = {
      content: cosine(av, vectors.get(c.id)!),
      collab: collabSimilarity(fansByEvent, anchor.id, c.id),
      city: anchor.city && anchor.city === c.city ? 1 : 0,
      price: priceSimilarity(anchor.minPrice, c.minPrice),
      soon: soonness(c.startTime, now),
    };
    const score =
      WEIGHTS.content * parts.content + WEIGHTS.collab * parts.collab + WEIGHTS.city * parts.city + WEIGHTS.price * parts.price + WEIGHTS.soon * parts.soon;
    return { id: c.id, score, parts, organizerId: c.organizerId };
  });
  scored.sort((x, y) => y.score - x.score);

  // Diversity: at most N from one organizer in the first pass, then backfill if there aren't enough others.
  const maxPer = opts.maxPerOrganizer ?? 2;
  const perOrg = new Map<string, number>();
  const picked: Scored[] = [];
  const skipped: Scored[] = [];
  // The same show listed twice (or the anchor's own twin) is never a useful suggestion.
  const titleKey = (t: string) => tokenize(t).join(" ");
  const titleOf = new Map(pool.map((c) => [c.id, titleKey(c.title)]));
  const seenTitles = new Set([titleKey(anchor.title)]);
  for (const s of scored) {
    const key = titleOf.get(s.id)!;
    if (key && seenTitles.has(key)) continue;
    seenTitles.add(key);
    const n = perOrg.get(s.organizerId) ?? 0;
    if (n < maxPer) {
      picked.push({ id: s.id, score: s.score, parts: s.parts });
      perOrg.set(s.organizerId, n + 1);
    } else {
      skipped.push({ id: s.id, score: s.score, parts: s.parts });
    }
    if (picked.length >= opts.limit) break;
  }
  for (const s of skipped) {
    if (picked.length >= opts.limit) break;
    picked.push(s);
  }
  return picked;
}
