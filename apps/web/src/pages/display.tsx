import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  displayClock,
  displayState,
  fmtCountdown,
  fmtMin,
  type DisplayBooking,
  type DisplayFeed,
  type DisplayPairResult,
} from "@app/shared";
import { msg } from "../api";
import { Brand } from "../components/ui";

// Token layar disimpan di perangkat ini saja. Bukan sesi user: tidak bisa dipakai
// untuk membuka aplikasi, hanya untuk membaca jadwal satu ruangan.
const TOKEN_KEY = "display_token";
const POLL_MS = 30_000;

export const displayToken = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* penyimpanan tidak tersedia: layar hanya bertahan selama tab terbuka */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* diabaikan */
    }
  },
};

class DisplayErr extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, token: string | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/display${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { "x-display-token": token } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      cache: "no-store",
    });
  } catch {
    throw new DisplayErr("NETWORK", "Tidak terhubung ke server.");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
  if (!res.ok) throw new DisplayErr(json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Terjadi kesalahan.");
  return json as T;
}

/** Memasang perangkat ini dengan kode dari admin, lalu menyimpan tokennya. */
export async function pairThisDevice(code: string): Promise<DisplayPairResult> {
  const res = await call<DisplayPairResult>("POST", "/pair", null, { code });
  displayToken.set(res.token);
  return res;
}

export function DisplayPage() {
  const [token, setToken] = useState(() => displayToken.get());
  const [notice, setNotice] = useState<string | null>(null);
  if (!token) return <PairScreen notice={notice} onPaired={setToken} />;
  return (
    <DisplayScreen
      token={token}
      onUnpaired={(why) => {
        displayToken.clear();
        setNotice(why);
        setToken(null);
      }}
    />
  );
}

function PairScreen({ notice, onPaired }: { notice: string | null; onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="disp-pair">
      <form
        className="disp-pair-card stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          pairThisDevice(code)
            .then((r) => onPaired(r.token))
            .catch((err) => setError(msg(err)))
            .finally(() => setBusy(false));
        }}
      >
        <Brand />
        <h1>Pasang layar ruangan</h1>
        <p className="muted" style={{ margin: 0 }}>
          Perangkat ini akan menampilkan jadwal hari ini, hitung mundur, dan peserta untuk satu ruangan. Minta kode pemasangan ke admin PT
          (menu Kelola ruangan → Layar ruangan).
        </p>
        {notice && <div className="notice warn">{notice}</div>}
        {error && <div className="notice error" role="alert">{error}</div>}
        <div>
          <label htmlFor="pair-code">Kode pemasangan</label>
          <input
            id="pair-code"
            className="disp-code-input"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="ABCD-2345"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <button className="primary" disabled={busy}>{busy ? "Memasang…" : "Pasang"}</button>
        <div className="small muted">
          Bukan layar ruangan? <Link to="/login">Masuk ke aplikasi</Link>
        </div>
      </form>
    </div>
  );
}

