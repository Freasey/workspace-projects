import { useColorScheme } from "react-native";

// Warna yang sama dengan versi web (apps/web/src/styles.css).
const light = {
  bg: "#f3f5f7",
  surface: "#ffffff",
  surface2: "#e9edf1",
  line: "#d5dce3",
  text: "#15202b",
  muted: "#566573",
  accent: "#332aaa",
  accentInk: "#ffffff",
  accentSoft: "#e6e4fa",
  ok: "#1f8a4c",
  okSoft: "#dcf1e4",
  warn: "#9a5b00",
  warnSoft: "#fbecd0",
  danger: "#b83227",
  dangerSoft: "#f9e0dc",
  brandTile: "#332aaa",
  brandAccent: "#8058fc",
  deep: "#17143f",
  deepInk: "#f0effa",
  deepMuted: "#b3b0d6",
  backdrop: "rgba(12, 17, 22, 0.5)",
};

const dark: Theme = {
  ...light,
  bg: "#10161c",
  surface: "#18212a",
  surface2: "#0c1116",
  line: "#2c3944",
  text: "#e6ecf1",
  muted: "#9aa8b5",
  accent: "#a59cff",
  accentInk: "#10161c",
  accentSoft: "#2a2766",
  ok: "#5fd08c",
  okSoft: "#173524",
  warn: "#f0b04a",
  warnSoft: "#3a2d12",
  danger: "#ff8a7a",
  dangerSoft: "#41211c",
  brandTile: "#d9d6ff",
  backdrop: "rgba(0, 0, 0, 0.6)",
};

export type Theme = typeof light;

export function useTheme(): Theme & { dark: boolean } {
  const isDark = useColorScheme() === "dark";
  return { ...(isDark ? dark : light), dark: isDark };
}
