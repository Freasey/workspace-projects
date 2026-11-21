import { Hono } from "hono";
import { and, asc, eq, gt, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  DEFAULT_HOURS,
  DEFAULT_SETTINGS,
  fmtMin,
  MAX_PARTICIPANTS,
  SLOT_MINUTES,
  WEEKDAY_NAMES,
  type BookingDto,
  type ClosureDto,
  type PersonDto,
  type RoomDisplayCreated,
  type RoomDisplayDto,
  type RoomDto,
  type RoomHour,
  type RoomSettings,
} from "@app/shared";
import * as s from "../db/schema";
import { AppError, audit, parse, requireModule, type AppEnv, type Ctx, type UserAuth } from "../lib/context";
import { randomCode, sha256 } from "../lib/crypto";
import { daysBetween, epochToZoned, isValidDate, now, weekdayOf, zonedToEpoch } from "../lib/time";

type RoomRow = typeof s.rooms.$inferSelect;
type BookingRow = typeof s.bookings.$inferSelect;

const HOLDING = ["confirmed", "pending"] as const;
const slot = z.number().int().min(0).max(1440).multipleOf(SLOT_MINUTES, `harus kelipatan ${SLOT_MINUTES} menit`);
const dateStr = z.string().refine(isValidDate, "tanggal tidak valid");

const hourShape = z
  .object({
    weekday: z.number().int().min(0).max(6),
    openMin: slot,
    closeMin: slot,
    breakStart: slot.nullable().default(null),
    breakEnd: slot.nullable().default(null),
  })
  .refine((h) => h.closeMin > h.openMin, "jam tutup harus setelah jam buka")
  .refine((h) => (h.breakStart === null) === (h.breakEnd === null), "jam istirahat harus lengkap")
  .refine(
    (h) => h.breakStart === null || (h.breakEnd! > h.breakStart && h.breakStart >= h.openMin && h.breakEnd! <= h.closeMin),
    "jam istirahat harus di dalam jam buka",
  );

// Isian tab Simple dan Advanced adalah data yang sama. Setiap isian opsional,
// sehingga menyimpan dari tab Simple tidak menyentuh isian Advanced.
const roomPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  capacity: z.number().int().min(1).max(10_000).optional(),
  location: z.string().trim().max(120).optional(),
  active: z.boolean().optional(),
  facilities: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  bufferMin: z.number().int().min(0).max(120).multipleOf(5).optional(),
  maxDurationMin: z.number().int().min(SLOT_MINUTES).max(1440).multipleOf(SLOT_MINUTES).nullable().optional(),
  maxDaysAhead: z.number().int().min(0).max(365).nullable().optional(),
});

function requireAdmin(a: UserAuth) {
  if (a.user.role !== "admin") throw new AppError(403, "FORBIDDEN", "Hanya admin perusahaan yang bisa melakukan ini.");
}

async function getRoom(c: Ctx, orgId: string, id: string): Promise<RoomRow> {
  const room = await c.get("db").select().from(s.rooms).where(and(eq(s.rooms.id, id), eq(s.rooms.orgId, orgId))).get();
  if (!room) throw new AppError(404, "NOT_FOUND", "Ruangan tidak ditemukan.");
  return room;
}

async function hoursFor(c: Ctx, roomIds: string[]): Promise<Map<string, RoomHour[]>> {
  const map = new Map<string, RoomHour[]>();
  if (!roomIds.length) return map;
  const rows = await c.get("db").select().from(s.roomHours).where(inArray(s.roomHours.roomId, roomIds)).orderBy(asc(s.roomHours.weekday)).all();
  for (const { roomId, ...h } of rows) map.set(roomId, [...(map.get(roomId) ?? []), h]);
  return map;
}

function toRoomDto(r: RoomRow, hours: RoomHour[]): RoomDto {
  return {
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    location: r.location,
    active: r.active,
    facilities: JSON.parse(r.facilities) as string[],
    bufferMin: r.bufferMin,
    maxDurationMin: r.maxDurationMin,
    maxDaysAhead: r.maxDaysAhead,
    hours,
  };
}

