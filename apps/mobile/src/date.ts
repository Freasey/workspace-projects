// Pembantu tanggal. Tanggal ditulis "YYYY-MM-DD" dan jam sebagai menit sejak
// tengah malam, keduanya menurut zona waktu PT (bukan zona waktu ponsel).

// Zona waktu yang didukung sistem tidak punya DST, jadi selisihnya tetap.
const OFFSET_MIN: Record<string, number> = {
  "Asia/Jakarta": 7 * 60,
  "Asia/Makassar": 8 * 60,
  "Asia/Jayapura": 9 * 60,
};

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const zoned = (tz: string, ms = Date.now()) => new Date(ms + (OFFSET_MIN[tz] ?? 7 * 60) * 60_000);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export const todayIn = (tz: string): string => zoned(tz).toISOString().slice(0, 10);

export function nowMinIn(tz: string): number {
  const d = zoned(tz);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export const addDays = (date: string, n: number): string => new Date(utc(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const weekdayOf = (date: string): number => utc(date).getUTCDay();
export const daysBetween = (from: string, to: string): number => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);

/** "Senin, 16 November 2026" */
export function fmtDate(date: string): string {
  const d = utc(date);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Sen, 16 Nov" */
export function fmtDateShort(date: string): string {
  const d = utc(date);
  return `${DAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export const dayShort = (date: string): string => DAYS_SHORT[weekdayOf(date)]!;
export const dayOfMonth = (date: string): number => utc(date).getUTCDate();
export const monthTitle = (year: number, month: number): string => `${MONTHS[month]} ${year}`;
export const WEEK_HEADER = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** Minggu-minggu (Senin lebih dulu) yang menutupi satu bulan; null untuk sel kosong. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
