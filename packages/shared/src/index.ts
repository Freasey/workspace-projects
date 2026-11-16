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
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

export const WEEKDAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
