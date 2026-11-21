import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Me } from "@app/shared";
import { api, ApiErr, AuthContext, display, msg, session, type UserMe } from "./api";
import { useTheme, type Theme } from "./theme";
import { Brand, Button, Logo, Notice, Txt } from "./ui";
import { Account, Home } from "./screens/Account";
import { AuthLayout, Blocked, ForcedChangePassword, Login } from "./screens/Auth";
import { DisplayScreen, PairDisplay } from "./screens/Display";
import { MyBookings, Schedule } from "./screens/Rooms";

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // Server tidak terjangkau saat membuka aplikasi: sesi dipertahankan, user bisa mencoba lagi.
  const [offline, setOffline] = useState<string | null>(null);
  // Mode layar ruangan: perangkat di depan ruangan, tanpa sesi user.
  const [screen, setScreen] = useState<"app" | "pair" | "display">("app");
  const [pairNotice, setPairNotice] = useState<string | null>(null);
  const unpaired = useCallback((why: string) => {
    setPairNotice(why);
    setScreen("pair");
  }, []);

  const refresh = useCallback(async () => {
    if (!session.hasToken()) {
      setMe(null);
      setOffline(null);
      return;
    }
    try {
      setMe(await api<Me>("GET", "/auth/me"));
      setOffline(null);
    } catch (e) {
      if (e instanceof ApiErr && e.status === 401) {
        await session.clear();
        setMe(null);
        setOffline(null);
      } else {
        setOffline(msg(e));
      }
    }
  }, []);

  const logout = useCallback(async () => {
    await session.logout();
    setMe(null);
    setOffline(null);
  }, []);

  useEffect(() => {
    session.onAuthChanged(() => void refresh());
    void Promise.all([session.restore(), display.restore()])
      .then(() => (display.hasToken() ? setScreen("display") : refresh()))
      .finally(() => setLoading(false));
  }, [refresh]);

  let body: ReactNode;
  let onDeep = true;
  if (loading) {
    onDeep = false;
    body = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, backgroundColor: t.bg }}>
        <Logo size={56} />
        <ActivityIndicator color={t.accent} />
      </View>
    );
  } else if (screen === "display") {
    onDeep = true;
    body = <DisplayScreen onUnpaired={unpaired} />;
  } else if (screen === "pair") {
    body = (
      <PairDisplay
        notice={pairNotice}
        onPaired={() => setScreen("display")}
        onBack={() => {
          setPairNotice(null);
          setScreen("app");
          void refresh();
        }}
      />
    );
  } else if (!me && offline) {
    body = (
      <AuthLayout>
        <Txt variant="title">Tidak terhubung</Txt>
        <Notice tone="warn" text={offline} />
        <Button kind="primary" label="Coba lagi" onPress={() => void refresh()} />
        <Button kind="ghost" label="Keluar" onPress={() => void logout()} />
      </AuthLayout>
    );
  } else if (!me) {
    body = <Login onDisplay={() => setScreen("pair")} />;
  } else if (me.kind === "superadmin") {
    body = <Blocked title="Panel pengelola ada di web" text="Akun pengelola sistem tidak dipakai di aplikasi mobile. Buka versi web untuk mengelola perusahaan, modul, dan kunci sekali pakai." />;
  } else if (me.org.status !== "active") {
    body = <Blocked title="Akses dihentikan sementara" text={`Akses ${me.org.name} sedang dihentikan sementara. Data Anda aman. Hubungi pengelola sistem untuk mengaktifkannya kembali.`} />;
  } else if (me.user.mustChangePassword && !me.impersonated) {
    body = <ForcedChangePassword />;
  } else {
    onDeep = false;
    body = <UserApp me={me} />;
  }

  return (
    <AuthContext.Provider value={{ me, refresh, logout }}>
      <StatusBar style={onDeep || t.dark ? "light" : "dark"} />
      {body}
    </AuthContext.Provider>
  );
}

type TabKey = "schedule" | "mine" | "home" | "account";

function UserApp({ me }: { me: UserMe }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rooms = me.modules.find((m) => m.key === "rooms");
  const roomsOn = rooms?.status === "active";
  const first: TabKey = roomsOn ? "schedule" : "home";
  const [tab, setTab] = useState<TabKey>(first);
  // Modul dijeda atau diaktifkan di tengah pemakaian: kembali ke tab pertama yang tersedia.
  const current: TabKey = tab === "account" || (roomsOn ? tab === "schedule" || tab === "mine" : tab === "home") ? tab : first;

  // Tombol kembali Android: dari tab lain kembali ke tab pertama dulu, baru keluar aplikasi.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (current === first) return false;
      setTab(first);
      return true;
    });
    return () => sub.remove();
  }, [current, first]);

  const tabs: { key: TabKey; label: string }[] = roomsOn
    ? [
        { key: "schedule", label: "Jadwal" },
        { key: "mine", label: "Booking saya" },
        { key: "account", label: "Akun" },
      ]
    : [
        { key: "home", label: "Beranda" },
        { key: "account", label: "Akun" },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ backgroundColor: t.surface, paddingTop: insets.top }}>
        {me.impersonated && (
          <View style={{ backgroundColor: t.warnSoft, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: t.warn, fontSize: 13, fontWeight: "500" }}>
              Anda masuk sebagai {me.user.name} dengan kunci sekali pakai. Sesi berakhir otomatis dalam 1 jam.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: current === "schedule" ? 0 : 1, borderBottomColor: t.line }}>
          <Brand size={22} />
          <Txt variant="small" muted numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>{me.org.name}</Txt>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {current === "schedule" && <Schedule />}
        {current === "mine" && <MyBookings />}
        {current === "home" && <Home />}
        {current === "account" && <Account />}
      </View>

      <View style={{ flexDirection: "row", backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line, paddingBottom: insets.bottom }} accessibilityRole="tablist">
        {tabs.map((item) => {
          const active = item.key === current;
          return (
            <Pressable
              key={item.key}
              testID={`tab-${item.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.key)}
              style={{ flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 8, gap: 4 }}
            >
              <TabIcon name={item.key} color={active ? t.accent : t.muted} theme={t} />
              <Text style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? t.accent : t.muted }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Ikon tab digambar dari bentuk dasar, tanpa pustaka ikon. */
function TabIcon({ name, color, theme }: { name: TabKey; color: string; theme: Theme }) {
  const box = { width: 24, height: 24, alignItems: "center", justifyContent: "center" } as const;
  if (name === "schedule") {
    return (
      <View style={box}>
        <View style={{ width: 20, height: 18, borderRadius: 4, borderWidth: 2, borderColor: color }}>
          <View style={{ height: 3, backgroundColor: color }} />
          <View style={{ flexDirection: "row", gap: 3, padding: 2.5 }}>
            <View style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: color }} />
            <View style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: color }} />
          </View>
        </View>
      </View>
    );
  }
  if (name === "mine") {
    return (
      <View style={[box, { gap: 3.5 }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
            <View style={{ width: 13, height: 2.5, borderRadius: 1.25, backgroundColor: color }} />
          </View>
        ))}
      </View>
    );
  }
  if (name === "home") {
    return (
      <View style={box}>
        <Logo size={18} />
      </View>
    );
  }
  return (
    <View style={[box, { gap: 2 }]}>
      <View style={{ width: 9, height: 9, borderRadius: 4.5, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 2, borderBottomWidth: 0, borderColor: color, backgroundColor: theme.surface }} />
    </View>
  );
}