async function getSettings(c: Ctx, orgId: string): Promise<RoomSettings> {
  const row = await c.get("db").select().from(s.roomSettings).where(eq(s.roomSettings.orgId, orgId)).get();
  return row
    ? { maxDurationMin: row.maxDurationMin, maxDaysAhead: row.maxDaysAhead, minNoticeMin: row.minNoticeMin }
    : DEFAULT_SETTINGS;
}

// D1 membatasi jumlah parameter per query, jadi daftar id dipecah.
function chunks<T>(list: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Peserta per booking, urut nama. */
export async function participantsFor(c: Ctx, bookingIds: string[]): Promise<Map<string, PersonDto[]>> {
  const map = new Map<string, PersonDto[]>();
  for (const ids of chunks(bookingIds)) {
    const rows = await c
      .get("db")
      .select({ bookingId: s.bookingParticipants.bookingId, id: s.users.id, name: s.users.name })
      .from(s.bookingParticipants)
      .innerJoin(s.users, eq(s.users.id, s.bookingParticipants.userId))
      // User yang dinonaktifkan tidak lagi tampil sebagai peserta.
      .where(and(inArray(s.bookingParticipants.bookingId, ids), eq(s.users.active, true)))
      .orderBy(asc(s.users.name))
      .all();
    for (const { bookingId, ...p } of rows) map.set(bookingId, [...(map.get(bookingId) ?? []), p]);
  }
  return map;
}

/**
 * Memeriksa calon peserta: harus user aktif di PT yang sama. Pemesan dan id ganda
 * dibuang. Mengembalikan id yang valid.
 */
async function checkParticipants(c: Ctx, a: UserAuth, ids: string[], bookerId: string): Promise<string[]> {
  const wanted = [...new Set(ids)].filter((id) => id !== bookerId);
  if (!wanted.length) return [];
  const found = new Set<string>();
  for (const part of chunks(wanted)) {
    const rows = await c
      .get("db")
      .select({ id: s.users.id })
      .from(s.users)
      .where(and(eq(s.users.orgId, a.org.id), eq(s.users.active, true), inArray(s.users.id, part)))
      .all();
    for (const r of rows) found.add(r.id);
  }
  if (found.size !== wanted.length) throw new AppError(400, "INVALID_PARTICIPANT", "Ada peserta yang bukan pengguna aktif di perusahaan ini.");
  return wanted;
}

async function saveParticipants(c: Ctx, bookingId: string, userIds: string[]) {
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM booking_participants WHERE booking_id = ?").bind(bookingId),
    ...userIds.map((u) => c.env.DB.prepare("INSERT INTO booking_participants (booking_id, user_id) VALUES (?, ?)").bind(bookingId, u)),
  ]);
}

function toBookingDto(b: BookingRow, roomName: string, userName: string, tz: string, participants: PersonDto[] = []): BookingDto {
  const start = epochToZoned(b.startAt, tz);
  const end = epochToZoned(b.endAt, tz);
  return {
    id: b.id,
    roomId: b.roomId,
    roomName,
    userId: b.userId,
    userName,
    title: b.title,
    note: b.note,
    date: start.date,
    startMin: start.minutes,
    // Booking yang berakhir tepat tengah malam ditampilkan sebagai 24.00 hari yang sama.
    endMin: end.date === start.date ? end.minutes : 1440,
    startAt: b.startAt,
    endAt: b.endAt,
    // Tanpa proses terjadwal: status "selesai" dihitung saat dibaca.
    status: b.status === "confirmed" && b.endAt <= now() ? "completed" : b.status === "confirmed" ? "confirmed" : "cancelled",
    participants,
  };
}

