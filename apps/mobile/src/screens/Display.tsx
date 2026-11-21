import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { displayClock, displayState, fmtCountdown, fmtMin, type DisplayBooking, type DisplayFeed, type DisplayTone } from "@app/shared";
import { ApiErr, display, msg } from "../api";
import { fmtDate, fmtDateShort } from "../date";
import { QrScanner } from "../scan";
import { useTheme } from "../theme";
import { Button, ErrorNote, Field, Input, Notice, Txt, useAction } from "../ui";
import { AuthLayout } from "./Auth";

const POLL_MS = 30_000;

// Warna status sama dengan versi web (/layar). Layar selalu gelap.
const TONES: Record<DisplayTone, [string, string]> = {
  busy: ["#c2382b", "#fff0ee"],
  soon: ["#c27a0e", "#fff6e6"],
  free: ["#2e9d5b", "#eafff1"],
  closed: ["#3b4652", "#e7edf3"],
};
const DARK = { bg: "#0d1117", card: "#161d26", ink: "#eef2f6", muted: "#aeb9c5", faint: "#7f8b98", chip: "#2a3440" };

/** Memasang perangkat ini sebagai layar ruangan dengan kode dari admin PT. */
export function PairDisplay({ notice, onPaired, onBack }: { notice?: string | null; onPaired: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const { busy, error, run, setError } = useAction();
  const pair = (value: string) =>
    void run(async () => {
      await display.pair(value);
      onPaired();
    });
  const submit = () => {
    if (!code.trim()) return setError("Isi kode pemasangan.");
    pair(code);
  };
  return (
    <AuthLayout>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header">Pasang layar ruangan</Txt>
        <Txt muted>
          Perangkat ini akan menampilkan jadwal hari ini, hitung mundur, dan peserta untuk satu ruangan. Minta QR atau kode pemasangan ke admin PT (web:
          Kelola ruangan → Layar ruangan).
        </Txt>
      </View>
      {!!notice && <Notice tone="warn" text={notice} />}
      <ErrorNote error={error} />
      <Button testID="pair-scan" kind="primary" label={busy ? "Memasang…" : "Pindai QR"} busy={busy} onPress={() => setScanning(true)} />
      <Txt variant="small" muted style={{ textAlign: "center" }}>atau ketik kodenya</Txt>
      <Field label="Kode pemasangan">
        <Input
          testID="pair-code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          placeholder="ABCD-2345"
          onSubmitEditing={submit}
          style={{ fontSize: 24, letterSpacing: 4, textAlign: "center", fontVariant: ["tabular-nums"] }}
        />
      </Field>
      <Button testID="pair-submit" label="Pasang dengan kode" disabled={busy} onPress={submit} />
      <Button kind="ghost" label="Kembali ke halaman masuk" onPress={onBack} />
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onCode={(scanned) => {
            setScanning(false);
            setCode(scanned);
            pair(scanned);
          }}
        />
      )}
    </AuthLayout>
  );
}

