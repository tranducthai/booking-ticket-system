#!/usr/bin/env node
/**
 * Populates a running local environment (api-gateway on :3000 + all
 * downstream services + infra) with a realistic demo dataset so a human can
 * open apps/web and actually have something to click through: categories,
 * organizers, events built from scripts/seed-data/real-events.json (real
 * public listings crawled with their sources, plus a few clearly-marked
 * placeholders), ticket types, seat maps, discount codes, and a handful of
 * completed / abandoned / failed / refunded / free orders.
 *
 * Talks to the system exactly the way apps/web does — HTTP through the
 * gateway — so every write goes through the same validation and sagas a
 * real user would trigger. Nothing here touches a database directly.
 *
 * Usage:  node scripts/seed-demo-data.mjs
 *         node scripts/seed-demo-data.mjs --only=kosmik,qvth   # add just these events
 *           (keys from real-events.json) on top of existing data — no orders,
 *           no membership plans; artists are reused by name.
 * Needs:  infra up (pnpm infra:up) + all 7 backend services running on
 *         their usual ports, api-gateway reachable at BASE_URL below.
 *
 * Safe to re-run: users/categories are looked up before being created, so
 * reruns won't duplicate accounts or categories — they WILL add another
 * batch of events and orders on top of whatever already exists, which is
 * fine for "give me more test data" but means this isn't a full reset.
 */

import { readFileSync } from "node:fs";

