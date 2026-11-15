import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_SETTINGS, MODULE_KEYS, MODULES, TIMEZONES, type OrgDto } from "@app/shared";
import * as s from "../db/schema";
import { AppError, audit, parse, requireSuperadmin, superFingerprint, type AppEnv, type Ctx, type OrgRow } from "../lib/context";
import { randomString, sha256 } from "../lib/crypto";
import { seedRoomsSample } from "../lib/seed";
import { now } from "../lib/time";
import { createUser, listAudit, listUsers, resetPassword, updateUser } from "../lib/users";
import { activeKeyFilter } from "./auth";

const MASTER_KEY_TTL = 10 * 60;
const timezone = z.enum(TIMEZONES.map((t) => t.value) as [string, ...string[]]);
const role = z.enum(["admin", "member"]);
const moduleKey = z.enum(MODULE_KEYS as [string, ...string[]]);

async function getOrg(c: Ctx, id: string): Promise<OrgRow> {
  const org = await c.get("db").select().from(s.organizations).where(eq(s.organizations.id, id)).get();
  if (!org) throw new AppError(404, "NOT_FOUND", "Perusahaan tidak ditemukan.");
  return org;
}

async function activeUserCounts(c: Ctx): Promise<Map<string, number>> {
  const rows = await c
    .get("db")
    .select({ orgId: s.users.orgId, n: sql<number>`count(*)` })
    .from(s.users)
    .where(eq(s.users.active, true))
    .groupBy(s.users.orgId)
    .all();
  return new Map(rows.map((r) => [r.orgId, r.n]));
}

const toOrgDto = (o: OrgRow, activeUsers: number): OrgDto => ({ ...o, activeUsers });

async function orgModules(c: Ctx, orgId: string) {
  const rows = await c.get("db").select().from(s.orgModules).where(eq(s.orgModules.orgId, orgId)).all();
  return MODULES.map((m) => {
    const row = rows.find((r) => r.moduleKey === m.key);
    return { ...m, status: row ? row.status : ("none" as const), pausedNote: row?.pausedNote ?? null };
  });
}

export const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
  requireSuperadmin(c);
  await next();
});

// ---- Perusahaan ----

admin.get("/orgs", async (c) => {
  const [orgs, counts] = await Promise.all([
    c.get("db").select().from(s.organizations).orderBy(s.organizations.name).all(),
    activeUserCounts(c),
  ]);
  return c.json({ orgs: orgs.map((o) => toOrgDto(o, counts.get(o.id) ?? 0)) });
});

admin.post("/orgs", async (c) => {
  const body = await parse(
    c,
    z.object({
      name: z.string().trim().min(1).max(120),
      maxUsers: z.number().int().min(1).max(100_000),
      timezone,
      adminName: z.string().trim().min(1).max(120),
      adminEmail: z.string().trim().email().max(200),
      modules: z.array(moduleKey).default([]),
    }),
  );
  const db = c.get("db");
  const orgId = crypto.randomUUID();
  await db
    .insert(s.organizations)
    .values({ id: orgId, name: body.name, status: "active", maxUsers: body.maxUsers, timezone: body.timezone, createdAt: now() })
    .run();
  try {
    const created = await createUser(c, orgId, { name: body.adminName, email: body.adminEmail, role: "admin" });
    await db.insert(s.roomSettings).values({ orgId, ...DEFAULT_SETTINGS }).run();
    for (const key of new Set(body.modules)) {
      await db.insert(s.orgModules).values({ orgId, moduleKey: key, status: "active" }).run();
    }
    await audit(c, orgId, "org.create", `${body.name}, batas ${body.maxUsers} user`);
    if (body.modules.includes("rooms")) {
      // Data contoh hanya pelengkap: kalau gagal, PT tetap terdaftar.
      try {
        await seedRoomsSample(c, orgId, created.user.id, body.timezone);
        await audit(c, orgId, "org.seed", "Data contoh Booking Ruangan: 3 ruangan, 2 booking");
      } catch (err) {
        console.error("Gagal membuat data contoh", err);
      }
    }
    return c.json({ org: toOrgDto(await getOrg(c, orgId), 1), admin: created.user, tempPassword: created.tempPassword }, 201);
  } catch (err) {
    // Admin pertama gagal dibuat (misalnya email sudah terpakai): batalkan PT-nya.
    await db.delete(s.auditLogs).where(eq(s.auditLogs.orgId, orgId)).run();
    await db.delete(s.users).where(eq(s.users.orgId, orgId)).run();
    await db.delete(s.roomSettings).where(eq(s.roomSettings.orgId, orgId)).run();
    await db.delete(s.organizations).where(eq(s.organizations.id, orgId)).run();
    throw err;
  }
});

admin.get("/orgs/:id", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  const [users, modules] = await Promise.all([listUsers(c, org.id), orgModules(c, org.id)]);
  return c.json({ org: toOrgDto(org, users.filter((u) => u.active).length), users, modules });
});

