import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Me } from "@app/shared";
import { api, ApiErr, AuthContext, useAuth } from "./api";
import { Brand } from "./components/ui";
import { AdminAudit, AdminKey, AdminOrgDetail, AdminOrgs } from "./pages/admin";
import { AuthLayout, ChangePassword, Login } from "./pages/auth";
import { Home, OrgUsers } from "./pages/home";
import { MyBookings, RoomsBooking } from "./pages/rooms";
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
      {!me ? <Login /> : me.kind === "superadmin" ? <AdminApp email={me.email} /> : <UserApp me={me} />}
    </AuthContext.Provider>
  );
}

type NavItem =
  | { group: string }
  | { module: string }
  | { to: string; label: string; sub?: boolean; badge?: ReactNode; match?: (path: string) => boolean };

/** Shell opsi B: bar atas, sidebar modul yang selalu terlihat, area kerja di kanan. */
function Shell(props: { context: string; who: string; role: string; nav: NavItem[]; banner?: ReactNode; children: ReactNode }) {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  return (
    <div className="shell">
      {props.banner}
      <header className="topbar">
        <Brand />
        <span className="muted">{props.context}</span>
        <span className="grow" />
        <span className="who small">
          <strong>{props.who}</strong>
          <br />
          <span className="muted">{props.role}</span>
        </span>
        <button className="sm" onClick={() => void logout()}>Keluar</button>
      </header>
      <nav className="side" aria-label="Menu">
        {props.nav.map((item, i) =>
          "group" in item ? (
            <span key={i} className="grp">{item.group}</span>
          ) : "module" in item ? (
            <span key={i} className="mod">{item.module}</span>
          ) : (
            <Link
              key={i}
              to={item.to}
              className={`${item.sub ? "sub " : ""}${(item.match ? item.match(pathname) : pathname === item.to) ? "active" : ""}`}
              aria-current={(item.match ? item.match(pathname) : pathname === item.to) ? "page" : undefined}
            >
              <span>{item.label}</span>
              {item.badge}
            </Link>
          ),
        )}
      </nav>
      <main>
        <div className="inner">{props.children}</div>
      </main>
    </div>
  );
}

function AdminApp({ email }: { email: string }) {
  const nav: NavItem[] = [
    { group: "Pengelola sistem" },
    { to: "/admin", label: "Perusahaan", match: (p) => p === "/admin" || p.startsWith("/admin/orgs") },
    { to: "/admin/key", label: "Kunci sekali pakai" },
    { to: "/admin/audit", label: "Log" },
  ];
  return (
    <Shell context="Panel Pengelola" who={email} role="Super admin" nav={nav}>
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
      <AuthLayout>
        <div className="stack">
          <h1>Akses dihentikan sementara</h1>
          <p className="muted">Akses {me.org.name} sedang dihentikan sementara. Data Anda aman. Hubungi pengelola sistem untuk mengaktifkannya kembali.</p>
          <button onClick={() => void logout()}>Keluar</button>
        </div>
      </AuthLayout>
    );
  }
  if (me.user.mustChangePassword && !me.impersonated) return <ChangePassword forced />;

  const rooms = me.modules.find((m) => m.key === "rooms");
  const roomsOn = rooms?.status === "active";
  const isAdmin = me.user.role === "admin";

  const nav: NavItem[] = [];
  if (me.modules.length) nav.push({ group: "Modul" });
  if (roomsOn) {
    nav.push({ module: rooms.name });
    nav.push({ to: "/rooms", label: "Jadwal", sub: true });
    nav.push({ to: "/rooms/mine", label: "Booking saya", sub: true });
    if (isAdmin) nav.push({ to: "/rooms/manage", label: "Kelola ruangan", sub: true });
  } else if (rooms) {
    nav.push({ to: "/", label: rooms.name, badge: <span className="badge warn">Dijeda</span> });
  }
  if (isAdmin) nav.push({ group: "Kelola PT" }, { to: "/users", label: "Pengguna" });
  if (!me.impersonated) nav.push({ group: "Akun" }, { to: "/password", label: "Ganti password" });

  return (
    <Shell context={me.org.name} who={me.user.name} role={isAdmin ? "Admin PT" : "User"} nav={nav} banner={banner}>
      <Routes>
        {/* Jadwal adalah halaman awal selama modul Booking Ruangan aktif. */}
        <Route path="/" element={roomsOn ? <Navigate to="/rooms" replace /> : <Home />} />
        {roomsOn && <Route path="/rooms" element={<RoomsBooking />} />}
        {roomsOn && <Route path="/rooms/mine" element={<MyBookings />} />}
        {roomsOn && isAdmin && <Route path="/rooms/manage" element={<RoomsManage />} />}
        {isAdmin && <Route path="/users" element={<OrgUsers />} />}
        {!me.impersonated && <Route path="/password" element={<ChangePassword />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
