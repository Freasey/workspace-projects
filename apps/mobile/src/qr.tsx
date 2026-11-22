import { useMemo } from "react";
import { View } from "react-native";
import qrcode from "qrcode-generator";

/**
 * Kode QR digambar dari kotak View, tanpa pustaka SVG. Tiap baris digabung menjadi
 * potongan hitam yang bersambung supaya jumlah View tetap sedikit. Selalu hitam di
 * atas putih dengan tepi putih (quiet zone) supaya terbaca kamera.
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { start: number; len: number }[][] = [];
    for (let r = 0; r < n; r++) {
      const runs: { start: number; len: number }[] = [];
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        const last = runs[runs.length - 1];
        if (last && last.start + last.len === c) last.len++;
        else runs.push({ start: c, len: 1 });
      }
      out.push(runs);
    }
    return out;
  }, [value]);
  const quiet = 4;
  const cell = Math.floor(size / (rows.length + quiet * 2));
  const inner = cell * rows.length;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ backgroundColor: "#ffffff", padding: cell * quiet, borderRadius: 12, alignSelf: "center" }}
    >
      <View style={{ width: inner, height: inner }}>
        {rows.map((runs, r) =>
          runs.map((run) => (
            <View
              key={`${r}-${run.start}`}
              style={{ position: "absolute", top: r * cell, left: run.start * cell, width: run.len * cell, height: cell, backgroundColor: "#000000" }}
            />
          )),
        )}
      </View>
    </View>
  );
}
