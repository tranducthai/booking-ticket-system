#!/usr/bin/env node
/**
 * Populates a running local environment (api-gateway on :3000 + all
 * downstream services + infra) with a realistic demo dataset so a human can
 * open apps/web and actually have something to click through: categories,
 * organizers, a spread of events across every status/mode combination,
 * ticket types, seat maps, discount codes, and a handful of completed /
 * abandoned / failed / refunded orders.
 *
 * Talks to the system exactly the way apps/web does — HTTP through the
 * gateway — so every write goes through the same validation and sagas a
 * real user would trigger. Nothing here touches a database directly.
 *
 * Usage:  node scripts/seed-demo-data.mjs
 * Needs:  infra up (pnpm infra:up) + all 7 backend services running on
 *         their usual ports, api-gateway reachable at BASE_URL below.
 *
 * Safe to re-run: users/categories are looked up before being created, so
 * reruns won't duplicate accounts or categories — they WILL add another
 * batch of events and orders on top of whatever already exists, which is
 * fine for "give me more test data" but means this isn't a full reset.
 */

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "Demo@12345";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// picsum.photos serves a stable image per seed string, so re-runs keep using
// the same pictures instead of shuffling on every request. encodeURIComponent
// keeps seeds with spaces/diacritics (Vietnamese artist names) URL-safe.
const avatarUrl = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/300`;
const bannerUrl = (seed) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/675`;
const galleryUrls = (seed, count = 3) =>
  Array.from({ length: count }, (_, i) => `https://picsum.photos/seed/${encodeURIComponent(seed)}-g${i}/800/600`);

/**
 * Thin wrapper: throws with the response body on any non-2xx so failures are
 * loud and specific instead of a generic "fetch failed". Retries on 429 —
 * the gateway's own /auth/login limiter (5/min/IP, docs/spec/12-resilience-
 * and-failure-design.md) is easy for a script doing dozens of logins in a
 * burst to trip; that's the limiter doing its job, not a real failure.
 */
async function api(method, path, { token, body } = {}, retriesLeft = 3) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual", // mock-complete 303-redirects; we only care that the call landed
  });
  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "5");
    console.log(`  … rate-limited on ${method} ${path}, waiting ${retryAfter}s`);
    await sleep((retryAfter + 1) * 1000);
    return api(method, path, { token, body }, retriesLeft - 1);
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
async function registerOrLogin(email, fullName) {
  try {
    return await api("POST", "/user/auth/register", { body: { email, password: PASSWORD, fullName } });
  } catch (err) {
    if (!String(err.message).includes("409")) throw err;
    return api("POST", "/user/auth/login", { body: { email, password: PASSWORD } });
  }
}

