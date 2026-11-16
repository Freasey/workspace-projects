import { createContext, useContext } from "react";
import type { LoginResult, Me } from "@app/shared";
import { storage } from "./storage";

const TOKEN_KEY = "session_token";
const SERVER_KEY = "server_url";

/** Alamat server bawaan, ditanam saat build lewat EXPO_PUBLIC_API_URL. */
export const DEFAULT_SERVER = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

let token: string | null = null;
let server = DEFAULT_SERVER;
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

export function normalizeServer(input: string): string {
  const v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export const session = {
  async restore(): Promise<void> {
    token = await storage.get(TOKEN_KEY);
    server = (await storage.get(SERVER_KEY)) ?? DEFAULT_SERVER;
  },
  hasToken: () => token !== null,
  server: () => server,
  async setServer(url: string): Promise<void> {
    server = normalizeServer(url);
    if (server === DEFAULT_SERVER) await storage.remove(SERVER_KEY);
    else await storage.set(SERVER_KEY, server);
  },
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
    res = await fetch(`${server}/api/v1${path}`, {
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
