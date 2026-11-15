import { useState } from "react";
import type { Role, UserDto } from "@app/shared";
import { api } from "../api";
import { ErrorNote, Section, TempPassword, useAction } from "./ui";

interface Props {
  /** Awalan alamat API: "/org" untuk admin perusahaan, "/admin/orgs/:id" untuk pengelola sistem. */
  base: string;
  users: UserDto[];
  maxUsers: number;
  canResetAdmins: boolean;
  onChanged: () => Promise<void>;
}

export function UserManager({ base, users, maxUsers, canResetAdmins, onChanged }: Props) {
  const [form, setForm] = useState({ name: "", email: "", role: "member" as Role });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const { busy, error, run } = useAction();
  const active = users.filter((u) => u.active).length;
  const full = active >= maxUsers;

  const create = () =>
    run(async () => {
      const res = await api<{ user: UserDto; tempPassword: string }>("POST", `${base}/users`, form);
      setTemp({ email: res.user.email, password: res.tempPassword });
      setForm({ name: "", email: "", role: "member" });
      await onChanged();
    });

  const patch = (u: UserDto, body: Partial<Pick<UserDto, "role" | "active">>) =>
    run(async () => {
      await api("PATCH", `${base}/users/${u.id}`, body);
      await onChanged();
    });

  const reset = (u: UserDto) =>
    run(async () => {
      if (!confirm(`Reset password ${u.email}? Sesi yang sedang login akan diputus.`)) return;
      const res = await api<{ tempPassword: string }>("POST", `${base}/users/${u.id}/reset-password`);
      setTemp({ email: u.email, password: res.tempPassword });
      await onChanged();
    });

  return (
    <Section
      title="User"
      right={<span className={`badge ${full ? "warn" : "ok"}`}>{active} dari {maxUsers} user aktif</span>}
    >
      <ErrorNote error={error} />
      {temp && <TempPassword {...temp} onClose={() => setTemp(null)} />}

      <form
        className="fields"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div>
          <label htmlFor="u-name">Nama</label>
          <input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-email">Email</label>
          <input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="u-role">Peran</label>
          <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="member">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="primary" disabled={busy || full} title={full ? "Batas maksimal user sudah tercapai" : undefined}>
          Tambah user
        </button>
      </form>
      {full && <p className="small muted">Batas maksimal user tercapai. Nonaktifkan user lain atau minta pengelola sistem menaikkan batas.</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="small">{u.email}</td>
                <td>
                  <select
                    aria-label={`Peran ${u.name}`}
                    value={u.role}
                    disabled={busy || !u.active}
                    onChange={(e) => void patch(u, { role: e.target.value as Role })}
                    style={{ width: "auto" }}
                  >
                    <option value="member">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  {!u.active ? <span className="badge bad">Nonaktif</span> : u.mustChangePassword ? <span className="badge warn">Belum ganti password</span> : <span className="badge ok">Aktif</span>}
                </td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    {u.active && (canResetAdmins || u.role !== "admin") && (
                      <button className="sm" disabled={busy} onClick={() => void reset(u)}>Reset password</button>
                    )}
                    <button className={`sm ${u.active ? "danger" : ""}`} disabled={busy} onClick={() => void patch(u, { active: !u.active })}>
                      {u.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
