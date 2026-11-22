import { Hono } from "hono";
import { and, asc, count, eq, gt, gte, inArray, isNull, lt, or } from "drizzle-orm";
import type { DisplayBooking, DisplayFeed, DisplayRequestResult, DisplayStatus } from "@app/shared";
import * as s from "../db/schema";
import { AppError, audit, type AppEnv, type Ctx } from "../lib/context";
import { randomCode, randomToken, sha256 } from "../lib/crypto";
import { epochToZoned, now, weekdayOf, zonedToEpoch } from "../lib/time";
import { participantsFor } from "./rooms";

/**
 * Layar ruangan: perangkat di depan ruangan yang menampilkan jadwal hari ini,
 * hitung mundur, dan peserta. Tidak memakai sesi user. Perangkat menampilkan QR dan
 * kode sekali pakai; admin PT memindainya dari HP dan memilih ruangannya. Setelah itu
 * perangkat memegang token sendiri yang dikirim lewat header `X-Display-Token`.
 * Admin bisa mencabutnya kapan saja.
 */
export const display = new Hono<AppEnv>();

const TOKEN_HEADER = "x-display-token";
const SEEN_EVERY = 60;
const LATER_DAYS = 14;
export const REQUEST_TTL = 15 * 60;
const MAX_REQUESTS_PER_IP = 20;

const unpaired = () => new AppError(401, "DISPLAY_UNPAIRED", "Layar ini belum dipasang atau sudah dicabut admin.");

// Perangkat yang belum terpasang meminta kode untuk ditampilkan sebagai QR.
// Tidak butuh login, jadi dibatasi per IP dan kodenya cepat hangus.
display.post("/request", async (c) => {
  const db = c.get("db");
  const t = now();
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  await db.delete(s.displayRequests).where(lt(s.displayRequests.expiresAt, t)).run();

  // Kode yang diperbarui (kedaluwarsa atau diminta ulang) menggantikan kode lama perangkat ini.
  const old = c.req.header(TOKEN_HEADER);
  if (old) await db.delete(s.displayRequests).where(eq(s.displayRequests.tokenHash, await sha256(old))).run();

  const active = await db.select({ n: count() }).from(s.displayRequests).where(eq(s.displayRequests.ip, ip)).get();
  if ((active?.n ?? 0) >= MAX_REQUESTS_PER_IP) {
    throw new AppError(429, "TOO_MANY", "Terlalu banyak layar menunggu dihubungkan dari jaringan ini. Coba lagi beberapa menit lagi.");
  }

  const code = randomCode(8);
  const token = randomToken();
  const expiresAt = t + REQUEST_TTL;
  await db
    .insert(s.displayRequests)
    .values({ id: crypto.randomUUID(), codeHash: await sha256(code), tokenHash: await sha256(token), ip, createdAt: t, expiresAt })
    .run();
  return c.json<DisplayRequestResult>({ token, code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt });
});

// Ditanya perangkat berkala selama QR tampil, sampai admin menghubungkannya.
display.get("/status", async (c) => {
  const token = c.req.header(TOKEN_HEADER);
  if (!token) throw unpaired();
  const db = c.get("db");
  const hash = await sha256(token);
  const d = await db.select().from(s.roomDisplays).where(eq(s.roomDisplays.tokenHash, hash)).get();
  if (d && !d.revokedAt) {
    const room = await db.select({ name: s.rooms.name }).from(s.rooms).where(eq(s.rooms.id, d.roomId)).get();
    return c.json<DisplayStatus>({ state: "paired", roomName: room?.name ?? "" });
  }
  const r = await db.select().from(s.displayRequests).where(eq(s.displayRequests.tokenHash, hash)).get();
  if (!d && r && r.expiresAt > now()) return c.json<DisplayStatus>({ state: "pending", expiresAt: r.expiresAt });
  throw unpaired();
});

async function loadDisplay(c: Ctx) {
  const token = c.req.header(TOKEN_HEADER);
  if (!token) throw unpaired();
  const db = c.get("db");
  const d = await db.select().from(s.roomDisplays).where(eq(s.roomDisplays.tokenHash, await sha256(token))).get();
  if (!d || d.revokedAt) throw unpaired();
  const org = await db.select().from(s.organizations).where(eq(s.organizations.id, d.orgId)).get();
  const room = await db.select().from(s.rooms).where(eq(s.rooms.id, d.roomId)).get();
  if (!org || org.status === "archived" || !room) throw unpaired();
  return { d, org, room };
}

