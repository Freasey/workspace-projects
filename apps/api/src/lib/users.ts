import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { AuditDto, Role, UserDto } from "@app/shared";
import * as s from "../db/schema";
import { AppError, audit, type Ctx, type UserRow } from "./context";
import { hashPassword, randomString } from "./crypto";
import { now } from "./time";

const TEMP_PASSWORD_DAYS = 7;

export function toUserDto(u: UserRow): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

async function newTempPassword() {
  const password = randomString(12);
  return { password, hash: await hashPassword(password), expiresAt: now() + TEMP_PASSWORD_DAYS * 86_400 };
}

export async function listUsers(c: Ctx, orgId: string): Promise<UserDto[]> {
  const rows = await c.get("db").select().from(s.users).where(eq(s.users.orgId, orgId)).orderBy(s.users.name).all();
  return rows.map(toUserDto);
}

async function getUser(c: Ctx, orgId: string, userId: string): Promise<UserRow> {
  const user = await c.get("db").select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.orgId, orgId))).get();
  if (!user) throw new AppError(404, "NOT_FOUND", "User tidak ditemukan.");
  return user;
}

export async function createUser(c: Ctx, orgId: string, input: { name: string; email: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  if (email === c.env.SUPERADMIN_EMAIL?.trim().toLowerCase()) {
    throw new AppError(409, "EMAIL_TAKEN", "Email ini tidak bisa dipakai.");
  }
  const existing = await c.get("db").select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email)).get();
  if (existing) throw new AppError(409, "EMAIL_TAKEN", "Email ini sudah terdaftar.");

  const temp = await newTempPassword();
  const id = crypto.randomUUID();
  // Cek kuota dan penambahan dalam satu pernyataan, supaya dua request bersamaan
  // tidak bisa melewati batas.
  const result = await c.env.DB.prepare(
    `INSERT INTO users (id, org_id, email, name, role, password_hash, must_change_password, temp_password_expires_at, active, created_at)
     SELECT ?, ?, ?, ?, ?, ?, 1, ?, 1, ?
     WHERE (SELECT COUNT(*) FROM users WHERE org_id = ? AND active = 1)
         < (SELECT max_users FROM organizations WHERE id = ?)`,
  )
    .bind(id, orgId, email, input.name.trim(), input.role, temp.hash, temp.expiresAt, now(), orgId, orgId)
    .run();
  if (result.meta.changes === 0) {
    throw new AppError(409, "USER_LIMIT", "Batas maksimal user sudah tercapai. Hubungi pengelola sistem untuk menambah batas.");
  }
  await audit(c, orgId, "user.create", `${input.name.trim()} <${email}> sebagai ${input.role}`);
  return { user: toUserDto(await getUser(c, orgId, id)), tempPassword: temp.password };
}

async function assertNotLastAdmin(c: Ctx, user: UserRow): Promise<void> {
  if (user.role !== "admin" || !user.active) return;
  const others = await c
    .get("db")
    .select({ n: sql<number>`count(*)` })
    .from(s.users)
    .where(and(eq(s.users.orgId, user.orgId), eq(s.users.role, "admin"), eq(s.users.active, true), ne(s.users.id, user.id)))
    .get();
  if (!others?.n) throw new AppError(409, "LAST_ADMIN", "Ini admin terakhir perusahaan. Tunjuk admin lain terlebih dahulu.");
}

export async function updateUser(
  c: Ctx,
  orgId: string,
  userId: string,
  patch: { name?: string; role?: Role; active?: boolean },
): Promise<UserDto> {
  const db = c.get("db");
  const user = await getUser(c, orgId, userId);
  const changes: string[] = [];

  if ((patch.role === "member" && user.role === "admin") || (patch.active === false && user.active)) {
    await assertNotLastAdmin(c, user);
  }

  if (patch.active === true && !user.active) {
    const result = await c.env.DB.prepare(
      `UPDATE users SET active = 1 WHERE id = ?
         AND (SELECT COUNT(*) FROM users WHERE org_id = ? AND active = 1)
           < (SELECT max_users FROM organizations WHERE id = ?)`,
    )
      .bind(userId, orgId, orgId)
      .run();
    if (result.meta.changes === 0) {
      throw new AppError(409, "USER_LIMIT", "Batas maksimal user sudah tercapai. Hubungi pengelola sistem untuk menambah batas.");
    }
    changes.push("diaktifkan");
  }

  if (patch.active === false && user.active) {
    // Nonaktif, bukan hapus: riwayat tetap ada, booking mendatang dibatalkan, sesi diputus.
    await db.update(s.users).set({ active: false }).where(eq(s.users.id, userId)).run();
    await db.delete(s.sessions).where(eq(s.sessions.userId, userId)).run();
    await db
      .update(s.bookings)
      .set({ status: "cancelled", cancelledAt: now(), cancelledBy: "system:user-deactivated" })
      .where(and(eq(s.bookings.userId, userId), inArray(s.bookings.status, ["confirmed", "pending"]), gt(s.bookings.startAt, now())))
      .run();
    changes.push("dinonaktifkan");
  }

  const set: Partial<UserRow> = {};
  if (patch.name !== undefined && patch.name.trim() !== user.name) {
    set.name = patch.name.trim();
    changes.push(`nama menjadi ${set.name}`);
  }
  if (patch.role !== undefined && patch.role !== user.role) {
    set.role = patch.role;
    changes.push(`peran menjadi ${patch.role}`);
  }
  if (Object.keys(set).length) await db.update(s.users).set(set).where(eq(s.users.id, userId)).run();

  if (changes.length) await audit(c, orgId, "user.update", `${user.email}: ${changes.join(", ")}`);
  return toUserDto(await getUser(c, orgId, userId));
}

export async function resetPassword(c: Ctx, orgId: string, userId: string, opts: { allowAdminTarget: boolean }) {
  const db = c.get("db");
  const user = await getUser(c, orgId, userId);
  if (user.role === "admin" && !opts.allowAdminTarget) {
    throw new AppError(403, "FORBIDDEN", "Password admin hanya bisa direset oleh pengelola sistem.");
  }
  const temp = await newTempPassword();
  await db
    .update(s.users)
    .set({ passwordHash: temp.hash, mustChangePassword: true, tempPasswordExpiresAt: temp.expiresAt })
    .where(eq(s.users.id, userId))
    .run();
  await db.delete(s.sessions).where(eq(s.sessions.userId, userId)).run();
  await audit(c, orgId, "user.reset_password", user.email);
  return { tempPassword: temp.password };
}

export async function listAudit(c: Ctx, orgId: string | null, limit = 100): Promise<AuditDto[]> {
  const rows = await c
    .get("db")
    .select({ log: s.auditLogs, userName: s.users.name })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.actorUserId))
    .where(orgId ? eq(s.auditLogs.orgId, orgId) : undefined)
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(limit)
    .all();
  return rows.map(({ log, userName }) => ({
    id: log.id,
    orgId: log.orgId,
    actor:
      log.actorKind === "superadmin"
        ? "Pengelola sistem"
        : log.actorKind === "superadmin_as_user"
          ? `Pengelola sistem sebagai ${userName ?? "user"}`
          : (userName ?? (log.action.startsWith("room.display.") ? "Layar ruangan" : "User")),
    action: log.action,
    detail: log.detail,
    createdAt: log.createdAt,
  }));
}
