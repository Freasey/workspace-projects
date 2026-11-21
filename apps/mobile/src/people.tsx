import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MAX_PARTICIPANTS, type PersonDto } from "@app/shared";
import { api } from "./api";
import { useTheme } from "./theme";
import { Button, Input, Loading, Sheet, Txt } from "./ui";

// Daftar orang jarang berubah selama aplikasi terbuka, jadi dibaca sekali.
let cache: Promise<PersonDto[]> | null = null;
export function usePeople(): PersonDto[] | null {
  const [people, setPeople] = useState<PersonDto[] | null>(null);
  useEffect(() => {
    cache ??= api<{ people: PersonDto[] }>("GET", "/rooms/people").then((r) => r.people);
    cache.then(setPeople).catch(() => {
      cache = null;
      setPeople([]);
    });
  }, []);
  return people;
}

export const peopleSummary = (ids: string[], people: PersonDto[] | null) => {
  if (!ids.length) return "Belum ada peserta";
  const names = ids.map((id) => people?.find((p) => p.id === id)?.name ?? "…");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} lainnya`;
};

/** Lembar pemilih peserta: cari nama, ketuk untuk memilih atau melepas. */
export function PeopleSheet(props: { value: string[]; excludeId: string; title?: string; busy?: boolean; onDone: (ids: string[]) => void; onClose: () => void }) {
  const t = useTheme();
  const people = usePeople();
  const [picked, setPicked] = useState(props.value);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = (people ?? []).filter((p) => p.id !== props.excludeId && (!term || p.name.toLowerCase().includes(term)));
  const full = picked.length >= MAX_PARTICIPANTS;

  return (
    <Sheet
      full
      title={props.title ?? "Pilih peserta"}
      onClose={props.onClose}
      footer={
        <>
          <Button label="Batal" onPress={props.onClose} style={{ flex: 1 }} />
          <Button
            testID="people-done"
            kind="primary"
            label={`Simpan (${picked.length} peserta)`}
            busy={props.busy}
            onPress={() => props.onDone(picked)}
            style={{ flex: 2 }}
          />
        </>
      }
    >
      <Input value={q} onChangeText={setQ} placeholder="Cari nama" autoCorrect={false} />
      {full && <Txt variant="small" muted>Maksimal {MAX_PARTICIPANTS} peserta.</Txt>}
      {!people ? (
        <Loading />
      ) : list.length === 0 ? (
        <Txt muted>{term ? "Tidak ada nama yang cocok." : "Belum ada pengguna lain di perusahaan ini."}</Txt>
      ) : (
        <View style={{ gap: 6 }}>
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                disabled={!on && full}
                onPress={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? t.accent : t.line,
                  backgroundColor: pressed ? t.surface2 : t.surface,
                  opacity: !on && full ? 0.5 : 1,
                })}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: on ? t.accent : t.line,
                    backgroundColor: on ? t.accent : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {on && <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: "800" }}>✓</Text>}
                </View>
                <Txt style={{ flex: 1 }}>{p.name}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
