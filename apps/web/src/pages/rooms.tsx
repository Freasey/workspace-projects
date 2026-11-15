import { useCallback, useEffect, useState } from "react";
import { fmtMin, WEEKDAY_NAMES, type BookingDto, type ClosureDto, type RoomDto, type RoomSettings } from "@app/shared";
import { api, msg, todayIn, useUser } from "../api";
import { ErrorNote, ModeTabs, Section, TimeSelect, useAction, useMode } from "../components/ui";

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const fmtDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function RoomsBooking() {
  const me = useUser();
  const tz = me.org.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [closures, setClosures] = useState<ClosureDto[]>([]);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [mine, setMine] = useState<BookingDto[]>([]);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, cl, b, m] = await Promise.all([
        api<{ rooms: RoomDto[]; settings: RoomSettings }>("GET", "/rooms"),
        api<{ closures: ClosureDto[] }>("GET", "/rooms/closures"),
        api<{ bookings: BookingDto[] }>("GET", `/rooms/bookings?date=${date}`),
        api<{ bookings: BookingDto[] }>("GET", "/rooms/bookings?mine=1"),
      ]);
      setRooms(r.rooms.filter((x) => x.active));
      setSettings(r.settings);
      setClosures(cl.closures);
      setBookings(b.bookings);
      setMine(m.bookings);
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, [date]);
  useEffect(() => void load(), [load]);

  const weekday = weekdayOf(date);
  const dayHours = rooms.flatMap((r) => r.hours.filter((h) => h.weekday === weekday));
  const from = dayHours.length ? Math.min(...dayHours.map((h) => h.openMin)) : 480;
  const to = dayHours.length ? Math.max(...dayHours.map((h) => h.closeMin)) : 1080;
  const pct = (min: number) => `${((Math.min(Math.max(min, from), to) - from) / (to - from)) * 100}%`;
  const upcoming = mine.filter((b) => b.status === "confirmed");

  const cancel = async (b: BookingDto) => {
    if (!confirm(`Batalkan booking "${b.title}"?`)) return;
    try {
      await api("POST", `/rooms/bookings/${b.id}/cancel`);
      await load();
    } catch (e) {
      setError(msg(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Booking ruangan</h1>
          <div className="muted">{fmtDate(date)}</div>
        </div>
        <div className="row">
          <button className="sm" onClick={() => setDate(todayIn(tz))}>Hari ini</button>
          <input type="date" aria-label="Tanggal" value={date} min={todayIn(tz)} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: "auto" }} />
        </div>
      </div>
      <ErrorNote error={error} />

      {rooms.length === 0 && !error && (
        <div className="card muted">
          Belum ada ruangan.{me.user.role === "admin" ? " Tambahkan lewat menu Kelola ruangan." : " Minta admin perusahaan untuk menambahkannya."}
        </div>
      )}

      {rooms.map((room) => {
        const h = room.hours.find((x) => x.weekday === weekday);
        const closure = closures.find((c) => c.date === date && (c.roomId === null || c.roomId === room.id));
        const list = bookings.filter((b) => b.roomId === room.id);
        const bookable = h && !closure;
        return (
          <section key={room.id} className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>{room.name}</h2>
                <div className="small muted">
                  {room.capacity} orang{room.location && ` · ${room.location}`}
                  {room.facilities.length > 0 && ` · ${room.facilities.join(", ")}`}
                </div>
              </div>
              {bookable ? (
                <button className="primary sm" onClick={() => setOpenRoom(openRoom === room.id ? null : room.id)}>
                  {openRoom === room.id ? "Tutup form" : "Booking"}
                </button>
              ) : (
                <span className="badge">{closure ? `Tutup${closure.note ? `: ${closure.note}` : ""}` : `Tutup hari ${WEEKDAY_NAMES[weekday]}`}</span>
              )}
            </div>

            {bookable && (
              <>
                <div className="timeline" aria-hidden="true">
                  {h.breakStart !== null && <div className="break" style={{ left: pct(h.breakStart), width: `calc(${pct(h.breakEnd!)} - ${pct(h.breakStart)})` }} />}
                  {list.map((b) => (
                    <div
                      key={b.id}
                      className={`block ${b.userId === me.user.id ? "mine" : ""}`}
                      style={{ left: pct(b.startMin), width: `calc(${pct(b.endMin)} - ${pct(b.startMin)})` }}
                      title={`${fmtMin(b.startMin)}–${fmtMin(b.endMin)} ${b.title} (${b.userName})`}
                    >
                      {b.title}
                    </div>
                  ))}
                </div>
                <div className="ticks"><span>{fmtMin(from)}</span><span>{fmtMin(Math.round((from + to) / 2 / 15) * 15)}</span><span>{fmtMin(to)}</span></div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Buka {fmtMin(h.openMin)}–{fmtMin(h.closeMin)}
                  {h.breakStart !== null && `, istirahat ${fmtMin(h.breakStart)}–${fmtMin(h.breakEnd!)}`}
                </div>
                {list.length > 0 && (
                  <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {list.map((b) => (
                      <li key={b.id}>
                        <strong>{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</strong> {b.title} <span className="muted">oleh {b.userName}</span>{" "}
                        {(b.userId === me.user.id || me.user.role === "admin") && b.startAt * 1000 > Date.now() && (
                          <button className="ghost sm danger" onClick={() => void cancel(b)}>Batalkan</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {openRoom === room.id && bookable && settings && (
              <BookingForm
                room={room}
                date={date}
                openMin={h.openMin}
                closeMin={h.closeMin}
                maxDuration={room.maxDurationMin ?? settings.maxDurationMin}
                onDone={async () => {
                  setOpenRoom(null);
                  await load();
                }}
              />
            )}
          </section>
        );
      })}

      <Section title="Booking saya yang akan datang">
        {upcoming.length === 0 ? (
          <p className="muted">Belum ada booking.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tanggal</th><th>Jam</th><th>Ruangan</th><th>Judul</th><th></th></tr></thead>
              <tbody>
                {upcoming.map((b) => (
                  <tr key={b.id}>
                    <td className="small">{fmtDate(b.date)}</td>
                    <td>{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</td>
                    <td>{b.roomName}</td>
                    <td>{b.title}</td>
                    <td style={{ textAlign: "right" }}>
                      {b.startAt * 1000 > Date.now() && <button className="sm danger" onClick={() => void cancel(b)}>Batalkan</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function BookingForm(props: { room: RoomDto; date: string; openMin: number; closeMin: number; maxDuration: number; onDone: () => Promise<void> }) {
  const me = useUser();
  const [mode, setMode] = useMode(me.user.id);
  const [startMin, setStart] = useState(props.openMin);
  const [endMin, setEnd] = useState(Math.min(props.openMin + 60, props.closeMin));
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();

  return (
    <form
      className="stack"
      style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api("POST", "/rooms/bookings", { roomId: props.room.id, date: props.date, startMin, endMin, title, note });
          await props.onDone();
        });
      }}
    >
      <div className="spread">
        <h3 style={{ margin: 0 }}>Booking {props.room.name}</h3>
        <ModeTabs mode={mode} onChange={setMode} advancedCount={note.trim() ? 1 : 0} />
      </div>
      <ErrorNote error={error} />
      <div className="fields">
        <div>
          <label>Mulai</label>
          <TimeSelect value={startMin} min={props.openMin} max={props.closeMin - 15} onChange={(v) => { setStart(v); if (endMin <= v) setEnd(Math.min(v + 60, props.closeMin)); }} />
        </div>
        <div>
          <label>Selesai</label>
          <TimeSelect value={endMin} min={startMin + 15} max={props.closeMin} onChange={setEnd} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label htmlFor="b-title">Judul</label>
          <input id="b-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misalnya: Rapat mingguan tim" />
        </div>
      </div>
      {mode === "advanced" && (
        <div>
          <label htmlFor="b-note">Catatan</label>
          <textarea id="b-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div className="row">
        <button className="primary" disabled={busy}>Simpan booking</button>
        <span className="small muted">Durasi maksimal {props.maxDuration / 60} jam.</span>
      </div>
    </form>
  );
}
