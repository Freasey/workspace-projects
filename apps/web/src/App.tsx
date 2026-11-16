import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import type { Me } from "@app/shared";
import { api, ApiErr, AuthContext, useAuth } from "./api";
import { AdminAudit, AdminKey, AdminOrgDetail, AdminOrgs } from "./pages/admin";
import { ChangePassword, Login } from "./pages/auth";
import { Home, OrgUsers } from "./pages/home";
import { RoomsBooking } from "./pages/rooms";
import { RoomsManage } from "./pages/roomsManage";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", "/auth/me"));
    } catch (e) {
      if (e instanceof ApiErr && e.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("auth-changed", onChange);
    return () => window.removeEventListener("auth-changed", onChange);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("POST", "/auth/logout").catch(() => undefined);
    setMe(null);
  }, []);

  if (loading) return <div className="center muted">Memuat…</div>;

  return (
    <AuthContext.Provider value={{ me, refresh, logout }}>
      {!me ? <Login /> : me.kind === "superadmin" ? <AdminApp /> : <UserApp me={me} />}
    </AuthContext.Provider>
  );
}

function Shell({ title, links, banner, children }: { title: string; links: [string, string][]; banner?: ReactNode; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <>
      {banner}
      <header className="topbar">
        <span className="brand"><img src="/logo.svg" alt="Spaces" />{title}</span>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end>{label}</NavLink>
          ))}
        </nav>
        <button className="sm" onClick={() => void logout()}>Keluar</button>
      </header>
      <main>{children}</main>
    </>
  );
}

function AdminApp() {
  return (
    <Shell title="Spaces · Panel Pengelola" links={[["/admin", "Perusahaan"], ["/admin/key", "Kunci sekali pakai"], ["/admin/audit", "Log"]]}>
      <Routes>
        <Route path="/admin" element={<AdminOrgs />} />
        <Route path="/admin/orgs/:id" element={<AdminOrgDetail />} />
        <Route path="/admin/key" element={<AdminKey />} />
        <Route path="/admin/audit" element={<AdminAudit />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}

function UserApp({ me }: { me: Extract<Me, { kind: "user" }> }) {
  const { logout } = useAuth();
  const banner = me.impersonated ? (
    <div className="banner">Anda masuk sebagai {me.user.name} ({me.user.email}) dengan kunci sekali pakai. Sesi berakhir otomatis dalam 1 jam.</div>
  ) : undefined;

  if (me.org.status !== "active") {
    return (
      <div className="center">
        <div className="card login">
          <h1>Akses dihentikan sementara</h1>
          <p className="muted">Akses {me.org.name} sedang dihentikan sementara. Data Anda aman. Hubungi pengelola sistem untuk mengaktifkannya kembali.</p>
          <button onClick={() => void logout()}>Keluar</button>
        </div>
      </div>
    );
  }
  if (me.user.mustChangePassword && !me.impersonated) return <ChangePassword forced />;

  const rooms = me.modules.find((m) => m.key === "rooms");
  const isAdmin = me.user.role === "admin";
  const links: [string, string][] = [["/", "Beranda"]];
  if (rooms?.status === "active") {
    links.push(["/rooms", "Booking ruangan"]);
    if (isAdmin) links.push(["/rooms/manage", "Kelola ruangan"]);
  }
  if (isAdmin) links.push(["/users", "User"]);
  if (!me.impersonated) links.push(["/password", "Ganti password"]);

  return (
    <Shell title={me.org.name} links={links} banner={banner}>
      <Routes>
        <Route path="/" element={<Home />} />
        {rooms?.status === "active" && <Route path="/rooms" element={<RoomsBooking />} />}
        {rooms?.status === "active" && isAdmin && <Route path="/rooms/manage" element={<RoomsManage />} />}
        {isAdmin && <Route path="/users" element={<OrgUsers />} />}
        {!me.impersonated && <Route path="/password" element={<ChangePassword />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