async function listBookings(c: Ctx, a: UserAuth, where: ReturnType<typeof and>): Promise<BookingDto[]> {
  const rows = await c
    .get("db")
    .select({ b: s.bookings, roomName: s.rooms.name, userName: s.users.name })
    .from(s.bookings)
    .innerJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
    .innerJoin(s.users, eq(s.users.id, s.bookings.userId))
    .where(and(eq(s.bookings.orgId, a.org.id), where))
    .orderBy(asc(s.bookings.startAt))
    .all();
  const people = await participantsFor(c, rows.map((r) => r.b.id));
  return rows.map((r) => toBookingDto(r.b, r.roomName, r.userName, a.org.timezone, people.get(r.b.id)));
}

export const rooms = new Hono<AppEnv>();

// ---- Ruangan ----

rooms.get("/", async (c) => {
  const a = await requireModule(c, "rooms");
  const rows = await c.get("db").select().from(s.rooms).where(eq(s.rooms.orgId, a.org.id)).orderBy(asc(s.rooms.name)).all();
  const visible = a.user.role === "admin" ? rows : rows.filter((r) => r.active);
  const hours = await hoursFor(c, visible.map((r) => r.id));
  return c.json({ rooms: visible.map((r) => toRoomDto(r, hours.get(r.id) ?? [])), settings: await getSettings(c, a.org.id) });
});

// Daftar orang untuk memilih peserta. Terbuka untuk semua user modul, hanya nama.
rooms.get("/people", async (c) => {
  const a = await requireModule(c, "rooms");
  const people = await c
    .get("db")
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .where(and(eq(s.users.orgId, a.org.id), eq(s.users.active, true)))
    .orderBy(asc(s.users.name))
    .all();
  return c.json({ people: people satisfies PersonDto[] });
});

rooms.post("/", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const body = await parse(c, roomPatch.required({ name: true }));
  const db = c.get("db");
  const id = crypto.randomUUID();
  await db
    .insert(s.rooms)
    .values({
      id,
      orgId: a.org.id,
      name: body.name,
      capacity: body.capacity ?? 1,
      location: body.location ?? "",
      active: true,
      facilities: JSON.stringify(body.facilities ?? []),
      bufferMin: body.bufferMin ?? 0,
      maxDurationMin: body.maxDurationMin ?? null,
      maxDaysAhead: body.maxDaysAhead ?? null,
      createdAt: now(),
    })
    .run();
  // Ruangan baru langsung punya jadwal bawaan supaya bisa dibooking.
  for (const weekday of DEFAULT_HOURS.weekdays) {
    await db.insert(s.roomHours).values({ roomId: id, weekday, openMin: DEFAULT_HOURS.openMin, closeMin: DEFAULT_HOURS.closeMin }).run();
  }
  await audit(c, a.org.id, "room.create", body.name);
  const hours = await hoursFor(c, [id]);
  return c.json({ room: toRoomDto(await getRoom(c, a.org.id, id), hours.get(id) ?? []) }, 201);
});

rooms.patch("/:id", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const room = await getRoom(c, a.org.id, c.req.param("id"));
  const { facilities, ...rest } = await parse(c, roomPatch);
  const db = c.get("db");
  const set: Partial<RoomRow> = { ...rest };
  if (facilities) set.facilities = JSON.stringify(facilities);
  if (Object.keys(set).length) await db.update(s.rooms).set(set).where(eq(s.rooms.id, room.id)).run();

  let cancelled = 0;
  if (rest.active === false && room.active) {
    // Ruangan dinonaktifkan: booking mendatangnya dibatalkan.
    const result = await db
      .update(s.bookings)
      .set({ status: "cancelled", cancelledAt: now(), cancelledBy: "system:room-deactivated" })
      .where(and(eq(s.bookings.roomId, room.id), inArray(s.bookings.status, [...HOLDING]), gt(s.bookings.startAt, now())))
      .run();
    cancelled = result.meta.changes;
  }
  await audit(c, a.org.id, "room.update", `${room.name}: ${Object.keys({ ...rest, ...(facilities ? { facilities } : {}) }).join(", ")}`);
  const hours = await hoursFor(c, [room.id]);
  return c.json({ room: toRoomDto(await getRoom(c, a.org.id, room.id), hours.get(room.id) ?? []), cancelledBookings: cancelled });
});

