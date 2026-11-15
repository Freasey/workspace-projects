import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { ModuleKey } from "@app/shared";
import * as schema from "../db/schema";
import { sha256 } from "./crypto";
import { now } from "./time";

export interface Bindings {
  DB: D1Database;
  SUPERADMIN_EMAIL?: string;
  SUPERADMIN_PASSWORD?: string;
}

export type Db = DrizzleD1Database<typeof schema>;
export type UserRow = typeof schema.users.$inferSelect;
export type OrgRow = typeof schema.organizations.$inferSelect;

export type Auth =
  | { kind: "superadmin"; email: string }
  | { kind: "user"; impersonated: boolean; user: UserRow; org: OrgRow };
export type UserAuth = Extract<Auth, { kind: "user" }>;

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Db; auth: Auth | null; sessionHash: string | null };
};
export type Ctx = Context<AppEnv>;

export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const SESSION_COOKIE = "sid";

/** Sidik jari kredensial super admin. Sesi dan kunci sekali pakai diikat ke nilai ini. */
export async function superFingerprint(env: Bindings): Promise<string | null> {
  if (!env.SUPERADMIN_EMAIL || !env.SUPERADMIN_PASSWORD) return null;
  return sha256(`${env.SUPERADMIN_EMAIL.trim().toLowerCase()}\n${env.SUPERADMIN_PASSWORD}`);
}

export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = drizzle(c.env.DB, { schema });
  c.set("db", db);
  c.set("auth", null);
  c.set("sessionHash", null);

  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? getCookie(c, SESSION_COOKIE);
  if (token) {
    const idHash = await sha256(token);
    const session = await db.select().from(schema.sessions).where(eq(schema.sessions.idHash, idHash)).get();
    if (session && session.expiresAt > now()) {
      if (session.kind === "superadmin") {
        const fp = await superFingerprint(c.env);
        if (fp && fp === session.fingerprint) {
          c.set("auth", { kind: "superadmin", email: c.env.SUPERADMIN_EMAIL!.trim().toLowerCase() });
          c.set("sessionHash", idHash);
        }
      } else if (session.userId) {
        const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
        const org = user && (await db.select().from(schema.organizations).where(eq(schema.organizations.id, user.orgId)).get());
        if (user?.active && org && org.status !== "archived") {
          c.set("auth", { kind: "user", impersonated: session.kind === "impersonation", user, org });
          c.set("sessionHash", idHash);
        }
      }
    }
  }
  await next();
};

export function requireSuperadmin(c: Ctx): void {
  if (c.get("auth")?.kind !== "superadmin") throw new AppError(401, "UNAUTHORIZED", "Perlu login sebagai super admin.");
}

/** User yang login, tanpa memeriksa status PT atau kewajiban ganti password. */
export function requireLogin(c: Ctx): UserAuth {
  const auth = c.get("auth");
  if (auth?.kind !== "user") throw new AppError(401, "UNAUTHORIZED", "Perlu login.");
  return auth;
}

/** User yang boleh memakai aplikasi: PT aktif dan password sudah diganti. */
export function requireUser(c: Ctx): UserAuth {
  const auth = requireLogin(c);
  if (auth.org.status !== "active") {
    throw new AppError(403, "ORG_SUSPENDED", "Akses perusahaan ini sedang dihentikan sementara. Hubungi pengelola sistem.");
  }
  if (auth.user.mustChangePassword && !auth.impersonated) {
    throw new AppError(403, "MUST_CHANGE_PASSWORD", "Ganti password sementara terlebih dahulu.");
  }
  return auth;
}

export function requireOrgAdmin(c: Ctx): UserAuth {
  const auth = requireUser(c);
  if (auth.user.role !== "admin") throw new AppError(403, "FORBIDDEN", "Hanya admin perusahaan yang bisa melakukan ini.");
  return auth;
}

/** Modul harus diberikan dan aktif. Diperiksa di setiap request. */
export async function requireModule(c: Ctx, key: ModuleKey): Promise<UserAuth> {
  const auth = requireUser(c);
  const row = await c
    .get("db")
    .select()
    .from(schema.orgModules)
    .where(and(eq(schema.orgModules.orgId, auth.org.id), eq(schema.orgModules.moduleKey, key)))
    .get();
  if (!row) throw new AppError(403, "MODULE_NOT_GRANTED", "Modul ini tidak tersedia untuk perusahaan Anda.");
  if (row.status === "paused") {
    throw new AppError(403, "MODULE_PAUSED", row.pausedNote || "Modul ini sedang dijeda. Hubungi pengelola sistem.");
  }
  return auth;
}

export async function parse<T extends z.ZodTypeAny>(c: Ctx, shape: T): Promise<z.infer<T>> {
  const json = await c.req.json().catch(() => null);
  const result = shape.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join(".");
    throw new AppError(400, "INVALID", `Data tidak valid${field ? ` pada "${field}"` : ""}: ${issue?.message ?? ""}`);
  }
  return result.data;
}

export async function audit(c: Ctx, orgId: string | null, action: string, detail?: string): Promise<void> {
  const auth = c.get("auth");
  await c
    .get("db")
    .insert(schema.auditLogs)
    .values({
      id: crypto.randomUUID(),
      orgId,
      actorKind: auth?.kind === "superadmin" ? "superadmin" : auth?.impersonated ? "superadmin_as_user" : "user",
      actorUserId: auth?.kind === "user" ? auth.user.id : null,
      action,
      detail: detail ?? null,
      createdAt: now(),
    })
    .run();
}
