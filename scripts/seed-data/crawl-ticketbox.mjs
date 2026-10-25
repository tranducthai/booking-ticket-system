#!/usr/bin/env node
/**
 * Reads the schema.org `Event` JSON-LD that public ticketbox.vn event pages
 * publish for search engines (name, start/end, venue, organizer, lowest
 * price) and writes it, with the page URL and fetch time, to
 * ticketbox-events.json — the raw record real-events.json is built from.
 * Event pages are allowed by ticketbox.vn/robots.txt; requests are spaced
 * out. Descriptions and posters are NOT taken (copyrighted) — seed text is
 * written separately and images are freely licensed (see real-events.json).
 *
 * Usage: node scripts/seed-data/crawl-ticketbox.mjs <event-url> [...]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = new URL("./ticketbox-events.json", import.meta.url);
const urls = process.argv.slice(2);
const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { about: "", events: {} };
store.about =
  "Raw schema.org Event data read from public ticketbox.vn event pages (JSON-LD for search engines). Times are UTC as published. Only facts are kept — no description text, no images.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const url of urls) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (booking-ticket-system demo seed)" } });
  const html = await res.text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  });
  const ev = blocks.find((b) => b && b["@type"] === "Event");
  if (!ev) {
    console.log("no Event data:", url);
    continue;
  }
  const slug = new URL(url).pathname.replace(/^\//, "");
  store.events[slug] = {
    url,
    fetchedAt: new Date().toISOString(),
    name: ev.name?.replace(/^TicketBox \| /, ""),
    startDate: ev.startDate,
    endDate: ev.endDate,
    status: ev.eventStatus?.split("/").pop(),
    venue: ev.location?.name,
    address: ev.location?.address?.streetAddress,
    organizer: ev.organizer?.name,
    performer: Array.isArray(ev.performer) ? ev.performer.map((p) => p.name) : ev.performer?.name,
    lowPrice: ev.offers?.lowPrice ?? null,
    availability: ev.offers?.availability?.split("/").pop(),
  };
  console.log(`${store.events[slug].startDate}  ${store.events[slug].name}  | ${store.events[slug].venue} | từ ${store.events[slug].lowPrice}`);
  await sleep(3000);
}

writeFileSync(OUT, JSON.stringify(store, null, 2));
