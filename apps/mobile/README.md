# Spaces Mobile

Aplikasi mobile Spaces untuk Android (iOS menyusul dari kode yang sama). React Native + Expo + TypeScript, memakai API yang sama dengan versi web (`/api/v1`).

## Isi aplikasi

| Layar | Isi |
|---|---|
| Masuk | Email dan password. Ganti password sementara diwajibkan saat login pertama. |
| Jadwal | Jadwal per hari untuk semua ruangan, garis waktu terisi, buat booking, lihat detail, batalkan. |
| Booking saya | Booking mendatang dan riwayat 30 hari. |
| Akun | Profil, ganti password, keluar. |

Yang sengaja tetap di web: kelola ruangan, jadwal, aturan booking, pengguna, dan panel super admin.

Status dari server ditangani sama seperti di web: PT di-suspend, modul dijeda, sesi kunci sekali pakai (banner, ganti password dikunci), dan sesi yang gugur.

## Struktur

```
index.ts            Titik masuk
src/App.tsx         Gerbang login dan shell (tab bawah)
src/api.ts          Klien API, sesi, token
src/storage.ts      Penyimpanan token (Keystore/Keychain lewat expo-secure-store)
src/theme.ts        Warna terang dan gelap, sama dengan web
src/ui.tsx          Komponen dasar (tombol, isian, kartu, lembar bawah)
src/pickers.tsx     Pemilih tanggal dan jam
src/date.ts         Pembantu tanggal menurut zona waktu PT
src/screens/        Auth, Rooms (jadwal, form, detail, booking saya), Account
```

Tipe dan konstanta diambil dari `packages/shared` (alias `@app/shared`, diatur di `metro.config.js` dan `tsconfig.json`).

Folder `android/` dan `ios/` tidak disimpan di repo. Keduanya dibuat ulang dari `app.json` oleh `expo prebuild`; jangan diubah dengan tangan.

## Server

Alamat server tertanam di aplikasi: `https://spaces.worksell.id` (lihat `src/api.ts`). User tidak perlu mengetik alamat apa pun.

Untuk development, timpa dengan variabel `EXPO_PUBLIC_API_URL` saat menjalankan atau build.

## Menjalankan saat development

Butuh Node.js 20 ke atas. Untuk Android: JDK 17 dan Android SDK (`ANDROID_HOME`).

```bash
cd apps/mobile
```

```bash
npm install
```

Jalankan API lokal dari akar repo (`pnpm dev`), lalu dari emulator Android (komputer sendiri beralamat `10.0.2.2`):

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm run android
```

## Rilis lewat GitHub Actions (disarankan)

Workflow `.github/workflows/android-release.yml` membuat APK bertanda tangan keystore Spaces, memeriksa sidik jari sertifikatnya, lalu meng-commit APK dan info rilis (`apps/web/src/release.ts`) ke branch yang dipilih. Deploy web berjalan seperti biasa dari commit itu.

**Sekali saja: isi GitHub Secrets.** Di GitHub: repo → Settings → Secrets and variables → Actions → New repository secret.

| Nama secret | Isi |
|---|---|
| `SPACES_UPLOAD_KEYSTORE_BASE64` | File `.jks` dalam base64: `base64 -w0 spaces-upload.jks` (Linux) atau `base64 -i spaces-upload.jks` (macOS) |
| `SPACES_UPLOAD_STORE_PASSWORD` | Password keystore |
| `SPACES_UPLOAD_KEY_ALIAS` | Alias kunci |
| `SPACES_UPLOAD_KEY_PASSWORD` | Password kunci |

**Setiap rilis:**

1. Naikkan `version` dan `android.versionCode` di `app.json`, commit ke `dev`.
2. GitHub → Actions → **Rilis APK Android** → Run workflow → branch `dev`. Centang "gabungkan juga ke prod" kalau langsung dirilis ke produksi.
3. Workflow gagal dengan pesan jelas kalau secret belum diisi, kalau APK ditandatangani kunci lain, atau kalau ukurannya melebihi 25 MiB. APK tidak pernah sampai ke web dalam keadaan itu.

## Merilis APK baru secara manual

APK dibagikan langsung dari situs, di `https://spaces.worksell.id/download/spaces-android.apk`, dengan tombol unduh di halaman utama.

1. Naikkan `version` dan `android.versionCode` di `app.json`. `versionCode` wajib lebih besar dari rilis sebelumnya, kalau tidak ponsel menolak memasang pembaruan.
2. Siapkan keystore rilis (lihat bagian berikut), lalu build:

   ```bash
   npm run apk
   ```

3. Salin `android/app/build/outputs/apk/release/app-release.apk` ke `apps/web/public/download/spaces-android.apk`.
4. Perbarui `apps/web/src/release.ts` (versi, ukuran, tanggal).
5. Commit, lalu deploy seperti biasa (branch `prod`).

APK hanya berisi arsitektur `arm64-v8a`, yang dipakai hampir semua ponsel Android sejak 2017. Alasannya, Cloudflare membatasi file statis maksimal 25 MiB; APK dengan arsitektur 32-bit ikut berukuran sekitar 32 MB.

## Keystore rilis

Build rilis ditandatangani dengan keystore Spaces lewat plugin `plugins/withReleaseSigning.js`. Keystore dan password-nya **tidak** disimpan di repo; plugin membacanya dari variabel lingkungan:

```bash
export SPACES_UPLOAD_STORE_FILE=/path/absolut/ke/spaces-upload.jks
export SPACES_UPLOAD_STORE_PASSWORD='...'
export SPACES_UPLOAD_KEY_ALIAS=spaces
export SPACES_UPLOAD_KEY_PASSWORD='...'
```

Tanpa variabel ini, build jatuh ke kunci debug. Hasilnya hanya untuk uji dan tidak bisa memperbarui aplikasi yang sudah terpasang di ponsel user.

**Jangan sampai keystore hilang.** Android hanya mau memasang pembaruan yang ditandatangani kunci yang sama. Kalau keystore hilang, semua user harus uninstall lalu install ulang. Keystore yang sama juga dipakai kalau nanti aplikasi masuk Google Play.

Catatan lain:

- Build rilis hanya bisa terhubung lewat HTTPS.
- Nama paket `com.freasey.spaces` ada di `app.json` dan tidak bisa diganti setelah aplikasi masuk Google Play.

## iOS

Kode aplikasinya sudah lintas-platform. Build iOS butuh macOS dengan Xcode (`npm run ios`) atau EAS Build, serta akun Apple Developer.

## Pemeriksaan

```bash
npm run typecheck
```

Ikon aplikasi dibuat dari logo dengan `npm run icons` (butuh Playwright).
