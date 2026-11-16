import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { fmtMin, SLOT_MINUTES, WEEKDAY_NAMES, type BookingDto, type BookingStatus, type ClosureDto, type RoomDto, type RoomHour, type RoomSettings } from "@app/shared";
import { api, msg, useUser } from "../api";
import { addDays, dayOfMonth, dayShort, fmtDate, fmtDateShort, nowMinIn, todayIn, weekdayOf } from "../date";
import { DateSheet, TimeSheet } from "../pickers";
import { useTheme } from "../theme";
import { Badge, Button, Card, DetailRow, ErrorNote, Field, Input, Loading, Notice, PickerRow, Sheet, Toast, Txt, useAction, useToast, type Tone } from "../ui";

const STATUS: Record<BookingStatus, [string, Tone]> = {
  confirmed: ["Terkonfirmasi", "info"],
  completed: ["Selesai", "neutral"],
  cancelled: ["Dibatalkan", "bad"],
};
const StatusBadge = ({ status }: { status: BookingStatus }) => <Badge label={STATUS[status][0]} tone={STATUS[status][1]} />;

const roomMeta = (room: RoomDto) => `${room.capacity} orang${room.location ? ` · ${room.location}` : ""}`;
const hoursText = (h: RoomHour) =>
  `Buka ${fmtMin(h.openMin)}–${fmtMin(h.closeMin)}${h.breakStart !== null ? `, istirahat ${fmtMin(h.breakStart)}–${fmtMin(h.breakEnd!)}` : ""}`;

interface Draft {
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
}

/** Memuat ulang saat aplikasi kembali ke depan, supaya jadwal tidak basi. */
function useReloadOnResume(load: () => Promise<void>) {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, [load]);
}

// ---- Jadwal ----