/** Booking mendatang yang berada di luar jadwal yang diberikan. */
async function bookingsOutsideHours(c: Ctx, a: UserAuth, roomId: string, hours: RoomHour[]): Promise<BookingDto[]> {
  const upcoming = await listBookings(
    c,
    a,
    and(eq(s.bookings.roomId, roomId), inArray(s.bookings.status, [...HOLDING]), gt(s.bookings.startAt, now())),
  );
  return upcoming.filter((b) => {
    const h = hours.find((x) => x.weekday === weekdayOf(b.date));
    if (!h || b.startMin < h.openMin || b.endMin > h.closeMin) return true;
    return h.breakStart !== null && b.startMin < h.breakEnd! && b.endMin > h.breakStart;
  });
}

// Mengganti seluruh jadwal ruangan. Dengan ?preview=1 tidak ada yang disimpan:
// hanya mengembalikan booking yang akan berada di luar jadwal baru.
rooms.put("/:id/hours", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const room = await getRoom(c, a.org.id, c.req.param("id"));
  const body = await parse(
    c,
    z.object({ hours: z.array(hourShape).max(7) }).refine((b) => new Set(b.hours.map((h) => h.weekday)).size === b.hours.length, "hari tidak boleh ganda"),
  );
  const affected = await bookingsOutsideHours(c, a, room.id, body.hours);
  if (c.req.query("preview")) return c.json({ affected });

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM room_hours WHERE room_id = ?").bind(room.id),
    ...body.hours.map((h) =>
      c.env.DB.prepare(
        "INSERT INTO room_hours (room_id, weekday, open_min, close_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(room.id, h.weekday, h.openMin, h.closeMin, h.breakStart, h.breakEnd),
    ),
  ]);
  await audit(c, a.org.id, "room.hours", room.name);
  return c.json({ hours: body.hours.sort((x, y) => x.weekday - y.weekday), affected });
});

// ---- Batasan booking (seluruh perusahaan) ----

rooms.put("/settings", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const body = await parse(
    c,
    z.object({
      maxDurationMin: z.number().int().min(SLOT_MINUTES).max(1440).multipleOf(SLOT_MINUTES).optional(),
      maxDaysAhead: z.number().int().min(0).max(365).optional(),
      minNoticeMin: z.number().int().min(0).max(7 * 1440).optional(),
    }),
  );
  const next = { ...(await getSettings(c, a.org.id)), ...body };
  await c
    .get("db")
    .insert(s.roomSettings)
    .values({ orgId: a.org.id, ...next })
    .onConflictDoUpdate({ target: s.roomSettings.orgId, set: next })
    .run();
  await audit(c, a.org.id, "room.settings", Object.keys(body).join(", "));
  return c.json({ settings: next });
});

// ---- Tanggal tutup ----

rooms.get("/closures", async (c) => {
  const a = await requireModule(c, "rooms");
  const rows = await c.get("db").select().from(s.roomClosures).where(eq(s.roomClosures.orgId, a.org.id)).orderBy(asc(s.roomClosures.date)).all();
  return c.json({ closures: rows.map(({ orgId: _, ...r }): ClosureDto => r) });
});

rooms.post("/closures", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const body = await parse(c, z.object({ roomId: z.string().nullable().default(null), date: dateStr, note: z.string().trim().max(120).default("") }));
  if (body.roomId) await getRoom(c, a.org.id, body.roomId);
  const row = { id: crypto.randomUUID(), orgId: a.org.id, ...body };
  await c.get("db").insert(s.roomClosures).values(row).run();
  await audit(c, a.org.id, "room.closure.create", `${body.date} ${body.note}`.trim());
  return c.json({ closure: { id: row.id, roomId: row.roomId, date: row.date, note: row.note } satisfies ClosureDto }, 201);
});

