// Tes alur utama terhadap server lokal (`pnpm dev`).
// Pakai: BASE=http://localhost:8787 SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node scripts/smoke-test.mjs
const BASE = process.env.BASE ?? "http://localhost:8787";
const SA_EMAIL = process.env.SUPERADMIN_EMAIL ?? "admin@example.com";
const SA_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "ganti-password-ini";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}${cond ? "" : ` ${extra}`}`);
}

function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, code: json?.error?.code };
  };
}

const uniq = Date.now().toString(36);
const email = (n) => `${n}.${uniq}@test.local`;

// Tanggal lokal WIB untuk N hari ke depan, dilewati sampai jatuh di hari kerja.
function workday(offset) {
  const d = new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const sa = client();
const adminA = client();
const member = client();
let r;

console.log("\nSuper admin");
r = await sa("POST", "/auth/login", { email: SA_EMAIL, password: "salah" });
check("password salah ditolak", r.status === 401);
r = await sa("POST", "/auth/login", { email: SA_EMAIL, password: SA_PASSWORD });
check("login dari env berhasil", r.status === 200, JSON.stringify(r.json));
r = await sa("GET", "/auth/me");
check("me = superadmin", r.json.kind === "superadmin");
r = await client()("GET", "/admin/orgs");
check("panel admin tertutup tanpa login", r.status === 401);

console.log("\nPendaftaran PT");
r = await sa("POST", "/admin/orgs", {
  name: `PT Uji ${uniq}`, maxUsers: 2, timezone: "Asia/Jakarta",
  adminName: "Admin Uji", adminEmail: email("admin"), modules: ["rooms"],
});
check("PT dibuat dengan password sementara", r.status === 201 && r.json.tempPassword?.length === 12, JSON.stringify(r.json));
const orgId = r.json.org.id;
const adminTemp = r.json.tempPassword;
r = await sa("POST", "/admin/orgs", {
  name: "PT Ganda", maxUsers: 2, timezone: "Asia/Jakarta", adminName: "X", adminEmail: email("admin"),
});
check("email admin ganda ditolak", r.code === "EMAIL_TAKEN");
r = await sa("GET", "/admin/orgs");
check("PT yang gagal tidak tersisa", !r.json.orgs.some((o) => o.name === "PT Ganda"));
r = await sa("POST", `/admin/orgs/${orgId}/users`, { name: "S", email: SA_EMAIL, role: "member" });
check("email super admin dicadangkan", r.code === "EMAIL_TAKEN");

console.log("\nLogin pertama admin PT");
r = await adminA("POST", "/auth/login", { email: email("admin"), password: adminTemp });
check("login dengan password sementara", r.status === 200);
r = await adminA("GET", "/org/users");
check("wajib ganti password sebelum memakai aplikasi", r.code === "MUST_CHANGE_PASSWORD");
r = await adminA("POST", "/auth/change-password", { currentPassword: adminTemp, newPassword: "pendek" });
check("password baru terlalu pendek ditolak", r.status === 400);
r = await adminA("POST", "/auth/change-password", { currentPassword: adminTemp, newPassword: "password-admin-1" });
check("ganti password berhasil", r.status === 200, JSON.stringify(r.json));
r = await adminA("GET", "/admin/orgs");
check("admin PT tidak bisa membuka panel super admin", r.status === 401);

console.log("\nKuota user");
r = await adminA("POST", "/org/users", { name: "Budi", email: email("budi"), role: "member" });
check("user ke-2 berhasil (batas 2)", r.status === 201, JSON.stringify(r.json));
const budiId = r.json.user.id;
const budiTemp = r.json.tempPassword;
r = await adminA("POST", "/org/users", { name: "Citra", email: email("citra"), role: "member" });
check("user ke-3 ditolak", r.code === "USER_LIMIT");
r = await sa("POST", `/admin/orgs/${orgId}/users`, { name: "Citra", email: email("citra"), role: "member" });
check("batas juga berlaku untuk super admin", r.code === "USER_LIMIT");
r = await sa("PATCH", `/admin/orgs/${orgId}`, { maxUsers: 3 });
r = await sa("POST", `/admin/orgs/${orgId}/users`, { name: "Citra", email: email("citra"), role: "member" });
check("setelah batas dinaikkan, super admin bisa menambah", r.status === 201);
const citraId = r.json.user.id;
r = await adminA("PATCH", `/org/users/${citraId}`, { active: false });
check("nonaktifkan user", r.json.user?.active === false);
r = await sa("PATCH", `/admin/orgs/${orgId}`, { maxUsers: 2 });
r = await adminA("PATCH", `/org/users/${citraId}`, { active: true });
check("mengaktifkan lagi ditolak saat penuh", r.code === "USER_LIMIT");
const self = (await adminA("GET", "/auth/me")).json.user.id;
r = await adminA("PATCH", `/org/users/${self}`, { active: false });
check("admin terakhir tidak bisa dinonaktifkan", r.code === "LAST_ADMIN");
r = await adminA("PATCH", `/org/users/${self}`, { role: "member" });
check("admin terakhir tidak bisa diturunkan", r.code === "LAST_ADMIN");
r = await adminA("POST", `/org/users/${self}/reset-password`);
check("admin PT tidak bisa mereset password admin", r.status === 403);

console.log("\nRuangan dan booking");
await member("POST", "/auth/login", { email: email("budi"), password: budiTemp });
await member("POST", "/auth/change-password", { currentPassword: budiTemp, newPassword: "password-budi-1" });
r = await member("POST", "/rooms", { name: "Ruang X" });
check("user biasa tidak bisa membuat ruangan", r.status === 403);
r = await adminA("POST", "/rooms", { name: "Ruang Merapi", capacity: 8, location: "Lantai 2" });
check("admin membuat ruangan dengan jadwal bawaan", r.status === 201 && r.json.room.hours.length === 5, JSON.stringify(r.json));
const roomId = r.json.room.id;
const day = workday(2);
const book = (c, startMin, endMin, date = day) => c("POST", "/rooms/bookings", { roomId, date, startMin, endMin, title: "Rapat" });

r = await book(member, 9 * 60, 10 * 60);
check("booking 09.00–10.00", r.status === 201 && r.json.booking.startMin === 540, JSON.stringify(r.json));
const bookingId = r.json.booking.id;
r = await book(adminA, 9 * 60 + 30, 10 * 60 + 30);
check("booking tumpang-tindih ditolak", r.code === "OVERLAP", JSON.stringify(r.json));
r = await book(adminA, 10 * 60, 11 * 60);
check("booking bersebelahan diterima", r.status === 201);
const both = await Promise.all([book(adminA, 13 * 60, 14 * 60), book(member, 13 * 60, 14 * 60)]);
check("dua booking bersamaan: tepat satu yang menang", both.filter((x) => x.status === 201).length === 1, both.map((x) => x.status).join(","));
r = await book(member, 9 * 60 + 5, 10 * 60);
check("bukan kelipatan 15 menit ditolak", r.status === 400);
r = await book(member, 7 * 60, 8 * 60);
check("di luar jam buka ditolak", r.code === "OUTSIDE_HOURS");
r = await book(member, 14 * 60, 18 * 60 + 15);
check("melebihi durasi maksimal ditolak", r.code === "MAX_DURATION" || r.code === "OUTSIDE_HOURS");
r = await book(member, 14 * 60, 15 * 60, workday(45));
check("terlalu jauh ke depan ditolak", r.code === "MAX_DAYS_AHEAD");
r = await book(member, 9 * 60, 10 * 60, "2020-01-06");
check("waktu lampau ditolak", r.code === "IN_PAST");
r = await adminA("GET", `/rooms/bookings?date=${day}`);
check("daftar booking per tanggal", r.json.bookings.length === 3, String(r.json.bookings?.length));

console.log("\nJadwal, tanggal tutup, jeda");
const narrow = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openMin: 600, closeMin: 1020, breakStart: 720, breakEnd: 780 }));
r = await adminA("PUT", `/rooms/${roomId}/hours?preview=1`, { hours: narrow });
check("pratinjau jadwal menampilkan booking terdampak", r.json.affected?.length === 1, JSON.stringify(r.json));
r = await adminA("GET", "/rooms");
check("pratinjau tidak menyimpan", r.json.rooms[0].hours[0].openMin === 480);
r = await adminA("PUT", `/rooms/${roomId}/hours`, { hours: narrow });
check("jadwal Advanced tersimpan", r.status === 200);
r = await book(member, 12 * 60, 13 * 60);
check("booking di jam istirahat ditolak", r.code === "BREAK");
r = await adminA("PATCH", `/rooms/${roomId}`, { name: "Ruang Merapi Baru" });
r = await adminA("GET", "/rooms");
check("simpan dari Simple tidak menyentuh jadwal Advanced", r.json.rooms[0].name === "Ruang Merapi Baru" && r.json.rooms[0].hours[0].breakStart === 720);
r = await adminA("PATCH", `/rooms/${roomId}`, { bufferMin: 15 });
r = await book(member, 11 * 60, 12 * 60);
check("jeda antar-booking ditegakkan", r.code === "BUFFER", JSON.stringify(r.json));
r = await book(member, 11 * 60 + 15, 12 * 60);
check("booking setelah jeda diterima", r.status === 201, JSON.stringify(r.json));
const closedDay = workday(5);
r = await adminA("POST", "/rooms/closures", { roomId: null, date: closedDay, note: "Libur nasional" });
r = await book(member, 10 * 60, 11 * 60, closedDay);
check("tanggal tutup ditegakkan dengan alasannya", r.code === "CLOSED_DATE" && r.json.error.message.includes("Libur nasional"));

console.log("\nPembatalan");
r = await adminA("POST", `/rooms/bookings/${bookingId}/cancel`);
check("admin bisa membatalkan booking orang lain", r.status === 200);
r = await book(adminA, 15 * 60, 16 * 60);
const adminBooking = r.json.booking.id;
r = await member("POST", `/rooms/bookings/${adminBooking}/cancel`);
check("user biasa tidak bisa membatalkan booking orang lain", r.status === 403);

console.log("\nJeda modul");
r = await sa("PUT", `/admin/orgs/${orgId}/modules/rooms`, { status: "paused", note: "Hubungi admin untuk mengaktifkan kembali" });
r = await member("GET", "/rooms");
check("modul dijeda: tertolak dengan catatan", r.code === "MODULE_PAUSED" && r.json.error.message.includes("Hubungi admin"));
r = await member("GET", "/auth/me");
check("modul tetap tampil berstatus dijeda", r.json.modules[0].status === "paused");
r = await sa("PUT", `/admin/orgs/${orgId}/modules/rooms`, { status: "active" });
r = await adminA("GET", `/rooms/bookings?date=${day}`);
check("data utuh setelah diaktifkan lagi", r.json.bookings.length >= 3, String(r.json.bookings?.length));
r = await sa("PUT", `/admin/orgs/${orgId}/modules/rooms`, { status: "none" });
r = await member("GET", "/auth/me");
check("modul yang dicabut tidak tampil", r.json.modules.length === 0);
await sa("PUT", `/admin/orgs/${orgId}/modules/rooms`, { status: "active" });

console.log("\nKunci sekali pakai");
r = await sa("POST", "/admin/master-key");
check("kunci dibuat (32 karakter)", r.json.key?.length === 32);
const key1 = r.json.key;
r = await sa("POST", "/admin/master-key");
const key2 = r.json.key;
const imp = client();
r = await imp("POST", "/auth/login", { email: email("budi"), password: key1 });
check("kunci lama hangus saat kunci baru dibuat", r.status === 401);
r = await imp("POST", "/auth/login", { email: SA_EMAIL, password: key2 });
check("kunci tidak berlaku untuk super admin", r.status === 401);
r = await imp("POST", "/auth/login", { email: email("citra"), password: key2 });
check("kunci tidak menembus user nonaktif", r.status === 401);
r = await imp("POST", "/auth/login", { email: email("budi"), password: key2 });
check("login sebagai user dengan kunci", r.status === 200);
r = await imp("GET", "/auth/me");
check("sesi ditandai sebagai penyamaran", r.json.impersonated === true && r.json.user.email === email("budi"));
r = await imp("POST", "/auth/change-password", { currentPassword: key2, newPassword: "password-baru-9" });
check("ganti password dikunci di sesi kunci", r.status === 403);
r = await client()("POST", "/auth/login", { email: email("admin"), password: key2 });
check("kunci hangus setelah satu kali pakai", r.status === 401);
r = await member("GET", "/auth/me");
check("sesi asli user tidak terganggu", r.status === 200);
r = await sa("POST", "/admin/master-key");
await sa("DELETE", "/admin/master-key");
r = await client()("POST", "/auth/login", { email: email("budi"), password: r.json.key });
check("kunci yang dihanguskan tidak bisa dipakai", r.status === 401);
r = await sa("GET", `/admin/audit?orgId=${orgId}`);
check("pemakaian kunci tercatat", r.json.logs.some((l) => l.action === "master_key.login" && l.actor.startsWith("Pengelola sistem sebagai")));

console.log("\nNonaktif, suspend, reset");
r = await book(member, 16 * 60 + 15, 17 * 60);
check("booking user sebelum dinonaktifkan", r.status === 201, JSON.stringify(r.json));
r = await adminA("PATCH", `/org/users/${budiId}`, { active: false });
r = await member("GET", "/auth/me");
check("user nonaktif langsung terputus", r.status === 401);
r = await adminA("GET", `/rooms/bookings?date=${day}`);
check("booking mendatang user nonaktif dibatalkan", !r.json.bookings.some((b) => b.userId === budiId));
r = await sa("PATCH", `/admin/orgs/${orgId}`, { status: "suspended" });
r = await adminA("GET", "/auth/me");
check("PT di-suspend: masih bisa login dan melihat status", r.status === 200 && r.json.org.status === "suspended");
r = await adminA("GET", "/org/users");
check("PT di-suspend: fitur tertolak", r.code === "ORG_SUSPENDED");
await sa("PATCH", `/admin/orgs/${orgId}`, { status: "active" });
r = await sa("POST", `/admin/orgs/${orgId}/users/${self}/reset-password`);
check("super admin mereset password admin PT", r.json.tempPassword?.length === 12);
r = await adminA("GET", "/auth/me");
check("reset password memutus sesi lama", r.status === 401);

console.log("\nBatas percobaan login");
const brute = client();
let last;
for (let i = 0; i < 6; i++) last = await brute("POST", "/auth/login", { email: email("admin"), password: `tebak-${i}` });
check("terkunci setelah 5 kali gagal", last.status === 429, String(last.status));

console.log(`\n${passed} lulus, ${failed} gagal`);
process.exit(failed ? 1 : 0);
