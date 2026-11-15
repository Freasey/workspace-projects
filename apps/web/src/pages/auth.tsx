import { useState, type ReactNode } from "react";
import { api, useAuth } from "../api";
import { Brand, ErrorNote, useAction } from "../components/ui";

/** Tata letak halaman di luar aplikasi: panel merek di kiri, isi di kanan. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-brand">
        <Brand />
        <div>
          <h2>Aplikasi kantor untuk internal PT Anda.</h2>
          <p>Booking ruangan tanpa bentrok, dengan jadwal dan aturan yang ditetapkan admin PT Anda sendiri.</p>
        </div>
        <div className="motif" aria-hidden="true">
          <div><i style={{ gridColumn: "3 / 7" }} /><i className="o" style={{ gridColumn: "11 / 15" }} /></div>
          <div><i style={{ gridColumn: "2 / 4" }} /><i style={{ gridColumn: "5 / 9" }} /><i style={{ gridColumn: "16 / 18" }} /></div>
          <div><i style={{ gridColumn: "13 / 21" }} /></div>
          <div><i style={{ gridColumn: "7 / 9" }} /></div>
        </div>
        <small>Akses hanya untuk akun yang didaftarkan oleh PT Anda.</small>
      </div>
      <div className="auth-form">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input
        id={props.id}
        type={show ? "text" : "password"}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        required
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button type="button" onClick={() => setShow(!show)}>{show ? "Sembunyikan" : "Tampilkan"}</button>
    </span>
  );
}

export function Login() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();

  return (
    <AuthLayout>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            try {
              await api("POST", "/auth/login", { email, password });
            } catch (err) {
              setPassword("");
              throw err;
            }
            await refresh();
          });
        }}
      >
        <div>
          <h1>Masuk</h1>
          <p className="muted">Gunakan email kantor dan password Anda.</p>
        </div>
        <ErrorNote error={error} />
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" placeholder="nama@perusahaan.co.id" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
        </div>
        <button className="primary" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
        <p className="small muted">
          Lupa password? Minta reset ke admin PT Anda. Admin PT meminta reset ke pengelola sistem. Reset lewat email tidak tersedia.
        </p>
      </form>
    </AuthLayout>
  );
}

export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { refresh, logout } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useAction();

  const form = (
    <form
      className="stack"
      style={forced ? undefined : { maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (newPassword !== confirm) return setError("Konfirmasi password tidak sama.");
        void run(async () => {
          await api("POST", "/auth/change-password", { currentPassword, newPassword });
          setCurrent("");
          setNew("");
          setConfirm("");
          setDone(true);
          await refresh();
        });
      }}
    >
      {forced && (
        <div>
          <h1>Buat password baru</h1>
          <p className="muted">Anda masuk dengan password sementara. Ganti dulu sebelum melanjutkan.</p>
        </div>
      )}
      <ErrorNote error={error} />
      {done && <div className="notice">Password berhasil diganti.</div>}
      <div>
        <label htmlFor="cur">{forced ? "Password sementara" : "Password saat ini"}</label>
        <PasswordInput id="cur" autoComplete="current-password" value={currentPassword} onChange={setCurrent} />
      </div>
      <div>
        <label htmlFor="new">Password baru (minimal 8 karakter)</label>
        <PasswordInput id="new" autoComplete="new-password" minLength={8} value={newPassword} onChange={setNew} />
      </div>
      <div>
        <label htmlFor="conf">Ulangi password baru</label>
        <input id="conf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button className="primary" disabled={busy}>{forced ? "Simpan dan masuk" : "Simpan password"}</button>
      {forced && <button type="button" className="ghost" onClick={() => void logout()}>Keluar</button>}
    </form>
  );
  if (forced) return <AuthLayout>{form}</AuthLayout>;
  return (
    <>
      <div className="page-head"><h1>Ganti password</h1></div>
      <section className="card">{form}</section>
    </>
  );
}
