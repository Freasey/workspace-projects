import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import { parse, requireOrgAdmin, type AppEnv } from "../lib/context";
import { createUser, listAudit, listUsers, resetPassword, updateUser } from "../lib/users";

const role = z.enum(["admin", "member"]);

/** Pengelolaan user oleh admin perusahaan. */
export const org = new Hono<AppEnv>();

org.get("/users", async (c) => {
  const a = requireOrgAdmin(c);
  const users = await listUsers(c, a.org.id);
  const fresh = await c.get("db").select().from(s.organizations).where(eq(s.organizations.id, a.org.id)).get();
  return c.json({ users, maxUsers: fresh!.maxUsers, activeUsers: users.filter((u) => u.active).length });
});

org.post("/users", async (c) => {
  const a = requireOrgAdmin(c);
  const body = await parse(c, z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200), role }));
  return c.json(await createUser(c, a.org.id, body), 201);
});

org.patch("/users/:userId", async (c) => {
  const a = requireOrgAdmin(c);
  const body = await parse(
    c,
    z.object({ name: z.string().trim().min(1).max(120).optional(), role: role.optional(), active: z.boolean().optional() }),
  );
  return c.json({ user: await updateUser(c, a.org.id, c.req.param("userId"), body) });
});

org.post("/users/:userId/reset-password", async (c) => {
  const a = requireOrgAdmin(c);
  return c.json(await resetPassword(c, a.org.id, c.req.param("userId"), { allowAdminTarget: false }));
});

org.get("/audit", async (c) => {
  const a = requireOrgAdmin(c);
  return c.json({ logs: await listAudit(c, a.org.id, 100) });
});
