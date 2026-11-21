import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DEFAULT_HOURS,
  fmtMin,
  pairingUrl,
  WEEKDAY_NAMES,
  type BookingDto,
  type ClosureDto,
  type RoomDisplayCreated,
  type RoomDisplayDto,
  type RoomDto,
  type RoomHour,
  type RoomSettings,
} from "@app/shared";
import { api, fmtDateTime, msg, todayIn, useUser } from "../api";
import { QrCode } from "../components/qr";
import { pairThisDevice } from "./display";
import { ErrorNote, ModeTabs, Section, TimeSelect, useAction, useMode } from "../components/ui";

// Senin lebih dulu, Minggu terakhir.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface DayDraft {
  open: boolean;
  openMin: number;
  closeMin: number;
  hasBreak: boolean;
  breakStart: number;
  breakEnd: number;
}

function toDraft(hours: RoomHour[]): DayDraft[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const h = hours.find((x) => x.weekday === weekday);
    return {
      open: !!h,
      openMin: h?.openMin ?? DEFAULT_HOURS.openMin,
      closeMin: h?.closeMin ?? DEFAULT_HOURS.closeMin,
      hasBreak: h ? h.breakStart !== null : false,
      breakStart: h?.breakStart ?? 720,
      breakEnd: h?.breakEnd ?? 780,
    };
  });
}

function fromDraft(draft: DayDraft[]): RoomHour[] {
  return draft.flatMap((d, weekday) =>
    d.open
      ? [{ weekday, openMin: d.openMin, closeMin: d.closeMin, breakStart: d.hasBreak ? d.breakStart : null, breakEnd: d.hasBreak ? d.breakEnd : null }]
      : [],
  );
}

/** Jadwal bisa diwakili tab Simple kalau semua hari buka punya jam yang sama dan tanpa istirahat. */
function isUniform(draft: DayDraft[]): boolean {
  const open = draft.filter((d) => d.open);
  const first = open[0];
  return !first || open.every((d) => !d.hasBreak && d.openMin === first.openMin && d.closeMin === first.closeMin);
}

export function RoomsManage() {
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [closures, setClosures] = useState<ClosureDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", capacity: 6, location: "" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api<{ rooms: RoomDto[]; settings: RoomSettings }>("GET", "/rooms"),
        api<{ closures: ClosureDto[] }>("GET", "/rooms/closures"),
      ]);
      setRooms(r.rooms);
      setSettings(r.settings);
      setClosures(c.closures);
    } catch (e) {
      setLoadError(msg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const room = rooms.find((r) => r.id === selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kelola ruangan</h1>
          <div className="muted">Tiap bagian punya tab Simple dan Advanced sendiri. Keduanya mengatur data yang sama; Advanced hanya menampilkan lebih banyak isian.</div>
        </div>
      </div>
      <ErrorNote error={loadError ?? error} />

      <Section title="Ruangan">
        <form
          className="fields"
          style={{ marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await api<{ room: RoomDto }>("POST", "/rooms", form);
              setForm({ name: "", capacity: 6, location: "" });
              await load();
              setSelected(res.room.id);
            });
          }}
        >
          <div>
            <label htmlFor="r-name">Nama ruangan</label>
            <input id="r-name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="r-cap">Kapasitas</label>
            <input id="r-cap" type="number" min={1} required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="r-loc">Lokasi</label>
            <input id="r-loc" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <button className="primary" disabled={busy}>Tambah ruangan</button>
        </form>

        {rooms.length === 0 ? (
          <p className="muted">Belum ada ruangan. Ruangan baru langsung mendapat jadwal Senin–Jumat 08.00–18.00.</p>
        ) : (
          <div className="row">
            {rooms.map((r) => (
              <button key={r.id} className={selected === r.id ? "primary" : ""} onClick={() => setSelected(selected === r.id ? null : r.id)}>
                {r.name}{!r.active && " (nonaktif)"}
              </button>
            ))}
          </div>
        )}
      </Section>

      {room && (
        <>
          <RoomData key={`d-${room.id}`} room={room} onSaved={load} />
          <RoomSchedule key={`s-${room.id}`} room={room} closures={closures} onSaved={load} />
          <RoomDisplays key={`l-${room.id}`} room={room} />
        </>
      )}

      {settings && <Limits settings={settings} onSaved={load} />}
    </>
  );
}

interface EditorProps {
  onSaved: () => Promise<void>;
}

