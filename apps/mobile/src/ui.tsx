import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { msg } from "./api";
import { useTheme } from "./theme";

// ---- Teks ----

type Variant = "body" | "small" | "title" | "heading" | "label";
const SIZES: Record<Variant, TextStyle> = {
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
};

export function Txt({ variant = "body", muted, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const t = useTheme();
  return <RNText {...rest} style={[SIZES[variant], { color: color ?? (muted ? t.muted : t.text) }, style]} />;
}

// ---- Logo: empat petak, satu berwarna aksen ----

export function Logo({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  const t = useTheme();
  const gap = size * 0.12;
  const tile = (size - gap) / 2;
  const base = onDark ? "#d9d6ff" : t.brandTile;
  const box = (color: string): ViewStyle => ({ width: tile, height: tile, borderRadius: tile * 0.2, backgroundColor: color });
  return (
    <View style={{ width: size, height: size, gap }} accessibilityLabel="Spaces" accessibilityRole="image">
      <View style={{ flexDirection: "row", gap }}>
        <View style={box(base)} />
        <View style={box(t.brandAccent)} />
      </View>
      <View style={{ flexDirection: "row", gap }}>
        <View style={box(base)} />
        <View style={box(base)} />
      </View>
    </View>
  );
}

export function Brand({ onDark = false, size = 26 }: { onDark?: boolean; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Logo size={size} onDark={onDark} />
      <RNText style={{ fontSize: size * 0.8, fontWeight: "700", letterSpacing: -0.3, color: onDark ? t.deepInk : t.text }}>Spaces</RNText>
    </View>
  );
}

// ---- Tombol ----

type Kind = "default" | "primary" | "danger" | "ghost";

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: Kind;
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const kind = props.kind ?? "default";
  const off = props.disabled || props.busy;
  const bg = kind === "primary" ? t.accent : kind === "danger" ? t.dangerSoft : kind === "ghost" ? "transparent" : t.surface;
  const fg = kind === "primary" ? t.accentInk : kind === "danger" ? t.danger : kind === "ghost" ? t.accent : t.text;
  const border = kind === "primary" ? t.accent : kind === "danger" ? t.dangerSoft : kind === "ghost" ? "transparent" : t.line;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={props.onPress}
      hitSlop={props.small ? 8 : 0}
      style={({ pressed }) => [
        {
          minHeight: props.small ? 34 : 48,
          paddingHorizontal: props.small ? 12 : 18,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: off ? 0.55 : pressed ? 0.8 : 1,
        },
        props.style,
      ]}
    >
      {props.busy && <ActivityIndicator size="small" color={fg} />}
      <RNText style={{ color: fg, fontSize: props.small ? 13 : 15, fontWeight: "600" }}>{props.label}</RNText>
    </Pressable>
  );
}

// ---- Isian ----

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      {children}
      {!!hint && <Txt variant="small" muted>{hint}</Txt>}
    </View>
  );
}

export function Input({ style, ...rest }: TextInputProps) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...rest}
      onFocus={(e) => {
        setFocus(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        rest.onBlur?.(e);
      }}
      style={[
        {
          minHeight: 48,
          borderWidth: 1,
          borderColor: focus ? t.accent : t.line,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 16,
          color: t.text,
          backgroundColor: t.surface,
        },
        style,
      ]}
    />
  );
}

export function PasswordInput(props: { value: string; onChangeText: (v: string) => void; testID?: string; onSubmitEditing?: () => void; newPassword?: boolean }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View>
      <Input
        testID={props.testID}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={props.newPassword ? "new-password" : "current-password"}
        onSubmitEditing={props.onSubmitEditing}
        style={{ paddingRight: 110 }}
      />
      <Pressable
        onPress={() => setShow(!show)}
        accessibilityRole="button"
        hitSlop={6}
        style={{ position: "absolute", right: 4, top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 10 }}
      >
        <RNText style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>{show ? "Sembunyikan" : "Tampilkan"}</RNText>
      </Pressable>
    </View>
  );
}

// ---- Kartu, lencana, pemberitahuan ----

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 16 }, style]}>{children}</View>;
}

export type Tone = "neutral" | "info" | "ok" | "warn" | "bad";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const colors: Record<Tone, [string, string]> = {
    neutral: [t.surface2, t.muted],
    info: [t.accentSoft, t.accent],
    ok: [t.okSoft, t.ok],
    warn: [t.warnSoft, t.warn],
    bad: [t.dangerSoft, t.danger],
  };
  const [bg, fg] = colors[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <RNText style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</RNText>
    </View>
  );
}

export function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warn" | "bad" | "ok" }) {
  const t = useTheme();
  const map = { info: [t.accentSoft, t.accent], warn: [t.warnSoft, t.warn], bad: [t.dangerSoft, t.danger], ok: [t.okSoft, t.ok] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, padding: 12 }} accessibilityRole={tone === "bad" ? "alert" : undefined}>
      <RNText style={{ color: fg, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>{text}</RNText>
    </View>
  );
}

export const ErrorNote = ({ error }: { error: string | null | false | undefined }) => (error ? <Notice tone="bad" text={error} /> : null);

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

// ---- Aksi asinkron dengan status sibuk dan pesan galat ----

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

export function useToast(): [string | null, (m: string) => void] {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => setText(null), 3500);
    return () => clearTimeout(timer);
  }, [text]);
  return [text, setText];
}

export function Toast({ text }: { text: string | null }) {
  const t = useTheme();
  if (!text) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 16, alignItems: "center" }}>
      <View accessibilityLiveRegion="polite" style={{ backgroundColor: t.dark ? "#e6ecf1" : "#15202b", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480 }}>
        <RNText style={{ color: t.dark ? "#15202b" : "#ffffff", fontSize: 14, lineHeight: 20 }}>{text}</RNText>
      </View>
    </View>
  );
}

// ---- Lembar bawah (bottom sheet) ----

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; full?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: t.backdrop }}>
        <Pressable style={{ flex: 1, minHeight: insets.top + 24 }} onPress={props.onClose} accessibilityLabel="Tutup" />
        <View
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "92%",
            ...(props.full ? { height: "92%" } : null),
            paddingBottom: insets.bottom,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 8, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
            <Txt variant="heading" style={{ flex: 1 }} numberOfLines={2} accessibilityRole="header">{props.title}</Txt>
            <Button kind="ghost" small label="Tutup" onPress={props.onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16 }} style={{ flexGrow: 0, flexShrink: 1 }}>
            {props.children}
          </ScrollView>
          {props.footer && (
            <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.surface }}>
              {props.footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Baris yang membuka pemilih: menampilkan nilai saat ini seperti kotak isian. */
export function PickerRow(props: { value: string; onPress: () => void; testID?: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 10,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: pressed ? t.surface2 : t.surface,
        opacity: props.disabled ? 0.55 : 1,
      })}
    >
      <RNText style={{ flex: 1, color: t.text, fontSize: 16 }} numberOfLines={1}>{props.value}</RNText>
      <RNText style={{ color: t.muted, fontSize: 12 }}>▼</RNText>
    </Pressable>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Txt variant="small" muted style={{ width: 84, paddingTop: 2 }}>{label}</Txt>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Txt>{children}</Txt> : children}</View>
    </View>
  );
}