export function Schedule() {
  const me = useUser();
  const t = useTheme();
  const tz = me.org.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [rooms, setRooms] = useState<RoomDto[] | null>(null);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [closures, setClosures] = useState<ClosureDto[]>([]);
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<BookingDto | null>(null);
  const [picking, setPicking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  // Jawaban yang datang terlambat untuk tanggal lama tidak boleh menimpa tanggal yang sedang dilihat.
  const wanted = useRef(date);
  wanted.current = date;

  const load = useCallback(async () => {
    try {
      const [r, cl, b] = await Promise.all([
        api<{ rooms: RoomDto[]; settings: RoomSettings }>("GET", "/rooms"),
        api<{ closures: ClosureDto[] }>("GET", "/rooms/closures"),
        api<{ bookings: BookingDto[] }>("GET", `/rooms/bookings?date=${date}`),
      ]);
      if (wanted.current !== date) return;
      setRooms(r.rooms.filter((x) => x.active));
      setSettings(r.settings);
      setClosures(cl.closures);
      setBookings(b.bookings);
      setLoadedDate(date);
      setError(null);
    } catch (e) {
      if (wanted.current === date) setError(msg(e));
    }
  }, [date]);
  useEffect(() => void load(), [load]);
  useReloadOnResume(load);

  const today = todayIn(tz);
  const weekday = weekdayOf(date);
  const closureOf = (room: RoomDto) => closures.find((c) => c.date === date && (c.roomId === null || c.roomId === room.id));
  const hoursOf = (room: RoomDto) => room.hours.find((h) => h.weekday === weekday);
  const stale = loadedDate !== date;

  const newBooking = (roomId?: string) => {
    const room = rooms?.find((r) => r.id === roomId) ?? rooms?.find((r) => hoursOf(r) && !closureOf(r)) ?? rooms?.[0];
    if (!room) return;
    const h = hoursOf(room);
    const open = h?.openMin ?? 480;
    const close = h?.closeMin ?? 1080;
    // Hari ini: mulai dari slot berikutnya, bukan dari jam buka yang sudah lewat.
    const next = date === today ? Math.ceil((nowMinIn(tz) + 1) / SLOT_MINUTES) * SLOT_MINUTES : open;
    const startMin = Math.min(Math.max(open, next), close - SLOT_MINUTES);
    setDraft({ roomId: room.id, date, startMin, endMin: Math.min(startMin + 60, close) });
  };

  // Strip tujuh hari: minggu (Senin–Minggu) yang memuat tanggal terpilih.
  const monday = addDays(date, -((weekday + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.line, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          <Pressable style={{ flex: 1 }} onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={`Pilih tanggal, sekarang ${fmtDate(date)}`} testID="date-title">
            <Txt variant="heading">{fmtDate(date)}</Txt>
            <Txt variant="small" color={t.accent}>Pilih tanggal lain</Txt>
          </Pressable>
          {date !== today && <Button small label="Hari ini" onPress={() => setDate(today)} />}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Button small kind="ghost" label="‹" onPress={() => setDate(addDays(date, -7))} />
          {week.map((d) => {
            const selected = d === date;
            return (
              <Pressable
                key={d}
                onPress={() => setDate(d)}
                accessibilityRole="button"
                accessibilityLabel={fmtDate(d)}
                accessibilityState={{ selected }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10, backgroundColor: selected ? t.accent : "transparent" }}
              >
                <Text style={{ fontSize: 11, color: selected ? t.accentInk : t.muted }}>{dayShort(d)}</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: selected ? t.accentInk : t.text, fontVariant: ["tabular-nums"] }}>{dayOfMonth(d)}</Text>
                <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: d === today ? (selected ? t.accentInk : t.accent) : "transparent" }} />
              </Pressable>
            );
          })}
          <Button small kind="ghost" label="›" onPress={() => setDate(addDays(date, 7))} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.accent}
            colors={[t.accent]}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <ErrorNote error={error} />
        {!rooms && !error && <Loading />}
        {rooms?.length === 0 && (
          <Card>
            <Txt muted>
              Belum ada ruangan. {me.user.role === "admin" ? "Tambahkan lewat menu Kelola ruangan di versi web." : "Minta admin PT Anda untuk menambahkannya."}
            </Txt>
          </Card>
        )}
        {rooms?.map((room) => {
          const h = hoursOf(room);
          const closure = closureOf(room);
          const open = !!h && !closure;
          const list = stale ? [] : bookings.filter((b) => b.roomId === room.id);
          return (
            <Card key={room.id} style={{ gap: 12, opacity: stale ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="heading">{room.name}</Txt>
                  <Txt variant="small" muted>{roomMeta(room)}</Txt>
                  {room.facilities.length > 0 && <Txt variant="small" muted>{room.facilities.join(", ")}</Txt>}
                </View>
                {open && <Button small kind="primary" label="Booking" testID={`book-${room.name}`} onPress={() => newBooking(room.id)} />}
              </View>
              {!open && <Badge label={closure ? `Tutup${closure.note ? `: ${closure.note}` : ""}` : `Tutup hari ${WEEKDAY_NAMES[weekday]}`} />}
              {open && (
                <>
                  <DayBar hours={h} bookings={list} meId={me.user.id} nowMin={date === today ? nowMinIn(tz) : null} />
                  <Txt variant="small" muted>
                    {hoursText(h)}
                    {!stale && list.length === 0 ? ". Belum ada booking." : ""}
                  </Txt>
                </>
              )}
              {list.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setDetail(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 10,
                    borderRadius: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: b.status === "completed" ? t.line : t.accent,
                    backgroundColor: pressed ? t.surface2 : b.userId === me.user.id && b.status !== "completed" ? t.accentSoft : t.bg,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: t.text, fontVariant: ["tabular-nums"] }}>
                    {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: "600" }} numberOfLines={1}>{b.title}</Txt>
                    <Txt variant="small" muted numberOfLines={1}>
                      {b.userId === me.user.id ? "Anda" : b.userName}
                      {b.status === "completed" ? " · Selesai" : ""}
                    </Txt>
                  </View>
                  <Text style={{ color: t.muted, fontSize: 18 }}>›</Text>
                </Pressable>
              ))}
            </Card>
          );
        })}
      </ScrollView>

      {picking && (
        <DateSheet
          value={date}
          today={today}
          onClose={() => setPicking(false)}
          onPick={(d) => {
            setPicking(false);
            setDate(d);
          }}
        />
      )}
      {draft && rooms && settings && (
        <BookingForm
          draft={draft}
          rooms={rooms}
          settings={settings}
          closures={closures}
          onClose={() => setDraft(null)}
          onDone={async (b) => {
            setDraft(null);
            if (b.date !== date) setDate(b.date);
            else await load();
            setToast(`Booking tersimpan: ${b.roomName}, ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}.`);
          }}
        />
      )}
      {detail && (
        <BookingDetail
          booking={detail}
          onClose={() => setDetail(null)}
          onCancelled={async () => {
            setDetail(null);
            await load();
            setToast("Booking dibatalkan.");
          }}
        />
      )}
      <Toast text={toast} />
    </View>
  );
}

