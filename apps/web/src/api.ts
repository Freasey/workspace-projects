import { createContext, useContext } from "react";
import type { Me } from "@app/shared";

export class ApiErr extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    const err = new ApiErr(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Terjadi kesalahan.");
    // Sesi gugur atau status berubah di tengah pemakaian: muat ulang keadaan login.
    if (["UNAUTHORIZED", "ORG_SUSPENDED", "MUST_CHANGE_PASSWORD", "MODULE_PAUSED", "MODULE_NOT_GRANTED"].includes(err.code)) {
      window.dispatchEvent(new Event("auth-changed"));
    }
    throw err;
  }
  return json as T;
}

export const msg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

export interface AuthState {
  me: Me | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);
export function useUser() {
  const { me } = useAuth();
  if (me?.kind !== "user") throw new Error("Bukan sesi user");
  return me;
}

export const fmtDateTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function todayIn(tz: string, offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + offsetDays * 86_400_000));
}