rooms.delete("/closures/:id", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  await c.get("db").delete(s.roomClosures).where(and(eq(s.roomClosures.id, c.req.param("id")), eq(s.roomClosures.orgId, a.org.id))).run();
  await audit(c, a.org.id, "room.closure.delete");
  return c.json({ ok: true });
});

// ---- Booking ----

rooms.get("/bookings", async (c) => {
  const a = await requireModule(c, "rooms");
  if (c.req.query("mine")) {
    return c.json({ bookings: await listBookings(c, a, and(eq(s.bookings.userId, a.user.id), gte(s.bookings.endAt, now() - 30 * 86_400))) });
  }
  const date = c.req.query("date") ?? "";
  if (!isValidDate(date)) throw new AppError(400, "INVALID", "Tanggal tidak valid.");
  const from = zonedToEpoch(date, 0, a.org.timezone);
  const to = zonedToEpoch(date, 1440, a.org.timezone);
  return c.json({
    bookings: await listBookings(c, a, and(inArray(s.bookings.status, [...HOLDING]), lt(s.bookings.startAt, to), gt(s.bookings.endAt, from))),
  });
});

rooms.post("/bookings", async (c) => {
  const a = await requireModule(c, "rooms");
  const body = await parse(
    c,
    z.object({
      roomId: z.string(),
      date: dateStr,
      startMin: slot,
      endMin: slot,
      title: z.string().trim().min(1).max(120),
      note: z.string().trim().max(500).default(""),
      participantIds: z.array(z.string()).max(MAX_PARTICIPANTS, `peserta paling banyak ${MAX_PARTICIPANTS} orang`).default([]),
    }),
  );
  const db = c.get("db");
  const tz = a.org.timezone;
  const reject = (code: string, message: string) => new AppError(409, code, message);

  const room = await getRoom(c, a.org.id, body.roomId);
  if (!room.active) throw reject("ROOM_INACTIVE", "Ruangan ini sedang tidak aktif.");
  if (body.endMin <= body.startMin) throw new AppError(400, "INVALID", "Jam selesai harus setelah jam mulai.");

  const settings = await getSettings(c, a.org.id);
  const startAt = zonedToEpoch(body.date, body.startMin, tz);
  const endAt = zonedToEpoch(body.date, body.endMin, tz);
  const t = now();

  if (startAt < t) throw reject("IN_PAST", "Waktu mulai sudah lewat.");
  if (startAt < t + settings.minNoticeMin * 60) {
    throw reject("MIN_NOTICE", `Booking harus dibuat paling lambat ${settings.minNoticeMin} menit sebelum mulai.`);
  }
  const maxDuration = room.maxDurationMin ?? settings.maxDurationMin;
  if (body.endMin - body.startMin > maxDuration) {
    throw reject("MAX_DURATION", `Durasi maksimal untuk ruangan ini ${maxDuration / 60} jam.`);
  }
  const maxDaysAhead = room.maxDaysAhead ?? settings.maxDaysAhead;
  if (daysBetween(epochToZoned(t, tz).date, body.date) > maxDaysAhead) {
    throw reject("MAX_DAYS_AHEAD", `Ruangan ini hanya bisa dibooking paling jauh ${maxDaysAhead} hari ke depan.`);
  }

  const weekday = weekdayOf(body.date);
  const hours = await db.select().from(s.roomHours).where(and(eq(s.roomHours.roomId, room.id), eq(s.roomHours.weekday, weekday))).get();
  if (!hours) throw reject("CLOSED_DAY", `Ruangan ini tutup pada hari ${WEEKDAY_NAMES[weekday]}.`);
  if (body.startMin < hours.openMin || body.endMin > hours.closeMin) {
    throw reject("OUTSIDE_HOURS", `Ruangan ini buka ${fmtMin(hours.openMin)}–${fmtMin(hours.closeMin)} pada hari ${WEEKDAY_NAMES[weekday]}.`);
  }
  if (hours.breakStart !== null && body.startMin < hours.breakEnd! && body.endMin > hours.breakStart) {
    throw reject("BREAK", `Ruangan ini istirahat ${fmtMin(hours.breakStart)}–${fmtMin(hours.breakEnd!)}.`);
  }

  const closure = await db
    .select()
    .from(s.roomClosures)
    .where(and(eq(s.roomClosures.orgId, a.org.id), eq(s.roomClosures.date, body.date), or(isNull(s.roomClosures.roomId), eq(s.roomClosures.roomId, room.id))))
    .get();
  if (closure) throw reject("CLOSED_DATE", `Ruangan tutup pada tanggal ini${closure.note ? `: ${closure.note}` : "."}`);

  if (room.bufferMin > 0) {
    const pad = room.bufferMin * 60;
    const near = await db
      .select({ id: s.bookings.id })
      .from(s.bookings)
      .where(and(eq(s.bookings.roomId, room.id), inArray(s.bookings.status, [...HOLDING]), lt(s.bookings.startAt, endAt + pad), gt(s.bookings.endAt, startAt - pad)))
      .get();
    if (near) throw reject("BUFFER", `Ruangan ini butuh jeda ${room.bufferMin} menit dari booking lain.`);
  }

  const participantIds = await checkParticipants(c, a, body.participantIds, a.user.id);

  const id = crypto.randomUUID();
  try {
    await db
      .insert(s.bookings)
      .values({ id, orgId: a.org.id, roomId: room.id, userId: a.user.id, title: body.title, note: body.note, startAt, endAt, status: "confirmed", createdAt: t })
      .run();
  } catch (err) {
    // Trigger database menolak booking yang tumpang-tindih.
    if (String((err as Error).message).includes("BOOKING_OVERLAP") || String((err as { cause?: Error }).cause?.message).includes("BOOKING_OVERLAP")) {
      throw reject("OVERLAP", "Ruangan sudah dibooking pada jam itu.");
    }
    throw err;
  }
  if (participantIds.length) await saveParticipants(c, id, participantIds);
  await audit(c, a.org.id, "booking.create", `${room.name}, ${body.date} ${fmtMin(body.startMin)}–${fmtMin(body.endMin)}: ${body.title}`);
  const [booking] = await listBookings(c, a, eq(s.bookings.id, id));
  return c.json({ booking }, 201);
});

