import { useRef, useState } from "react";
import { Linking, Modal, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parsePairingCode } from "@app/shared";
import { Button } from "./ui";

/**
 * Pemindai QR layar ruangan, layar penuh. Dipakai admin untuk memindai QR yang
 * tampil di tablet/TV (alamat /layar/hubungkan#kode=…); yang diteruskan hanya
 * kodenya. QR lain diabaikan dengan pesan.
 */
export function QrScanner({ onCode, onClose, title = "Pindai QR" }: { onCode: (code: string) => void; onClose: () => void; title?: string }) {
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  // Kamera bisa melaporkan QR yang sama berkali-kali per detik; cukup diproses sekali.
  const done = useRef(false);
  const lastBad = useRef("");

  let body;
  if (!permission) {
    body = <Text style={{ color: "#fff" }}>Memeriksa izin kamera…</Text>;
  } else if (!permission.granted) {
    body = (
      <View style={{ gap: 14, alignItems: "stretch", width: "100%", maxWidth: 360 }}>
        <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>
          Izinkan kamera untuk memindai QR yang tampil di layar ruangan. Kamera hanya dipakai di sini.
        </Text>
        {permission.canAskAgain ? (
          <Button kind="primary" label="Izinkan kamera" onPress={() => void request()} />
        ) : (
          <Button kind="primary" label="Buka pengaturan aplikasi" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    );
  } else {
    body = (
      <>
        <CameraView
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const code = parsePairingCode(data);
            if (code) {
              done.current = true;
              onCode(code);
            } else if (data !== lastBad.current) {
              lastBad.current = data;
              setHint("Ini bukan QR layar ruangan Spaces. Pindai QR yang tampil di tablet atau TV yang akan dipasang.");
            }
          }}
        />
        <View pointerEvents="none" style={{ width: 240, height: 240, borderRadius: 20, borderWidth: 3, borderColor: "#ffffff" }} />
      </>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {body}
        <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 4 }}>{title}</Text>
        </View>
        <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 16, gap: 10 }}>
          {!!hint && (
            <View style={{ backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, padding: 12 }}>
              <Text style={{ color: "#fff", fontSize: 14 }}>{hint}</Text>
            </View>
          )}
          <Button label="Tutup" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