export function DisplayScreen({ onUnpaired }: { onUnpaired: (why: string) => void }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width > height && width >= 700;
  const [feed, setFeed] = useState<DisplayFeed | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const skew = useRef(0);
  const [tick, setTick] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const sent = Date.now();
      const f = await display.feed();
      // Koreksi jam perangkat terhadap jam server.
      skew.current = f.now * 1000 - (sent + Date.now()) / 2;
      setFeed(f);
      setOffline(null);
    } catch (e) {
      if (e instanceof ApiErr && e.code === "DISPLAY_UNPAIRED") {
        await display.clear();
        onUnpaired(e.message);
      } else setOffline(msg(e));
    }
  }, [onUnpaired]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && void load());
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      sub.remove();
    };
  }, [load]);

  const now = Math.floor((tick + skew.current) / 1000);
  const boundary = !!feed && [...feed.bookings.flatMap((b) => [b.startAt, b.endAt]), feed.dayStart + 86_400].some((t) => t > feed.now && t <= now);
  useEffect(() => {
    if (boundary) void load();
  }, [boundary, load]);

  if (!feed) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ color: DARK.muted, fontSize: 16, textAlign: "center" }}>{offline ? `${offline} Mencoba lagi…` : "Memuat jadwal ruangan…"}</Text>
        {!!offline && <Button kind="ghost" label="Keluar dari mode layar" onPress={() => setMenu(true)} />}
        <ExitDialog visible={menu} roomName={null} onCancel={() => setMenu(false)} onConfirm={async () => { await display.unpair(); onUnpaired("Mode layar dihentikan di perangkat ini."); }} />
      </View>
    );
  }

  const st = displayState(feed, now);
  const tone: DisplayTone = feed.blocked ? "closed" : st.tone;
  const [bg, ink] = TONES[tone];
  const featured = st.current ?? (st.next && st.next.date === feed.date ? st.next : null);
  const big = wide ? 1.25 : 1;

  const main = (
    <View style={{ backgroundColor: bg, padding: 24, paddingTop: 24 + insets.top, gap: 22, ...(wide ? { flex: 3 } : { minHeight: height * 0.66 }) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ink, fontSize: 28 * big, fontWeight: "700", letterSpacing: -0.5 }} numberOfLines={2}>{feed.room.name}</Text>
          <Text style={{ color: ink, opacity: 0.85, fontSize: 14 * big, marginTop: 4 }}>
            {feed.room.capacity} orang{feed.room.location ? ` · ${feed.room.location}` : ""} · {feed.org.name}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: ink, fontSize: 28 * big, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{displayClock(feed, now)}</Text>
          <Text style={{ color: ink, opacity: 0.85, fontSize: 12 * big }}>{fmtDate(feed.date)}</Text>
        </View>
      </View>

      <View style={{ flexGrow: 1, justifyContent: "center", gap: 8 }}>
        <Text style={{ color: ink, fontSize: 46 * big, fontWeight: "800", letterSpacing: -1 }}>{feed.blocked ? "Tidak tersedia" : st.label}</Text>
        {feed.blocked ? (
          <Text style={{ color: ink, fontSize: 17 * big, opacity: 0.92 }}>{feed.blocked}</Text>
        ) : (
          <>
            {st.current && <Text style={{ color: ink, fontSize: 22 * big, fontWeight: "600" }}>{st.current.title}</Text>}
            {!st.current && !!st.detail && <Text style={{ color: ink, fontSize: 17 * big, opacity: 0.92 }}>{st.detail}</Text>}
            {st.countdown && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: ink, opacity: 0.88, fontSize: 16 * big }}>{st.countdown.label}</Text>
                <Text style={{ color: ink, fontSize: 64 * big, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -1 }}>
                  {fmtCountdown(st.countdown.seconds)}
                </Text>
              </View>
            )}
            {!st.current && st.next && (
              <Text style={{ color: ink, fontSize: 16 * big, opacity: 0.92 }}>
                Berikutnya: <Text style={{ fontWeight: "700" }}>{st.next.title}</Text>, {st.next.date === feed.date ? "" : `${fmtDateShort(st.next.date)} `}
                {fmtMin(st.next.startMin)}–{fmtMin(st.next.endMin)}
              </Text>
            )}
            {!st.next && !st.current && <Text style={{ color: ink, fontSize: 16 * big, opacity: 0.92 }}>Tidak ada booking dalam 14 hari ke depan.</Text>}
          </>
        )}
      </View>

      {!feed.blocked && featured && <Attendees booking={featured} heading={st.current ? "Peserta" : "Peserta booking berikutnya"} ink={ink} scale={big} />}
    </View>
  );

  const side = (
    <View style={{ padding: 24, gap: 12, paddingBottom: 16 + insets.bottom, ...(wide ? { flex: 2, paddingTop: 24 + insets.top } : null) }}>
      <Text style={{ color: DARK.muted, fontSize: 14, fontWeight: "700", letterSpacing: 1.2 }}>JADWAL HARI INI</Text>
      {feed.blocked || feed.bookings.length === 0 ? (
        <Text style={{ color: DARK.muted, fontSize: 15 }}>{feed.blocked ? "—" : "Belum ada booking hari ini."}</Text>
      ) : (
        feed.bookings.map((b) => {
          const state = b.endAt <= now ? "done" : b.startAt <= now ? "now" : b.id === st.next?.id ? "next" : "";
          return (
            <View
              key={b.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: DARK.card,
                borderWidth: 2,
                borderColor: state === "now" ? bg : "transparent",
                opacity: state === "done" ? 0.45 : 1,
              }}
            >
              <Text style={{ color: DARK.muted, fontVariant: ["tabular-nums"], fontSize: 14 }}>{fmtMin(b.startMin)}–{fmtMin(b.endMin)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: DARK.ink, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{b.title}</Text>
                <Text style={{ color: DARK.muted, fontSize: 12 }} numberOfLines={1}>
                  {b.userName}
                  {b.participants.length > 0 ? ` + ${b.participants.length} peserta` : ""}
                </Text>
              </View>
              {state === "now" && <Pill label="Berjalan" bg={bg} fg={ink} />}
              {state === "next" && <Pill label="Berikutnya" bg={DARK.chip} fg={DARK.ink} />}
            </View>
          );
        })
      )}
      {feed.hours && feed.closure === null && (
        <Text style={{ color: DARK.muted, fontSize: 13 }}>
          Buka {fmtMin(feed.hours.openMin)}–{fmtMin(feed.hours.closeMin)}
          {feed.hours.breakStart !== null ? `, istirahat ${fmtMin(feed.hours.breakStart)}–${fmtMin(feed.hours.breakEnd!)}` : ""}
        </Text>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: wide ? "auto" : 8 }}>
        <Text style={{ color: offline ? "#f0b04a" : DARK.faint, fontSize: 12, flex: 1 }}>
          {offline ? "● Tidak terhubung, menampilkan data terakhir" : "Booking lewat aplikasi Spaces"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pengaturan layar"
          onLongPress={() => setMenu(true)}
          delayLongPress={800}
          hitSlop={12}
          style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#2c3944" }}
        >
          <Text style={{ color: DARK.faint, fontSize: 16 }}>⋯</Text>
        </Pressable>
      </View>
      {!wide && <Text style={{ color: DARK.faint, fontSize: 11 }}>Tekan lama ⋯ untuk keluar dari mode layar.</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg }}>
      {wide ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          {main}
          <ScrollView style={{ flex: 2 }} contentContainerStyle={{ flexGrow: 1 }}>{side}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {main}
          {side}
        </ScrollView>
      )}
      <ExitDialog
        visible={menu}
        roomName={feed.room.name}
        onCancel={() => setMenu(false)}
        onConfirm={async () => {
          await display.unpair();
          onUnpaired("Mode layar dihentikan di perangkat ini.");
        }}
      />
    </View>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function Attendees({ booking: b, heading, ink, scale }: { booking: DisplayBooking; heading: string; ink: string; scale: number }) {
  const people = [{ id: "booker", name: b.userName, booker: true }, ...b.participants.map((p) => ({ ...p, booker: false }))];
  return (
    <View style={{ backgroundColor: "rgba(0,0,0,0.16)", borderRadius: 14, padding: 16, gap: 10 }}>
      <Text style={{ color: ink, fontWeight: "600", fontSize: 15 * scale }}>
        {heading} <Text style={{ fontWeight: "400", opacity: 0.8 }}>({people.length} orang)</Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 16 }}>
        {people.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180 * scale }}>
            <View style={{ width: 30 * scale, height: 30 * scale, borderRadius: 15 * scale, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: ink, fontWeight: "700", fontSize: 12 * scale }}>{initials(p.name)}</Text>
            </View>
            <Text style={{ color: ink, fontSize: 15 * scale }} numberOfLines={1}>{p.name}</Text>
            {p.booker && (
              <View style={{ borderWidth: 1, borderColor: ink, borderRadius: 999, paddingHorizontal: 7, opacity: 0.8 }}>
                <Text style={{ color: ink, fontSize: 11 * scale }}>Pemesan</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function ExitDialog(props: { visible: boolean; roomName: string | null; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const t = useTheme();
  const { busy, run } = useAction();
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <View style={{ flex: 1, backgroundColor: t.backdrop, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 14, width: "100%", maxWidth: 420 }}>
          <Txt variant="heading">Keluar dari mode layar?</Txt>
          <Txt muted>
            Perangkat ini berhenti menampilkan jadwal{props.roomName ? ` ${props.roomName}` : ""} dan tautannya dicabut. Untuk memasang lagi, admin PT perlu
            membuat kode baru.
          </Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Batal" onPress={props.onCancel} style={{ flex: 1 }} />
            <Button kind="danger" label="Ya, keluar" busy={busy} onPress={() => void run(props.onConfirm)} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
