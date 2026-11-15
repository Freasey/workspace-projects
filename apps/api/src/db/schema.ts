import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Skema ini harus sama dengan migrations/*.sql. Migrasi adalah sumber kebenaran.

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "suspended", "archived"] }).notNull(),
  maxUsers: integer("max_users").notNull(),
  timezone: text("timezone").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull(),
  tempPasswordExpiresAt: integer("temp_password_expires_at"),
  active: integer("active", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  kind: text("kind", { enum: ["user", "superadmin", "impersonation"] }).notNull(),
  userId: text("user_id"),
  fingerprint: text("fingerprint"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull(),
  lockedUntil: integer("locked_until").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const masterKeys = sqliteTable("master_keys", {
  id: text("id").primaryKey(),
  keyHash: text("key_hash").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  usedUserId: text("used_user_id"),
  revokedAt: integer("revoked_at"),
});

export const orgModules = sqliteTable(
  "org_modules",
  {
    orgId: text("org_id").notNull(),
    moduleKey: text("module_key").notNull(),
    status: text("status", { enum: ["active", "paused"] }).notNull(),
    pausedAt: integer("paused_at"),
    pausedNote: text("paused_note"),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.moduleKey] })],
);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  orgId: text("org_id"),
  actorKind: text("actor_kind", { enum: ["superadmin", "user", "superadmin_as_user"] }).notNull(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at").notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  location: text("location").notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
  facilities: text("facilities").notNull(),
  bufferMin: integer("buffer_min").notNull(),
  maxDurationMin: integer("max_duration_min"),
  maxDaysAhead: integer("max_days_ahead"),
  createdAt: integer("created_at").notNull(),
});

export const roomHours = sqliteTable(
  "room_hours",
  {
    roomId: text("room_id").notNull(),
    weekday: integer("weekday").notNull(),
    openMin: integer("open_min").notNull(),
    closeMin: integer("close_min").notNull(),
    breakStart: integer("break_start"),
    breakEnd: integer("break_end"),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.weekday] })],
);

export const roomClosures = sqliteTable("room_closures", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  roomId: text("room_id"),
  date: text("date").notNull(),
  note: text("note").notNull(),
});

export const roomSettings = sqliteTable("room_settings", {
  orgId: text("org_id").primaryKey(),
  maxDurationMin: integer("max_duration_min").notNull(),
  maxDaysAhead: integer("max_days_ahead").notNull(),
  minNoticeMin: integer("min_notice_min").notNull(),
});

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  roomId: text("room_id").notNull(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  note: text("note").notNull(),
  startAt: integer("start_at").notNull(),
  endAt: integer("end_at").notNull(),
  status: text("status", { enum: ["confirmed", "pending", "cancelled", "rejected"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  cancelledAt: integer("cancelled_at"),
  cancelledBy: text("cancelled_by"),
});
