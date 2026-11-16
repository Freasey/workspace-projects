import { useState } from "react";
import { api, useAuth } from "../api";
import { ErrorNote, useAction } from "../components/ui";

export function Login() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();

  return (
    <div className="center">
      <form
        className="card login stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("POST", "/auth/login", { email, password });
            await refresh();
          });
        }}
      >
        <div className="wordmark"><img src="/logo.svg" alt="" />Spaces</div>
        <div>
          <h1>Masuk</h1>
          <p className="muted">Gunakan email dan password dari admin Anda.</p>
        </div>
        <ErrorNote error={error} />
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="primary" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
    </div>
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
      className="card login stack"
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
      <div>
        <h1>{forced ? "Buat password baru" : "Ganti password"}</h1>
        {forced && <p className="muted">Password sementara harus diganti sebelum Anda bisa memakai aplikasi.</p>}
      </div>
      <ErrorNote error={error} />
      {done && <div className="notice">Password berhasil diganti.</div>}
      <div>
        <label htmlFor="cur">{forced ? "Password sementara" : "Password saat ini"}</label>
        <input id="cur" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label htmlFor="new">Password baru (minimal 8 karakter)</label>
        <input id="new" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </div>
      <div>
        <label htmlFor="conf">Ulangi password baru</label>
        <input id="conf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div className="row">
        <button className="primary" disabled={busy}>Simpan password</button>
        {forced && <button type="button" onClick={() => void logout()}>Keluar</button>}
      </div>
    </form>
  );
  return forced ? <div className="center">{form}</div> : form;
}
