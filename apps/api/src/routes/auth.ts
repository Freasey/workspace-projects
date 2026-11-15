import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { MODULES, type Me, type OrgModule } from "@app/shared";
import * as s from "../db/schema";
import { AppError, audit, parse, requireLogin, SESSION_COOKIE, superFingerprint, type AppEnv, type Ctx } from "../lib/context";
import { hashPassword, randomToken, safeEqual, sha256, verifyPassword } from "../lib/crypto";
import { now } from "../lib/time";
import { toUserDto } from "../lib/users";

const MAX_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const TTL = { user: 7 * 86_400, superadmin: 12 * 3600, impersonation: 3600 } as const;

const BAD_LOGIN = () => new AppError(401, "BAD_CREDENTIALS", "Email atau password salah.");

async function assertNotLocked(c: Ctx, key: string) {
  const row = await c.get("db").select().from(s.loginAttempts).where(eq(s.loginAttempts.key, key)).get();
  if (row && row.lockedUntil > now()) {
    const minutes = Math.ceil((row.lockedUntil - now()) / 60);
    throw new AppError(429, "LOCKED", `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`);
  }
}

async function recordFailure(c: Ctx, key: string) {
  const t = now();
  // Hitungan direset kalau kegagalan terakhir sudah lebih lama dari masa kunci.
  const row = await c.env.DB.prepare(
    `INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES (?, 1, 0, ?)
     ON CONFLICT(key) DO UPDATE SET
       failures = CASE WHEN updated_at < ? THEN 1 ELSE failures + 1 END,
       updated_at = excluded.updated_at
     RETURNING failures`,
  )
    .bind(key, t, t - LOCK_SECONDS)
    .first<{ failures: number }>();
  if (row && row.failures >= MAX_FAILURES) {
    await c.get("db").update(s.loginAttempts).set({ failures: 0, lockedUntil: t + LOCK_SECONDS }).where(eq(s.loginAttempts.key, key)).run();
  }
}

async function startSession(c: Ctx, kind: keyof typeof TTL, userId: string | null, fingerprint: string | null) {
  const token = randomToken();
  await c
    .get("db")
    .insert(s.sessions)
    .values({ idHash: await sha256(token), kind, userId, fingerprint, expiresAt: now() + TTL[kind], createdAt: now() })
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: TTL[kind],
  });
}

export const auth = new Hono<AppEnv>();

auth.post("/login", async (c) => {
  const body = await parse(c, z.object({ email: z.string().min(1).max(200), password: z.string().min(1).max(200) }));
  const db = c.get("db");
  const email = body.email.trim().toLowerCase();
  const lockKey = `${email}|${c.req.header("cf-connecting-ip") ?? "local"}`;
  await assertNotLocked(c, lockKey);

  const fingerprint = await superFingerprint(c.env);

  // Super admin: hanya dari variabel lingkungan, dicek lebih dulu dari database.
  if (fingerprint && email === c.env.SUPERADMIN_EMAIL!.trim().toLowerCase()) {
    if (!safeEqual(await sha256(body.password), await sha256(c.env.SUPERADMIN_PASSWORD!))) {
      await recordFailure(c, lockKey);
      throw BAD_LOGIN();
    }
    await db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, lockKey)).run();
    await startSession(c, "superadmin", null, fingerprint);
    return c.json({ ok: true });
  }

  const user = await db.select().from(s.users).where(eq(s.users.email, email)).get();
  const org = user && (await db.select().from(s.organizations).where(eq(s.organizations.id, user.orgId)).get());
  if (!user || !user.active || !org || org.status === "archived") {
    await recordFailure(c, lockKey);
    throw BAD_LOGIN();
  }

  if (await verifyPassword(body.password, user.passwordHash)) {
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < now()) {
      throw new AppError(401, "TEMP_PASSWORD_EXPIRED", "Password sementara sudah kedaluwarsa. Minta admin untuk mereset.");
    }
    await db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, lockKey)).run();
    await startSession(c, "user", user.id, null);
    return c.json({ ok: true });
  }

  // Kunci sekali pakai: universal, tapi diklaim secara atomik sehingga hanya
  // satu login yang bisa memakainya.
  if (fingerprint) {
    const t = now();
    const claimed = await c.env.DB.prepare(
      `UPDATE master_keys SET used_at = ?, used_user_id = ?
       WHERE key_hash = ? AND fingerprint = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    )
      .bind(t, user.id, await sha256(body.password), fingerprint, t)
      .run();
    if (claimed.meta.changes === 1) {
      await db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, lockKey)).run();
      await startSession(c, "impersonation", user.id, null);
      await db
        .insert(s.auditLogs)
        .values({
          id: crypto.randomUUID(),
          orgId: user.orgId,
          actorKind: "superadmin_as_user",
          actorUserId: user.id,
          action: "master_key.login",
          detail: `Masuk ke akun ${user.email} dengan kunci sekali pakai`,
          createdAt: t,
        })
        .run();
      return c.json({ ok: true });
    }
  }

  await recordFailure(c, lockKey);
  throw BAD_LOGIN();
});

auth.post("/logout", async (c) => {
  const hash = c.get("sessionHash");
  if (hash) await c.get("db").delete(s.sessions).where(eq(s.sessions.idHash, hash)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const a = c.get("auth");
  if (!a) throw new AppError(401, "UNAUTHORIZED", "Perlu login.");
  if (a.kind === "superadmin") return c.json<Me>({ kind: "superadmin", email: a.email });

  const rows = await c.get("db").select().from(s.orgModules).where(eq(s.orgModules.orgId, a.org.id)).all();
  const modules: OrgModule[] = MODULES.flatMap((m) => {
    const row = rows.find((r) => r.moduleKey === m.key);
    return row ? [{ ...m, status: row.status, pausedNote: row.pausedNote }] : [];
  });
  return c.json<Me>({
    kind: "user",
    impersonated: a.impersonated,
    user: toUserDto(a.user),
    org: { id: a.org.id, name: a.org.name, status: a.org.status, timezone: a.org.timezone },
    modules,
  });
});

auth.post("/change-password", async (c) => {
  const a = requireLogin(c);
  if (a.impersonated) throw new AppError(403, "FORBIDDEN", "Password tidak bisa diganti dari sesi kunci sekali pakai.");
  const body = await parse(
    c,
    z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, "minimal 8 karakter").max(200) }),
  );
  if (!(await verifyPassword(body.currentPassword, a.user.passwordHash))) {
    throw new AppError(400, "BAD_CREDENTIALS", "Password saat ini salah.");
  }
  if (body.newPassword === body.currentPassword) {
    throw new AppError(400, "INVALID", "Password baru harus berbeda dari password saat ini.");
  }
  const db = c.get("db");
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, tempPasswordExpiresAt: null })
    .where(eq(s.users.id, a.user.id))
    .run();
  // Sesi lain milik user ini diputus; sesi yang sedang dipakai tetap.
  await db
    .delete(s.sessions)
    .where(and(eq(s.sessions.userId, a.user.id), ne(s.sessions.idHash, c.get("sessionHash")!)))
    .run();
  await audit(c, a.org.id, "user.change_password", a.user.email);
  return c.json({ ok: true });
});

/** Kunci sekali pakai yang masih bisa dipakai saat ini. */
export function activeKeyFilter(fingerprint: string) {
  return and(
    eq(s.masterKeys.fingerprint, fingerprint),
    isNull(s.masterKeys.usedAt),
    isNull(s.masterKeys.revokedAt),
    gt(s.masterKeys.expiresAt, now()),
  );
}
