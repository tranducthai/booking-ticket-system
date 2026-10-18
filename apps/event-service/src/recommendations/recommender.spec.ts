import { cityOf, collabSimilarity, cosine, priceSimilarity, recommend, RecItem, tfidfVectors, tokenize } from "./recommender";

const now = new Date("2026-10-14T00:00:00Z");
const item = (over: Partial<RecItem> & { id: string }): RecItem => ({
  title: "",
  description: null,
  categorySlug: null,
  organizerId: "org-x",
  artistNames: [],
  city: null,
  minPrice: null,
  startTime: new Date("2026-10-20T12:00:00Z"),
  ...over,
});

describe("recommender building blocks", () => {
  it("tokenizes Vietnamese without diacritics and drops stopwords", () => {
    expect(tokenize("Đêm nhạc Trịnh Công Sơn và những người bạn")).toEqual(["dem", "nhac", "trinh", "cong", "son", "ban"]);
  });

  it("normalizes the city from an address", () => {
    expect(cityOf("1 Tràng Tiền, Hoàn Kiếm, Hà Nội")).toBe("ha noi");
    expect(cityOf("4 Phạm Ngọc Thạch, Quận 1, TP.HCM")).toBe("ho chi minh");
    expect(cityOf("Quận 1, Thành phố Hồ Chí Minh")).toBe("ho chi minh");
  });

  it("cosine of identical vectors is 1, of disjoint ones 0", () => {
    const v = tfidfVectors([item({ id: "a", title: "rock concert" }), item({ id: "b", title: "piano recital" })]);
    expect(cosine(v.get("a")!, v.get("a")!)).toBeCloseTo(1);
    expect(cosine(v.get("a")!, v.get("b")!)).toBeLessThan(0.3); // only the shared organizer token overlaps
  });

  it("collaborative similarity is the cosine of the two fan sets", () => {
    const fans = new Map([
      ["a", new Set(["u1", "u2", "u3", "u4"])],
      ["b", new Set(["u1", "u2"])],
    ]);
    expect(collabSimilarity(fans, "a", "b")).toBeCloseTo(2 / Math.sqrt(8));
    expect(collabSimilarity(fans, "a", "nobody")).toBe(0);
  });

  it("price similarity is log-scaled", () => {
    expect(priceSimilarity(300_000, 300_000)).toBe(1);
    expect(priceSimilarity(200_000, 300_000)).toBeGreaterThan(0.8);
    expect(priceSimilarity(200_000, 2_000_000)).toBe(0);
  });
});

describe("recommend", () => {
  const anchor = item({ id: "anchor", title: "Đêm nhạc acoustic mùa thu", categorySlug: "am-nhac", city: "ha noi", minPrice: 250_000, artistNames: ["Hà Anh Tuấn"] });
  const candidates = [
    item({ id: "same-artist", title: "Hà Anh Tuấn live", categorySlug: "am-nhac", city: "ho chi minh", minPrice: 900_000, artistNames: ["Hà Anh Tuấn"] }),
    item({ id: "acoustic-hn", title: "Acoustic night Hà Nội", categorySlug: "am-nhac", city: "ha noi", minPrice: 300_000, organizerId: "org-y" }),
    item({ id: "football", title: "V.League All-Star", categorySlug: "the-thao", city: "ho chi minh", minPrice: 150_000, organizerId: "org-z" }),
  ];

  it("ranks content-similar events above unrelated ones and never returns the anchor", () => {
    const out = recommend(anchor, [anchor, ...candidates], new Map(), { limit: 3, now });
    expect(out.map((s) => s.id)).not.toContain("anchor");
    expect(out[out.length - 1].id).toBe("football");
  });

  it("lets co-favorites lift an otherwise unrelated event", () => {
    const fans = new Map([
      ["anchor", new Set(["u1", "u2", "u3"])],
      ["football", new Set(["u1", "u2", "u3"])],
    ]);
    const without = recommend(anchor, candidates, new Map(), { limit: 3, now }).find((s) => s.id === "football")!;
    const withFans = recommend(anchor, candidates, fans, { limit: 3, now }).find((s) => s.id === "football")!;
    expect(withFans.score).toBeGreaterThan(without.score + 0.2);
  });

  it("caps one organizer's share of the slots, backfilling only when it must", () => {
    const sameOrg = Array.from({ length: 5 }, (_, i) => item({ id: `big${i}`, title: `acoustic mùa thu đêm ${i}${i}`, categorySlug: "am-nhac", organizerId: "big" }));
    const other = item({ id: "other", title: "kịch nói", categorySlug: "san-khau", organizerId: "small" });
    const out = recommend(anchor, [...sameOrg, other], new Map(), { limit: 3, now, maxPerOrganizer: 2 });
    expect(out.map((s) => s.id)).toContain("other");
    expect(out.filter((s) => s.id.startsWith("big"))).toHaveLength(2);
  });

  it("drops duplicate listings of the same show, including the anchor's twin", () => {
    const twins = [
      item({ id: "twin-of-anchor", title: "Đêm nhạc Acoustic mùa thu", categorySlug: "am-nhac" }),
      item({ id: "dup1", title: "Countdown 2027", categorySlug: "am-nhac", organizerId: "a" }),
      item({ id: "dup2", title: "COUNTDOWN 2027!", categorySlug: "am-nhac", organizerId: "b" }),
    ];
    const ids = recommend(anchor, twins, new Map(), { limit: 5, now }).map((s) => s.id);
    expect(ids).not.toContain("twin-of-anchor");
    expect(ids.filter((id) => id.startsWith("dup"))).toHaveLength(1);
  });
});
