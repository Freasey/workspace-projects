# Setup

## Menjalankan di komputer sendiri

Butuh Node.js 20 ke atas dan pnpm.

```bash
pnpm install
```

```bash
cp .dev.vars.example .dev.vars
```

Isi `.dev.vars` dengan email dan password super admin untuk lokal, lalu:

```bash
pnpm db:migrate:local
```

```bash
pnpm dev
```

Aplikasi terbuka di `http://localhost:8787`. Database lokal adalah simulasi di folder `.wrangler`, bukan database Cloudflare.

Untuk menjalankan tes alur (server harus sedang berjalan, dan nilai super admin harus sama dengan `.dev.vars`):

```bash
SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=ganti-password-ini pnpm test
```

Saat mengubah tampilan, `pnpm dev:web` memberi muat ulang otomatis di `http://localhost:5173` dan meneruskan `/api` ke server di atas.

## Deploy produksi (branch `prod`)

Backend dan frontend ter-deploy sebagai **satu Worker**. Cukup satu deployment, dengan root folder di akar repo.

### 1. Database produksi

Database D1 produksi sudah dibuat dan ID-nya sudah terpasang di `wrangler.jsonc` (bagian `env.production`). ID ini bukan rahasia.

### 2. Hubungkan repo ke Cloudflare

Di dashboard Cloudflare: Workers & Pages → Create → Import a repository.

| Isian | Nilai |
|---|---|
| Nama Worker | `workspace-projects` (harus sama dengan `name` di bagian `env.production` pada `wrangler.jsonc`) |
| Branch produksi | `prod` |
| Root directory | kosong (akar repo) |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote --env production && npx wrangler deploy --env production` |

Matikan build untuk branch selain produksi, supaya `dev` dan `main` tidak ikut ter-deploy.

Deploy command di atas menerapkan migrasi database sebelum deploy. Kalau token build Cloudflare tidak punya izin D1, jalankan migrasi dari komputer sendiri dengan `pnpm db:migrate:prod` dan pakai `npx wrangler deploy --env production` saja sebagai deploy command.

### 3. Isi kredensial super admin

Di Cloudflare tidak ada file `.env` di server. Padanannya adalah **Variables and Secrets** milik Worker; di komputer sendiri padanannya file `.dev.vars`.

Di dashboard: Worker `workspace-projects` → Settings → Variables and Secrets. Tambahkan dua nilai dengan tipe **Secret**:

- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

Jangan simpan nilai ini di repo. Mengubahnya membuat semua sesi super admin dan kunci sekali pakai yang masih aktif langsung gugur. Kalau lupa password, cukup ganti nilainya di sini.

Tanpa dua nilai ini, login super admin dan kunci sekali pakai tidak aktif.

## Aplikasi mobile

Aplikasi Android/iOS ada di `apps/mobile` dan punya dependensi sendiri (npm, di luar workspace pnpm). Cara menjalankan dan membuat APK ada di [`apps/mobile/README.md`](../apps/mobile/README.md).

Aplikasi mobile butuh server yang sudah memuat perubahan login mobile (`client: "mobile"` di `POST /api/v1/auth/login`). Deploy API lebih dulu sebelum membagikan APK.

## Mengubah skema database

Tambah file baru di `apps/api/migrations` dengan nomor urut berikutnya, lalu samakan `apps/api/src/db/schema.ts`. File migrasi yang sudah diterapkan tidak boleh diubah.