rooms.post("/bookings/:id/cancel", async (c) => {
  const a = await requireModule(c, "rooms");
  const db = c.get("db");
  const booking = await db.select().from(s.bookings).where(and(eq(s.bookings.id, c.req.param("id")), eq(s.bookings.orgId, a.org.id))).get();
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking tidak ditemukan.");
  if (booking.userId !== a.user.id && a.user.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Hanya pemesan atau admin yang bisa membatalkan booking ini.");
  }
  if (!HOLDING.includes(booking.status as (typeof HOLDING)[number])) throw new AppError(409, "NOT_ACTIVE", "Booking ini sudah tidak aktif.");
  if (booking.startAt <= now()) throw new AppError(409, "ALREADY_STARTED", "Booking yang sudah mulai tidak bisa dibatalkan.");
  await db.update(s.bookings).set({ status: "cancelled", cancelledAt: now(), cancelledBy: a.user.id }).where(eq(s.bookings.id, booking.id)).run();
  await audit(c, a.org.id, "booking.cancel", booking.title);
  return c.json({ ok: true });
});

// Mengganti daftar peserta. Boleh oleh pemesan atau admin, selama booking belum selesai.
rooms.put("/bookings/:id/participants", async (c) => {
  const a = await requireModule(c, "rooms");
  const body = await parse(c, z.object({ participantIds: z.array(z.string()).max(MAX_PARTICIPANTS, `peserta paling banyak ${MAX_PARTICIPANTS} orang`) }));
  const booking = await c.get("db").select().from(s.bookings).where(and(eq(s.bookings.id, c.req.param("id")), eq(s.bookings.orgId, a.org.id))).get();
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking tidak ditemukan.");
  if (booking.userId !== a.user.id && a.user.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Hanya pemesan atau admin yang bisa mengubah peserta.");
  }
  if (!HOLDING.includes(booking.status as (typeof HOLDING)[number])) throw new AppError(409, "NOT_ACTIVE", "Booking ini sudah tidak aktif.");
  if (booking.endAt <= now()) throw new AppError(409, "ALREADY_ENDED", "Booking yang sudah selesai tidak bisa diubah.");
  const ids = await checkParticipants(c, a, body.participantIds, booking.userId);
  await saveParticipants(c, booking.id, ids);
  await audit(c, a.org.id, "booking.participants", `${booking.title}: ${ids.length} peserta`);
  const [dto] = await listBookings(c, a, eq(s.bookings.id, booking.id));
  return c.json({ booking: dto });
});

