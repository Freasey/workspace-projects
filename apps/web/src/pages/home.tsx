import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AuditDto, UserDto } from "@app/shared";
import { api, fmtDateTime, msg, useUser } from "../api";
import { ErrorNote, Section } from "../components/ui";
import { UserManager } from "../components/UserManager";

const MODULE_PATH: Record<string, string> = { rooms: "/rooms" };

export function Home() {
  const me = useUser();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Halo, {me.user.name}</h1>
          <div className="muted">{me.org.name}</div>
        </div>
      </div>
      {me.modules.length === 0 && <div className="card muted">Belum ada modul yang diaktifkan untuk perusahaan Anda.</div>}
      <div className="grid">
        {me.modules.map((m) =>
          m.status === "active" ? (
            <Link key={m.key} to={MODULE_PATH[m.key] ?? "/"} className="module">
              <div className="card">
                <div className="spread"><h2 style={{ margin: 0 }}>{m.name}</h2><span className="badge ok">Aktif</span></div>
                <p className="muted" style={{ margin: "8px 0 0" }}>{m.description}</p>
              </div>
            </Link>
          ) : (
            <div key={m.key} className="module paused" aria-disabled="true">
              <div className="card">
                <div className="spread"><h2 style={{ margin: 0 }}>{m.name}</h2><span className="badge warn">Dijeda</span></div>
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  {m.pausedNote || "Modul ini sedang dijeda dan tidak bisa dibuka. Data Anda aman. Hubungi pengelola sistem."}
                </p>
              </div>
            </div>
          ),
        )}
      </div>
    </>
  );
}

export function AuditTable({ logs }: { logs: AuditDto[] }) {
  if (!logs.length) return <p className="muted">Belum ada aktivitas.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Detail</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(l.createdAt)}</td>
              <td className="small">{l.actor}</td>
              <td className="small mono">{l.action}</td>
              <td className="small">{l.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrgUsers() {
  const [data, setData] = useState<{ users: UserDto[]; maxUsers: number } | null>(null);
  const [logs, setLogs] = useState<AuditDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([
        api<{ users: UserDto[]; maxUsers: number }>("GET", "/org/users"),
        api<{ logs: AuditDto[] }>("GET", "/org/audit"),
      ]);
      setData(u);
      setLogs(a.logs);
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <>
      <div className="page-head"><h1>User</h1></div>
      <ErrorNote error={error} />
      {data && <UserManager base="/org" users={data.users} maxUsers={data.maxUsers} canResetAdmins={false} onChanged={load} />}
      <Section title="Log aktivitas"><AuditTable logs={logs} /></Section>
    </>
  );
}
