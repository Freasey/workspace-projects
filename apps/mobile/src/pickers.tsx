import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fmtMin, SLOT_MINUTES } from "@app/shared";
import { monthGrid, monthTitle, WEEK_HEADER } from "./date";
import { useTheme } from "./theme";
import { Button, Sheet, Txt } from "./ui";

/** Kalender satu bulan untuk memilih tanggal. `min` dan `max` membatasi tanggal yang bisa dipilih. */
export function DateSheet(props: { value: string; today: string; min?: string; max?: string; onPick: (date: string) => void; onClose: () => void }) {
  const t = useTheme();
  const [ym, setYm] = useState(() => ({ y: Number(props.value.slice(0, 4)), m: Number(props.value.slice(5, 7)) - 1 }));
  const shift = (n: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + n, 1));
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  return (
    <Sheet title="Pilih tanggal" onClose={props.onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button small label="‹" onPress={() => shift(-1)} />
        <Txt variant="heading" style={{ flex: 1, textAlign: "center" }}>{monthTitle(ym.y, ym.m)}</Txt>
        <Button small label="›" onPress={() => shift(1)} />
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row" }}>
          {WEEK_HEADER.map((d) => (
            <Txt key={d} variant="small" muted style={{ flex: 1, textAlign: "center" }}>{d}</Txt>
          ))}
        </View>
        {monthGrid(ym.y, ym.m).map((week, i) => (
          <View key={i} style={{ flexDirection: "row" }}>
            {week.map((date, j) => {
              if (!date) return <View key={j} style={{ flex: 1 }} />;
              const off = (props.min !== undefined && date < props.min) || (props.max !== undefined && date > props.max);
              const selected = date === props.value;
              const isToday = date === props.today;
              return (
                <Pressable
                  key={j}
                  disabled={off}
                  accessibilityRole="button"
                  accessibilityLabel={date}
                  accessibilityState={{ selected, disabled: off }}
                  onPress={() => props.onPick(date)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 3 }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? t.accent : "transparent",
                      borderWidth: isToday && !selected ? 1.5 : 0,
                      borderColor: t.accent,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: selected || isToday ? "700" : "400", color: selected ? t.accentInk : off ? t.line : t.text, fontVariant: ["tabular-nums"] }}>
                      {Number(date.slice(8))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {props.value !== props.today && (props.min === undefined || props.today >= props.min) && (
        <Button label="Hari ini" onPress={() => props.onPick(props.today)} />
      )}
    </Sheet>
  );
}

/** Daftar jam dalam kelipatan slot, dari `min` sampai `max`. */
export function TimeSheet(props: { title: string; value: number; min: number; max: number; onPick: (min: number) => void; onClose: () => void }) {
  const t = useTheme();
  const options: number[] = [];
  for (let m = props.min; m <= props.max; m += SLOT_MINUTES) options.push(m);
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      {options.length === 0 && <Txt muted>Tidak ada jam yang tersedia.</Txt>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((m) => {
          const selected = m === props.value;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => props.onPick(m)}
              style={({ pressed }) => ({
                width: "23%",
                minHeight: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selected ? t.accent : t.line,
                backgroundColor: selected ? t.accent : pressed ? t.surface2 : t.surface,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: selected ? "700" : "500", color: selected ? t.accentInk : t.text, fontVariant: ["tabular-nums"] }}>{fmtMin(m)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