const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",").filter(Boolean);

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo@12345";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Account avatars: picsum.photos serves a stable image per seed string, so
// re-runs keep the same pictures. Event images are real photos per topic —
// see IMG in main().
const avatarUrl = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/300`;

/**
 * Thin wrapper: throws with the response body on any non-2xx so failures are
 * loud and specific instead of a generic "fetch failed". Retries on 429 —
 * the gateway's own /auth/login limiter (5/min/IP, docs/spec/12-resilience-
 * and-failure-design.md) is easy for a script doing dozens of logins in a
 * burst to trip; that's the limiter doing its job, not a real failure.
 */
async function api(method, path, { token, body, headers } = {}, retriesLeft = 3) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual", // mock-complete 303-redirects; we only care that the call landed
  });
  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "5");
    console.log(`  … rate-limited on ${method} ${path}, waiting ${retryAfter}s`);
    await sleep((retryAfter + 1) * 1000);
    return api(method, path, { token, body, headers }, retriesLeft - 1);
  }
  if (res.status >= 300 && res.status < 400) return { status: res.status };
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return json;
}

/** Register if the email is free, otherwise log in with PASSWORD. Returns { accessToken, user }. */
async function registerOrLogin(email, fullName, password = PASSWORD) {
  try {
    return await api("POST", "/user/auth/register", { body: { email, password, fullName } });
  } catch (err) {
    if (!String(err.message).includes("409")) throw err;
    return api("POST", "/user/auth/login", { body: { email, password } });
  }
}

/** Same idea, but for the well-known accounts created during earlier manual E2E testing (password123, may already be ADMIN/ORGANIZER). */
async function loginKnownOrSeedFresh(email, fullName, fallbackPassword = "password123") {
  try {
    return await api("POST", "/user/auth/login", { body: { email, password: fallbackPassword } });
  } catch {
    // Fresh database: create the well-known account with the password the closing message advertises.
    return registerOrLogin(email, fullName, fallbackPassword);
  }
}

async function ensureOrganizer(adminToken, email, fullName, knownPassword) {
  // Figure out which password actually works for this account first — an
  // account that already existed (e.g. organizer@test.com from earlier
  // manual testing) uses knownPassword; a brand-new one uses PASSWORD.
  let password = PASSWORD;
  let auth;
  if (knownPassword) {
    try {
      auth = await api("POST", "/user/auth/login", { body: { email, password: knownPassword } });
      password = knownPassword;
    } catch {
      auth = await registerOrLogin(email, fullName, knownPassword);
      password = knownPassword;
    }
  } else {
    auth = await registerOrLogin(email, fullName);
  }
  if (auth.user.role === "ORGANIZER" || auth.user.role === "ADMIN") return auth;
  await api("PATCH", `/user/users/${auth.user.id}/verify-organizer`, { token: adminToken });
  // The JWT minted above still carries the pre-promotion role claim (the
  // gateway trusts the token's role, not a fresh DB read) — log in again so
  // every call below actually authenticates as ORGANIZER.
  return api("POST", "/user/auth/login", { body: { email, password } });
}

async function setAvatar(token, seed) {
  await api("PATCH", "/user/users/me", { token, body: { avatarUrl: avatarUrl(seed) } });
}

async function ensureCategory(adminToken, existing, name, slug) {
  const found = existing.find((c) => c.slug === slug);
  if (found) return found;
  return api("POST", "/event/categories", { token: adminToken, body: { name, slug } });
}

async function createEvent(token, dto) {
  return api("POST", "/event/events", { token, body: dto });
}

/** Poll GET /booking/orders/:id (as the owning customer) until the saga lands on one of `targets`, or give up. */
async function waitForOrderStatus(token, orderId, targets, { tries = 15, intervalMs = 700 } = {}) {
  for (let i = 0; i < tries; i++) {
    const order = await api("GET", `/booking/orders/${orderId}`, { token });
    if (targets.includes(order.status)) return order;
    await sleep(intervalMs);
  }
  const last = await api("GET", `/booking/orders/${orderId}`, { token });
  console.warn(`  ! order ${orderId} still ${last.status} after ${tries} polls (expected one of ${targets.join(", ")})`);
  return last;
}

async function main() {
  console.log(`Seeding demo data into ${BASE_URL} ...\n`);

  // ---- 1. Admin -----------------------------------------------------
  const admin = await loginKnownOrSeedFresh("admin@test.com", "Quản trị viên");
  if (admin.user.role !== "ADMIN") {
    console.warn(
      `! admin@test.com exists but is role=${admin.user.role}, not ADMIN — this script can't self-promote the ` +
        `first admin (no public API for that). Set it once with e.g.:\n` +
        `  UPDATE "User" SET role='ADMIN' WHERE email='admin@test.com';  -- against the user-service DB\n` +
        `and re-run.`,
    );
    process.exit(1);
  }
  console.log(`✓ admin: ${admin.user.email}`);

  // ---- 2. Categories --------------------------------------------------
  const existingCategories = await api("GET", "/event/categories");
  const categoryDefs = [
    ["Âm nhạc", "am-nhac"],
    ["Sân khấu & Nghệ thuật", "san-khau-nghe-thuat"],
    ["Thể thao", "the-thao"],
    ["Hội thảo & Workshop", "hoi-thao-workshop"],
    ["Gia đình & Thiếu nhi", "gia-dinh-thieu-nhi"],
  ];
  const categories = {};
  for (const [name, slug] of categoryDefs) {
    categories[slug] = await ensureCategory(admin.accessToken, existingCategories, name, slug);
  }
  console.log(`✓ categories: ${Object.keys(categories).join(", ")}`);

  // ---- 3. Organizers ----------------------------------------------------
  const vnstage = await ensureOrganizer(admin.accessToken, "organizer@test.com", "VNStage Live", "password123");
  const soundwave = await ensureOrganizer(admin.accessToken, "soundwave.organizer@demo.local", "SoundWave Concerts");
  const arena = await ensureOrganizer(admin.accessToken, "arena.organizer@demo.local", "Arena Sports Vietnam");
  const artspace = await ensureOrganizer(admin.accessToken, "artspace.organizer@demo.local", "ArtSpace Productions");
  await setAvatar(vnstage.accessToken, "vnstage-live");
  await setAvatar(soundwave.accessToken, "soundwave-concerts");
  await setAvatar(arena.accessToken, "arena-sports-vietnam");
  await setAvatar(artspace.accessToken, "artspace-productions");
  console.log(`✓ organizers: VNStage Live, SoundWave Concerts, Arena Sports Vietnam, ArtSpace Productions (avatars set)`);

  // ---- 4. Customers -------------------------------------------------
  const customerNames = [
    ["customer@test.com", "Nguyễn Văn A", "password123"],
    ["minh.nguyen@demo.local", "Nguyễn Hoàng Minh"],
    ["lan.tran@demo.local", "Trần Thị Lan"],
    ["hoa.pham@demo.local", "Phạm Thị Hoa"],
    ["duc.le@demo.local", "Lê Anh Đức"],
    ["mai.vo@demo.local", "Võ Thị Mai"],
    ["tuan.hoang@demo.local", "Hoàng Minh Tuấn"],
    ["linh.dang@demo.local", "Đặng Thùy Linh"],
  ];
  const customers = {};
  for (const [email, fullName, knownPassword] of customerNames) {
    customers[email] = knownPassword
      ? await loginKnownOrSeedFresh(email, fullName, knownPassword)
      : await registerOrLogin(email, fullName);
    await setAvatar(customers[email].accessToken, email);
  }
  console.log(`✓ customers: ${Object.keys(customers).length} accounts ready (avatars set)`);

  // ---- 5. Events ------------------------------------------------------
  console.log("\nCreating events...");

  // Events come from scripts/seed-data/real-events.json: crawled from public
  // ticketing pages (source + URLs + crawl date), with every value the
  // sources didn't give listed under `assumptions`. Images are freely
  // licensed photos picked by hand to match each event (license, author and
  // source page recorded per image) — never the official poster.
  const DATA = JSON.parse(readFileSync(new URL("./seed-data/real-events.json", import.meta.url), "utf8"));
  const IMG = DATA.images;
  const ORGANIZERS = { vnstage, soundwave, arena, artspace };
  const ZONE_COLORS = ["#db2777", "#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c"];

  /** "Giới thiệu" as the rich-text editor would produce it: a colored lead, headed sections, an inline photo. */
  function richDescription({ lead, color = "#7c3aed", sections = [], image }) {
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let html = `<p><span style="color: ${color}; font-size: 18px"><strong>${esc(lead)}</strong></span></p>`;
    for (const s of sections) {
      html += `<h2>${esc(s.title)}</h2>`;
      if (s.text) html += `<p>${esc(s.text)}</p>`;
      if (s.items) html += `<ul>${s.items.map((i) => `<li><p>${esc(i)}</p></li>`).join("")}</ul>`;
    }
    if (image) html += `<img src="${image}" alt="">`;
    return html;
  }

  /** Builds the event page text from the crawled facts only — nothing invented beyond what `assumptions` admits. */
  function describe(entry, tiers) {
    const s = entry.source ?? {};
    const sections = [];
    if (s.program) sections.push({ title: "Chương trình", items: s.program });
    const credits = [
      ...(s.artists?.length ? [`Nghệ sĩ: ${s.artists.join(", ")}`] : []),
      ...(s.conductor ? [`Chỉ huy: ${s.conductor}`] : []),
      ...(s.soloists?.length ? [`Độc tấu/độc xướng: ${s.soloists.join(", ")}`] : []),
      ...(s.credits ? [`Đạo diễn: ${s.credits.director}`, `Biên đạo: ${s.credits.choreographers.join(", ")}`] : []),
      ...(s.mc ? [`MC: ${s.mc}`] : []),
    ];
    if (credits.length) sections.push({ title: "Thực hiện", items: credits });
    if (s.highlights) sections.push({ title: "Điểm nhấn", items: s.highlights });
    if (s.included) sections.push({ title: "Bao gồm", items: s.included });
    const info = [
      ...(s.schedule ? [`Lịch: ${s.schedule}`] : []),
      ...(s.gates ? [s.gates] : []),
      ...(s.dates?.length > 1 ? [`Các suất diễn: ${s.dates.map((d) => new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })).join(", ")}`] : []),
      ...(s.distances ? [`Cự ly: ${s.distances.join(", ")}`] : []),
      ...(s.start && !s.start.startsWith("20") ? [`Xuất phát: ${s.start}`] : []),
      ...(s.finish ? [`Về đích: ${s.finish}`] : []),
      ...(s.discounts ? [`Ưu đãi: ${s.discounts}`] : []),
      ...(s.groupDiscount ? [`Ưu đãi: ${s.groupDiscount}`] : []),
      ...(s.ageLimit ? [s.ageLimit] : []),
      ...(s.phone ? [`Điện thoại đặt chỗ: ${s.phone}`] : []),
    ];
    const soldOut = (s.tiers ?? []).filter((t) => t.soldOut).map((t) => t.name);
    if (soldOut.length) info.push(`Đã bán hết: ${soldOut.join(", ")}`);
    if (info.length) sections.push({ title: "Thông tin", items: info });
    if (s.urls?.length) {
      sections.push({ title: "Nguồn tham khảo", text: `Thông tin tổng hợp ngày ${DATA.crawledAt} từ ${[...new Set(s.urls.map((u) => new URL(u).hostname))].join(", ")} — dữ liệu demo, vui lòng đối chiếu kênh chính thức của ban tổ chức.` });
    }
    // CC BY / BY-SA / BY-ND photos must credit their author.
    const photoCredits = entry.seed.images
      .map((k) => IMG[k])
      .filter((img) => img.license !== "CC0")
      .map((img) => `${img.creator ?? "Wikimedia Commons"} (${img.license})`);
    if (photoCredits.length) sections.push({ title: "Ảnh minh hoạ", text: [...new Set(photoCredits)].join(" · ") });
    const lead = s.summary ?? entry.basis ?? `${entry.seed.title ?? s.title}`;
    void tiers;
    return richDescription({ lead, color: ZONE_COLORS[(entry.key.length * 7) % ZONE_COLORS.length], sections, image: IMG[entry.seed.images?.[1]]?.url });
  }

  function tiersOf(entry) {
    const from = entry.seed.copyTiersFrom ? DATA.events.find((e) => e.key === entry.seed.copyTiersFrom) : entry;
    const raw = (from.seed.tiers ?? from.source?.tiers ?? []).filter((t) => !t.soldOut);
    const qty = from.seed.quantities ?? [];
    return raw.map((t, i) => ({ name: t.name, price: t.price, quantity: qty[i] ?? 100 }));
  }

  function canvasOf(entry, tiers) {
    const c = entry.seed.canvas;
    if (!c) return undefined;
    const skip = new Set(c.aisles ?? []);
    return {
      canvas: { rows: c.rows, cols: c.cols, stageLabel: c.stage },
      zones: Object.entries(c.zones).map(([name, rects], i) => {
        const tier = tiers.find((t) => t.name === name);
        if (!tier) throw new Error(`${entry.key}: zone "${name}" has no tier price`);
        const cells = [];
        for (const [r0, r1, c0, c1] of rects) for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) if (!skip.has(col)) cells.push({ r, c: col });
        return { name, price: tier.price, color: ZONE_COLORS[i % ZONE_COLORS.length], cells };
      }),
    };
  }

  // Refund rules are this demo platform's setting, not taken from the sources
  // (most real listings are non-refundable): enabled on the theatre/classical
  // nights so the per-ticket refund flow has something to run against.
  const REFUNDABLE = new Set(["mahler", "nguyenDu", "doShow"]);
  const STANDARD_REFUND = {
    customerRefundable: true,
    tiers: [
      { minHoursBefore: 168, percent: 80 },
      { minHoursBefore: 72, percent: 50 },
      { minHoursBefore: 0, percent: 0 },
    ],
    evidenceRequiredFor: ["MEDICAL"],
  };

  async function buildFromData(entry) {
    const { seed, source = {} } = entry;
    const organizer = ORGANIZERS[seed.organizerAccount];
    const tiers = tiersOf(entry);
    const seatCanvas = seed.ticketMode === "SEATMAP" ? canvasOf(entry, tiers) : undefined;
    const street = seed.street ?? source.address ?? "";
    const event = await createEvent(organizer.accessToken, {
      categoryId: categories[seed.category].id,
      title: seed.title ?? source.title,
      description: describe(entry, tiers),
      bannerUrl: IMG[seed.images[0]].url,
      galleryUrls: seed.images.slice(1).map((k) => IMG[k].url),
      venueName: seed.venueName ?? source.venue,
      venueAddress: [street, seed.ward, seed.province].filter(Boolean).join(", "),
      province: seed.province,
      ward: seed.ward || undefined,
      streetAddress: street,
      startTime: new Date(seed.startTime ?? source.start).toISOString(),
      endTime: new Date(seed.end).toISOString(),
      ...(seed.salesEndTime ? { salesEndTime: new Date(seed.salesEndTime).toISOString() } : {}),
      ticketMode: seed.ticketMode,
      organizerName: source.organizer ?? organizer.user.fullName,
      ...(seed.minAge != null ? { minAge: seed.minAge } : {}),
      ...(seed.maxTicketsPerAccount ? { maxTicketsPerAccount: seed.maxTicketsPerAccount } : {}),
      ...(seed.memberBenefits ? { memberBenefits: true } : {}),
      refundPolicy: REFUNDABLE.has(entry.key) ? STANDARD_REFUND : { customerRefundable: false, tiers: [] },
    });
    const ticketTypes = [];
    if (seed.ticketMode === "GENERAL") {
      for (const t of tiers) {
        ticketTypes.push(await api("POST", `/event/events/${event.id}/ticket-types`, { token: organizer.accessToken, body: { name: t.name, price: t.price, quantityTotal: t.quantity } }));
      }
    } else if (seatCanvas) {
      await api("POST", `/event/events/${event.id}/seat-map`, { token: organizer.accessToken, body: seatCanvas });
    }
    if (seed.discount) await api("POST", `/event/events/${event.id}/discount-codes`, { token: organizer.accessToken, body: seed.discount });
    if (seed.status !== "DRAFT") await api("POST", `/event/events/${event.id}/submit`, { token: organizer.accessToken });
    if (seed.status === "PUBLISHED") await api("PATCH", `/event/events/${event.id}/approve`, { token: admin.accessToken });
    if (seed.status === "REJECTED") await api("PATCH", `/event/events/${event.id}/reject`, { token: admin.accessToken, body: { reason: seed.rejectReason } });
    if (seed.highDemand) await api("PATCH", `/event/events/${event.id}/high-demand`, { token: organizer.accessToken, body: { enabled: true } });
    console.log(`  - [${seed.status}]${entry.generated ? " (mô phỏng)" : ""} ${event.title}`);
    return { ...event, key: entry.key, organizer, highDemand: !!seed.highDemand, ticketTypes };
  }

  const selected = ONLY ? DATA.events.filter((e) => ONLY.includes(e.key)) : DATA.events;
  if (ONLY && selected.length !== ONLY.length) throw new Error(`unknown --only key(s): ${ONLY.filter((k) => !selected.some((e) => e.key === k)).join(", ")}`);
  const events = {};
  for (const entry of selected) events[entry.key] = await buildFromData(entry);
  console.log(`✓ events: ${selected.length} (${selected.filter((e) => !e.generated).length} theo nguồn thật, ${selected.filter((e) => e.generated).length} mô phỏng) — xem scripts/seed-data/real-events.json`);

  // ---- 5.5 Artists ----------------------------------------------------
  // The real performers named by the sources, attached to the events they
  // play. No avatar: an official photo isn't ours to reuse.
  console.log("\nCreating artists...");
  const artists = {};
  for (const entry of selected) {
    const names = entry.source?.artists ?? (entry.seed.copyTiersFrom ? DATA.events.find((e) => e.key === entry.seed.copyTiersFrom).source.artists : []) ?? [];
    for (const name of names) {
      if (!artists[name]) {
        // Reuse an artist already in the directory (a rerun, or --only on top of existing data).
        const found = (await api("GET", `/event/artists?q=${encodeURIComponent(name)}&limit=50`)).data.find((a) => a.name === name);
        artists[name] = found ?? (await api("POST", "/event/artists", { token: events[entry.key].organizer.accessToken, body: { name } }));
        if (!artists[name].isVerified) await api("PATCH", `/event/artists/${artists[name].id}/verify`, { token: admin.accessToken });
      }
      await api("POST", `/event/events/${events[entry.key].id}/artists`, { token: events[entry.key].organizer.accessToken, body: { artistId: artists[name].id } });
    }
  }
  console.log(`✓ artists: ${Object.keys(artists).length} (from the sources' line-ups), attached to their events`);

  if (ONLY) {
    console.log("\n✓ Added the selected events (--only): no membership plans or orders created.");
    return;
  }

  // Membership cards are a demo of this platform's feature — not something the artists offer.
  await api("PUT", `/event/artists/${artists["Thanh Lam"].id}/membership-plan`, {
    token: admin.accessToken,
    body: { name: "Thẻ thành viên Thanh Lam (demo)", price: 199000, durationDays: 365, discountPercent: 10, presaleHours: 48, benefits: "- Ưu tiên check-in cổng riêng" },
  });
  await api("PUT", `/event/artists/${artists["Phan Mạnh Quỳnh"].id}/membership-plan`, {
    token: admin.accessToken,
    body: { name: "Thẻ thành viên Phan Mạnh Quỳnh (demo)", price: 0, durationDays: 180, discountPercent: 5, presaleHours: 24 },
  });
  console.log("✓ membership cards (demo): Thanh Lam (paid), Phan Mạnh Quỳnh (free); member benefits on Ký ức Hà Nội");

  // Artist page "Bài đăng" — demo posts (written by the admin, as the platform would on an artist's behalf).
  await api("POST", `/event/artists/${artists["Thanh Lam"].id}/posts`, {
    token: admin.accessToken,
    body: { content: "Tháng 11 này Thanh Lam có hai đêm diễn tại Hà Nội: Diễm Xưa Giữa Mùa Thu (13/11, Trung tâm Nghệ thuật Âu Cơ) và Ký Ức Hà Nội (21/11, Cung Hữu nghị Việt Xô). Hẹn gặp mọi người! (bài đăng demo)" },
  });
  await api("POST", `/event/artists/${artists["Thanh Lam"].id}/posts`, {
    token: admin.accessToken,
    body: { content: "Dành cho thành viên: cổng check-in riêng mở sớm 30 phút trước giờ diễn ở cả hai đêm. (bài đăng demo)", membersOnly: true },
  });

  console.log("\nCreating orders (buy / abandon / fail / refund / free)...");

  // ---- 6. Orders — a spread of real outcomes -----------------------
  const cust = (email) => customers[email];

  /**
   * High-demand events only accept holds from an admitted waiting-room
   * session (booking-service checks it) — queue like a real browser would.
   */
  async function queueSessionFor(event) {
    if (!event.highDemand) return {};
    const sessionId = crypto.randomUUID();
    let status = await api("POST", `/event/events/${event.id}/waiting-room/join`, { body: { sessionId } });
    for (let i = 0; i < 30 && !status.admitted; i++) {
      await sleep(1000);
      status = await api("GET", `/event/events/${event.id}/waiting-room/status?sessionId=${sessionId}`);
    }
    if (!status.admitted) throw new Error(`waiting room never admitted the seeder for "${event.title}"`);
    return { "x-queue-session": sessionId };
  }

  async function pay(accessToken, order, method, outcome) {
    const payment = await api("POST", "/payment/payments", { token: accessToken, body: { orderId: order.id, method } });
    await api("POST", `/payment/payments/${payment.paymentId}/mock-complete`, { token: accessToken, body: { outcome } });
    return waitForOrderStatus(accessToken, order.id, outcome === "success" ? ["PAID", "TICKET_ISSUED"] : ["EXPIRED"]);
  }

  async function buyGeneral(customerEmail, event, ticketTypeName, quantity, { discountCode, outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const ticketType = event.ticketTypes.find((t) => t.name === ticketTypeName);
    const order = await api("POST", "/booking/cart/hold", {
      token: accessToken,
      headers: await queueSessionFor(event),
      body: { eventId: event.id, items: [{ ticketTypeId: ticketType.id, quantity }] },
    });
    if (discountCode) await api("POST", `/booking/orders/${order.id}/apply-discount`, { token: accessToken, body: { code: discountCode } });
    const finalStatus = await pay(accessToken, order, "vnpay", outcome);
    console.log(`  - ${customerEmail} bought ${quantity}x "${ticketTypeName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  async function buySeats(customerEmail, event, zoneName, seatCount, { outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const layout = await api("GET", `/event/events/${event.id}/seat-map/layout`, { token: accessToken });
    const zone = layout.zones.find((z) => z.name === zoneName);
    const state = await api("GET", `/event/events/${event.id}/seat-map/state`, { token: accessToken });
    const seats = zone.seats.filter((s) => !state[s.id] || state[s.id] === "AVAILABLE").slice(0, seatCount);
    const order = await api("POST", "/booking/cart/hold", { token: accessToken, body: { eventId: event.id, items: seats.map((s) => ({ seatId: s.id })) } });
    const finalStatus = await pay(accessToken, order, "momo", outcome);
    console.log(`  - ${customerEmail} bought ${seatCount} seat(s) in "${zoneName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  await buySeats("customer@test.com", events.mahler, "Hạng A", 2);
  await buySeats("minh.nguyen@demo.local", events.doShow, "Gọi Dó", 1);
  await buySeats("lan.tran@demo.local", events.nguyenDu, "Lưu Hương", 2);
  await buySeats("hoa.pham@demo.local", events.muaRoi, "Hạng 1", 2);
  await buyGeneral("customer@test.com", events.kyUc1, "THU HÀ NỘI", 2);
  await buyGeneral("minh.nguyen@demo.local", events.hanoiMidnight, "21km (Half Marathon)", 1);
  await buyGeneral("lan.tran@demo.local", events.candle, "Workshop làm nến thơm 150g", 4, { discountCode: "NHOM4" });

  const refundable = await buySeats("duc.le@demo.local", events.doShow, "Dó Mơn", 1);
  {
    const { accessToken } = cust("duc.le@demo.local");
    // Refunds need issued tickets (they get locked while the request is open).
    await waitForOrderStatus(accessToken, refundable.id, ["TICKET_ISSUED"]);
    const refund = await api("POST", "/payment/refunds", {
      token: accessToken,
      body: { orderId: refundable.id, reasonCategory: "SCHEDULE_CONFLICT", reason: "Không thể tham dự do lịch trình thay đổi." },
    });
    await api("PATCH", `/payment/refunds/${refund.id}/approve`, { token: artspace.accessToken, body: {} });
    console.log(`  - duc.le@demo.local requested an 80% refund on order ${refundable.id}, approved by the organizer`);
  }

  // Free registration (0đ tickets): hold, then confirm without a payment.
  {
    const { accessToken } = cust("hoa.pham@demo.local");
    const ticketType = events.freeTalk.ticketTypes[0];
    const order = await api("POST", "/booking/cart/hold", { token: accessToken, body: { eventId: events.freeTalk.id, items: [{ ticketTypeId: ticketType.id, quantity: 1 }] } });
    await api("POST", `/booking/orders/${order.id}/confirm-free`, { token: accessToken });
    console.log(`  - hoa.pham@demo.local registered for free on "${events.freeTalk.title}"`);
  }

  // Abandoned cart: hold created, never paid — left for the sweeper / "expired" UI state.
  {
    const { accessToken } = cust("mai.vo@demo.local");
    const ticketType = events.hanoiMidnight.ticketTypes[0];
    await api("POST", "/booking/cart/hold", { token: accessToken, body: { eventId: events.hanoiMidnight.id, items: [{ ticketTypeId: ticketType.id, quantity: 1 }] } });
    console.log(`  - mai.vo@demo.local holds a cart on "${events.hanoiMidnight.title}" and never pays (abandoned)`);
  }

  // "Bán lại vé": two customers resell a ticket they can't use (at or below face value).
  async function resell(customerEmail, event, price) {
    const { accessToken } = cust(customerEmail);
    for (let i = 0; i < 15; i++) {
      const tickets = (await api("GET", `/ticket/tickets/mine?eventId=${event.id}`, { token: accessToken })).data.filter((t) => t.status === "ISSUED");
      if (tickets.length > 0) {
        const listing = await api("POST", "/booking/resale/listings", { token: accessToken, body: { ticketId: tickets[0].id, price } });
        console.log(`  - ${customerEmail} resells a ticket of "${event.title}" (${listing.code}, ${price}đ)`);
        return;
      }
      await sleep(700);
    }
  }
  await resell("customer@test.com", events.mahler, 550000);
  await resell("lan.tran@demo.local", events.nguyenDu, 600000);

  await buyGeneral("tuan.hoang@demo.local", events.diwali, "Regular", 1, { outcome: "fail" });
  await buyGeneral("linh.dang@demo.local", events.daQuang, "Thổ Quang", 2);

  console.log("\n✓ Seed complete.");
  console.log(`
Log in at the frontend (usually http://localhost:5173) with:
  Admin:      admin@test.com / password123
  Organizer:  organizer@test.com / password123  (VNStage Live)
  Customer:   customer@test.com / password123
  Other demo accounts: <name>@demo.local / ${PASSWORD}
`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
