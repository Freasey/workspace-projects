import { DEFAULT_HOURS } from "@app/shared";
import * as s from "../db/schema";
import type { Ctx } from "./context";
import { epochToZoned, now, weekdayOf, zonedToEpoch } from "./time";

const SAMPLE_ROOMS = [
  { name: "Ruang Rapat Utama", capacity: 12, location: "Lantai 2", facilities: ["Proyektor", "Papan tulis", "Konferensi video"] },
  { name: "Ruang Diskusi", capacity: 6, location: "Lantai 2", facilities: ["TV", "Papan tulis"] },
  { name: "Pod Fokus", capacity: 2, location: "Lantai 1", facilities: [] },
];
// Indeks ruangan, jam mulai, jam selesai, judul.
const SAMPLE_BOOKINGS: [number, number, number, string][] = [
  [0, 9 * 60, 10 * 60 + 30, "Contoh: Rapat mingguan tim"],
  [1, 13 * 60, 14 * 60, "Contoh: Diskusi proyek"],
];

/**
 * Data contoh modul Booking Ruangan untuk PT yang baru dibuat, supaya layar
 * pertamanya tidak kosong. Semuanya data biasa: admin PT bebas mengubah,
 * menonaktifkan ruangan, atau membatalkan booking contoh.
 */
export async function seedRoomsSample(c: Ctx, orgId: string, adminUserId: string, tz: string): Promise<void> {
  const db = c.get("db");
  const t = now();
  const roomIds: string[] = [];
  for (const r of SAMPLE_ROOMS) {
    const id = crypto.randomUUID();
    roomIds.push(id);
    await db
      .insert(s.rooms)
      .values({ id, orgId, name: r.name, capacity: r.capacity, location: r.location, active: true, facilities: JSON.stringify(r.facilities), bufferMin: 0, maxDurationMin: null, maxDaysAhead: null, createdAt: t })
      .run();
    for (const weekday of DEFAULT_HOURS.weekdays) {
      await db.insert(s.roomHours).values({ roomId: id, weekday, openMin: DEFAULT_HOURS.openMin, closeMin: DEFAULT_HOURS.closeMin }).run();
    }
  }

  // Booking contoh diletakkan di hari kerja berikutnya menurut zona waktu PT.
  let date = epochToZoned(t + 86_400, tz).date;
  while (!DEFAULT_HOURS.weekdays.includes(weekdayOf(date))) date = epochToZoned(zonedToEpoch(date, 720, tz) + 86_400, tz).date;
  for (const [room, startMin, endMin, title] of SAMPLE_BOOKINGS) {
    await db
      .insert(s.bookings)
      .values({
        id: crypto.randomUUID(),
        orgId,
        roomId: roomIds[room]!,
        userId: adminUserId,
        title,
        note: "Data contoh dari sistem. Boleh dibatalkan.",
        startAt: zonedToEpoch(date, startMin, tz),
        endAt: zonedToEpoch(date, endMin, tz),
        status: "confirmed",
        createdAt: t,
      })
      .run();
  }
}
