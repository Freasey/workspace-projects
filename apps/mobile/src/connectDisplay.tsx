import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { parsePairingCode, type RoomDisplayDto, type RoomDto } from "@app/shared";
import { api } from "./api";
import { QrScanner } from "./scan";
import { useTheme } from "./theme";
import { Button, ErrorNote, Field, Input, Loading, Notice, Sheet, Txt, useAction } from "./ui";

/**
 * Admin PT menghubungkan tablet/TV ke ruangan: pindai QR yang tampil di layar itu
 * (atau ketik kodenya), pilih ruangan, lalu Hubungkan. Layar berganti sendiri ke
 * jadwal ruangan dalam beberapa detik.
 */
export function ConnectDisplaySheet({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const t = useTheme();
  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [rooms, setRooms] = useState<RoomDto[] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const { busy, error, run, setError } = useAction();

  useEffect(() => {
    void run(async () => {
      const r = await api<{ rooms: RoomDto[] }>("GET", "/rooms");
      setRooms(r.rooms);
      if (r.rooms.length === 1) setRoomId(r.rooms[0]!.id);
    });
  }, []);

  const room = rooms?.find((r) => r.id === roomId);
  const submitTyped = () => {
    const c = parsePairingCode(typed);
    if (!c) return setError("Kode terdiri dari 8 huruf atau angka, seperti ABCD-2345.");
    setError(null);
    setCode(c);
  };
  const connect = () =>
    void run(async () => {
      if (!code || !room) return;
      const res = await api<{ display: RoomDisplayDto }>("POST", `/rooms/${room.id}/displays`, { code, name: name.trim() });
      onDone(`${res.display.name} terhubung. Layarnya berganti ke jadwal ${room.name} dalam beberapa detik.`);
    });

  if (scanning && !code) {
    return (
      <QrScanner
        title="Pindai QR di layar ruangan"
        onClose={() => setScanning(false)}
        onCode={(c) => {
          setScanning(false);
          setCode(c);
        }}
      />
    );
  }

  return (
    <Sheet
      full
      title="Hubungkan layar ruangan"
      onClose={onClose}
      footer={
        code ? (
          <>
            <Button label="Batal" onPress={onClose} style={{ flex: 1 }} />
            <Button
              testID="connect-display"
              kind="primary"
              label={room ? `Hubungkan ke ${room.name}` : "Pilih ruangan dulu"}
              disabled={!room}
              busy={busy}
              onPress={connect}
              style={{ flex: 2 }}
            />
          </>
        ) : undefined
      }
    >
      <ErrorNote error={error} />
      {!code ? (
        <>
          <Txt muted>
            Di tablet atau TV, buka aplikasi Spaces → Pasang sebagai layar ruangan, atau buka alamat /layar di peramban. Layarnya menampilkan QR dan kode.
          </Txt>
          <Button kind="primary" label="Pindai QR di layar" onPress={() => setScanning(true)} />
          <Txt variant="small" muted style={{ textAlign: "center" }}>atau ketik kode yang tampil di layar</Txt>
          <Field label="Kode di layar">
            <Input
              value={typed}
              onChangeText={(v) => setTyped(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              placeholder="ABCD-2345"
              onSubmitEditing={submitTyped}
              style={{ fontSize: 22, letterSpacing: 4, textAlign: "center", fontVariant: ["tabular-nums"] }}
            />
          </Field>
          <Button label="Lanjut" onPress={submitTyped} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="small" muted>Kode layar</Txt>
              <Txt style={{ fontSize: 22, fontWeight: "800", letterSpacing: 3, fontVariant: ["tabular-nums"] }}>{code}</Txt>
            </View>
            <Button kind="ghost" small label="Pindai ulang" onPress={() => { setCode(null); setScanning(true); }} />
          </View>
          <Txt variant="heading">Tampilkan ruangan</Txt>
          {!rooms ? (
            <Loading />
          ) : rooms.length === 0 ? (
            <Notice tone="warn" text="Belum ada ruangan. Tambahkan ruangan dulu lewat Kelola ruangan di versi web." />
          ) : (
            <View style={{ gap: 6 }}>
              {rooms.map((r) => {
                const on = r.id === roomId;
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setRoomId(r.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? t.accent : t.line,
                      backgroundColor: pressed ? t.surface2 : t.surface,
                    })}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? t.accent : t.line, alignItems: "center", justifyContent: "center" }}>
                      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt>{r.name}</Txt>
                      <Text style={{ color: t.muted, fontSize: 13 }}>
                        {r.capacity} orang{r.location ? ` · ${r.location}` : ""}
                        {!r.active ? " · nonaktif" : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Field label="Nama layar (opsional)">
            <Input value={name} onChangeText={setName} maxLength={60} placeholder={room ? `Layar ${room.name}` : "Misalnya: Tablet pintu"} />
          </Field>
        </>
      )}
    </Sheet>
  );
}
