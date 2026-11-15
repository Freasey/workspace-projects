import { Hono } from "hono";
import type { ApiError } from "@app/shared";
import { AppError, loadSession, type AppEnv } from "./lib/context";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { org } from "./routes/org";
import { rooms } from "./routes/rooms";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json<ApiError>({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error(err);
  return c.json<ApiError>({ error: { code: "INTERNAL", message: "Terjadi kesalahan di server." } }, 500);
});

const v1 = new Hono<AppEnv>();
v1.use("*", loadSession);
// Permintaan yang mengubah data harus berupa JSON. Form lintas-situs tidak bisa
// mengirim tipe ini tanpa preflight, sehingga menutup celah CSRF pada cookie sesi.
v1.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !c.req.header("content-type")?.includes("application/json")) {
    throw new AppError(400, "INVALID", "Content-Type harus application/json.");
  }
  await next();
});
v1.get("/health", (c) => c.json({ ok: true }));
v1.route("/auth", auth);
v1.route("/admin", admin);
v1.route("/org", org);
v1.route("/rooms", rooms);

app.route("/api/v1", v1);
app.all("/api/*", (c) => c.json<ApiError>({ error: { code: "NOT_FOUND", message: "Alamat API tidak ditemukan." } }, 404));

export default app;
