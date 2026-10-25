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

  async function buildEvent(organizer, dto, { ticketTypes, seatZones, seatCanvas, discount, highDemand, submit, approve, reject } = {}) {
    const event = await createEvent(organizer.accessToken, dto);
    const createdTicketTypes = [];
    for (const tt of ticketTypes ?? []) {
      createdTicketTypes.push(await api("POST", `/event/events/${event.id}/ticket-types`, { token: organizer.accessToken, body: tt }));
    }
    if (seatCanvas) {
      // A hall drawn in the organizer's seat-map designer (see hall() below).
      await api("POST", `/event/events/${event.id}/seat-map`, { token: organizer.accessToken, body: seatCanvas });
    } else if (seatZones) {
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
    return { ...event, highDemand: !!highDemand, ticketTypes: createdTicketTypes };
  }

  // Wikimedia Commons photos (free licenses), picked per venue/topic so each
  // event looks like what it is — not random picsum scenery.
  const W = "https://thumb.wikimedia.org/wikipedia/commons/thumb";
  const IMG = {
    opera: [`${W}/5/52/Hanoi_Opera_House%2C_24_December_2016.jpg/1280px-Hanoi_Opera_House%2C_24_December_2016.jpg`, `${W}/0/03/Opera_House_-_Hanoi_-_Vietnam.JPG/1280px-Opera_House_-_Hanoi_-_Vietnam.JPG`, `${W}/b/b6/Hanoi_Opera_House_16.JPG/1280px-Hanoi_Opera_House_16.JPG`],
    acoustic: [`${W}/c/c1/Acoustic_Syndicate_with_Larry_Keel_Smilefest_Pinnacle_NC_May_2010.jpg/1280px-Acoustic_Syndicate_with_Larry_Keel_Smilefest_Pinnacle_NC_May_2010.jpg`, `${W}/2/21/Knicely%27s_Big_Winter_Concert_2012_Franklin_Park_Arts_Center_Purcellville_VA_February_2012.jpg/1280px-Knicely%27s_Big_Winter_Concert_2012_Franklin_Park_Arts_Center_Purcellville_VA_February_2012.jpg`],
    festival: [`${W}/e/e1/Band_performs_live_on_stage_with_bright_lights_at_music_festival_in_summer.jpg/1280px-Band_performs_live_on_stage_with_bright_lights_at_music_festival_in_summer.jpg`, `${W}/d/d9/Musicians_perform_at_an_outdoor_music_festival%2C_captivating_the_crowd_with_energetic_guitar_riffs_and_dynamic_stage_presence.jpg/1280px-Musicians_perform_at_an_outdoor_music_festival%2C_captivating_the_crowd_with_energetic_guitar_riffs_and_dynamic_stage_presence.jpg`, `${W}/1/18/Rock_band_performs_live_on_stage_with_vibrant_lights_and_energetic_atmosphere_during_a_music_festival_in_an_outdoor_venue.jpg/1280px-Rock_band_performs_live_on_stage_with_vibrant_lights_and_energetic_atmosphere_during_a_music_festival_in_an_outdoor_venue.jpg`, `${W}/a/ae/Live_rock_band_performance_at_outdoor_music_festival_with_vibrant_lights_and_energetic_crowd.jpg/1280px-Live_rock_band_performance_at_outdoor_music_festival_with_vibrant_lights_and_energetic_crowd.jpg`],
    rock: [`${W}/8/88/Rock_band_performs_energetic_live_concert_on_stage_in_vibrant_atmosphere_during_summer_festival.jpg/1280px-Rock_band_performs_energetic_live_concert_on_stage_in_vibrant_atmosphere_during_summer_festival.jpg`, `${W}/5/50/Rock_band_performs_energetically_on_stage_during_a_concert_at_a_local_music_festival_in_the_evening.jpg/1280px-Rock_band_performs_energetically_on_stage_during_a_concert_at_a_local_music_festival_in_the_evening.jpg`],
    theatre: [`${W}/2/2f/Traditional_Goan_Konkani_play%2C_from_the_zomnivoilo_fell_%28stageless_play%29%2C_staged_in_Panjim%2C_Goa_in_Feb_2023_03.jpg/1280px-Traditional_Goan_Konkani_play%2C_from_the_zomnivoilo_fell_%28stageless_play%29%2C_staged_in_Panjim%2C_Goa_in_Feb_2023_03.jpg`, `${W}/6/6a/Traditional_Goan_Konkani_play%2C_from_the_zomnivoilo_fell_%28stageless_play%29%2C_staged_in_Panjim%2C_Goa_in_Feb_2023_04.jpg/1280px-Traditional_Goan_Konkani_play%2C_from_the_zomnivoilo_fell_%28stageless_play%29%2C_staged_in_Panjim%2C_Goa_in_Feb_2023_04.jpg`, `${W}/9/92/James_Ensor_-_Theatre_of_masks.jpg/1280px-James_Ensor_-_Theatre_of_masks.jpg`],
    museum: [`${W}/1/1f/Vietnam_National_Museum_of_Fine_Arts%2C_Hanoi%2C_Vietnam_-_20131030-03.JPG/1280px-Vietnam_National_Museum_of_Fine_Arts%2C_Hanoi%2C_Vietnam_-_20131030-03.JPG`, `${W}/1/11/Interior_of_the_Vietnam_National_Museum_of_Fine_Arts%2C_Hanoi%2C_Vietnam_-_20131030-03.JPG/1280px-Interior_of_the_Vietnam_National_Museum_of_Fine_Arts%2C_Hanoi%2C_Vietnam_-_20131030-03.JPG`, `${W}/4/46/Gallery_installation_view_%E2%80%93_Contemporary_Art_BASEL_2021_13.jpg/1280px-Gallery_installation_view_%E2%80%93_Contemporary_Art_BASEL_2021_13.jpg`],
    waterPuppet: [`${W}/0/04/Hanoi_Vietnam_Thang-Long-Water-Puppet-Theatre-01.jpg/1280px-Hanoi_Vietnam_Thang-Long-Water-Puppet-Theatre-01.jpg`, `${W}/9/90/Thang_Long_Water_Puppet_Theatre_2.jpg/1280px-Thang_Long_Water_Puppet_Theatre_2.jpg`, `${W}/6/6f/Thang_Long_Water_puppet_theater..JPG/1280px-Thang_Long_Water_puppet_theater..JPG`, `${W}/c/cd/Thang_Long_Water_Puppet_Theatre7.JPG/1280px-Thang_Long_Water_Puppet_Theatre7.JPG`],
    thongNhat: [`${W}/4/43/Th%E1%BB%91ng_Nh%E1%BA%A5t_Stadium.JPG/1280px-Th%E1%BB%91ng_Nh%E1%BA%A5t_Stadium.JPG`, `${W}/3/32/Th%E1%BB%91ng_Nh%E1%BA%A5t_Stadium_2022.jpg/1280px-Th%E1%BB%91ng_Nh%E1%BA%A5t_Stadium_2022.jpg`, `${W}/2/20/City_of_Manchester_Stadium_Crowd_Against_Hull.jpg/1280px-City_of_Manchester_Stadium_Crowd_Against_Hull.jpg`],
    myDinh: ["https://upload.wikimedia.org/wikipedia/commons/5/56/Hanoi%27s_My_Dinh_National_Stadium_on_2003-08-22%2C_ten_days_before_official_opening.jpg"],
    marathon: [`${W}/8/8c/Runners_finish_a_race_and_celebrate_at_the_end_of_a_marathon_event_in_a_busy_city_park_during_the_afternoon.jpg/1280px-Runners_finish_a_race_and_celebrate_at_the_end_of_a_marathon_event_in_a_busy_city_park_during_the_afternoon.jpg`, `${W}/a/a8/Runners_finish_race_with_medals_at_the_event_held_in_a_city_during_the_afternoon.jpg/1280px-Runners_finish_race_with_medals_at_the_event_held_in_a_city_during_the_afternoon.jpg`, "https://upload.wikimedia.org/wikipedia/commons/f/f0/Marathon_runners_near_the_end_of_the_race_-_geograph.org.uk_-_6142899.jpg"],
    workshop: [`${W}/4/47/Breakout_session_at_Toolbox.jpg/1280px-Breakout_session_at_Toolbox.jpg`, `${W}/8/8f/Deforestation_in_Nigeria_training_workshop_session_03.jpg/1280px-Deforestation_in_Nigeria_training_workshop_session_03.jpg`],
    podium: [`${W}/7/7d/Gooseneck_microphone_on_podium_with_stage_bokeh_lights_01.jpg/1280px-Gooseneck_microphone_on_podium_with_stage_bokeh_lights_01.jpg`, `${W}/d/d9/Gooseneck_microphone_on_podium_with_stage_bokeh_lights_02.jpg/1280px-Gooseneck_microphone_on_podium_with_stage_bokeh_lights_02.jpg`],
    fireworks: [`${W}/f/fd/Fireworks_show_during_Chinese_New_Year_2012.jpg/1280px-Fireworks_show_during_Chinese_New_Year_2012.jpg`],
    beer: [`${W}/5/54/GBBF_2005_-_Crowds_at_the_bar_%2831136747%29.jpg/1280px-GBBF_2005_-_Crowds_at_the_bar_%2831136747%29.jpg`, "https://upload.wikimedia.org/wikipedia/commons/b/bd/2010_Ashville_Beer_City_Festival_-_36.jpg"],
    tea: [`${W}/b/b3/Vietnamese_tea_set.JPG/1280px-Vietnamese_tea_set.JPG`, `${W}/6/69/Tea-teapot-cup-ceramic-kettle-drink-617935-pxhere.jpg/1280px-Tea-teapot-cup-ceramic-kettle-drink-617935-pxhere.jpg`],
    // Artist avatars are instruments/stage gear, not portraits: the artists below are fictional,
    // and a real person's photo next to an invented name would misattribute them.
    guitar: "https://upload.wikimedia.org/wikipedia/commons/3/34/Electric_guitar_%28477101105%29.jpg",
    piano: `${W}/9/97/Grand_Piano_MET_DP300941.jpg/1280px-Grand_Piano_MET_DP300941.jpg`,
    drums: `${W}/f/f1/A_drum_kit_made_by_Mapex_Drums_-_Cacon_Photos-_Copyleft_-_Creative_Commons_11.jpg/1280px-A_drum_kit_made_by_Mapex_Drums_-_Cacon_Photos-_Copyleft_-_Creative_Commons_11.jpg`,
    mic: `${W}/d/d9/Gooseneck_microphone_on_podium_with_stage_bokeh_lights_02.jpg/1280px-Gooseneck_microphone_on_podium_with_stage_bokeh_lights_02.jpg`,
    mask: `${W}/9/92/James_Ensor_-_Theatre_of_masks.jpg/1280px-James_Ensor_-_Theatre_of_masks.jpg`,
  };

  /** "Giới thiệu" as the rich-text editor would produce it (headings, colored lead, lists, an inline photo). */
  function richDescription({ lead, color = "#7c3aed", sections = [], image }) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let html = `<p><span style="color: ${color}; font-size: 18px"><strong>${esc(lead)}</strong></span></p>`;
    for (const s of sections) {
      html += `<h2>${esc(s.title)}</h2>`;
      if (s.text) html += `<p>${esc(s.text)}</p>`;
      if (s.items) html += `<ul>${s.items.map((i) => `<li><p>${esc(i)}</p></li>`).join("")}</ul>`;
    }
    if (image) html += `<img src="${image}" alt="">`;
    return html;
  }

  /**
   * Seat-map canvas (the organizer hall designer's format): zones paint
   * rectangles [rowFrom, rowTo, colFrom, colTo] (inclusive) onto the grid;
   * `aisles` columns are left empty across every zone.
   */
  function hall(rows, cols, stageLabel, zones, aisles = []) {
    const skip = new Set(aisles);
    return {
      canvas: { rows, cols, stageLabel },
      zones: zones.map((z) => {
        if (z.isGeneral) return { name: z.name, price: z.price, color: z.color, isGeneral: true, capacity: z.capacity };
        const cells = [];
        for (const [r0, r1, c0, c1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!skip.has(c)) cells.push({ r, c });
        return { name: z.name, price: z.price, color: z.color, cells };
      }),
    };
  }

  const STANDARD_REFUND = {
    customerRefundable: true,
    tiers: [
      { minHoursBefore: 168, percent: 80 },
      { minHoursBefore: 72, percent: 50 },
      { minHoursBefore: 0, percent: 0 },
    ],
    evidenceRequiredFor: ["MEDICAL"],
  };

  const acoustic = await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Đêm Nhạc Acoustic: Mùa Thu Hà Nội",
      description: richDescription({
        lead: "Một đêm nhạc mộc giữa khán phòng cổ kính nhất Hà Nội — guitar, piano và những bản tình ca mùa thu.",
        sections: [
          { title: "Chương trình", items: ["Phần 1: Hà Nội mùa thu — những ca khúc kinh điển phối mới", "Phần 2: Unplugged — sáng tác mới của Lam Ngọc", "Phần 3: Song ca cùng Nhóm Gió Sớm"] },
          { title: "Thông tin", items: ["Thời lượng: 120 phút, có 15 phút giải lao", "Trang phục lịch sự", "Không mang đồ ăn, thức uống vào khán phòng"] },
        ],
        image: IMG.opera[2],
      }),
      bannerUrl: IMG.opera[0],
      galleryUrls: [IMG.acoustic[0], IMG.acoustic[1], IMG.opera[1]],
      venueName: "Nhà hát Lớn Hà Nội",
      venueAddress: "1 Tràng Tiền, Phường Cửa Nam, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Cửa Nam",
      streetAddress: "1 Tràng Tiền",
      startTime: daysFromNow(14, 20),
      endTime: daysFromNow(14, 22),
      ticketMode: "SEATMAP",
      organizerName: "SoundWave Concerts",
      organizerDescription: "Đơn vị tổ chức các đêm nhạc acoustic và live concert quy mô vừa tại Hà Nội và TP.HCM.",
      terms: "- Vé đã mua không đổi suất.\n- Trẻ em dưới 8 tuổi không được vào khán phòng.\n- Vui lòng có mặt trước giờ diễn 30 phút.",
      minAge: 8,
      maxTicketsPerAccount: 6,
      refundPolicy: STANDARD_REFUND,
    },
    {
      seatCanvas: hall(13, 24, "SÂN KHẤU", [
        { name: "Hạng VIP", price: 1500000, color: "#db2777", rects: [[0, 3, 2, 21]] },
        { name: "Hạng A", price: 1000000, color: "#7c3aed", rects: [[4, 8, 1, 22]] },
        { name: "Hạng B", price: 650000, color: "#2563eb", rects: [[9, 12, 0, 23]] },
      ], [6, 17]),
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
      description: richDescription({
        lead: "Lễ hội âm nhạc ngoài trời lớn nhất mùa thu: 2 sân khấu, 12 nghệ sĩ, 8 tiếng âm nhạc liên tục.",
        color: "#ea580c",
        sections: [
          { title: "Line-up", text: "Hải Đăng Band, DJ Nova, Linh Lan, Kay T. cùng nhiều khách mời bí mật." },
          { title: "Khu vực", items: ["Fanzone: khu đứng sát sân khấu, vào cổng ưu tiên", "GA: khu đứng phía sau", "VIP ngồi: ghế riêng, quầy đồ uống riêng", "Khán đài: ghế ngồi trên khán đài sân vận động"] },
          { title: "Lưu ý", items: ["Mở cổng 15:00", "Không mang đồ uống có cồn, vật sắc nhọn", "Có khu ăn uống và gửi đồ trong sân"] },
        ],
        image: IMG.festival[2],
      }),
      bannerUrl: IMG.festival[0],
      galleryUrls: [IMG.festival[1], IMG.festival[3], IMG.myDinh[0]],
      venueName: "Sân vận động Quốc gia Mỹ Đình",
      venueAddress: "Lê Đức Thọ, Phường Từ Liêm, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Từ Liêm",
      streetAddress: "Lê Đức Thọ",
      startTime: daysFromNow(30, 16),
      endTime: daysFromNow(30, 23),
      ticketMode: "SEATMAP",
      organizerName: "SoundWave Concerts",
      terms: "- Vé không hoàn sau khi đã giữ chỗ trong 72 giờ trước sự kiện.\n- Ban tổ chức có quyền từ chối khách say xỉn.",
      minAge: 16,
      maxTicketsPerAccount: 4,
      refundPolicy: STANDARD_REFUND,
    },
    {
      seatCanvas: hall(15, 36, "SÂN KHẤU CHÍNH", [
        { name: "Fanzone (đứng)", price: 1990000, color: "#dc2626", isGeneral: true, capacity: 1500 },
        { name: "GA (đứng)", price: 990000, color: "#ea580c", isGeneral: true, capacity: 5000 },
        { name: "VIP ngồi", price: 2990000, color: "#ca8a04", rects: [[0, 3, 8, 27]] },
        { name: "Khán đài", price: 790000, color: "#0891b2", rects: [[5, 14, 0, 35]] },
      ], [11, 24]),
      discount: { code: "FEST50K", discountType: "FIXED", value: 50000, quantityTotal: 100 },
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Live Concert: Ban nhạc Ngọn Lửa — Thắp Sáng",
      description: richDescription({
        lead: "Đêm rock sôi động kỷ niệm 10 năm thành lập ban nhạc Ngọn Lửa.",
        color: "#dc2626",
        sections: [{ title: "Điểm nhấn", items: ["Trọn bộ album 'Thắp Sáng' lần đầu biểu diễn live", "Khách mời: Nhóm Gió Sớm"] }],
      }),
      bannerUrl: IMG.rock[0],
      galleryUrls: [IMG.rock[1], IMG.festival[3]],
      venueName: "Cung Thể thao Quần Ngựa",
      venueAddress: "30 Văn Cao, Phường Ngọc Hà, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Ngọc Hà",
      streetAddress: "30 Văn Cao",
      startTime: daysFromNow(21, 19),
      endTime: daysFromNow(21, 22),
      ticketMode: "GENERAL",
      organizerName: "SoundWave Concerts",
      minAge: 14,
    },
    {
      ticketTypes: [
        { name: "GA (đứng)", price: 590000, quantityTotal: 1500, description: "Khu đứng tự do phía sau." },
        { name: "VIP (sát sân khấu)", price: 1190000, quantityTotal: 300, description: "Khu đứng sát sân khấu, vào cổng ưu tiên, kèm poster có chữ ký." },
      ],
      submit: true, // left PENDING_APPROVAL on purpose
    },
  );

  const kichNoi = await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Kịch nói: Hồn Trương Ba, Da Hàng Thịt",
      description: richDescription({
        lead: "Vở kịch kinh điển của Lưu Quang Vũ trong một bản dàn dựng mới của ArtSpace Productions.",
        color: "#b45309",
        sections: [
          { title: "Nội dung", text: "Hồn ông Trương Ba phải sống nhờ trong thân xác anh hàng thịt — câu chuyện về sự giằng co giữa linh hồn và thể xác, giữa được sống và được là chính mình." },
          { title: "Thông tin", items: ["Thời lượng: 110 phút, không giải lao", "Khuyến nghị khán giả từ 12 tuổi"] },
        ],
        image: IMG.theatre[1],
      }),
      bannerUrl: IMG.theatre[0],
      galleryUrls: [IMG.theatre[1], IMG.theatre[2]],
      venueName: "Nhà hát Kịch Việt Nam",
      venueAddress: "Phố Đinh Lễ, Phường Hoàn Kiếm, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàn Kiếm",
      streetAddress: "Phố Đinh Lễ",
      startTime: daysFromNow(10, 20),
      endTime: daysFromNow(10, 22),
      ticketMode: "SEATMAP",
      organizerName: "ArtSpace Productions",
      organizerDescription: "Đơn vị sản xuất sân khấu, triển lãm và các chương trình nghệ thuật đương đại.",
      minAge: 12,
      refundPolicy: STANDARD_REFUND,
    },
    {
      seatCanvas: hall(12, 22, "SÂN KHẤU", [
        { name: "Hạng VIP", price: 450000, color: "#b45309", rects: [[0, 2, 2, 19]] },
        { name: "Hạng A", price: 350000, color: "#7c3aed", rects: [[3, 7, 1, 20]] },
        { name: "Hạng B", price: 250000, color: "#16a34a", rects: [[8, 11, 0, 21]] },
      ], [5, 16]),
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Triển lãm Mỹ thuật Đương đại: Những Lát Cắt",
      description: richDescription({
        lead: "Hơn 60 tác phẩm hội họa, sắp đặt và video art của 20 nghệ sĩ trẻ.",
        color: "#0891b2",
        sections: [{ title: "Mở cửa", items: ["9:00 – 17:00 hằng ngày", "Có hướng dẫn viên lúc 10:00 và 15:00"] }],
      }),
      bannerUrl: IMG.museum[0],
      galleryUrls: [IMG.museum[1], IMG.museum[2]],
      venueName: "Bảo tàng Mỹ thuật Việt Nam",
      venueAddress: "66 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Ba Đình",
      streetAddress: "66 Nguyễn Thái Học",
      startTime: daysFromNow(40, 9),
      endTime: daysFromNow(45, 17),
      ticketMode: "GENERAL",
      organizerName: "ArtSpace Productions",
    },
    {
      ticketTypes: [
        { name: "Vé người lớn", price: 80000, quantityTotal: 1000 },
        { name: "Vé HSSV", price: 40000, quantityTotal: 500, description: "Xuất trình thẻ học sinh/sinh viên khi vào cửa." },
      ],
    }, // left DRAFT — never submitted
  );

  const muaRoi = await buildEvent(
    artspace,
    {
      categoryId: categories["gia-dinh-thieu-nhi"].id,
      title: "Múa Rối Nước Thăng Long: Tinh Hoa Đất Việt",
      description: richDescription({
        lead: "Nghệ thuật múa rối nước truyền thống trên thủy đình, cùng dàn nhạc dân tộc và hát chèo sống.",
        color: "#0891b2",
        sections: [
          { title: "Các tiết mục", items: ["Múa rồng", "Chú Tễu", "Đánh cáo", "Rước kiệu", "Múa lân", "Vinh quy bái tổ"] },
          { title: "Thông tin", items: ["Thời lượng: 50 phút", "Phù hợp mọi lứa tuổi — trẻ em dưới 3 tuổi miễn vé (ngồi cùng người lớn)", "Hàng ghế đầu có thể bị nước bắn nhẹ"] },
        ],
        image: IMG.waterPuppet[2],
      }),
      bannerUrl: IMG.waterPuppet[0],
      galleryUrls: [IMG.waterPuppet[1], IMG.waterPuppet[3], IMG.waterPuppet[2]],
      venueName: "Nhà hát Múa rối Thăng Long",
      venueAddress: "57B Đinh Tiên Hoàng, Phường Hoàn Kiếm, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàn Kiếm",
      streetAddress: "57B Đinh Tiên Hoàng",
      startTime: daysFromNow(7, 18),
      endTime: daysFromNow(7, 19),
      ticketMode: "SEATMAP",
      organizerName: "ArtSpace Productions",
      terms: "- Không quay phim, chụp ảnh có đèn flash trong khi biểu diễn.",
    },
    {
      // A water stage in front, two price bands of tiered seating behind it.
      seatCanvas: hall(14, 22, "THỦY ĐÌNH · SÂN KHẤU NƯỚC", [
        { name: "Hạng 1", price: 200000, color: "#0891b2", rects: [[0, 5, 1, 20]] },
        { name: "Hạng 2", price: 150000, color: "#16a34a", rects: [[6, 13, 0, 21]] },
      ], [11]),
      submit: true,
      approve: true,
    },
  );

  const vleague = await buildEvent(
    arena,
    {
      categoryId: categories["the-thao"].id,
      title: "V.League All-Star Match 2026",
      description: richDescription({
        lead: "Trận đấu giao hữu quy tụ các cầu thủ xuất sắc nhất mùa giải V.League 2026.",
        color: "#16a34a",
        sections: [
          { title: "Chương trình", items: ["17:30 Mở cổng, hoạt động giao lưu người hâm mộ", "19:00 Lễ khai mạc", "19:30 Bóng lăn"] },
          { title: "Khán đài", items: ["Khán đài A: có mái che, giữa sân", "Khán đài B: hai đầu sân", "Khu VIP: ghế riêng, đồ uống miễn phí"] },
        ],
        image: IMG.thongNhat[1],
      }),
      bannerUrl: IMG.thongNhat[0],
      galleryUrls: [IMG.thongNhat[1], IMG.thongNhat[2]],
      venueName: "Sân vận động Thống Nhất",
      venueAddress: "138 Đào Duy Từ, Phường Diên Hồng, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Diên Hồng",
      streetAddress: "138 Đào Duy Từ",
      startTime: daysFromNow(25, 19),
      endTime: daysFromNow(25, 21),
      ticketMode: "SEATMAP",
      organizerName: "Arena Sports Vietnam",
      organizerDescription: "Tổ chức sự kiện thể thao: bóng đá, chạy bộ, giải phong trào.",
      maxTicketsPerAccount: 8,
      // docs/spec/13-refund-and-anti-fraud-design.md §2.1 — tiered customer refunds.
      refundPolicy: STANDARD_REFUND,
    },
    {
      seatCanvas: hall(12, 40, "SÂN THI ĐẤU", [
        { name: "Khu VIP", price: 600000, color: "#ca8a04", rects: [[0, 1, 14, 25]] },
        { name: "Khán đài A", price: 300000, color: "#16a34a", rects: [[2, 7, 8, 31]] },
        { name: "Khán đài B", price: 150000, color: "#2563eb", rects: [[0, 7, 0, 6], [0, 7, 33, 39], [8, 11, 0, 39]] },
      ], [7, 32]),
      discount: { code: "THETHAO15", discountType: "PERCENT", value: 15, quantityTotal: 50 },
      submit: true,
      approve: true,
    },
  );

  const marathon = await buildEvent(
    arena,
    {
      categoryId: categories["the-thao"].id,
      title: "Giải Chạy Hà Nội Marathon Mùa Thu 2026",
      description: richDescription({
        lead: "Chạy qua những con phố đẹp nhất Hà Nội vào buổi sáng mùa thu — 4 cự ly cho mọi trình độ.",
        color: "#dc2626",
        sections: [
          { title: "Cự ly & giờ xuất phát", items: ["42km: 4:00", "21km: 4:30", "10km: 5:30", "5km: 6:00"] },
          { title: "Quyền lợi vận động viên", items: ["Áo chạy, BIB gắn chip tính giờ", "Huy chương hoàn thành", "Nước uống, tiếp tế dọc đường, y tế trên toàn tuyến", "Ảnh chụp trên đường chạy"] },
          { title: "Yêu cầu", items: ["VĐV cự ly 21km và 42km nộp giấy khám sức khỏe khi nhận BIB", "Nhận BIB tại Cung Văn hóa Hữu nghị 2 ngày trước giải"] },
        ],
        image: IMG.marathon[1],
      }),
      bannerUrl: IMG.marathon[0],
      galleryUrls: [IMG.marathon[1], IMG.marathon[2]],
      venueName: "Hồ Hoàn Kiếm (xuất phát & về đích)",
      venueAddress: "Phố Đinh Tiên Hoàng, Phường Hoàn Kiếm, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàn Kiếm",
      streetAddress: "Phố Đinh Tiên Hoàng",
      startTime: daysFromNow(18, 4),
      endTime: daysFromNow(18, 11),
      ticketMode: "GENERAL",
      organizerName: "Arena Sports Vietnam",
      minAge: 12,
      maxTicketsPerAccount: 2,
    },
    {
      ticketTypes: [
        { name: "Cự ly 5km", price: 390000, quantityTotal: 2000, description: "Áo, BIB, huy chương. Phù hợp người mới chạy." },
        { name: "Cự ly 10km", price: 550000, quantityTotal: 2000, description: "Áo, BIB chip, huy chương." },
        { name: "Cự ly 21km (Half Marathon)", price: 790000, quantityTotal: 1500, description: "Áo, BIB chip, huy chương, khăn finisher. Từ 16 tuổi." },
        { name: "Cự ly 42km (Full Marathon)", price: 990000, quantityTotal: 800, description: "Áo, BIB chip, huy chương, áo finisher. Từ 18 tuổi, yêu cầu giấy khám sức khỏe." },
      ],
      submit: true,
      approve: true,
    },
  );

  const workshop = await buildEvent(
    vnstage,
    {
      categoryId: categories["hoi-thao-workshop"].id,
      title: "Workshop: Quản lý Dự án Agile Thực Chiến",
      description: richDescription({
        lead: "Một ngày thực hành Scrum/Kanban với case study thật, dành cho PM, team lead và người mới chuyển ngành.",
        color: "#2563eb",
        sections: [
          { title: "Nội dung", items: ["Lập backlog và ước lượng story point", "Điều phối sprint, daily, retro hiệu quả", "Đo lường tiến độ bằng burndown và cycle time"] },
          { title: "Bao gồm", items: ["Tài liệu, chứng nhận tham dự", "Tea-break 2 buổi và bữa trưa"] },
        ],
      }),
      bannerUrl: IMG.workshop[0],
      galleryUrls: [IMG.workshop[1]],
      venueName: "Dreamplex Điện Biên Phủ",
      venueAddress: "195 Điện Biên Phủ, Phường Xuân Hòa, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Xuân Hòa",
      streetAddress: "195 Điện Biên Phủ",
      startTime: daysFromNow(5, 9),
      endTime: daysFromNow(5, 17),
      ticketMode: "GENERAL",
      organizerName: "VNStage Live",
    },
    { ticketTypes: [{ name: "Vé Tham dự", price: 590000, quantityTotal: 60, description: "Gồm tài liệu, bữa trưa và chứng nhận." }], submit: true, approve: true },
  );

  // Small, hands-on, sells out — tickets only, no seat map.
  await buildEvent(
    artspace,
    {
      categoryId: categories["hoi-thao-workshop"].id,
      title: "Workshop Trà Đạo: Nghệ Thuật Thưởng Trà Việt",
      description: richDescription({
        lead: "Học cách chọn trà, pha trà và thưởng trà theo lối Việt cùng nghệ nhân — trong một không gian nhỏ, ấm cúng.",
        color: "#16a34a",
        sections: [
          { title: "Bạn sẽ được", items: ["Phân biệt trà Thái Nguyên, Shan tuyết, trà ướp sen", "Thực hành pha trà với bộ ấm chén riêng", "Thưởng trà cùng bánh cốm, bánh đậu xanh"] },
          { title: "Lưu ý", items: ["Lớp tối đa 20 người", "Mỗi học viên được tặng một gói trà 100g mang về"] },
        ],
        image: IMG.tea[1],
      }),
      bannerUrl: IMG.tea[0],
      galleryUrls: [IMG.tea[1]],
      venueName: "Trà quán Mộc An",
      venueAddress: "12 Hàng Bút, Phường Hoàn Kiếm, Thành phố Hà Nội",
      province: "Thành phố Hà Nội",
      ward: "Phường Hoàn Kiếm",
      streetAddress: "12 Hàng Bút",
      startTime: daysFromNow(9, 14),
      endTime: daysFromNow(9, 17),
      ticketMode: "GENERAL",
      organizerName: "ArtSpace Productions",
      maxTicketsPerAccount: 2,
    },
    {
      ticketTypes: [
        { name: "Vé tham dự", price: 550000, quantityTotal: 20, description: "Một chỗ ngồi, bộ ấm chén thực hành, quà trà mang về." },
        { name: "Vé đôi", price: 990000, quantityTotal: 6, description: "Hai chỗ ngồi cạnh nhau." },
      ],
      submit: true,
      approve: true,
    },
  );

  const startup = await buildEvent(
    vnstage,
    {
      categoryId: categories["hoi-thao-workshop"].id,
      title: "Hội thảo Khởi nghiệp & Đầu tư 2026",
      description: richDescription({
        lead: "Gặp gỡ 30 quỹ đầu tư và hơn 100 startup — pitching, panel và networking trong một ngày.",
        color: "#7c3aed",
        sections: [
          { title: "Chương trình", items: ["Keynote: Bức tranh đầu tư mạo hiểm Đông Nam Á 2026", "Panel: Gọi vốn vòng seed trong thị trường khó", "Pitching: 10 startup chọn lọc", "Networking & business matching"] },
          { title: "Hạng vé", items: ["Early Bird / Standard: tham dự toàn bộ chương trình", "VIP Networking: thêm tiệc tối giao lưu cùng nhà đầu tư"] },
        ],
      }),
      bannerUrl: IMG.podium[0],
      galleryUrls: [IMG.podium[1], IMG.workshop[0]],
      venueName: "White Palace Phạm Văn Đồng",
      venueAddress: "108 Phạm Văn Đồng, Phường Hiệp Bình, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Hiệp Bình",
      streetAddress: "108 Phạm Văn Đồng",
      startTime: daysFromNow(12, 8),
      endTime: daysFromNow(12, 18),
      ticketMode: "GENERAL",
      organizerName: "VNStage Live",
    },
    {
      ticketTypes: [
        { name: "Vé Early Bird", price: 290000, quantityTotal: 150 },
        { name: "Vé Standard", price: 490000, quantityTotal: 400 },
        { name: "VIP Networking", price: 1290000, quantityTotal: 60, description: "Gồm tiệc tối giao lưu cùng nhà đầu tư." },
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
      description: richDescription({
        lead: "Đón năm mới 2027 cùng dàn nghệ sĩ trẻ và màn pháo hoa đếm ngược lúc nửa đêm.",
        color: "#ca8a04",
        sections: [{ title: "Lịch trình", items: ["19:00 Mở cổng", "20:00 – 23:55 Biểu diễn", "00:00 Đếm ngược & pháo hoa"] }],
        image: IMG.fireworks[0],
      }),
      bannerUrl: IMG.fireworks[0],
      galleryUrls: [IMG.festival[0], IMG.festival[1]],
      venueName: "Sân vận động Quân khu 7",
      venueAddress: "202 Hoàng Văn Thụ, Phường Tân Sơn Hòa, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Tân Sơn Hòa",
      streetAddress: "202 Hoàng Văn Thụ",
      startTime: daysFromNow(66, 19),
      endTime: daysFromNow(67, 1),
      ticketMode: "SEATMAP",
      organizerName: "VNStage Live",
      minAge: 12,
    },
    {
      seatCanvas: hall(10, 30, "SÂN KHẤU COUNTDOWN", [
        { name: "Fanzone (đứng)", price: 1490000, color: "#dc2626", isGeneral: true, capacity: 1000 },
        { name: "GA (đứng)", price: 690000, color: "#ea580c", isGeneral: true, capacity: 4000 },
        { name: "Khán đài VIP", price: 2490000, color: "#ca8a04", rects: [[0, 3, 5, 24]] },
        { name: "Khán đài thường", price: 990000, color: "#7c3aed", rects: [[4, 9, 0, 29]] },
      ], [9, 20]),
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    soundwave,
    {
      categoryId: categories["am-nhac"].id,
      title: "Đêm nhạc Tưởng nhớ Trịnh Công Sơn (đã diễn ra)",
      description: richDescription({
        lead: "Những ca khúc bất hủ của cố nhạc sĩ Trịnh Công Sơn qua giọng hát của các ca sĩ trẻ.",
        color: "#6b7280",
        sections: [{ title: "Trình bày", text: "Lam Ngọc, Nhóm Gió Sớm và ban nhạc acoustic." }],
      }),
      bannerUrl: IMG.acoustic[1],
      galleryUrls: [IMG.acoustic[0]],
      venueName: "Nhà Văn hóa Thanh Niên",
      venueAddress: "4 Phạm Ngọc Thạch, Phường Sài Gòn, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Sài Gòn",
      streetAddress: "4 Phạm Ngọc Thạch",
      startTime: daysFromNow(-10, 20),
      endTime: daysFromNow(-10, 22),
      ticketMode: "GENERAL",
      organizerName: "SoundWave Concerts",
    },
    {
      ticketTypes: [
        { name: "Vé thường", price: 450000, quantityTotal: 300 },
        { name: "Vé VIP (bàn trà)", price: 900000, quantityTotal: 40, description: "Bàn trà hàng đầu, kèm trà và bánh." },
      ],
      submit: true,
      approve: true,
    },
  );

  await buildEvent(
    artspace,
    {
      categoryId: categories["san-khau-nghe-thuat"].id,
      title: "Lễ hội Bia Thủ công Sài Gòn",
      description: richDescription({ lead: "Hơn 40 nhà nấu bia thủ công, nhạc sống và ẩm thực đường phố.", color: "#ca8a04" }),
      bannerUrl: IMG.beer[0],
      galleryUrls: [IMG.beer[1]],
      venueName: "Công viên 23 Tháng 9",
      venueAddress: "Phạm Ngũ Lão, Phường Bến Thành, Thành phố Hồ Chí Minh",
      province: "Thành phố Hồ Chí Minh",
      ward: "Phường Bến Thành",
      streetAddress: "Phạm Ngũ Lão",
      startTime: daysFromNow(15, 17),
      endTime: daysFromNow(15, 23),
      ticketMode: "GENERAL",
      organizerName: "ArtSpace Productions",
      minAge: 18,
    },
    {
      ticketTypes: [{ name: "Vé vào cổng (kèm 3 phiếu nếm thử)", price: 150000, quantityTotal: 800 }],
      reject: "Thiếu giấy phép tổ chức sự kiện ngoài trời — vui lòng bổ sung và nộp lại.",
    },
  );

  // ---- 5.5 Artists ----------------------------------------------------
  console.log("\nCreating artists...");

  async function createArtist(organizer, name, { bio, avatar, verify = false } = {}) {
    const artist = await api("POST", "/event/artists", {
      token: organizer.accessToken,
      body: { name, bio, avatarUrl: avatar },
    });
    if (verify) {
      await api("PATCH", `/event/artists/${artist.id}/verify`, { token: admin.accessToken });
    }
    return artist;
  }

  async function attachArtist(organizer, event, artist) {
    await api("POST", `/event/events/${event.id}/artists`, { token: organizer.accessToken, body: { artistId: artist.id } });
  }

  // Fictional artists (demo data) — see IMG's note on why their avatars are instruments.
  const lamNgoc = await createArtist(soundwave, "Lam Ngọc", { bio: "Ca sĩ - nhạc sĩ dòng ballad acoustic, nổi tiếng với những bản tình ca về Hà Nội.", avatar: IMG.piano, verify: true });
  const gioSom = await createArtist(soundwave, "Nhóm Gió Sớm", { bio: "Nhóm nhạc acoustic ba thành viên: guitar, cajón và violin.", avatar: IMG.guitar, verify: true });
  const haiDang = await createArtist(soundwave, "Hải Đăng Band", { bio: "Ban nhạc pop-rock với những bản hit sôi động.", avatar: IMG.drums, verify: true });
  const djNova = await createArtist(soundwave, "DJ Nova", { bio: "DJ - producer nhạc điện tử, thường trú tại các lễ hội lớn.", avatar: IMG.mic, verify: true });
  const linhLan = await createArtist(soundwave, "Linh Lan", { bio: "Ca sĩ pop kết hợp chất liệu dân gian đương đại.", avatar: IMG.mic, verify: true });
  await createArtist(soundwave, "Kay T.", { bio: "Rapper trẻ, chưa xác minh.", avatar: IMG.mic }); // left unverified on purpose — exercises AdminArtistsPage's verify action
  const doanKich = await createArtist(artspace, "Đoàn kịch Phố Cổ", { bio: "Đoàn kịch nói với nhiều vở diễn kinh điển được dàn dựng mới.", avatar: IMG.mask, verify: true });

  await attachArtist(soundwave, acoustic, lamNgoc);
  await attachArtist(soundwave, acoustic, gioSom);
  await attachArtist(soundwave, festival, haiDang);
  await attachArtist(soundwave, festival, djNova);
  await attachArtist(soundwave, festival, linhLan);
  await attachArtist(artspace, kichNoi, doanKich);
  console.log(`✓ artists: 7 created (6 verified, all fictional), attached to lineups on 3 events`);

  console.log("\nCreating orders (buy / abandon / fail / refund)...");

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

  async function buyGeneral(customerEmail, event, ticketTypeName, quantity, { discountCode, outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const ticketType = event.ticketTypes.find((t) => t.name === ticketTypeName);
    const order = await api("POST", "/booking/cart/hold", {
      token: accessToken,
      headers: await queueSessionFor(event),
      body: { eventId: event.id, items: [{ ticketTypeId: ticketType.id, quantity }] },
    });
    if (discountCode) {
      await api("POST", `/booking/orders/${order.id}/apply-discount`, { token: accessToken, body: { code: discountCode } });
    }
    const payment = await api("POST", "/payment/payments", { token: accessToken, body: { orderId: order.id, method: "vnpay" } });
    await api("POST", `/payment/payments/${payment.paymentId}/mock-complete`, { token: accessToken, body: { outcome } });
    const finalStatus = await waitForOrderStatus(accessToken, order.id, outcome === "success" ? ["PAID", "TICKET_ISSUED"] : ["EXPIRED"]);
    console.log(`  - ${customerEmail} bought ${quantity}x "${ticketTypeName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  async function buySeats(customerEmail, event, zoneName, seatCount, { discountCode, outcome = "success" } = {}) {
    const { accessToken } = cust(customerEmail);
    const layout = await api("GET", `/event/events/${event.id}/seat-map/layout`, { token: accessToken });
    const zone = layout.zones.find((z) => z.name === zoneName);
    const seats = zone.seats.slice(0, seatCount);
    const order = await api("POST", "/booking/cart/hold", {
      token: accessToken,
      body: { eventId: event.id, items: seats.map((s) => ({ seatId: s.id })) },
    });
    if (discountCode) {
      await api("POST", `/booking/orders/${order.id}/apply-discount`, { token: accessToken, body: { code: discountCode } });
    }
    const payment = await api("POST", "/payment/payments", { token: accessToken, body: { orderId: order.id, method: "momo" } });
    await api("POST", `/payment/payments/${payment.paymentId}/mock-complete`, { token: accessToken, body: { outcome } });
    const finalStatus = await waitForOrderStatus(accessToken, order.id, outcome === "success" ? ["PAID", "TICKET_ISSUED"] : ["EXPIRED"]);
    console.log(`  - ${customerEmail} bought ${seatCount} seat(s) in "${zoneName}" on "${event.title}" -> ${finalStatus.status}`);
    return finalStatus;
  }

  await buySeats("customer@test.com", acoustic, "Hạng A", 2, { discountCode: "THUHA10" });
  await buySeats("minh.nguyen@demo.local", festival, "Khán đài", 1);
  await buySeats("lan.tran@demo.local", kichNoi, "Hạng VIP", 2);
  await buySeats("hoa.pham@demo.local", muaRoi, "Hạng 1", 2);

  const refundable = await buySeats("duc.le@demo.local", vleague, "Khán đài A", 1);
  {
    const { accessToken } = cust("duc.le@demo.local");
    // Refunds need issued tickets (they get locked while the request is open).
    await waitForOrderStatus(accessToken, refundable.id, ["TICKET_ISSUED"]);
    const refund = await api("POST", "/payment/refunds", {
      token: accessToken,
      body: { orderId: refundable.id, reasonCategory: "SCHEDULE_CONFLICT", reason: "Không thể tham dự do lịch trình thay đổi." },
    });
    await api("PATCH", `/payment/refunds/${refund.id}/approve`, { token: arena.accessToken, body: {} });
    console.log(`  - duc.le@demo.local requested an 80% refund on order ${refundable.id}, approved by the organizer`);
  }

  // Abandoned cart: hold created, never paid — left for the sweeper / "expired" UI state.
  {
    const { accessToken } = cust("mai.vo@demo.local");
    const ticketType = marathon.ticketTypes[0];
    await api("POST", "/booking/cart/hold", {
      token: accessToken,
      body: { eventId: marathon.id, items: [{ ticketTypeId: ticketType.id, quantity: 1 }] },
    });
    console.log(`  - mai.vo@demo.local holds a cart on "${marathon.title}" and never pays (abandoned)`);
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