function RoomData({ room, onSaved }: EditorProps & { room: RoomDto }) {
  const me = useUser();
  const [mode, setMode] = useMode(me.user.id, "room-data");
  const [d, setD] = useState({
    name: room.name,
    capacity: room.capacity,
    location: room.location,
    facilities: room.facilities.join(", "),
    maxDurationMin: room.maxDurationMin,
    maxDaysAhead: room.maxDaysAhead,
  });
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const count = (room.facilities.length ? 1 : 0) + (room.maxDurationMin !== null ? 1 : 0) + (room.maxDaysAhead !== null ? 1 : 0);

  const save = () =>
    run(async () => {
      // Tab Simple hanya mengirim isian Simple, sehingga isian Advanced tidak tersentuh.
      const body: Record<string, unknown> = { name: d.name, capacity: d.capacity, location: d.location };
      if (mode === "advanced") {
        body.facilities = d.facilities.split(",").map((f) => f.trim()).filter(Boolean);
        body.maxDurationMin = d.maxDurationMin;
        body.maxDaysAhead = d.maxDaysAhead;
      }
      await api("PATCH", `/rooms/${room.id}`, body);
      setSaved(true);
      await onSaved();
    });

  const toggleActive = () =>
    run(async () => {
      if (room.active && !confirm(`Nonaktifkan ${room.name}? Semua booking mendatang di ruangan ini akan dibatalkan.`)) return;
      await api("PATCH", `/rooms/${room.id}`, { active: !room.active });
      await onSaved();
    });

  return (
    <Section title={`Data ruangan: ${room.name}`} right={<ModeTabs mode={mode} onChange={setMode} advancedCount={count} />}>
      <ErrorNote error={error} />
      {saved && <div className="notice">Tersimpan.</div>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="fields">
          <div>
            <label htmlFor="d-name">Nama</label>
            <input id="d-name" required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="d-cap">Kapasitas</label>
            <input id="d-cap" type="number" min={1} required value={d.capacity} onChange={(e) => setD({ ...d, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="d-loc">Lokasi</label>
            <input id="d-loc" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} />
          </div>
        </div>
        {mode === "advanced" && (
          <div className="fields">
            <div style={{ gridColumn: "span 2" }}>
              <label htmlFor="d-fac">Fasilitas (pisahkan dengan koma)</label>
              <input id="d-fac" value={d.facilities} onChange={(e) => setD({ ...d, facilities: e.target.value })} placeholder="Proyektor, TV, Papan tulis" />
            </div>
            <div>
              <label htmlFor="d-dur">Durasi maksimal (ruangan ini)</label>
              <select id="d-dur" value={d.maxDurationMin ?? ""} onChange={(e) => setD({ ...d, maxDurationMin: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Ikut aturan perusahaan</option>
                {[30, 60, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{m / 60} jam</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="d-days">Booking paling jauh (ruangan ini)</label>
              <select id="d-days" value={d.maxDaysAhead ?? ""} onChange={(e) => setD({ ...d, maxDaysAhead: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Ikut aturan perusahaan</option>
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} hari</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="row">
          <button className="primary" disabled={busy}>Simpan data</button>
          <button type="button" className={room.active ? "danger" : ""} disabled={busy} onClick={() => void toggleActive()}>
            {room.active ? "Nonaktifkan ruangan" : "Aktifkan ruangan"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function RoomSchedule({ room, closures, onSaved }: EditorProps & { room: RoomDto; closures: ClosureDto[] }) {
  const me = useUser();
  const [mode, setMode] = useMode(me.user.id, "room-schedule");
  const [draft, setDraft] = useState(() => toDraft(room.hours));
  const [bufferMin, setBuffer] = useState(room.bufferMin);
  const [closure, setClosure] = useState({ date: todayIn(me.org.timezone, 1), note: "", allRooms: false });
  const [note, setNote] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const uniform = isUniform(draft);
  const firstOpen = draft.find((d) => d.open);
  const roomClosures = closures.filter((c) => c.roomId === null || c.roomId === room.id);
  const count = (isUniform(toDraft(room.hours)) ? 0 : 1) + (room.bufferMin > 0 ? 1 : 0) + (roomClosures.length ? 1 : 0);
  const setDay = (weekday: number, patch: Partial<DayDraft>) => setDraft(draft.map((d, i) => (i === weekday ? { ...d, ...patch } : d)));
  const setAllOpen = (patch: Partial<DayDraft>) => setDraft(draft.map((d) => ({ ...d, ...patch })));

  const save = () =>
    run(async () => {
      setNote(null);
      const hours = fromDraft(draft);
      // Jadwal yang dipersempit: tampilkan booking terdampak sebelum disimpan.
      const { affected } = await api<{ affected: BookingDto[] }>("PUT", `/rooms/${room.id}/hours?preview=1`, { hours });
      if (affected.length) {
        const list = affected.slice(0, 5).map((b) => `• ${b.date} ${fmtMin(b.startMin)}–${fmtMin(b.endMin)} ${b.title} (${b.userName})`).join("\n");
        const more = affected.length > 5 ? `\n…dan ${affected.length - 5} lainnya` : "";
        if (!confirm(`${affected.length} booking mendatang berada di luar jadwal baru:\n${list}${more}\n\nBooking itu tidak dibatalkan otomatis. Tetap simpan jadwal?`)) return;
      }
      await api("PUT", `/rooms/${room.id}/hours`, { hours });
      if (mode === "advanced" && bufferMin !== room.bufferMin) await api("PATCH", `/rooms/${room.id}`, { bufferMin });
      setNote(affected.length ? `Jadwal tersimpan. ${affected.length} booking lama tetap berlaku dan perlu Anda tinjau.` : "Jadwal tersimpan.");
      await onSaved();
    });

  const addClosure = () =>
    run(async () => {
      await api("POST", "/rooms/closures", { roomId: closure.allRooms ? null : room.id, date: closure.date, note: closure.note });
      setClosure({ ...closure, note: "" });
      await onSaved();
    });

  return (
    <Section title={`Jadwal: ${room.name}`} right={<ModeTabs mode={mode} onChange={setMode} advancedCount={count} />}>
      <ErrorNote error={error} />
      {note && <div className="notice">{note}</div>}

      {mode === "simple" && !uniform && (
        <div className="notice warn">
          <strong>Diatur di Advanced.</strong> Jadwal ruangan ini punya jam berbeda per hari atau jam istirahat, yang tidak bisa ditampilkan di tab Simple.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="sm" onClick={() => setMode("advanced")}>Buka tab Advanced</button>
            <button
              className="sm"
              onClick={() => firstOpen && setAllOpen({ openMin: firstOpen.openMin, closeMin: firstOpen.closeMin, hasBreak: false })}
            >
              Kembalikan ke simple
            </button>
          </div>
        </div>
      )}

      {mode === "simple" && uniform && (
        <div className="stack">
          <div className="row">
            {WEEK_ORDER.map((w) => (
              <label key={w} className="row" style={{ margin: 0, fontWeight: 400, gap: 4 }}>
                <input
                  type="checkbox"
                  checked={draft[w]!.open}
                  onChange={(e) => setDay(w, { open: e.target.checked, openMin: firstOpen?.openMin ?? DEFAULT_HOURS.openMin, closeMin: firstOpen?.closeMin ?? DEFAULT_HOURS.closeMin, hasBreak: false })}
                />
                {WEEKDAY_NAMES[w]}
              </label>
            ))}
          </div>
          <div className="fields" style={{ maxWidth: 360 }}>
            <div>
              <label>Jam buka</label>
              <TimeSelect value={firstOpen?.openMin ?? DEFAULT_HOURS.openMin} max={1425} disabled={!firstOpen} onChange={(v) => setAllOpen({ openMin: v })} />
            </div>
            <div>
              <label>Jam tutup</label>
              <TimeSelect value={firstOpen?.closeMin ?? DEFAULT_HOURS.closeMin} min={15} disabled={!firstOpen} onChange={(v) => setAllOpen({ closeMin: v })} />
            </div>
          </div>
        </div>
      )}

      {mode === "advanced" && (
        <div className="stack">
          <div>
            {WEEK_ORDER.map((w) => {
              const d = draft[w]!;
              return (
                <div key={w} className="day-row">
                  <label className="row" style={{ margin: 0, gap: 6 }}>
                    <input type="checkbox" checked={d.open} onChange={(e) => setDay(w, { open: e.target.checked })} />
                    {WEEKDAY_NAMES[w]}
                  </label>
                  <span className="small muted">{d.open ? "Buka" : "Tutup"}</span>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <TimeSelect value={d.openMin} max={1425} disabled={!d.open} onChange={(v) => setDay(w, { openMin: v })} />
                    <span className="muted">–</span>
                    <TimeSelect value={d.closeMin} min={15} disabled={!d.open} onChange={(v) => setDay(w, { closeMin: v })} />
                  </div>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <label className="row small" style={{ margin: 0, gap: 4, fontWeight: 400, flexWrap: "nowrap", flexShrink: 0 }}>
                      <input type="checkbox" checked={d.hasBreak} disabled={!d.open} onChange={(e) => setDay(w, { hasBreak: e.target.checked })} />
                      Istirahat
                    </label>
                    {d.hasBreak && d.open && (
                      <>
                        <TimeSelect value={d.breakStart} min={d.openMin} max={d.closeMin} onChange={(v) => setDay(w, { breakStart: v })} />
                        <span className="muted">–</span>
                        <TimeSelect value={d.breakEnd} min={d.openMin} max={d.closeMin} onChange={(v) => setDay(w, { breakEnd: v })} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ maxWidth: 260 }}>
            <label htmlFor="s-buf">Jeda antar-booking</label>
            <select id="s-buf" value={bufferMin} onChange={(e) => setBuffer(Number(e.target.value))}>
              {[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m === 0 ? "Tanpa jeda" : `${m} menit`}</option>)}
            </select>
          </div>
        </div>
      )}

      {(mode === "advanced" || uniform) && (
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={busy} onClick={() => void save()}>Simpan jadwal</button>
        </div>
      )}

      {mode === "advanced" && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <h3>Tanggal tutup</h3>
          <div className="fields" style={{ marginBottom: 10 }}>
            <div>
              <label htmlFor="c-date">Tanggal</label>
              <input id="c-date" type="date" value={closure.date} onChange={(e) => setClosure({ ...closure, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c-note">Keterangan</label>
              <input id="c-note" value={closure.note} maxLength={120} onChange={(e) => setClosure({ ...closure, note: e.target.value })} placeholder="Misalnya: Libur nasional" />
            </div>
            <label className="row" style={{ margin: 0, fontWeight: 400 }}>
              <input type="checkbox" checked={closure.allRooms} onChange={(e) => setClosure({ ...closure, allRooms: e.target.checked })} />
              Semua ruangan
            </label>
            <button disabled={busy || !closure.date} onClick={() => void addClosure()}>Tambah tanggal tutup</button>
          </div>
          {roomClosures.length === 0 ? (
            <p className="small muted">Belum ada tanggal tutup.</p>
          ) : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {roomClosures.map((c) => (
                <li key={c.id}>
                  <strong>{c.date}</strong> {c.note} <span className="muted">({c.roomId ? "ruangan ini" : "semua ruangan"})</span>{" "}
                  <button
                    className="ghost sm danger"
                    onClick={() =>
                      run(async () => {
                        await api("DELETE", `/rooms/closures/${c.id}`);
                        await onSaved();
                      })
                    }
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

function Limits({ settings, onSaved }: EditorProps & { settings: RoomSettings }) {
  const me = useUser();
  const [mode, setMode] = useMode(me.user.id, "limits");
  const [d, setD] = useState(settings);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  return (
    <Section title="Batasan booking (semua ruangan)" right={<ModeTabs mode={mode} onChange={setMode} advancedCount={settings.minNoticeMin > 0 ? 1 : 0} />}>
      <ErrorNote error={error} />
      {saved && <div className="notice">Tersimpan. Aturan baru hanya berlaku untuk booking baru.</div>}
      <form
        className="fields"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const body = mode === "advanced" ? d : { maxDurationMin: d.maxDurationMin, maxDaysAhead: d.maxDaysAhead };
            await api("PUT", "/rooms/settings", body);
            setSaved(true);
            await onSaved();
          });
        }}
      >
        <div>
          <label htmlFor="l-dur">Durasi maksimal</label>
          <select id="l-dur" value={d.maxDurationMin} onChange={(e) => setD({ ...d, maxDurationMin: Number(e.target.value) })}>
            {[30, 60, 120, 180, 240, 360, 480, 720].map((m) => <option key={m} value={m}>{m / 60} jam</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="l-days">Booking paling jauh</label>
          <select id="l-days" value={d.maxDaysAhead} onChange={(e) => setD({ ...d, maxDaysAhead: Number(e.target.value) })}>
            {[7, 14, 30, 60, 90, 180].map((n) => <option key={n} value={n}>{n} hari ke depan</option>)}
          </select>
        </div>
        {mode === "advanced" && (
          <div>
            <label htmlFor="l-notice">Jarak minimal sebelum mulai</label>
            <select id="l-notice" value={d.minNoticeMin} onChange={(e) => setD({ ...d, minNoticeMin: Number(e.target.value) })}>
              {[0, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m === 0 ? "Tanpa batas" : m < 60 ? `${m} menit` : `${m / 60} jam`}</option>)}
            </select>
          </div>
        )}
        <button className="primary" disabled={busy}>Simpan batasan</button>
      </form>
    </Section>
  );
}

/**
 * Layar ruangan: tablet atau HP di depan pintu yang menampilkan jadwal hari ini,
 * hitung mundur, dan peserta. Dipasang dengan kode sekali pakai.
 */
function RoomDisplays({ room }: { room: RoomDto }) {
  const navigate = useNavigate();
  const [list, setList] = useState<RoomDisplayDto[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<RoomDisplayCreated | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    setList((await api<{ displays: RoomDisplayDto[] }>("GET", `/rooms/${room.id}/displays`)).displays);
  }, [room.id]);
  useEffect(() => {
    void run(load);
  }, [load]);

  const create = () =>
    api<RoomDisplayCreated>("POST", `/rooms/${room.id}/displays`, { name: name.trim() });

  const status = (d: RoomDisplayDto) =>
    !d.pairedAt ? (
      <span className="badge warn">Menunggu dipasang, kode berlaku sampai {new Date(d.pairExpiresAt! * 1000).toLocaleTimeString("id-ID", { timeStyle: "short" })}</span>
    ) : d.lastSeenAt && Date.now() / 1000 - d.lastSeenAt < 5 * 60 ? (
      <span className="badge ok">Aktif</span>
    ) : (
      <span className="badge">Terakhir aktif {d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "—"}</span>
    );

  return (
    <Section title={`Layar ruangan: ${room.name}`}>
      <p className="muted" style={{ marginTop: 0 }}>
        Pasang tablet atau HP di depan ruangan. Layar menampilkan status ruangan, jadwal hari ini, hitung mundur ke akhir atau awal booking, dan
        daftar peserta. Layar tidak memakai akun siapa pun dan hanya bisa membaca jadwal ruangan ini.
      </p>
      <ErrorNote error={error} />
      {!room.active && <div className="notice warn">Ruangan ini nonaktif. Layarnya akan menampilkan "Tidak tersedia".</div>}

      {created && (
        <div className="notice">
          <div className="spread">
            <strong>Kode pemasangan untuk {created.display.name}</strong>
            <button className="ghost sm" onClick={() => setCreated(null)}>Tutup</button>
          </div>
          <div className="pair-box">
            <QrCode value={pairingUrl(window.location.origin, created.code)} label={`Kode QR pemasangan ${created.code}`} />
            <div className="stack">
              <div>
                <div className="small muted">Kode</div>
                <div className="disp-layar-code">{created.code}</div>
              </div>
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  <strong>Pindai QR</strong> dengan kamera tablet atau HP yang akan dipasang. Peramban terbuka dan layar langsung terpasang.
                </li>
                <li>
                  Di aplikasi Android Spaces: halaman masuk → <strong>Pasang sebagai layar ruangan</strong> → <strong>Pindai QR</strong>.
                </li>
                <li>
                  Tanpa kamera: buka <strong>{window.location.host}/layar</strong> lalu ketik kodenya.
                </li>
              </ol>
              <div className="small muted">
                QR dan kode hanya ditampilkan sekali, berlaku sampai{" "}
                {new Date(created.display.pairExpiresAt! * 1000).toLocaleTimeString("id-ID", { timeStyle: "short" })}, dan hanya untuk satu perangkat.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fields" style={{ marginBottom: 12 }}>
        <div>
          <label htmlFor="disp-name">Nama layar (opsional)</label>
          <input id="disp-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Layar ${room.name}`} />
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setCreated(await create());
              setName("");
              await load();
            })
          }
        >
          Buat QR dan kode
        </button>
        <button
          disabled={busy}
          title="Membuka mode layar di peramban ini"
          onClick={() =>
            run(async () => {
              const res = await create();
              await pairThisDevice(res.code);
              navigate("/layar");
            })
          }
        >
          Jadikan perangkat ini layar
        </button>
      </div>

      {list && list.length > 0 && (
        <div>
          {list.map((d) => (
            <div key={d.id} className="list-item">
              <span className="g">
                <strong>{d.name}</strong>
                <span className="small muted">Dibuat {fmtDateTime(d.createdAt)}</span>
              </span>
              {status(d)}
              {revoking === d.id ? (
                <>
                  <button
                    className="danger sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("POST", `/rooms/displays/${d.id}/revoke`);
                        setRevoking(null);
                        if (created?.display.id === d.id) setCreated(null);
                        await load();
                      })
                    }
                  >
                    Ya, cabut
                  </button>
                  <button className="sm" onClick={() => setRevoking(null)}>Batal</button>
                </>
              ) : (
                <button className="sm" onClick={() => setRevoking(d.id)}>{d.pairedAt ? "Cabut" : "Batalkan kode"}</button>
              )}
            </div>
          ))}
        </div>
      )}
      {list?.length === 0 && <p className="small muted" style={{ margin: 0 }}>Belum ada layar untuk ruangan ini.</p>}
    </Section>
  );
}
