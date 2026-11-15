import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { fmtMin, SLOT_MINUTES, WEEKDAY_NAMES, type BookingDto, type BookingStatus, type ClosureDto, type RoomDto, type RoomSettings } from "@app/shared";
import { api, msg, todayIn, useUser } from "../api";
import { ErrorNote, Modal, ModeTabs, TimeSelect, useAction, useMedia, useMode } from "../components/ui";

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const fmtDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDateShort = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Menit sejak tengah malam saat ini di zona waktu PT. */
function nowMinIn(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

const STATUS: Record<BookingStatus, [string, string]> = {
  confirmed: ["Terkonfirmasi", "info"],
  completed: ["Selesai", ""],
  cancelled: ["Dibatalkan", "bad"],
};
const StatusBadge = ({ status }: { status: BookingStatus }) => <span className={`badge ${STATUS[status][1]}`}>{STATUS[status][0]}</span>;

interface Draft {
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
}

function useToast(): [string | null, (m: string) => void] {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 3500);
    return () => clearTimeout(t);
  }, [text]);
  return [text, setText];
}

export function RoomsBooking() {
  const me = useUser();
  const tz = me.org.timezone;
  const isAdmin = me.user.role === "admin";
  const narrow = useMedia("(max-width: 760px)");
  const [date, setDate] = useState(() => todayIn(tz));
  const [rooms, setRooms] = useState<RoomDto[] | null>(null);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [closures, setClosures] = useState<ClosureDto[]>([]);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<BookingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    try {
      const [r, cl, b] = await Promise.all([
        api<{ rooms: RoomDto[]; settings: RoomSettings }>("GET", "/rooms"),
        api<{ closures: ClosureDto[] }>("GET", "/rooms/closures"),
        api<{ bookings: BookingDto[] }>("GET", `/rooms/bookings?date=${date}`),
      ]);
      setRooms(r.rooms.filter((x) => x.active));
      setSettings(r.settings);
      setClosures(cl.closures);
      setBookings(b.bookings);
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, [date]);
  useEffect(() => void load(), [load]);

  const weekday = weekdayOf(date);
  const today = todayIn(tz);
  const closureOf = (room: RoomDto) => closures.find((c) => c.date === date && (c.roomId === null || c.roomId === room.id));
  const hoursOf = (room: RoomDto) => room.hours.find((h) => h.weekday === weekday);

  const newBooking = (roomId?: string) => {
    const room = rooms?.find((r) => r.id === roomId) ?? rooms?.find((r) => hoursOf(r) && !closureOf(r)) ?? rooms?.[0];
    if (!room) return;
    const h = hoursOf(room);
    const open = h?.openMin ?? 480;
    const close = h?.closeMin ?? 1080;
    // Hari ini: mulai dari slot berikutnya, bukan dari jam buka yang sudah lewat.
    const next = date === today ? Math.ceil((nowMinIn(tz) + 1) / SLOT_MINUTES) * SLOT_MINUTES : open;
    const startMin = Math.min(Math.max(open, next), close - SLOT_MINUTES);
    setDraft({ roomId: room.id, date, startMin, endMin: Math.min(startMin + 60, close) });
  };

  return (
    <>
      <div className="page-head">
        <div className="row">
          <h1 style={{ margin: 0 }}>{fmtDate(date)}</h1>
          <button className="sm" aria-label="Hari sebelumnya" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <button className="sm" aria-label="Hari berikutnya" onClick={() => setDate(addDays(date, 1))}>›</button>
          <button className="sm" disabled={date === today} onClick={() => setDate(today)}>Hari ini</button>
          <input type="date" aria-label="Pilih tanggal" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: "auto", padding: "4px 8px" }} />
        </div>
        {!!rooms?.length && <button className="primary" onClick={() => newBooking()}>+ Booking</button>}
      </div>
      <ErrorNote error={error} />

      {rooms?.length === 0 && !error && (
        <div className="card muted">
          Belum ada ruangan. {isAdmin ? <>Tambahkan lewat menu <Link to="/rooms/manage">Kelola ruangan</Link>.</> : "Minta admin PT Anda untuk menambahkannya."}
        </div>
      )}

      {!!rooms?.length && !narrow && (
        <section className="card" style={{ padding: 0 }}>
          <Timeline
            rooms={rooms}
            weekday={weekday}
            bookings={bookings}
            meId={me.user.id}
            nowMin={date === today ? nowMinIn(tz) : null}
            closureOf={closureOf}
            onPick={(roomId, startMin, endMin) => setDraft({ roomId, date, startMin, endMin })}
            onOpen={setDetail}
          />
        </section>
      )}

      {!!rooms?.length && narrow && (
        <section className="card">
          {rooms.map((room, i) => {
            const h = hoursOf(room);
            const closure = closureOf(room);
            const list = bookings.filter((b) => b.roomId === room.id);
            return (
              <div key={room.id} style={i ? { borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 } : undefined}>
                <div className="spread">
                  <div>
                    <strong>{room.name}</strong>
                    <div className="small muted">{roomMeta(room)}</div>
                  </div>
                  {h && !closure ? (
                    <button className="sm" onClick={() => newBooking(room.id)}>Booking</button>
                  ) : (
                    <span className="badge">{closure ? `Tutup${closure.note ? `: ${closure.note}` : ""}` : `Tutup hari ${WEEKDAY_NAMES[weekday]}`}</span>
                  )}
                </div>
                {h && !closure && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Buka {fmtMin(h.openMin)}–{fmtMin(h.closeMin)}
                    {h.breakStart !== null && `, istirahat ${fmtMin(h.breakStart)}–${fmtMin(h.breakEnd!)}`}
                    {list.length === 0 && ". Belum ada booking."}
                  </div>
                )}
                {list.map((b) => (
                  <div key={b.id} className="list-item" style={{ borderTop: 0, padding: "8px 0 0" }}>
                    <span className="num">{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</span>
                    <span className="g"><strong>{b.title}</strong><span className="small muted">{b.userName}</span></span>
                    <button className="sm" onClick={() => setDetail(b)}>Detail</button>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {draft && rooms && settings && (
        <BookingDialog
          draft={draft}
          rooms={rooms}
          settings={settings}
          onClose={() => setDraft(null)}
          onDone={async (b) => {
            setDraft(null);
            if (b.date !== date) setDate(b.date);
            else await load();
            setToast(`Booking tersimpan: ${b.roomName}, ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}.`);
          }}
        />
      )}
      {detail && (
        <BookingDetail
          booking={detail}
          onClose={() => setDetail(null)}
          onCancelled={async () => {
            setDetail(null);
            await load();
            setToast("Booking dibatalkan.");
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

const roomMeta = (room: RoomDto) =>
  `${room.capacity} orang${room.location ? ` · ${room.location}` : ""}${room.facilities.length ? ` · ${room.facilities.join(", ")}` : ""}`;

interface TimelineProps {
  rooms: RoomDto[];
  weekday: number;
  bookings: BookingDto[];
  meId: string;
  /** Posisi garis "sekarang"; null kalau tanggal yang dilihat bukan hari ini. */
  nowMin: number | null;
  closureOf: (room: RoomDto) => ClosureDto | undefined;
  onPick: (roomId: string, startMin: number, endMin: number) => void;
  onOpen: (b: BookingDto) => void;
}

function Timeline({ rooms, weekday, bookings, meId, nowMin, closureOf, onPick, onOpen }: TimelineProps) {
  // Rentang jam mengikuti ruangan yang buka paling awal dan tutup paling akhir, dibulatkan ke jam penuh.
  const dayHours = rooms.flatMap((r) => (closureOf(r) ? [] : r.hours.filter((h) => h.weekday === weekday)));
  const from = dayHours.length ? Math.floor(Math.min(...dayHours.map((h) => h.openMin)) / 60) * 60 : 480;
  const to = dayHours.length ? Math.ceil(Math.max(...dayHours.map((h) => h.closeMin)) / 60) * 60 : 1080;
  const slots = (to - from) / SLOT_MINUTES;
  const col = (min: number) => Math.round((Math.min(Math.max(min, from), to) - from) / SLOT_MINUTES) + 1;
  const span = (a: number, b: number) => ({ gridColumn: `${col(a)} / ${col(b)}` });
  const grid = { gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))`, backgroundSize: `${6000 / (to - from)}% 100%` };

  const drag = useRef<{ roomId: string; left: number; width: number; lo: number; hi: number; a: number } | null>(null);
  const [sel, setSel] = useState<{ roomId: string; a: number; b: number } | null>(null);
  const slotAt = (x: number) => {
    const d = drag.current!;
    return Math.max(d.lo, Math.min(d.hi, Math.floor(((x - d.left) / d.width) * slots)));
  };

  const down = (e: PointerEvent<HTMLDivElement>, room: RoomDto, openMin: number, closeMin: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".tl-ev")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { roomId: room.id, left: rect.left, width: rect.width, lo: (openMin - from) / SLOT_MINUTES, hi: (closeMin - from) / SLOT_MINUTES - 1, a: 0 };
    const a = slotAt(e.clientX);
    drag.current.a = a;
    setSel({ roomId: room.id, a, b: a });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setSel({ roomId: drag.current.roomId, a: drag.current.a, b: slotAt(e.clientX) });
  };
  const up = (closeMin: number) => {
    if (!drag.current || !sel) return;
    const s = Math.min(sel.a, sel.b);
    const e = Math.max(sel.a, sel.b) + 1;
    const startMin = from + s * SLOT_MINUTES;
    // Klik tanpa seret: usulkan 1 jam.
    const endMin = sel.a === sel.b ? Math.min(startMin + 60, closeMin) : from + e * SLOT_MINUTES;
    const roomId = drag.current.roomId;
    drag.current = null;
    setSel(null);
    onPick(roomId, startMin, endMin);
  };
  const cancelDrag = () => {
    drag.current = null;
    setSel(null);
  };

  const hourMarks: number[] = [];
  for (let m = from; m < to; m += 60) hourMarks.push(m);
  const nowLeft = nowMin !== null && nowMin >= from && nowMin <= to ? `${((nowMin - from) / (to - from)) * 100}%` : null;

  return (
    <div className="tl-wrap">
      <div className="tl">
        <div className="tl-row head">
          <div className="tl-lab" />
          <div className="tl-track num" style={grid}>{hourMarks.map((m) => <span key={m}>{fmtMin(m)}</span>)}</div>
        </div>
        {rooms.map((room) => {
          const h = room.hours.find((x) => x.weekday === weekday);
          const closure = closureOf(room);
          const list = bookings.filter((b) => b.roomId === room.id && b.endMin > from && b.startMin < to);
          return (
            <div key={room.id} className="tl-row">
              <div className="tl-lab">
                <strong title={room.name}>{room.name}</strong>
                <span className="small muted">{room.capacity} orang{room.location && ` · ${room.location}`}</span>
              </div>
              {!h || closure ? (
                <div className="tl-track closed" style={{ gridTemplateColumns: grid.gridTemplateColumns }}>
                  <div className="tl-closed">{closure ? `Tutup${closure.note ? `: ${closure.note}` : ""}` : `Tutup hari ${WEEKDAY_NAMES[weekday]}`}</div>
                </div>
              ) : (
                <div
                  className="tl-track"
                  style={grid}
                  onPointerDown={(e) => down(e, room, h.openMin, h.closeMin)}
                  onPointerMove={move}
                  onPointerUp={() => up(h.closeMin)}
                  onPointerCancel={cancelDrag}
                >
                  {h.openMin > from && <div className="tl-off" style={span(from, h.openMin)} />}
                  {h.closeMin < to && <div className="tl-off" style={span(h.closeMin, to)} />}
                  {h.breakStart !== null && <div className="tl-off" style={span(h.breakStart, h.breakEnd!)}>Istirahat</div>}
                  {list.map((b) => (
                    <button
                      key={b.id}
                      className={`tl-ev${b.userId === meId ? " mine" : ""}${b.status === "completed" ? " done" : ""}`}
                      style={span(b.startMin, b.endMin)}
                      title={`${fmtMin(b.startMin)}–${fmtMin(b.endMin)} ${b.title} (${b.userName})`}
                      onClick={() => onOpen(b)}
                    >
                      {b.title}
                      <small>{b.userName}</small>
                    </button>
                  ))}
                  {sel?.roomId === room.id && <div className="tl-sel" style={{ gridColumn: `${Math.min(sel.a, sel.b) + 1} / ${Math.max(sel.a, sel.b) + 2}` }} />}
                  {nowLeft && <div className="tl-now" style={{ left: nowLeft }} />}
                </div>
              )}
            </div>
          );
        })}
        <div className="tl-legend">
          <span><i style={{ background: "color-mix(in srgb, var(--accent) 20%, var(--surface))", borderColor: "var(--accent)" }} />Terkonfirmasi</span>
          <span><i style={{ background: "var(--surface-2)" }} />Selesai</span>
          <span><i style={{ background: "repeating-linear-gradient(135deg, transparent 0 3px, var(--line) 3px 4px)" }} />Tutup atau istirahat</span>
          {nowLeft && <span><i style={{ width: 2, background: "var(--danger)", borderColor: "var(--danger)" }} />Sekarang</span>}
          <span>Klik atau seret area kosong untuk membuat booking. Garis tegak menandai tiap jam, berisi 4 slot.</span>
        </div>
      </div>
    </div>
  );
}

function BookingDialog(props: { draft: Draft; rooms: RoomDto[]; settings: RoomSettings; onClose: () => void; onDone: (b: BookingDto) => Promise<void> }) {
  const me = useUser();
  const [mode, setMode] = useMode(me.user.id);
  const [d, setD] = useState(props.draft);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();

  const room = props.rooms.find((r) => r.id === d.roomId) ?? props.rooms[0]!;
  const h = room.hours.find((x) => x.weekday === weekdayOf(d.date));
  const openMin = h?.openMin ?? 0;
  const closeMin = h?.closeMin ?? 1440;
  const maxDuration = room.maxDurationMin ?? props.settings.maxDurationMin;

  return (
    <Modal title="Booking baru" onClose={props.onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const res = await api<{ booking: BookingDto }>("POST", "/rooms/bookings", { ...d, title, note: mode === "advanced" ? note : "" });
            await props.onDone(res.booking);
          });
        }}
      >
        <div className="spread">
          <span className="small muted">{roomMeta(room)}</span>
          <ModeTabs mode={mode} onChange={setMode} advancedCount={note.trim() ? 1 : 0} />
        </div>
        <ErrorNote error={error && `Booking ditolak. ${error}`} />
        <div>
          <label htmlFor="b-room">Ruangan</label>
          <select id="b-room" value={d.roomId} onChange={(e) => setD({ ...d, roomId: e.target.value })}>
            {props.rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.capacity} orang)</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="b-date">Tanggal</label>
          <input id="b-date" type="date" required value={d.date} onChange={(e) => e.target.value && setD({ ...d, date: e.target.value })} />
        </div>
        <div className="fields">
          <div>
            <label>Mulai</label>
            <TimeSelect
              value={d.startMin}
              min={openMin}
              max={closeMin - SLOT_MINUTES}
              onChange={(v) => setD({ ...d, startMin: v, endMin: d.endMin <= v ? Math.min(v + 60, closeMin) : d.endMin })}
            />
          </div>
          <div>
            <label>Selesai</label>
            <TimeSelect value={d.endMin} min={d.startMin + SLOT_MINUTES} max={closeMin} onChange={(v) => setD({ ...d, endMin: v })} />
          </div>
        </div>
        <div>
          <label htmlFor="b-title">Judul</label>
          <input id="b-title" autoFocus required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misalnya: Rapat mingguan tim" />
        </div>
        {mode === "advanced" && (
          <div>
            <label htmlFor="b-note">Catatan</label>
            <textarea id="b-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <div className="small muted">
          {h ? `Buka ${fmtMin(h.openMin)}–${fmtMin(h.closeMin)}${h.breakStart !== null ? `, istirahat ${fmtMin(h.breakStart)}–${fmtMin(h.breakEnd!)}` : ""}.` : `Tutup pada hari ${WEEKDAY_NAMES[weekdayOf(d.date)]}.`}{" "}
          Durasi maksimal {maxDuration / 60} jam.
        </div>
        <div className="foot">
          <button type="button" onClick={props.onClose}>Batal</button>
          <button className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan booking"}</button>
        </div>
      </form>
    </Modal>
  );
}

function BookingDetail({ booking: b, onClose, onCancelled }: { booking: BookingDto; onClose: () => void; onCancelled: () => Promise<void> }) {
  const me = useUser();
  const [asking, setAsking] = useState(false);
  const { busy, error, run } = useAction();
  const canCancel = b.status === "confirmed" && b.startAt * 1000 > Date.now() && (b.userId === me.user.id || me.user.role === "admin");

  return (
    <Modal title={b.title} onClose={onClose}>
      <ErrorNote error={error} />
      <dl>
        <dt>Ruangan</dt><dd>{b.roomName}</dd>
        <dt>Waktu</dt><dd>{fmtDate(b.date)}, {fmtMin(b.startMin)}–{fmtMin(b.endMin)}</dd>
        <dt>Pemesan</dt><dd>{b.userName}</dd>
        <dt>Status</dt><dd><StatusBadge status={b.status} /></dd>
        {b.note && <><dt>Catatan</dt><dd>{b.note}</dd></>}
      </dl>
      {asking && <div className="notice warn">Batalkan booking ini? Slotnya langsung bisa dipakai orang lain.</div>}
      <div className="foot">
        {canCancel && !asking && <button className="danger" onClick={() => setAsking(true)}>Batalkan booking</button>}
        {asking && (
          <button
            className="danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("POST", `/rooms/bookings/${b.id}/cancel`);
                await onCancelled();
              })
            }
          >
            Ya, batalkan
          </button>
        )}
        <button onClick={asking ? () => setAsking(false) : onClose}>{asking ? "Tidak jadi" : "Tutup"}</button>
      </div>
    </Modal>
  );
}

export function MyBookings() {
  const [mine, setMine] = useState<BookingDto[] | null>(null);
  const [detail, setDetail] = useState<BookingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    try {
      setMine((await api<{ bookings: BookingDto[] }>("GET", "/rooms/bookings?mine=1")).bookings);
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const upcoming = mine?.filter((b) => b.status === "confirmed") ?? [];
  const past = (mine?.filter((b) => b.status !== "confirmed") ?? []).reverse();

  const table = (list: BookingDto[]) => (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Tanggal</th><th>Jam</th><th>Ruangan</th><th>Judul</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.id}>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDateShort(b.date)}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</td>
              <td>{b.roomName}</td>
              <td>{b.title}</td>
              <td><StatusBadge status={b.status} /></td>
              <td style={{ textAlign: "right" }}><button className="sm" onClick={() => setDetail(b)}>Detail</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <h1>Booking saya</h1>
        <Link to="/rooms">Buat booking di Jadwal</Link>
      </div>
      <ErrorNote error={error} />
      <section className="card">
        <h2>Akan datang</h2>
        {upcoming.length ? table(upcoming) : <p className="muted" style={{ margin: 0 }}>{mine ? "Belum ada booking yang akan datang." : "Memuat…"}</p>}
      </section>
      {past.length > 0 && (
        <section className="card">
          <h2>Riwayat 30 hari terakhir</h2>
          {table(past)}
        </section>
      )}
      {detail && (
        <BookingDetail
          booking={detail}
          onClose={() => setDetail(null)}
          onCancelled={async () => {
            setDetail(null);
            await load();
            setToast("Booking dibatalkan.");
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