/** Garis waktu satu hari untuk satu ruangan: bagian terisi, istirahat, dan posisi "sekarang". */
function DayBar({ hours, bookings, meId, nowMin }: { hours: RoomHour; bookings: BookingDto[]; meId: string; nowMin: number | null }) {
  const t = useTheme();
  const from = hours.openMin;
  const total = hours.closeMin - hours.openMin;
  const pos = (a: number, b: number) => {
    const lo = Math.max(a, from);
    const hi = Math.min(b, hours.closeMin);
    return { left: `${((lo - from) / total) * 100}%` as const, width: `${(Math.max(hi - lo, 0) / total) * 100}%` as const };
  };
  const marks: number[] = [];
  // Label tiap dua jam; jam tutup tidak diberi label supaya tidak berdempetan di tepi kanan.
  for (let m = Math.ceil(from / 120) * 120; m < hours.closeMin; m += 120) marks.push(m);
  return (
    <View accessible accessibilityLabel={`${bookings.length} booking pada hari ini`}>
      <View style={{ height: 14, borderRadius: 7, backgroundColor: t.surface2, overflow: "hidden" }}>
        {hours.breakStart !== null && <View style={{ position: "absolute", top: 0, bottom: 0, backgroundColor: t.line, ...pos(hours.breakStart, hours.breakEnd!) }} />}
        {bookings.map((b) => (
          <View
            key={b.id}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              borderRadius: 3,
              backgroundColor: b.status === "completed" ? t.muted : b.userId === meId ? t.accent : t.brandAccent,
              opacity: b.status === "completed" ? 0.45 : 1,
              ...pos(b.startMin, b.endMin),
            }}
          />
        ))}
        {nowMin !== null && nowMin > from && nowMin < hours.closeMin && (
          <View style={{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: t.danger, left: `${((nowMin - from) / total) * 100}%` }} />
        )}
      </View>
      <View style={{ height: 16, marginTop: 2 }}>
        {marks.map((m) => {
          const frac = (m - from) / total;
          return (
            <Text
              key={m}
              style={{
                position: "absolute",
                fontSize: 10,
                color: t.muted,
                fontVariant: ["tabular-nums"],
                left: `${frac * 100}%`,
              }}
            >
              {fmtMin(m)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ---- Form booking ----

function BookingForm(props: {
  draft: Draft;
  rooms: RoomDto[];
  settings: RoomSettings;
  closures: ClosureDto[];
  onClose: () => void;
  onDone: (b: BookingDto) => Promise<void>;
}) {
  const me = useUser();
  const t = useTheme();
  const tz = me.org.timezone;
  const [d, setD] = useState(props.draft);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [picker, setPicker] = useState<"room" | "date" | "start" | "end" | null>(null);
  const { busy, error, run, setError } = useAction();

  const today = todayIn(tz);
  const room = props.rooms.find((r) => r.id === d.roomId) ?? props.rooms[0]!;
  const weekday = weekdayOf(d.date);
  const h = room.hours.find((x) => x.weekday === weekday);
  const closure = props.closures.find((c) => c.date === d.date && (c.roomId === null || c.roomId === room.id));
  const maxDuration = room.maxDurationMin ?? props.settings.maxDurationMin;
  const maxDaysAhead = room.maxDaysAhead ?? props.settings.maxDaysAhead;
  const openMin = h?.openMin ?? 0;
  const closeMin = h?.closeMin ?? 1440;
  // Hari ini: jam yang sudah lewat tidak ditawarkan.
  const firstStart = d.date === today ? Math.max(openMin, Math.ceil((nowMinIn(tz) + 1) / SLOT_MINUTES) * SLOT_MINUTES) : openMin;

  // Ganti ruangan atau tanggal: jam dijepit ke jam buka yang baru.
  const fit = (next: Draft): Draft => {
    const r = props.rooms.find((x) => x.id === next.roomId) ?? room;
    const nh = r.hours.find((x) => x.weekday === weekdayOf(next.date));
    if (!nh) return next;
    const startMin = Math.min(Math.max(next.startMin, nh.openMin), nh.closeMin - SLOT_MINUTES);
    const endMin = Math.min(Math.max(next.endMin, startMin + SLOT_MINUTES), nh.closeMin);
    return { ...next, startMin, endMin };
  };

  const closedText = closure ? `Ruangan tutup pada tanggal ini${closure.note ? `: ${closure.note}` : "."}` : !h ? `Ruangan ini tutup pada hari ${WEEKDAY_NAMES[weekday]}.` : null;

  const submit = () => {
    if (!title.trim()) return setError("Isi judul booking.");
    void run(async () => {
      const res = await api<{ booking: BookingDto }>("POST", "/rooms/bookings", { ...d, title: title.trim(), note: showNote ? note.trim() : "" });
      await props.onDone(res.booking);
    });
  };

  return (
    <>
      <Sheet
        title="Booking baru"
        onClose={props.onClose}
        footer={
          <>
            <Button label="Batal" onPress={props.onClose} style={{ flex: 1 }} />
            <Button testID="booking-save" kind="primary" label={busy ? "Menyimpan…" : "Simpan booking"} busy={busy} disabled={!!closedText} onPress={submit} style={{ flex: 2 }} />
          </>
        }
      >
        <ErrorNote error={error && (error.startsWith("Isi ") ? error : `Booking ditolak. ${error}`)} />
        <Field label="Ruangan" hint={`${roomMeta(room)}${room.facilities.length ? ` · ${room.facilities.join(", ")}` : ""}`}>
          <PickerRow testID="pick-room" value={room.name} onPress={() => setPicker("room")} />
        </Field>
        <Field label="Tanggal">
          <PickerRow testID="pick-date" value={fmtDate(d.date)} onPress={() => setPicker("date")} />
        </Field>
        {closedText ? (
          <Notice tone="warn" text={`${closedText} Pilih tanggal atau ruangan lain.`} />
        ) : (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Mulai">
                <PickerRow testID="pick-start" value={fmtMin(d.startMin)} onPress={() => setPicker("start")} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Selesai">
                <PickerRow testID="pick-end" value={fmtMin(d.endMin)} onPress={() => setPicker("end")} />
              </Field>
            </View>
          </View>
        )}
        <Field label="Judul">
          <Input testID="booking-title" value={title} onChangeText={setTitle} maxLength={120} placeholder="Misalnya: Rapat mingguan tim" />
        </Field>
        {showNote ? (
          <Field label="Catatan (opsional)">
            <Input value={note} onChangeText={setNote} maxLength={500} multiline style={{ minHeight: 80, textAlignVertical: "top" }} />
          </Field>
        ) : (
          <Button kind="ghost" small label="+ Tambah catatan" onPress={() => setShowNote(true)} style={{ alignSelf: "flex-start" }} />
        )}
        {h && !closure && (
          <Txt variant="small" muted>
            {hoursText(h)}. Durasi maksimal {maxDuration / 60} jam.
          </Txt>
        )}
      </Sheet>

      {picker === "room" && (
        <Sheet title="Pilih ruangan" onClose={() => setPicker(null)}>
          <View style={{ gap: 8 }}>
            {props.rooms.map((r) => {
              const selected = r.id === room.id;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setD(fit({ ...d, roomId: r.id }));
                    setPicker(null);
                  }}
                  style={({ pressed }) => ({
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? t.accent : t.line,
                    backgroundColor: pressed ? t.surface2 : t.surface,
                  })}
                >
                  <Txt style={{ fontWeight: "600" }}>{r.name}</Txt>
                  <Txt variant="small" muted>{roomMeta(r)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </Sheet>
      )}
      {picker === "date" && (
        <DateSheet
          value={d.date}
          today={today}
          min={today}
          max={addDays(today, maxDaysAhead)}
          onClose={() => setPicker(null)}
          onPick={(date) => {
            setD(fit({ ...d, date }));
            setPicker(null);
          }}
        />
      )}
      {picker === "start" && (
        <TimeSheet
          title="Jam mulai"
          value={d.startMin}
          min={firstStart}
          max={closeMin - SLOT_MINUTES}
          onClose={() => setPicker(null)}
          onPick={(v) => {
            // Durasi dipertahankan saat jam mulai digeser, sebatas jam tutup.
            const length = Math.max(d.endMin - d.startMin, SLOT_MINUTES);
            setD({ ...d, startMin: v, endMin: Math.min(v + length, closeMin) });
            setPicker(null);
          }}
        />
      )}
      {picker === "end" && (
        <TimeSheet
          title="Jam selesai"
          value={d.endMin}
          min={d.startMin + SLOT_MINUTES}
          max={Math.min(closeMin, d.startMin + maxDuration)}
          onClose={() => setPicker(null)}
          onPick={(v) => {
            setD({ ...d, endMin: v });
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

// ---- Detail booking ----

function BookingDetail({ booking: b, onClose, onCancelled }: { booking: BookingDto; onClose: () => void; onCancelled: () => Promise<void> }) {
  const me = useUser();
  const [asking, setAsking] = useState(false);
  const { busy, error, run } = useAction();
  const canCancel = b.status === "confirmed" && b.startAt * 1000 > Date.now() && (b.userId === me.user.id || me.user.role === "admin");

  return (
    <Sheet
      title={b.title}
      onClose={onClose}
      footer={
        asking ? (
          <>
            <Button label="Tidak jadi" onPress={() => setAsking(false)} style={{ flex: 1 }} />
            <Button
              testID="cancel-confirm"
              kind="danger"
              label="Ya, batalkan"
              busy={busy}
              style={{ flex: 1 }}
              onPress={() =>
                void run(async () => {
                  await api("POST", `/rooms/bookings/${b.id}/cancel`);
                  await onCancelled();
                })
              }
            />
          </>
        ) : canCancel ? (
          <Button testID="cancel-booking" kind="danger" label="Batalkan booking" onPress={() => setAsking(true)} style={{ flex: 1 }} />
        ) : undefined
      }
    >
      <ErrorNote error={error} />
      <View style={{ gap: 12 }}>
        <DetailRow label="Ruangan">{b.roomName}</DetailRow>
        <DetailRow label="Waktu">{`${fmtDate(b.date)}, ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`}</DetailRow>
        <DetailRow label="Pemesan">{b.userName}</DetailRow>
        <DetailRow label="Status"><StatusBadge status={b.status} /></DetailRow>
        {!!b.note && <DetailRow label="Catatan">{b.note}</DetailRow>}
      </View>
      {asking && <Notice tone="warn" text="Batalkan booking ini? Slotnya langsung bisa dipakai orang lain." />}
    </Sheet>
  );
}

// ---- Booking saya ----

export function MyBookings() {
  const t = useTheme();
  const [mine, setMine] = useState<BookingDto[] | null>(null);
  const [detail, setDetail] = useState<BookingDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    try {
      setMine((await api<{ bookings: BookingDto[] }>("GET", "/rooms/bookings?mine=1")).bookings);
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);
  useReloadOnResume(load);

  const upcoming = mine?.filter((b) => b.status === "confirmed") ?? [];
  const past = (mine?.filter((b) => b.status !== "confirmed") ?? []).reverse();

  const item = (b: BookingDto) => (
    <Pressable
      key={b.id}
      onPress={() => setDetail(b)}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontWeight: "600" }} numberOfLines={1}>{b.title}</Txt>
        <Txt variant="small" muted>
          {fmtDateShort(b.date)} · {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
        </Txt>
        <Txt variant="small" muted numberOfLines={1}>{b.roomName}</Txt>
      </View>
      <StatusBadge status={b.status} />
      <Text style={{ color: t.muted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
  const list = (items: BookingDto[]) =>
    items.map((b, i) => (
      <View key={b.id} style={i ? { borderTopWidth: 1, borderTopColor: t.line } : undefined}>
        {item(b)}
      </View>
    ));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.accent}
            colors={[t.accent]}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <ErrorNote error={error} />
        {!mine && !error && <Loading />}
        {mine && (
          <Card>
            <Txt variant="heading">Akan datang</Txt>
            {upcoming.length ? list(upcoming) : <Txt muted style={{ marginTop: 8 }}>Belum ada booking yang akan datang. Buat lewat tab Jadwal.</Txt>}
          </Card>
        )}
        {past.length > 0 && (
          <Card>
            <Txt variant="heading">Riwayat 30 hari terakhir</Txt>
            {list(past)}
          </Card>
        )}
      </ScrollView>
      {detail && (
        <BookingDetail
          booking={detail}
          onClose={() => setDetail(null)}
          onCancelled={async () => {
            setDetail(null);
            await load();
            setToast("Booking dibatalkan.");
          }}
        />
      )}
      <Toast text={toast} />
    </View>
  );
}
