import { createContext, useContext } from "react";
import type { LoginResult, Me } from "@app/shared";
import { storage } from "./storage";

const TOKEN_KEY = "session_token";

/**
 * Alamat server tertanam di aplikasi. Untuk development, timpa saat build/start
 * dengan EXPO_PUBLIC_API_URL (misalnya http://10.0.2.2:8787 dari emulator).
 */
export const SERVER = (process.env.EXPO_PUBLIC_API_URL || "https://spaces.worksell.id").replace(/\/+$/, "");

let token: string | null = null;
let onAuthChanged: () => void = () => undefined;

export class ApiErr extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Kode yang berarti keadaan login berubah di tengah pemakaian. */
const STATE_CODES = ["UNAUTHORIZED", "ORG_SUSPENDED", "MUST_CHANGE_PASSWORD", "MODULE_PAUSED", "MODULE_NOT_GRANTED"];

export const session = {
  async restore(): Promise<void> {
    token = await storage.get(TOKEN_KEY);
  },
  hasToken: () => token !== null,
  async login(email: string, password: string): Promise<void> {
    const res = await api<LoginResult>("POST", "/auth/login", { email, password, client: "mobile" });
    if (!res.token) throw new ApiErr(500, "NO_TOKEN", "Server belum mendukung aplikasi mobile. Perbarui server lebih dulu.");
    token = res.token;
    await storage.set(TOKEN_KEY, res.token);
  },
  async logout(): Promise<void> {
    if (token) await api("POST", "/auth/logout").catch(() => undefined);
    await this.clear();
  },
  async clear(): Promise<void> {
    token = null;
    await storage.remove(TOKEN_KEY);
  },
  onAuthChanged(fn: () => void) {
    onAuthChanged = fn;
  },
};

export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    res = await fetch(`${SERVER}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiErr(0, "NETWORK", "Tidak bisa terhubung ke server. Periksa koneksi internet Anda.");
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    const err = new ApiErr(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Terjadi kesalahan.");
    if (token && STATE_CODES.includes(err.code)) onAuthChanged();
    throw err;
  }
  if (json === null) throw new ApiErr(res.status, "BAD_RESPONSE", "Jawaban server tidak dikenali. Periksa alamat server.");
  return json as T;
}

export const msg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

export type UserMe = Extract<Me, { kind: "user" }>;

export interface AuthState {
  me: Me | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);
export function useUser(): UserMe {
  const { me } = useAuth();
  if (me?.kind !== "user") throw new Error("Bukan sesi user");
  return me;
}
