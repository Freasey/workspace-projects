import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, session, useAuth } from "../api";
import { useTheme } from "../theme";
import { Brand, Button, Card, ErrorNote, Field, Input, Notice, PasswordInput, Txt, useAction } from "../ui";

/** Tata letak di luar aplikasi: panel merek di atas, kartu isi di bawahnya. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: t.deep }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + 28, paddingHorizontal: 24, paddingBottom: 28, gap: 18 }}>
          <Brand onDark />
          <Txt color={t.deepMuted}>Booking ruangan tanpa bentrok, dengan jadwal dan aturan yang ditetapkan admin PT Anda sendiri.</Txt>
        </View>
        <View
          style={{
            flexGrow: 1,
            backgroundColor: t.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Login() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run, setError } = useAction();

  const submit = () => {
    if (!email.trim() || !password) return setError("Isi email dan password.");
    void run(async () => {
      try {
        await session.login(email.trim(), password);
      } catch (e) {
        setPassword("");
        throw e;
      }
      await refresh();
    });
  };

  return (
    <AuthLayout>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header">Masuk</Txt>
        <Txt muted>Gunakan email kantor dan password Anda.</Txt>
      </View>
      <ErrorNote error={error} />
      <Field label="Email">
        <Input
          testID="login-email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          placeholder="nama@perusahaan.co.id"
        />
      </Field>
      <Field label="Password">
        <PasswordInput testID="login-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} />
      </Field>
      <Button testID="login-submit" kind="primary" label={busy ? "Memeriksa…" : "Masuk"} busy={busy} onPress={submit} />
      <Txt variant="small" muted>
        Lupa password? Minta reset ke admin PT Anda. Admin PT meminta reset ke pengelola sistem. Reset lewat email tidak tersedia.
      </Txt>
    </AuthLayout>
  );
}

function ChangePasswordForm({ forced, onDone }: { forced: boolean; onDone?: () => void }) {
  const { refresh } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useAction();

  const submit = () => {
    setDone(false);
    if (!currentPassword || !newPassword) return setError("Isi semua kolom.");
    if (newPassword.length < 8) return setError("Password baru minimal 8 karakter.");
    if (newPassword !== confirm) return setError("Konfirmasi password tidak sama.");
    void run(async () => {
      await api("POST", "/auth/change-password", { currentPassword, newPassword });
      setCurrent("");
      setNew("");
      setConfirm("");
      setDone(true);
      onDone?.();
      await refresh();
    });
  };

  return (
    <>
      <ErrorNote error={error} />
      {done && <Notice tone="ok" text="Password berhasil diganti." />}
      <Field label={forced ? "Password sementara" : "Password saat ini"}>
        <PasswordInput testID="pw-current" value={currentPassword} onChangeText={setCurrent} />
      </Field>
      <Field label="Password baru (minimal 8 karakter)">
        <PasswordInput testID="pw-new" newPassword value={newPassword} onChangeText={setNew} />
      </Field>
      <Field label="Ulangi password baru">
        <PasswordInput testID="pw-confirm" newPassword value={confirm} onChangeText={setConfirm} onSubmitEditing={submit} />
      </Field>
      <Button testID="pw-submit" kind="primary" label={forced ? "Simpan dan masuk" : "Simpan password"} busy={busy} onPress={submit} />
    </>
  );
}

/** Wajib ganti password sementara sebelum bisa memakai aplikasi. */
export function ForcedChangePassword() {
  const { logout } = useAuth();
  return (
    <AuthLayout>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header">Buat password baru</Txt>
        <Txt muted>Anda masuk dengan password sementara. Ganti dulu sebelum melanjutkan.</Txt>
      </View>
      <ChangePasswordForm forced />
      <Button kind="ghost" label="Keluar" onPress={() => void logout()} />
    </AuthLayout>
  );
}

export function ChangePasswordCard({ onDone }: { onDone?: () => void }) {
  return (
    <Card style={{ gap: 16 }}>
      <ChangePasswordForm forced={false} onDone={onDone} />
    </Card>
  );
}

/** Layar pemberitahuan dengan satu-satunya jalan keluar: tombol Keluar. */
export function Blocked({ title, text }: { title: string; text: string }) {
  const { logout, refresh } = useAuth();
  return (
    <AuthLayout>
      <Txt variant="title" accessibilityRole="header">{title}</Txt>
      <Txt muted>{text}</Txt>
      <Button label="Coba lagi" onPress={() => void refresh()} />
      <Button kind="ghost" label="Keluar" onPress={() => void logout()} />
    </AuthLayout>
  );
}