display.get("/", async (c) => {
  const { d, org, room } = await loadDisplay(c);
  const db = c.get("db");
  const t = now();
  if (!d.lastSeenAt || d.lastSeenAt < t - SEEN_EVERY) {
    await db.update(s.roomDisplays).set({ lastSeenAt: t }).where(eq(s.roomDisplays.id, d.id)).run();
  }

  const tz = org.timezone;
  const date = epochToZoned(t, tz).date;
  const base: DisplayFeed = {
    org: { name: org.name, timezone: tz },
    room: { id: room.id, name: room.name, capacity: room.capacity, location: room.location, facilities: JSON.parse(room.facilities) as string[] },
    now: t,
    date,
    dayStart: zonedToEpoch(date, 0, tz),
    hours: null,
    closure: null,
    bookings: [],
    later: null,
    blocked: null,
  };

  // Jeda modul dan status PT diperiksa setiap kali, sama seperti request user.
  const mod = await db
    .select()
    .from(s.orgModules)
    .where(and(eq(s.orgModules.orgId, org.id), eq(s.orgModules.moduleKey, "rooms")))
    .get();
  if (org.status !== "active") return c.json({ ...base, blocked: "Akses perusahaan ini sedang dihentikan sementara." });
  if (!mod) return c.json({ ...base, blocked: "Modul Booking Ruangan tidak tersedia untuk perusahaan ini." });
  if (mod.status === "paused") return c.json({ ...base, blocked: mod.pausedNote || "Modul Booking Ruangan sedang dijeda." });
  if (!room.active) return c.json({ ...base, blocked: "Ruangan ini sedang tidak aktif." });

  const hours = await db.select().from(s.roomHours).where(and(eq(s.roomHours.roomId, room.id), eq(s.roomHours.weekday, weekdayOf(date)))).get();
  const closure = await db
    .select()
    .from(s.roomClosures)
    .where(and(eq(s.roomClosures.orgId, org.id), eq(s.roomClosures.date, date), or(isNull(s.roomClosures.roomId), eq(s.roomClosures.roomId, room.id))))
    .get();

  const from = zonedToEpoch(date, 0, tz);
  const to = zonedToEpoch(date, 1440, tz);
  const today = await db
    .select({ b: s.bookings, userName: s.users.name })
    .from(s.bookings)
    .innerJoin(s.users, eq(s.users.id, s.bookings.userId))
    .where(and(eq(s.bookings.roomId, room.id), inArray(s.bookings.status, ["confirmed", "pending"]), lt(s.bookings.startAt, to), gt(s.bookings.endAt, from)))
    .orderBy(asc(s.bookings.startAt))
    .all();
  const later = await db
    .select({ b: s.bookings, userName: s.users.name })
    .from(s.bookings)
    .innerJoin(s.users, eq(s.users.id, s.bookings.userId))
    .where(
      and(
        eq(s.bookings.roomId, room.id),
        inArray(s.bookings.status, ["confirmed", "pending"]),
        gte(s.bookings.startAt, to),
        lt(s.bookings.startAt, to + LATER_DAYS * 86_400),
      ),
    )
    .orderBy(asc(s.bookings.startAt))
    .limit(1)
    .get();

  const rows = later ? [...today, later] : today;
  const people = await participantsFor(c, rows.map((r) => r.b.id));
  const dto = ({ b, userName }: (typeof rows)[number]): DisplayBooking => {
    const start = epochToZoned(b.startAt, tz);
    const end = epochToZoned(b.endAt, tz);
    return {
      id: b.id,
      title: b.title,
      userName,
      date: start.date,
      startMin: start.minutes,
      endMin: end.date === start.date ? end.minutes : 1440,
      startAt: b.startAt,
      endAt: b.endAt,
      participants: people.get(b.id) ?? [],
    };
  };

  return c.json<DisplayFeed>({
    ...base,
    hours: hours ? { weekday: hours.weekday, openMin: hours.openMin, closeMin: hours.closeMin, breakStart: hours.breakStart, breakEnd: hours.breakEnd } : null,
    closure: closure ? closure.note : null,
    bookings: today.map(dto),
    later: later ? dto(later) : null,
  });
});

// Perangkat keluar dari mode layar sendiri. Tokennya ikut dicabut.
display.post("/unpair", async (c) => {
  const { d } = await loadDisplay(c);
  await c.get("db").update(s.roomDisplays).set({ revokedAt: now() }).where(eq(s.roomDisplays.id, d.id)).run();
  await audit(c, d.orgId, "room.display.unpair", d.name);
  return c.json({ ok: true });
});
