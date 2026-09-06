/** Category slugs where an artist lineup makes sense — sports/workshop events don't have one. Matched loosely (see usage) since seeded category names/slugs vary ("Music", "Âm nhạc", "Sân khấu & Nghệ thuật"). */
export const ARTIST_LINEUP_CATEGORY_SLUGS = ["music", "am-nhac", "san-khau-nghe-thuat", "nhac-song"];

export function categorySupportsLineup(slug: string | undefined): boolean {
  if (!slug) return false;
  return ARTIST_LINEUP_CATEGORY_SLUGS.some((s) => slug.includes(s));
}