// ---- Layar ruangan (dikelola admin) ----

const PAIR_TTL = 15 * 60;

function toDisplayDto(d: typeof s.roomDisplays.$inferSelect): RoomDisplayDto {
  return {
    id: d.id,
    roomId: d.roomId,
    name: d.name,
    createdAt: d.createdAt,
    pairedAt: d.pairedAt,
    lastSeenAt: d.lastSeenAt,
    pairExpiresAt: d.pairedAt ? null : d.pairExpiresAt,
  };
}

rooms.get("/:id/displays", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const room = await getRoom(c, a.org.id, c.req.param("id"));
  const rows = await c
    .get("db")
    .select()
    .from(s.roomDisplays)
    .where(and(eq(s.roomDisplays.roomId, room.id), isNull(s.roomDisplays.revokedAt)))
    .orderBy(asc(s.roomDisplays.createdAt))
    .all();
  // Kode yang kedaluwarsa tanpa pernah dipakai tidak perlu ditampilkan.
  const live = rows.filter((d) => d.pairedAt || (d.pairExpiresAt ?? 0) > now());
  return c.json({ displays: live.map(toDisplayDto) });
});

// Membuat layar baru beserta kode pemasangan sekali pakai (berlaku 15 menit).
rooms.post("/:id/displays", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const room = await getRoom(c, a.org.id, c.req.param("id"));
  const body = await parse(c, z.object({ name: z.string().trim().max(60).default("") }));
  const code = randomCode(8);
  const row = {
    id: crypto.randomUUID(),
    orgId: a.org.id,
    roomId: room.id,
    name: body.name || `Layar ${room.name}`,
    pairCodeHash: await sha256(code),
    pairExpiresAt: now() + PAIR_TTL,
    tokenHash: null,
    createdBy: a.user.id,
    createdAt: now(),
    pairedAt: null,
    lastSeenAt: null,
    revokedAt: null,
  };
  await c.get("db").insert(s.roomDisplays).values(row).run();
  await audit(c, a.org.id, "room.display.create", `${room.name}: ${row.name}`);
  return c.json({ display: toDisplayDto(row), code: `${code.slice(0, 4)}-${code.slice(4)}` } satisfies RoomDisplayCreated, 201);
});

rooms.post("/displays/:displayId/revoke", async (c) => {
  const a = await requireModule(c, "rooms");
  requireAdmin(a);
  const db = c.get("db");
  const d = await db.select().from(s.roomDisplays).where(and(eq(s.roomDisplays.id, c.req.param("displayId")), eq(s.roomDisplays.orgId, a.org.id))).get();
  if (!d) throw new AppError(404, "NOT_FOUND", "Layar tidak ditemukan.");
  await db.update(s.roomDisplays).set({ revokedAt: now(), pairCodeHash: null }).where(eq(s.roomDisplays.id, d.id)).run();
  await audit(c, a.org.id, "room.display.revoke", d.name);
  return c.json({ ok: true });
});