/** Same idea, but for the well-known accounts created during earlier manual E2E testing (password123, may already be ADMIN/ORGANIZER). */
async function loginKnownOrSeedFresh(email, fullName, fallbackPassword = "password123") {
  try {
    return await api("POST", "/user/auth/login", { body: { email, password: fallbackPassword } });
  } catch {
    return registerOrLogin(email, fullName);
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
      auth = await registerOrLogin(email, fullName);
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

function daysFromNow(days, hour = 19) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
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

  async function buildEvent(organizer, dto, { ticketTypes, seatZones, discount, highDemand, submit, approve, reject } = {}) {
    const event = await createEvent(organizer.accessToken, dto);
    const createdTicketTypes = [];
    for (const tt of ticketTypes ?? []) {
      createdTicketTypes.push(await api("POST", `/event/events/${event.id}/ticket-types`, { token: organizer.accessToken, body: tt }));
    }
    if (seatZones) {
      await api("POST", `/event/events/${event.id}/seat-map`, { token: organizer.accessToken, body: { zones: seatZones } });
    }
    if (discount) {
      await api("POST", `/event/events/${event.id}/discount-codes`, { token: organizer.accessToken, body: discount });
    }
    if (submit || approve || reject) {
      await api("POST", `/event/events/${event.id}/submit`, { token: organizer.accessToken });
    }
    if (approve) {
      await api("PATCH", `/event/events/${event.id}/approve`, { token: admin.accessToken });
    }
    if (reject) {
      await api("PATCH", `/event/events/${event.id}/reject`, { token: admin.accessToken, body: { reason: reject } });
    }
    if (highDemand) {
      await api("PATCH", `/event/events/${event.id}/high-demand`, { token: organizer.accessToken, body: { enabled: true } });
    }
    console.log(`  - [${approve ? "PUBLISHED" : reject ? "REJECTED" : submit ? "PENDING_APPROVAL" : "DRAFT"}] ${dto.title}`);
    return { ...event, ticketTypes: createdTicketTypes };
  }

  const acoustic = await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Đêm Nhạc Acoustic - Mùa Thu Hà Nội",
      description: "Một đêm nhạc acoustic ấm áp giữa lòng Hà Nội, quy tụ các nghệ sĩ indie nổi bật.",
      bannerUrl: bannerUrl("acoustic-mua-thu"),
      galleryUrls: galleryUrls("acoustic-mua-thu"),
      venueName: "Nhà hát Lớn Hà Nội",
      venueAddress: "1 Tràng Tiền, Hoàn Kiếm, Hà Nội",
      startTime: daysFromNow(14),
      endTime: daysFromNow(14, 22),
      ticketMode: "GENERAL",
    },
    {
      ticketTypes: [
        { name: "Vé Thường", price: 250000, quantityTotal: 200 },
        { name: "Vé VIP", price: 500000, quantityTotal: 50 },
      ],
      discount: { code: "THUHA10", discountType: "PERCENT", value: 10, quantityTotal: 30 },
      submit: true,
      approve: true,
    },
  );

  const festival = await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "SoundWave Music Festival 2026",
      description: "Lễ hội âm nhạc lớn nhất năm với sự góp mặt của hàng loạt nghệ sĩ trong và ngoài nước.",
      bannerUrl: bannerUrl("soundwave-festival-2026"),
      galleryUrls: galleryUrls("soundwave-festival-2026"),
      venueName: "Sân vận động Mỹ Đình",
      venueAddress: "Lê Đức Thọ, Nam Từ Liêm, Hà Nội",
      startTime: daysFromNow(30),
      endTime: daysFromNow(30, 23),
      ticketMode: "SEATMAP",
    },
    {
      seatZones: [
        { name: "Khu A - Đứng", price: 300000, isGeneral: true, capacity: 500 },
        { name: "Khu B - Ngồi", price: 800000, rows: 10, seatsPerRow: 20 },
      ],
      discount: { code: "FEST50K", discountType: "FIXED", value: 50000, quantityTotal: 100 },
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Live Concert: Ban Nhạc Bức Tường",
      bannerUrl: bannerUrl("buc-tuong-live"),
      galleryUrls: galleryUrls("buc-tuong-live"),
      venueName: "Trung tâm Hội nghị Quốc gia",
      venueAddress: "57 Phạm Hùng, Nam Từ Liêm, Hà Nội",
      startTime: daysFromNow(21),
      endTime: daysFromNow(21, 22),
      ticketMode: "GENERAL",
    },
    { ticketTypes: [{ name: "Vé Thường", price: 350000, quantityTotal: 150 }], submit: true }, // left PENDING_APPROVAL on purpose
  );

  const kichNoi = await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Kịch Nói: Hồn Trương Ba Da Hàng Thịt",
      description: "Vở kịch kinh điển của Lưu Quang Vũ, dàn dựng mới.",
      bannerUrl: bannerUrl("hon-truong-ba"),
      galleryUrls: galleryUrls("hon-truong-ba"),
      venueName: "Nhà hát Kịch Việt Nam",
      venueAddress: "1 Tràng Tiền, Hoàn Kiếm, Hà Nội",
      startTime: daysFromNow(10),
      endTime: daysFromNow(10, 21),
      ticketMode: "GENERAL",
    },
    {
      ticketTypes: [
        { name: "Vé Thường", price: 200000, quantityTotal: 100 },
        { name: "Vé VIP", price: 400000, quantityTotal: 30 },
      ],
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Triển lãm Nghệ thuật Đương đại",
      bannerUrl: bannerUrl("trien-lam-duong-dai"),
      galleryUrls: galleryUrls("trien-lam-duong-dai"),
      venueName: "Bảo tàng Mỹ thuật Việt Nam",
      venueAddress: "66 Nguyễn Thái Học, Ba Đình, Hà Nội",
      startTime: daysFromNow(40),
      endTime: daysFromNow(45),
      ticketMode: "GENERAL",
    },
    { ticketTypes: [{ name: "Vé vào cửa", price: 50000, quantityTotal: 500 }] }, // left DRAFT — never submitted
  );

  const muaRoi = await buildEvent(
    artspace,
    {
      categoryId: categories["gia-dinh-thieu-nhi"].id,
      title: "Múa Rối Nước Thăng Long",
      bannerUrl: bannerUrl("mua-roi-thang-long"),
      galleryUrls: galleryUrls("mua-roi-thang-long"),
      venueName: "Nhà hát Múa rối Thăng Long",
      venueAddress: "57B Đinh Tiên Hoàng, Hoàn Kiếm, Hà Nội",
      startTime: daysFromNow(7),
      endTime: daysFromNow(7, 20),
      ticketMode: "SEATMAP",
    },
    {
      seatZones: [
        { name: "Khu Ghế Thường", price: 150000, rows: 8, seatsPerRow: 15 },
        { name: "Khu VIP", price: 250000, rows: 3, seatsPerRow: 10 },
      ],
      submit: true,
      approve: true,
    },
  );

  const vleague = await buildEvent(
    arena,
    {
      categoryId: categories["the-thao"].id,
      title: "V.League All-Star Match 2026",
      bannerUrl: bannerUrl("vleague-allstar-2026"),
      galleryUrls: galleryUrls("vleague-allstar-2026"),
      venueName: "Sân vận động Thống Nhất",
      venueAddress: "138 Đào Duy Từ, Quận 10, TP.HCM",
      startTime: daysFromNow(25),
      endTime: daysFromNow(25, 22),
      ticketMode: "SEATMAP",
    },
    {
      seatZones: [
        { name: "Khán đài A", price: 200000, rows: 15, seatsPerRow: 25 },
        { name: "Khán đài VIP", price: 600000, rows: 5, seatsPerRow: 10 },
      ],
      discount: { code: "THETHAO15", discountType: "PERCENT", value: 15, quantityTotal: 50 },
      submit: true,
      approve: true,
    },
  );

  const marathon = await buildEvent(
    arena,
    {
      categoryId: categories["the-thao"].id,
      title: "Giải Chạy Marathon Thành Phố",
      bannerUrl: bannerUrl("marathon-thanh-pho"),
      galleryUrls: galleryUrls("marathon-thanh-pho"),
      venueName: "Công viên Thống Nhất",
      venueAddress: "Quận Hai Bà Trưng, Hà Nội",
      startTime: daysFromNow(18, 6),
      endTime: daysFromNow(18, 12),
      ticketMode: "GENERAL",
    },
    {
      ticketTypes: [
        { name: "Vé 5km", price: 150000, quantityTotal: 300 },
        { name: "Vé 10km", price: 200000, quantityTotal: 300 },
        { name: "Vé 21km (Half Marathon)", price: 300000, quantityTotal: 150 },
      ],
      submit: true,
      approve: true,
    },
  );

  const workshop = await buildEvent(
    vnstage,
    {
      categoryId: categories["hoi-thao-workshop"].id,
      title: "Workshop: Kỹ năng Quản lý Dự án",
      bannerUrl: bannerUrl("workshop-quan-ly-du-an"),
      galleryUrls: galleryUrls("workshop-quan-ly-du-an"),
      venueName: "Dreamplex Q1",
      venueAddress: "195 Điện Biên Phủ, Quận 3, TP.HCM",
      startTime: daysFromNow(5, 9),
      endTime: daysFromNow(5, 17),
      ticketMode: "GENERAL",
    },
    { ticketTypes: [{ name: "Vé Tham dự", price: 300000, quantityTotal: 80 }], submit: true, approve: true },
  );

  const startup = await buildEvent(
    vnstage,
    {
      categoryId: categories["hoi-thao-workshop"].id,
      title: "Hội thảo Khởi nghiệp & Đầu tư 2026",
      bannerUrl: bannerUrl("khoi-nghiep-dau-tu-2026"),
      galleryUrls: galleryUrls("khoi-nghiep-dau-tu-2026"),
      venueName: "White Palace",
      venueAddress: "108 Phạm Văn Đồng, Thủ Đức, TP.HCM",
      startTime: daysFromNow(12, 8),
      endTime: daysFromNow(12, 17),
      ticketMode: "GENERAL",
    },
    {
      ticketTypes: [
        { name: "Vé Early Bird", price: 200000, quantityTotal: 100 },
        { name: "Vé Standard", price: 350000, quantityTotal: 200 },
      ],
      submit: true,
      approve: true,
      highDemand: true, // exercises the waiting-room flow on the frontend
    },
  );

  await buildEvent(
    vnstage,
    {
      categoryId: categories["am-nhac"].id,
      title: "Đại Nhạc Hội Countdown 2027",
      bannerUrl: bannerUrl("countdown-2027"),
      galleryUrls: galleryUrls("countdown-2027"),
      venueName: "Phố đi bộ Nguyễn Huệ",
      venueAddress: "Nguyễn Huệ, Quận 1, TP.HCM",
      startTime: daysFromNow(120, 20),
      endTime: daysFromNow(121, 1),
      ticketMode: "SEATMAP",
    },
    {
      seatZones: [
        { name: "Khu vực Đứng", price: 400000, isGeneral: true, capacity: 1000 },
        { name: "Khu VIP Ngồi", price: 1200000, rows: 6, seatsPerRow: 20 },
      ],
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Đêm nhạc Trịnh Công Sơn (đã diễn ra)",
      bannerUrl: bannerUrl("trinh-cong-son"),
      galleryUrls: galleryUrls("trinh-cong-son"),
      venueName: "Nhà Văn hóa Thanh Niên",
      venueAddress: "4 Phạm Ngọc Thạch, Quận 1, TP.HCM",
      startTime: daysFromNow(-10, 20),
      endTime: daysFromNow(-10, 23),
      ticketMode: "GENERAL",
    },
    { ticketTypes: [{ name: "Vé Thường", price: 200000, quantityTotal: 100 }], submit: true, approve: true },
  );

  await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Lễ hội Bia Craft",
      bannerUrl: bannerUrl("le-hoi-bia-craft"),
      galleryUrls: galleryUrls("le-hoi-bia-craft"),
      venueName: "Công viên 23/9",
      venueAddress: "Quận 1, TP.HCM",
      startTime: daysFromNow(15, 17),
      endTime: daysFromNow(15, 23),
      ticketMode: "GENERAL",
    },
    {
      ticketTypes: [{ name: "Vé vào cổng", price: 100000, quantityTotal: 200 }],
      reject: "Thiếu giấy phép tổ chức sự kiện ngoài trời — vui lòng bổ sung và nộp lại.",
    },
  );

  // ---- 5.5 Artists ----------------------------------------------------
  console.log("\nCreating artists...");

  async function createArtist(organizer, name, { bio, verify = false } = {}) {
    const artist = await api("POST", "/event/artists", {
      token: organizer.accessToken,
      body: { name, bio, avatarUrl: avatarUrl(name) },
    });
    if (verify) {
      await api("PATCH", `/event/artists/${artist.id}/verify`, { token: admin.accessToken });
    }
    return artist;
  }

  async function attachArtist(organizer, event, artist) {
    await api("POST", `/event/events/${event.id}/artists`, { token: organizer.accessToken, body: { artistId: artist.id } });
  }

  const mayLan = await createArtist(soundwave, "Mây Lang Thang", { bio: "Ban nhạc indie folk nổi tiếng với chất giọng mộc mạc.", verify: true });
  const dongNhi = await createArtist(soundwave, "Đông Nhi", { bio: "Ca sĩ, nhạc sĩ nhạc pop hàng đầu Việt Nam.", verify: true });
  const denVau = await createArtist(soundwave, "Đen Vâu", { bio: "Rapper, ca sĩ với phong cách gần gũi, đời thường.", verify: true });
  const hoangThuyLinh = await createArtist(soundwave, "Hoàng Thùy Linh", { bio: "Ca sĩ kết hợp âm nhạc dân gian đương đại.", verify: true });
  await createArtist(soundwave, "Vũ.", { bio: "Nghệ sĩ indie pop, chưa xác minh." }); // left unverified on purpose — exercises AdminArtistsPage's verify action
  const nsutThanhLoc = await createArtist(artspace, "NSƯT Thành Lộc", { bio: "Nghệ sĩ sân khấu kịch nói gạo cội.", verify: true });

  await attachArtist(soundwave, acoustic, mayLan);
  await attachArtist(soundwave, acoustic, dongNhi);
  await attachArtist(soundwave, festival, denVau);
  await attachArtist(soundwave, festival, hoangThuyLinh);
  await attachArtist(soundwave, festival, mayLan);
  await attachArtist(artspace, kichNoi, nsutThanhLoc);
  console.log(`✓ artists: 6 created (5 verified), attached to lineups on 3 events`);

  console.log("\nCreating orders (buy / abandon / fail / refund)...");

  // ---- 6. Orders — a spread of real outcomes -----------------------
  const cust = (email) => customers[email];

  async function buyGeneral(customerEmail, event, ticketTypeName, quantity, { discountCode, outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const ticketType = event.ticketTypes.find((t) => t.name === ticketTypeName);
    const order = await api("POST", "/booking/cart/hold", {
      token: accessToken,
      body: { eventId: event.id, items: [{ ticketTypeId: ticketType.id, quantity }] },
    });
    if (discountCode) {
      await api("POST", `/booking/orders/${order.id}/apply-discount`, { token: accessToken, body: { code: discountCode } });
    }
    const payment = await api("POST", "/payment/payments", { token: accessToken, body: { orderId: order.id, method: "vnpay" } });
    await api("POST", `/payment/payments/${payment.paymentId}/mock-complete`, { token: accessToken, body: { outcome } });
    const finalStatus = await waitForOrderStatus(accessToken, order.id, outcome === "success" ? ["PAID"] : ["EXPIRED"]);
    console.log(`  - ${customerEmail} bought ${quantity}x "${ticketTypeName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  async function buySeats(customerEmail, event, zoneName, seatCount, { outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const layout = await api("GET", `/event/events/${event.id}/seat-map/layout`, { token: accessToken });
    const zone = layout.zones.find((z) => z.name === zoneName);
    const seats = zone.seats.slice(0, seatCount);
    const order = await api("POST", "/booking/cart/hold", {
      token: accessToken,
      body: { eventId: event.id, items: seats.map((s) => ({ seatId: s.id })) },
    });
    const payment = await api("POST", "/payment/payments", { token: accessToken, body: { orderId: order.id, method: "momo" } });
    await api("POST", `/payment/payments/${payment.paymentId}/mock-complete`, { token: accessToken, body: { outcome } });
    const finalStatus = await waitForOrderStatus(accessToken, order.id, outcome === "success" ? ["PAID"] : ["EXPIRED"]);
    console.log(`  - ${customerEmail} bought ${seatCount} seat(s) in "${zoneName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  await buyGeneral("customer@test.com", acoustic, "Vé Thường", 2, { discountCode: "THUHA10" });
  await buySeats("minh.nguyen@demo.local", festival, "Khu B - Ngồi", 1);
  await buyGeneral("lan.tran@demo.local", kichNoi, "Vé VIP", 2);
  await buySeats("hoa.pham@demo.local", muaRoi, "Khu VIP", 2);

  const refundable = await buySeats("duc.le@demo.local", vleague, "Khán đài A", 1);
  {
    const { accessToken } = cust("duc.le@demo.local");
    const refund = await api("POST", "/payment/refunds", {
      token: accessToken,
      body: { orderId: refundable.id, reason: "Không thể tham dự do lịch trình thay đổi." },
    });
    await api("PATCH", `/payment/refunds/${refund.id}/approve`, { token: admin.accessToken });
    console.log(`  - duc.le@demo.local requested + admin approved a refund on order ${refundable.id}`);
  }

  // Abandoned cart: hold created, never paid — left for the sweeper / "expired" UI state.
  {
    const { accessToken } = cust("mai.vo@demo.local");
    const ticketType = marathon.ticketTypes[0];
    await api("POST", "/booking/cart/hold", {
      token: accessToken,
      body: { eventId: marathon.id, items: [{ ticketTypeId: ticketType.id, quantity: 1 }] },
    });
    console.log(`  - mai.vo@demo.local holds a cart on "Giải Chạy Marathon Thành Phố" and never pays (abandoned)`);
  }

  await buyGeneral("tuan.hoang@demo.local", workshop, "Vé Tham dự", 1, { outcome: "fail" });
  await buyGeneral("linh.dang@demo.local", startup, "Vé Early Bird", 2);

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