/** Layar tetap menyala selama halaman terlihat, kalau peramban mendukungnya. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    const take = () => {
      if (document.visibilityState === "visible") nav.wakeLock!.request("screen").then((l) => (lock = l)).catch(() => undefined);
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

function DisplayScreen({ token, onUnpaired }: { token: string; onUnpaired: (why: string) => void }) {
  const [feed, setFeed] = useState<DisplayFeed | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // Selisih jam server dan jam perangkat, supaya hitung mundur tidak ikut jam perangkat yang meleset.
  const skew = useRef(0);
  const [tick, setTick] = useState(() => Date.now());
  useWakeLock();

  const load = useCallback(async () => {
    try {
      const sent = Date.now();
      const f = await call<DisplayFeed>("GET", "", token);
      skew.current = f.now * 1000 - (sent + Date.now()) / 2;
      setFeed(f);
      setOffline(null);
    } catch (e) {
      if (e instanceof DisplayErr && e.code === "DISPLAY_UNPAIRED") onUnpaired(e.message);
      else setOffline(msg(e));
    }
  }, [token, onUnpaired]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const now = Math.floor((tick + skew.current) / 1000);
  // Pergantian hari atau booking yang baru selesai/mulai: baca ulang tanpa menunggu jadwal berikutnya.
  const boundary = !!feed && [...feed.bookings.flatMap((b) => [b.startAt, b.endAt]), feed.dayStart + 86_400].some((t) => t > feed.now && t <= now);
  useEffect(() => {
    if (boundary) void load();
  }, [boundary, load]);

  if (!feed) {
    return (
      <div className="disp-pair">
        <div className="disp-pair-card stack">
          <Brand />
          <p className="muted">{offline ? `${offline} Mencoba lagi…` : "Memuat jadwal ruangan…"}</p>
        </div>
      </div>
    );
  }

  const st = displayState(feed, now);
  const featured = st.current ?? (st.next && st.next.date === feed.date ? st.next : null);
  const tone = feed.blocked ? "closed" : st.tone;

  return (
    <div className={`disp tone-${tone}`}>
      <section className="disp-main">
        <header className="disp-top">
          <div>
            <div className="disp-room">{feed.room.name}</div>
            <div className="disp-meta">
              {feed.room.capacity} orang{feed.room.location && ` · ${feed.room.location}`} · {feed.org.name}
            </div>
          </div>
          <div className="disp-clock num">
            {displayClock(feed, now)}
            <small>{fmtDayLong(feed.date)}</small>
          </div>
        </header>

        {feed.blocked ? (
          <div className="disp-status">
            <div className="disp-label">Tidak tersedia</div>
            <p className="disp-detail">{feed.blocked}</p>
          </div>
        ) : (
          <div className="disp-status">
            <div className="disp-label">{st.label}</div>
            {st.current && <div className="disp-title">{st.current.title}</div>}
            {!st.current && st.detail && <p className="disp-detail">{st.detail}</p>}
            {st.countdown && (
              <div className="disp-count">
                <span>{st.countdown.label}</span>
                <strong className="num">{fmtCountdown(st.countdown.seconds)}</strong>
              </div>
            )}
            {!st.current && st.next && (
              <p className="disp-detail">
                Berikutnya: <b>{st.next.title}</b>, {st.next.date === feed.date ? "" : `${fmtDayShort(st.next.date)} `}
                {fmtMin(st.next.startMin)}–{fmtMin(st.next.endMin)}
              </p>
            )}
            {!st.next && !st.current && <p className="disp-detail">Tidak ada booking dalam 14 hari ke depan.</p>}
          </div>
        )}

        {!feed.blocked && featured && <Attendees booking={featured} heading={st.current ? "Peserta" : "Peserta booking berikutnya"} />}
      </section>

      <aside className="disp-side">
        <h2>Jadwal hari ini</h2>
        {feed.blocked || feed.bookings.length === 0 ? (
          <p className="disp-empty">{feed.blocked ? "—" : "Belum ada booking hari ini."}</p>
        ) : (
          <ol className="disp-list">
            {feed.bookings.map((b) => {
              const state = b.endAt <= now ? "done" : b.startAt <= now ? "now" : b.id === st.next?.id ? "next" : "";
              return (
                <li key={b.id} className={state}>
                  <span className="num">{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</span>
                  <div>
                    <strong>{b.title}</strong>
                    <small>
                      {b.userName}
                      {b.participants.length > 0 && ` + ${b.participants.length} peserta`}
                    </small>
                  </div>
                  {state === "now" && <em>Berjalan</em>}
                  {state === "next" && <em>Berikutnya</em>}
                </li>
              );
            })}
          </ol>
        )}
        {feed.hours && feed.closure === null && (
          <p className="disp-hours">
            Buka {fmtMin(feed.hours.openMin)}–{fmtMin(feed.hours.closeMin)}
            {feed.hours.breakStart !== null && `, istirahat ${fmtMin(feed.hours.breakStart)}–${fmtMin(feed.hours.breakEnd!)}`}
          </p>
        )}
        <footer className="disp-foot">
          <span>{offline ? <span className="disp-off">● Tidak terhubung, menampilkan data terakhir</span> : "Booking lewat aplikasi Spaces"}</span>
          <span className="row" style={{ gap: 6 }}>
            <button className="disp-btn" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Layar penuh</button>
            <button className="disp-btn" aria-label="Pengaturan layar" onClick={() => setMenu(true)}>⋯</button>
          </span>
        </footer>
      </aside>

      {menu && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Keluar dari mode layar">
            <h2>Keluar dari mode layar?</h2>
            <p className="muted">
              Perangkat ini berhenti menampilkan jadwal {feed.room.name} dan tautannya dicabut. Untuk memasang lagi, admin PT perlu membuat kode baru.
            </p>
            <div className="foot">
              <button onClick={() => setMenu(false)}>Batal</button>
              <button
                className="danger"
                onClick={() => {
                  void call("POST", "/unpair", token).catch(() => undefined);
                  onUnpaired("Mode layar dihentikan di perangkat ini.");
                }}
              >
                Ya, keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Attendees({ booking: b, heading }: { booking: DisplayBooking; heading: string }) {
  const people = [{ id: "booker", name: b.userName, booker: true }, ...b.participants.map((p) => ({ ...p, booker: false }))];
  return (
    <div className="disp-people">
      <h3>
        {heading} <span>({people.length} orang)</span>
      </h3>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <i aria-hidden="true">{initials(p.name)}</i>
            <span>{p.name}</span>
            {p.booker && <small>Pemesan</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const fmtDayLong = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtDayShort = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
