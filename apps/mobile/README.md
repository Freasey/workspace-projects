# Spaces Mobile

Aplikasi mobile Spaces untuk Android (iOS menyusul dari kode yang sama). React Native + Expo + TypeScript, memakai API yang sama dengan versi web (`/api/v1`).

## Isi aplikasi

| Layar | Isi |
|---|---|
| Masuk | Email, password, alamat server. Ganti password sementara diwajibkan saat login pertama. |
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

## Menjalankan saat development

Butuh Node.js 20 ke atas. Untuk Android: JDK 17 dan Android SDK (`ANDROID_HOME`).

```bash
cd apps/mobile
```

```bash
npm install
```

Jalankan API lokal dari akar repo (`pnpm dev`), lalu:

```bash
npm run android
```

Di layar masuk, isi alamat server. Dari emulator Android, komputer sendiri beralamat `http://10.0.2.2:8787`. Dari ponsel sungguhan, pakai alamat IP komputer di jaringan yang sama.

## Alamat server

Alamat server bawaan ditanam saat build lewat variabel `EXPO_PUBLIC_API_URL`. Kalau diisi, user tidak perlu mengetik alamat server; kalau kosong, layar masuk memintanya.

## Membuat APK

```bash
EXPO_PUBLIC_API_URL=https://alamat-produksi-anda npm run apk
```

Hasilnya di `android/app/build/outputs/apk/release/app-release.apk`.

Catatan:

- APK hasil perintah di atas ditandatangani dengan kunci debug bawaan. Cukup untuk dipasang langsung dan diuji, tetapi **tidak bisa** diunggah ke Play Store. Untuk rilis, buat keystore sendiri dan simpan di luar repo (lihat dokumentasi Expo tentang app signing), atau pakai EAS Build.
- Build rilis hanya mengizinkan HTTPS. Alamat `http://` hanya jalan di build debug.
- Nama paket `com.freasey.spaces` ada di `app.json`. Tentukan nama paket final sebelum rilis pertama ke Play Store, karena setelah itu tidak bisa diganti.
- Setiap rilis baru: naikkan `version` dan `android.versionCode` di `app.json`.

## iOS

Kode aplikasinya sudah lintas-platform. Build iOS butuh macOS dengan Xcode (`npm run ios`) atau EAS Build, serta akun Apple Developer.

## Pemeriksaan

```bash
npm run typecheck
```

Ikon aplikasi dibuat dari logo dengan `npm run icons` (butuh Playwright).
