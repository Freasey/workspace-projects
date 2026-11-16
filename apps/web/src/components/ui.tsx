import { useEffect, useState, type ReactNode } from "react";
import { fmtMin, SLOT_MINUTES } from "@app/shared";
import { msg } from "../api";

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="notice error" role="alert">{error}</div> : null;
}

/** Menjalankan aksi async dengan status sibuk dan pesan galat. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

export type Mode = "simple" | "advanced";

/**
 * Tab Simple/Advanced milik satu bagian. Tiap bagian menyimpan pilihannya sendiri,
 * jadi mengganti tab di satu bagian tidak mengubah bagian lain. Pilihan terakhir
 * diingat per user dan per bagian di perangkat ini.
 */
export function useMode(userId: string, section: string): [Mode, (m: Mode) => void] {
  const key = `mode:${userId}:${section}`;
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(key) === "advanced" ? "advanced" : "simple";
    } catch {
      return "simple";
    }
  });
  return [
    mode,
    (m) => {
      setMode(m);
      try {
        localStorage.setItem(key, m);
      } catch {
        /* penyimpanan tidak tersedia: pilihan hanya berlaku untuk sesi ini */
      }
    },
  ];
}

export function ModeTabs({ mode, onChange, advancedCount = 0 }: { mode: Mode; onChange: (m: Mode) => void; advancedCount?: number }) {
  return (
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "on" : ""} onClick={() => onChange("simple")}>
        Simple
      </button>
      <button role="tab" aria-selected={mode === "advanced"} className={mode === "advanced" ? "on" : ""} onClick={() => onChange("advanced")}>
        Advanced
        {advancedCount > 0 && <span className="count" title="Aturan Advanced yang aktif">{advancedCount}</span>}
      </button>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TimeSelect({ value, onChange, min = 0, max = 1440, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const options: number[] = [];
  for (let m = min; m <= max; m += SLOT_MINUTES) options.push(m);
  if (!options.includes(value)) options.push(value);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {options.sort((a, b) => a - b).map((m) => (
        <option key={m} value={m}>{fmtMin(m)}</option>
      ))}
    </select>
  );
}

export function TempPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <div className="notice">
      <div className="spread">
        <strong>Password sementara untuk {email}</strong>
        <button className="ghost sm" onClick={onClose}>Tutup</button>
      </div>
      <div className="secret">{password}</div>
      <div className="small muted">Hanya ditampilkan sekali. Berlaku 7 hari dan wajib diganti saat login pertama.</div>
    </div>
  );
}

/** Dialog di atas halaman. Tutup dengan Escape atau klik di luar. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Mengikuti media query, misalnya untuk mengganti timeline dengan daftar di layar sempit. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function Brand() {
  return <span className="brand"><i aria-hidden="true" />Workspace</span>;
}
