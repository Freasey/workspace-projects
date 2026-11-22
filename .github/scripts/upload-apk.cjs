// Mengunggah APK rilis ke Vercel Blob dan menulis alamat publiknya ke $GITHUB_ENV (APK_URL).
// Dijalankan oleh workflow "Rilis APK Android". Token dibaca dari BLOB_READ_WRITE_TOKEN.
const fs = require("fs");
const path = require("path");
const { put } = require(path.join(process.env.RUNNER_TEMP, "blob/node_modules/@vercel/blob"));

async function main() {
  const file = process.env.APK_BUILT;
  const app = JSON.parse(fs.readFileSync("apps/mobile/app.json", "utf8")).expo;
  // Nama memuat versi; akhiran acak membuat tiap unggahan punya alamat sendiri,
  // jadi cache CDN tidak pernah menyajikan APK lama di alamat baru.
  const pathname = `android/spaces-android-${app.version}-${app.android.versionCode}.apk`;
  const blob = await put(pathname, fs.readFileSync(file), {
    access: "public",
    addRandomSuffix: true,
    multipart: true,
    contentType: "application/vnd.android.package-archive",
  });
  fs.appendFileSync(process.env.GITHUB_ENV, `APK_URL=${blob.url}\n`);
  console.log(`Terunggah: ${blob.url}`);
}

main().catch((e) => {
  console.error(`::error::Gagal mengunggah ke Vercel Blob: ${e.message}`);
  process.exit(1);
});
