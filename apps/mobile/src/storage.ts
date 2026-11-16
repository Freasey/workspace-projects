import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Token sesi disimpan di penyimpanan terenkripsi perangkat (Keystore/Keychain).
// Di web (hanya dipakai untuk pengujian) jatuh ke localStorage.
const web = Platform.OS === "web";

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return web ? globalThis.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (web) globalThis.localStorage.setItem(key, value);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      // Penyimpanan tidak tersedia: sesi hanya bertahan selama aplikasi terbuka.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (web) globalThis.localStorage.removeItem(key);
      else await SecureStore.deleteItemAsync(key);
    } catch {
      // Diabaikan.
    }
  },
};
