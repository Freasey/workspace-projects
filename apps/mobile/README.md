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

Workflow `.github/workflows/android-release.yml` membuat APK bertanda tangan keystore Spaces, memeriksa sidik jari sertifikatnya, lalu mengunggahnya ke **Vercel Blob**. Alamat Blob itu ditulis ke info rilis (`apps/web/src/release.ts`, dipakai tombol unduh di halaman utama) dan ke `apps/web/public/_redirects`, supaya alamat lama `https://spaces.worksell.id/download/spaces-android.apk` tetap mengarah ke APK terbaru. Hanya kedua file itu yang di-commit ke branch yang dipilih; APK tidak disimpan di git. Deploy web berjalan seperti biasa dari commit itu.

**Sekali saja: isi GitHub Secrets.** Di GitHub: repo → Settings → Secrets and variables → Actions → New repository secret.

| Nama secret | Isi |
|---|---|
| `SPACES_UPLOAD_KEYSTORE_BASE64` | File `.jks` dalam base64: `base64 -w0 spaces-upload.jks` (Linux) atau `base64 -i spaces-upload.jks` (macOS) |
| `SPACES_UPLOAD_STORE_PASSWORD` | Password keystore |
| `SPACES_UPLOAD_KEY_ALIAS` | Alias kunci |
| `SPACES_UPLOAD_KEY_PASSWORD` | Password kunci |
| `BLOB_READ_WRITE_TOKEN` | Token baca-tulis Vercel Blob store (Vercel → Storage → store → Settings/.env.local). Store harus mengizinkan akses **public**, karena APK diunduh tanpa login. |

**Setiap rilis:**

1. Naikkan `version` dan `android.versionCode` di `app.json`, commit ke `dev`.
2. GitHub → Actions → **Rilis APK Android** → Run workflow → branch `dev`. Centang "gabungkan juga ke prod" kalau langsung dirilis ke produksi.
3. Workflow gagal dengan pesan jelas kalau secret belum diisi, kalau APK ditandatangani kunci lain, atau kalau unggahan ke Blob gagal. APK tidak pernah sampai ke web dalam keadaan itu.
4. Tiap rilis mendapat alamat Blob sendiri (nama berisi versi plus akhiran acak), jadi cache tidak pernah menyajikan APK lama. File rilis lama tetap ada di Blob; hapus manual dari dashboard Vercel kalau perlu.

## Merilis APK baru secara manual

Hanya kalau GitHub Actions tidak bisa dipakai.

1. Naikkan `version` dan `android.versionCode` di `app.json`. `versionCode` wajib lebih besar dari rilis sebelumnya, kalau tidak ponsel menolak memasang pembaruan.
2. Siapkan keystore rilis (lihat bagian berikut), lalu build:

   ```bash
   npm run apk
   ```

3. Unggah `android/app/build/outputs/apk/release/app-release.apk` ke Vercel Blob (public), misalnya lewat dashboard Vercel.
4. Isi alamatnya di `apps/web/src/release.ts` (beserta versi, ukuran, tanggal) dan di `apps/web/public/_redirects`.
5. Commit, lalu deploy seperti biasa (branch `prod`).

APK hanya berisi arsitektur `arm64-v8a`, yang dipakai hampir semua ponsel Android sejak 2017, dan pustaka native disimpan terkompresi (`plugins/withSmallApk.js`) supaya unduhannya kecil.

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
