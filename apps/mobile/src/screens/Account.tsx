import { useState } from "react";
import { ScrollView, View } from "react-native";
import appConfig from "../../app.json";
import { SERVER, useAuth, useUser } from "../api";
import { useTheme } from "../theme";
import { ConnectDisplaySheet } from "../connectDisplay";
import { Badge, Button, Card, DetailRow, Notice, Txt } from "../ui";
import { ChangePasswordCard } from "./Auth";

/** Ditampilkan sebagai tab pertama saat tidak ada modul yang bisa dibuka. */
export function Home() {
  const me = useUser();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ gap: 2, marginBottom: 4 }}>
        <Txt variant="title">Halo, {me.user.name}</Txt>
        <Txt muted>{me.org.name}</Txt>
      </View>
      {me.modules.length === 0 && (
        <Card>
          <Txt muted>Belum ada modul yang diaktifkan untuk perusahaan Anda.</Txt>
        </Card>
      )}
      {me.modules.map((m) => (
        <Card key={m.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Txt variant="heading" style={{ flex: 1 }}>{m.name}</Txt>
            <Badge label={m.status === "active" ? "Aktif" : "Dijeda"} tone={m.status === "active" ? "ok" : "warn"} />
          </View>
          <Txt muted>
            {m.status === "active" ? m.description : m.pausedNote || "Modul ini sedang dijeda dan tidak bisa dibuka. Data Anda aman. Hubungi pengelola sistem."}
          </Txt>
        </Card>
      ))}
    </ScrollView>
  );
}

export function Account() {
  const me = useUser();
  const t = useTheme();
  const { logout } = useAuth();
  const [changing, setChanging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const isAdmin = me.user.role === "admin";
  const roomsOn = me.modules.some((m) => m.key === "rooms" && m.status === "active");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<string | null>(null);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Txt variant="heading" color={t.accent}>{me.user.name.trim().charAt(0).toUpperCase()}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="heading">{me.user.name}</Txt>
            <Txt variant="small" muted>{me.user.email}</Txt>
          </View>
        </View>
        <DetailRow label="Perusahaan">{me.org.name}</DetailRow>
        <DetailRow label="Peran">{isAdmin ? "Admin PT" : "User"}</DetailRow>
      </Card>

      {!!connected && <Notice tone="ok" text={connected} />}
      {isAdmin && roomsOn && (
        <Card style={{ gap: 10 }}>
          <Txt variant="heading">Layar ruangan</Txt>
          <Txt muted>Pindai QR yang tampil di tablet atau TV depan ruangan untuk menjadikannya layar jadwal ruangan itu.</Txt>
          <Button
            testID="open-connect-display"
            kind="primary"
            label="Hubungkan layar ruangan"
            onPress={() => {
              setConnected(null);
              setConnecting(true);
            }}
          />
        </Card>
      )}
      {isAdmin && (
        <Card>
          <Txt muted>Kelola ruangan, jadwal, aturan booking, dan pengguna tersedia di versi web.</Txt>
        </Card>
      )}
      {connecting && (
        <ConnectDisplaySheet
          onClose={() => setConnecting(false)}
          onDone={(m) => {
            setConnecting(false);
            setConnected(m);
          }}
        />
      )}

      {!me.impersonated &&
        (changing ? (
          <>
            <ChangePasswordCard />
            <Button kind="ghost" label="Tutup ganti password" onPress={() => setChanging(false)} />
          </>
        ) : (
          <Button testID="open-change-password" label="Ganti password" onPress={() => setChanging(true)} />
        ))}

      <Button
        testID="logout"
        kind="danger"
        label="Keluar"
        busy={leaving}
        onPress={() => {
          setLeaving(true);
          void logout();
        }}
      />
      <Txt variant="small" muted style={{ textAlign: "center", marginTop: 8 }}>
        Spaces {appConfig.expo.version} · {SERVER.replace(/^https?:\/\//, "")}
      </Txt>
    </ScrollView>
  );
}
