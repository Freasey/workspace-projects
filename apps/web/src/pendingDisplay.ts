import { parsePairingCode } from "@app/shared";

/**
 * Kode layar dari QR (/layar/hubungkan#kode=…) disimpan sebentar di tab ini, supaya
 * tetap ada setelah admin masuk lebih dulu. Hash langsung dihapus dari alamat
 * supaya tidak tertinggal di riwayat atau ikut terbagi.
 */
const KEY = "pending_display_code";

export const pendingDisplay = {
  takeFromUrl() {
    const m = window.location.hash.match(/kode=([^&]+)/);
    if (!m) return;
    const code = parsePairingCode(decodeURIComponent(m[1]!));
    window.history.replaceState(null, "", window.location.pathname);
    if (code) this.set(code);
  },
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(code: string) {
    try {
      sessionStorage.setItem(KEY, code);
    } catch {
      /* penyimpanan tidak tersedia: admin perlu mengetik kodenya */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* diabaikan */
    }
  },
};