admin.patch("/orgs/:id", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  const body = await parse(
    c,
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      maxUsers: z.number().int().min(1).max(100_000).optional(),
      timezone: timezone.optional(),
      status: z.enum(["active", "suspended", "archived"]).optional(),
    }),
  );
  const changes: string[] = [];
  if (body.name && body.name !== org.name) changes.push(`nama menjadi ${body.name}`);
  if (body.maxUsers !== undefined && body.maxUsers !== org.maxUsers) changes.push(`batas user ${org.maxUsers} → ${body.maxUsers}`);
  if (body.timezone && body.timezone !== org.timezone) changes.push(`zona waktu menjadi ${body.timezone}`);
  if (body.status && body.status !== org.status) changes.push(`status ${org.status} → ${body.status}`);
  if (changes.length) {
    await c.get("db").update(s.organizations).set(body).where(eq(s.organizations.id, org.id)).run();
    await audit(c, org.id, "org.update", changes.join(", "));
  }
  const users = await listUsers(c, org.id);
  return c.json({ org: toOrgDto(await getOrg(c, org.id), users.filter((u) => u.active).length) });
});

// ---- Modul per perusahaan ----

admin.put("/orgs/:id/modules/:key", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  const key = moduleKey.safeParse(c.req.param("key"));
  if (!key.success) throw new AppError(404, "NOT_FOUND", "Modul tidak dikenal.");
  const body = await parse(c, z.object({ status: z.enum(["active", "paused", "none"]), note: z.string().trim().max(300).optional() }));
  const db = c.get("db");
  const where = and(eq(s.orgModules.orgId, org.id), eq(s.orgModules.moduleKey, key.data));

  if (body.status === "none") {
    // Mencabut modul hanya menghilangkan akses; data modul tidak dihapus.
    await db.delete(s.orgModules).where(where).run();
  } else {
    const paused = body.status === "paused";
    const values = { status: body.status, pausedAt: paused ? now() : null, pausedNote: paused ? body.note || null : null };
    await db
      .insert(s.orgModules)
      .values({ orgId: org.id, moduleKey: key.data, ...values })
      .onConflictDoUpdate({ target: [s.orgModules.orgId, s.orgModules.moduleKey], set: values })
      .run();
  }
  await audit(c, org.id, "module.set", `${key.data}: ${body.status}${body.note ? ` (${body.note})` : ""}`);
  return c.json({ modules: await orgModules(c, org.id) });
});

// ---- User perusahaan, dikelola pengelola sistem ----

admin.post("/orgs/:id/users", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  const body = await parse(c, z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200), role }));
  return c.json(await createUser(c, org.id, body), 201);
});

admin.patch("/orgs/:id/users/:userId", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  const body = await parse(
    c,
    z.object({ name: z.string().trim().min(1).max(120).optional(), role: role.optional(), active: z.boolean().optional() }),
  );
  return c.json({ user: await updateUser(c, org.id, c.req.param("userId"), body) });
});

admin.post("/orgs/:id/users/:userId/reset-password", async (c) => {
  const org = await getOrg(c, c.req.param("id"));
  return c.json(await resetPassword(c, org.id, c.req.param("userId"), { allowAdminTarget: true }));
});

// ---- Kunci sekali pakai ----

admin.get("/master-key", async (c) => {
  const db = c.get("db");
  const fp = (await superFingerprint(c.env))!;
  const active = await db.select().from(s.masterKeys).where(activeKeyFilter(fp)).get();
  const used = await db
    .select({ usedAt: s.masterKeys.usedAt, email: s.users.email, orgName: s.organizations.name })
    .from(s.masterKeys)
    .innerJoin(s.users, eq(s.users.id, s.masterKeys.usedUserId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.users.orgId))
    .orderBy(desc(s.masterKeys.usedAt))
    .limit(20)
    .all();
  return c.json({ active: active ? { expiresAt: active.expiresAt } : null, history: used });
});

admin.post("/master-key", async (c) => {
  const db = c.get("db");
  const fp = (await superFingerprint(c.env))!;
  // Hanya satu kunci aktif: yang lama dihanguskan.
  await db.update(s.masterKeys).set({ revokedAt: now() }).where(and(isNull(s.masterKeys.usedAt), isNull(s.masterKeys.revokedAt))).run();
  const key = randomString(32);
  const expiresAt = now() + MASTER_KEY_TTL;
  await db
    .insert(s.masterKeys)
    .values({ id: crypto.randomUUID(), keyHash: await sha256(key), fingerprint: fp, createdAt: now(), expiresAt })
    .run();
  await audit(c, null, "master_key.create");
  return c.json({ key, expiresAt }, 201);
});

admin.delete("/master-key", async (c) => {
  await c
    .get("db")
    .update(s.masterKeys)
    .set({ revokedAt: now() })
    .where(and(isNull(s.masterKeys.usedAt), isNull(s.masterKeys.revokedAt)))
    .run();
  await audit(c, null, "master_key.revoke");
  return c.json({ ok: true });
});

// ---- Log ----

admin.get("/audit", async (c) => {
  return c.json({ logs: await listAudit(c, c.req.query("orgId") || null, 200) });
});
