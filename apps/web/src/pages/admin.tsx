import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MODULES, TIMEZONES, type AuditDto, type OrgDto, type OrgStatus, type UserDto } from "@app/shared";
import { api, fmtDateTime, msg } from "../api";
import { ErrorNote, Section, TempPassword, useAction } from "../components/ui";
import { UserManager } from "../components/UserManager";
import { AuditTable } from "./home";

const STATUS_LABEL: Record<OrgStatus, [string, string]> = {
  active: ["Aktif", "ok"],
  suspended: ["Dihentikan sementara", "warn"],
  archived: ["Diarsipkan", "bad"],
};

export function AdminOrgs() {
  const [orgs, setOrgs] = useState<OrgDto[]>([]);
  const [form, setForm] = useState({ name: "", maxUsers: 10, timezone: "Asia/Jakarta", adminName: "", adminEmail: "", modules: ["rooms"] as string[] });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => setOrgs((await api<{ orgs: OrgDto[] }>("GET", "/admin/orgs")).orgs), []);
  useEffect(() => void load().catch(() => undefined), [load]);

  const create = () =>
    run(async () => {
      const res = await api<{ admin: UserDto; tempPassword: string }>("POST", "/admin/orgs", form);
      setTemp({ email: res.admin.email, password: res.tempPassword });
      setForm({ ...form, name: "", adminName: "", adminEmail: "" });
      await load();
    });

  return (
    <>
      <div className="page-head"><h1>Perusahaan</h1></div>

      <Section title="Daftarkan perusahaan">
        <ErrorNote error={error} />
        {temp && <TempPassword {...temp} onClose={() => setTemp(null)} />}
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="fields">
            <div>
              <label htmlFor="o-name">Nama perusahaan</label>
              <input id="o-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="o-max">Batas maksimal user</label>
              <input id="o-max" type="number" min={1} required value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="o-tz">Zona waktu</label>
              <select id="o-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="fields">
            <div>
              <label htmlFor="o-an">Nama admin pertama</label>
              <input id="o-an" required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="o-ae">Email admin pertama</label>
              <input id="o-ae" type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <span className="small" style={{ fontWeight: 600 }}>Modul:</span>
            {MODULES.map((m) => (
              <label key={m.key} className="row" style={{ margin: 0, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={form.modules.includes(m.key)}
                  onChange={(e) => setForm({ ...form, modules: e.target.checked ? [...form.modules, m.key] : form.modules.filter((k) => k !== m.key) })}
                />
                {m.name}
              </label>
            ))}
          </div>
          <div><button className="primary" disabled={busy}>Daftarkan</button></div>
        </form>
      </Section>

      <Section title={`Terdaftar (${orgs.length})`}>
        {orgs.length === 0 ? (
          <p className="muted">Belum ada perusahaan.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nama</th><th>User aktif</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orgs/${o.id}`}>{o.name}</Link></td>
                    <td>{o.activeUsers} dari {o.maxUsers}</td>
                    <td><span className={`badge ${STATUS_LABEL[o.status][1]}`}>{STATUS_LABEL[o.status][0]}</span></td>
                    <td style={{ textAlign: "right" }}><Link to={`/admin/orgs/${o.id}`}>Kelola</Link></td>
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

interface OrgDetail {
  org: OrgDto;
  users: UserDto[];
  modules: { key: string; name: string; status: "active" | "paused" | "none"; pausedNote: string | null }[];
}

export function AdminOrgDetail() {
  const { id } = useParams();
  const [data, setData] = useState<OrgDetail | null>(null);
  const [logs, setLogs] = useState<AuditDto[]>([]);
  const [edit, setEdit] = useState({ name: "", maxUsers: 1, timezone: "Asia/Jakarta" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        api<OrgDetail>("GET", `/admin/orgs/${id}`),
        api<{ logs: AuditDto[] }>("GET", `/admin/audit?orgId=${id}`),
      ]);
      setData(d);
      setLogs(a.logs);
      setEdit({ name: d.org.name, maxUsers: d.org.maxUsers, timezone: d.org.timezone });
    } catch (e) {
      setLoadError(msg(e));
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  if (loadError) return <ErrorNote error={loadError} />;
  if (!data) return <p className="muted">Memuat…</p>;
  const { org } = data;

  const patchOrg = (body: Partial<Pick<OrgDto, "name" | "maxUsers" | "timezone" | "status">>) =>
    run(async () => {
      await api("PATCH", `/admin/orgs/${org.id}`, body);
      await load();
    });
  const setModule = (key: string, status: "active" | "paused" | "none") =>
    run(async () => {
      await api("PUT", `/admin/orgs/${org.id}/modules/${key}`, { status, note: notes[key] });
      await load();
    });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small"><Link to="/admin">← Semua perusahaan</Link></div>
          <h1>{org.name}</h1>
        </div>
        <span className={`badge ${STATUS_LABEL[org.status][1]}`}>{STATUS_LABEL[org.status][0]}</span>
      </div>
      <ErrorNote error={error} />

      <Section title="Data perusahaan">
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault();
            void patchOrg(edit);
          }}
        >
          <div>
            <label htmlFor="e-name">Nama</label>
            <input id="e-name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="e-max">Batas maksimal user</label>
            <input id="e-max" type="number" min={1} required value={edit.maxUsers} onChange={(e) => setEdit({ ...edit, maxUsers: Number(e.target.value) })} />
          </div>
          <div>
            <label htmlFor="e-tz">Zona waktu</label>
            <select id="e-tz" value={edit.timezone} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })}>
              {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <button className="primary" disabled={busy}>Simpan</button>
        </form>
        {edit.maxUsers < org.activeUsers && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Batas ini di bawah jumlah user aktif ({org.activeUsers}). Tidak ada user yang dihapus; perusahaan hanya tidak bisa menambah user.
          </p>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          {org.status === "active" && <button disabled={busy} onClick={() => void patchOrg({ status: "suspended" })}>Hentikan sementara semua akses</button>}
          {org.status !== "active" && <button className="primary" disabled={busy} onClick={() => void patchOrg({ status: "active" })}>Aktifkan kembali</button>}
          {org.status === "suspended" && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => confirm(`Arsipkan ${org.name}? Semua user tidak akan bisa login. Data tetap disimpan.`) && void patchOrg({ status: "archived" })}
            >
              Arsipkan
            </button>
          )}
        </div>
      </Section>

      <Section title="Modul">
        <div className="stack">
          {data.modules.map((m) => (
            <div key={m.key} className="spread">
              <div>
                <strong>{m.name}</strong>{" "}
                <span className={`badge ${m.status === "active" ? "ok" : m.status === "paused" ? "warn" : ""}`}>
                  {m.status === "active" ? "Aktif" : m.status === "paused" ? "Dijeda" : "Tidak diberikan"}
                </span>
                {m.pausedNote && <div className="small muted">Catatan untuk user: {m.pausedNote}</div>}
              </div>
              <div className="row">
                {m.status === "active" && (
                  <>
                    <input
                      aria-label={`Catatan jeda ${m.name}`}
                      placeholder="Catatan untuk user (opsional)"
                      style={{ width: 240 }}
                      value={notes[m.key] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [m.key]: e.target.value })}
                    />
                    <button disabled={busy} onClick={() => void setModule(m.key, "paused")}>Jeda</button>
                  </>
                )}
                {m.status !== "active" && <button className="primary" disabled={busy} onClick={() => void setModule(m.key, "active")}>{m.status === "paused" ? "Aktifkan kembali" : "Berikan"}</button>}
                {m.status !== "none" && (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => confirm(`Cabut modul ${m.name}? Modul hilang dari tampilan user. Datanya tetap disimpan.`) && void setModule(m.key, "none")}
                  >
                    Cabut
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <UserManager base={`/admin/orgs/${org.id}`} users={data.users} maxUsers={org.maxUsers} canResetAdmins onChanged={load} />
      <Section title="Log aktivitas"><AuditTable logs={logs} /></Section>
    </>
  );
}

interface KeyState {
  active: { expiresAt: number } | null;
  history: { usedAt: number; email: string; orgName: string }[];
}

export function AdminKey() {
  const [state, setState] = useState<KeyState | null>(null);
  const [fresh, setFresh] = useState<{ key: string; expiresAt: number } | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const { busy, error, run } = useAction();

  const load = useCallback(async () => setState(await api<KeyState>("GET", "/admin/master-key")), []);
  useEffect(() => {
    void load().catch(() => undefined);
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [load]);

  const remaining = state?.active ? state.active.expiresAt - nowSec : 0;
  const live = remaining > 0;

  return (
    <>
      <div className="page-head"><h1>Kunci sekali pakai</h1></div>
      <Section title="Masuk sebagai user">
        <p className="muted">
          Kunci ini bisa dipakai sebagai password untuk login ke akun user mana pun, satu kali. Berlaku 10 menit, dan membuat kunci baru menghanguskan yang lama.
        </p>
        <ErrorNote error={error} />
        {fresh && live && (
          <div className="notice">
            <div className="secret">{fresh.key}</div>
            <div className="small muted">Hanya ditampilkan sekali. Masukkan di kolom password pada halaman login bersama email user.</div>
          </div>
        )}
        <div className="row">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setFresh(await api<{ key: string; expiresAt: number }>("POST", "/admin/master-key"));
                await load();
              })
            }
          >
            {live ? "Buat kunci baru" : "Buat kunci"}
          </button>
          {live && (
            <>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("DELETE", "/admin/master-key");
                    setFresh(null);
                    await load();
                  })
                }
              >
                Hanguskan sekarang
              </button>
              <span className="badge warn">Aktif, sisa {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
            </>
          )}
          {!live && <span className="badge">Tidak ada kunci aktif</span>}
        </div>
      </Section>

      <Section title="Riwayat pemakaian">
        {!state?.history.length ? (
          <p className="muted">Belum pernah dipakai.</p>
        ) : (
          <table>
            <thead><tr><th>Waktu</th><th>Akun yang dimasuki</th><th>Perusahaan</th></tr></thead>
            <tbody>
              {state.history.map((h) => (
                <tr key={h.usedAt + h.email}><td className="small">{fmtDateTime(h.usedAt)}</td><td>{h.email}</td><td>{h.orgName}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

export function AdminAudit() {
  const [logs, setLogs] = useState<AuditDto[]>([]);
  useEffect(() => {
    api<{ logs: AuditDto[] }>("GET", "/admin/audit").then((r) => setLogs(r.logs)).catch(() => undefined);
  }, []);
  return (
    <>
      <div className="page-head"><h1>Log aktivitas</h1></div>
      <Section title="200 aktivitas terakhir di semua perusahaan"><AuditTable logs={logs} /></Section>
    </>
  );
}
