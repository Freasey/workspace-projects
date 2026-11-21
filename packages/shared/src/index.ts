// Tipe dan konstanta yang dipakai bersama oleh API dan web (dan nanti mobile).

export const MODULES = [
  { key: "rooms", name: "Booking Ruangan", description: "Pesan ruang rapat tanpa bentrok" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export const MODULE_KEYS = MODULES.map((m) => m.key) as ModuleKey[];

export type ModuleStatus = "active" | "paused";
export type OrgStatus = "active" | "suspended" | "archived";
export type Role = "admin" | "member";

export const SLOT_MINUTES = 15;
export const DEFAULT_SETTINGS = { maxDurationMin: 240, maxDaysAhead: 30, minNoticeMin: 0 };
export const DEFAULT_HOURS = { weekdays: [1, 2, 3, 4, 5], openMin: 8 * 60, closeMin: 18 * 60 };
export const TIMEZONES = [
  { value: "Asia/Jakarta", label: "WIB (Jakarta)" },
  { value: "Asia/Makassar", label: "WITA (Makassar)" },
  { value: "Asia/Jayapura", label: "WIT (Jayapura)" },
] as const;

export interface ApiError {
  error: { code: string; message: string };
}

/** Respons login. `token` hanya dikirim untuk klien mobile; web memakai cookie. */
export interface LoginResult {
  ok: true;
  token?: string;
  expiresAt?: number;
}

export interface OrgModule {
  key: ModuleKey;
  name: string;
  description: string;
  status: ModuleStatus;
  pausedNote: string | null;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}

export interface OrgDto {
  id: string;
  name: string;
  status: OrgStatus;
  maxUsers: number;
  timezone: string;
  createdAt: number;
  activeUsers: number;
}

export type Me =
  | { kind: "superadmin"; email: string }
  | {
      kind: "user";
      impersonated: boolean;
      user: UserDto;
      org: Pick<OrgDto, "id" | "name" | "status" | "timezone">;
      modules: OrgModule[];
    };

export interface AuditDto {
  id: string;
  orgId: string | null;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: number;
}

export interface RoomHour {
  weekday: number; // 0 = Minggu
  openMin: number;
  closeMin: number;
  breakStart: number | null;
  breakEnd: number | null;
}

export interface RoomDto {
  id: string;
  name: string;
  capacity: number;
  location: string;
  active: boolean;
  facilities: string[];
  bufferMin: number;
  maxDurationMin: number | null;
  maxDaysAhead: number | null;
  hours: RoomHour[];
}

export interface RoomSettings {
  maxDurationMin: number;
  maxDaysAhead: number;
  minNoticeMin: number;
}

export interface ClosureDto {
  id: string;
  roomId: string | null;
  date: string;
  note: string;
}

export type BookingStatus = "confirmed" | "cancelled" | "completed";

/** Orang di PT yang sama, untuk memilih dan menampilkan peserta. */
export interface PersonDto {
  id: string;
  name: string;
}

export const MAX_PARTICIPANTS = 50;

export interface BookingDto {
  id: string;
  roomId: string;
  roomName: string;
  userId: string;
  userName: string;
  title: string;
  note: string;
  date: string;
  startMin: number;
  endMin: number;
  startAt: number;
  endAt: number;
  status: BookingStatus;
  /** Peserta selain pemesan. */
  participants: PersonDto[];
}

// ---- Layar ruangan ----

export interface RoomDisplayDto {
  id: string;
  roomId: string;
  name: string;
  createdAt: number;
  /** Null selama kode pemasangan belum dipakai. */
  pairedAt: number | null;
  lastSeenAt: number | null;
  /** Kode pemasangan masih berlaku sampai waktu ini (hanya sebelum dipasang). */
  pairExpiresAt: number | null;
}

/** Hasil membuat layar: kode pemasangan hanya dikirim sekali. */
export interface RoomDisplayCreated {
  display: RoomDisplayDto;
  code: string;
}

export interface DisplayPairResult {
  token: string;
  roomName: string;
}

export interface DisplayBooking {
  id: string;
  title: string;
  userName: string;
  date: string;
  startMin: number;
  endMin: number;
  startAt: number;
  endAt: number;
  participants: PersonDto[];
}

/** Isi layar ruangan. Dibaca ulang berkala oleh perangkat. */
export interface DisplayFeed {
  org: { name: string; timezone: string };
  room: { id: string; name: string; capacity: number; location: string; facilities: string[] };
  /** Waktu server (detik epoch). Perangkat memakainya untuk mengoreksi jamnya sendiri. */
  now: number;
  date: string;
  /** Tengah malam hari ini di zona waktu PT (detik epoch). */
  dayStart: number;
  hours: RoomHour | null;
  /** Catatan tanggal tutup hari ini; null kalau tidak tutup. Kosong berarti tutup tanpa catatan. */
  closure: string | null;
  /** Booking hari ini yang masih memegang slot, urut waktu. */
  bookings: DisplayBooking[];
  /** Booking pertama setelah hari ini (dalam 14 hari), untuk hitung mundur saat hari ini kosong. */
  later: DisplayBooking | null;
  /** Modul dijeda atau PT dihentikan: layar menampilkan pesan ini, bukan jadwal. */
  blocked: string | null;
}

/** Sisa waktu dalam detik → "1 j 05 m" atau "04:59". */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h >= 24) return `${Math.floor(h / 24)} hari ${h % 24} j`;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

export const WEEKDAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Booking yang mulai dalam waktu ini dianggap "segera dipakai". */
export const DISPLAY_SOON_SECONDS = 10 * 60;

export type DisplayTone = "busy" | "soon" | "free" | "closed";

export interface DisplayState {
  tone: DisplayTone;
  label: string;
  /** Booking yang sedang berjalan. */
  current: DisplayBooking | null;
  /** Booking berikutnya (hari ini, atau hari lain dari `later`). */
  next: DisplayBooking | null;
  /** Hitung mundur yang ditampilkan: ke akhir booking berjalan, atau ke awal booking berikutnya. */
  countdown: { label: string; seconds: number } | null;
  /** Keterangan tambahan, misalnya alasan tutup. */
  detail: string | null;
}

/**
 * Status layar ruangan pada detik `now`. Dihitung di perangkat setiap detik
 * dari isi terakhir, supaya hitung mundur tetap jalan di antara pembacaan.
 */
export function displayState(feed: DisplayFeed, now: number): DisplayState {
  const current = feed.bookings.find((b) => b.startAt <= now && b.endAt > now) ?? null;
  const next = feed.bookings.find((b) => b.startAt > now) ?? feed.later;
  const nowMin = Math.floor((now - feed.dayStart) / 60);
  const h = feed.hours;
  const closedAllDay = feed.closure !== null || !h;
  const inBreak = !!h && h.breakStart !== null && nowMin >= h.breakStart && nowMin < h.breakEnd!;
  const open = !closedAllDay && nowMin >= h!.openMin && nowMin < h!.closeMin && !inBreak;
  const toNext = next ? { label: next.date === feed.date ? "Dimulai dalam" : "Booking berikutnya dalam", seconds: next.startAt - now } : null;

  if (current) {
    return { tone: "busy", label: "Sedang dipakai", current, next, countdown: { label: "Berakhir dalam", seconds: current.endAt - now }, detail: null };
  }
  if (next && next.startAt - now <= DISPLAY_SOON_SECONDS) {
    return { tone: "soon", label: "Segera dipakai", current, next, countdown: toNext, detail: null };
  }
  if (open) {
    const freeUntil = next && next.date === feed.date ? `Kosong sampai ${fmtMin(next.startMin)}` : `Kosong sampai tutup ${fmtMin(h!.closeMin)}`;
    return { tone: "free", label: "Tersedia", current, next, countdown: toNext, detail: freeUntil };
  }
  let detail: string;
  if (feed.closure !== null) detail = `Tutup hari ini${feed.closure ? `: ${feed.closure}` : ""}`;
  else if (!h) detail = `Tutup setiap hari ${WEEKDAY_NAMES[new Date(`${feed.date}T00:00:00Z`).getUTCDay()]}`;
  else if (inBreak) detail = `Istirahat sampai ${fmtMin(h.breakEnd!)}`;
  else if (nowMin < h.openMin) detail = `Buka pukul ${fmtMin(h.openMin)}`;
  else detail = `Sudah tutup sejak ${fmtMin(h.closeMin)}`;
  return { tone: "closed", label: inBreak ? "Istirahat" : "Tutup", current, next, countdown: toNext, detail };
}

/** Jam lokal PT "HH.MM" untuk detik `now`. */
export const displayClock = (feed: DisplayFeed, now: number) => fmtMin(((Math.floor((now - feed.dayStart) / 60) % 1440) + 1440) % 1440);
