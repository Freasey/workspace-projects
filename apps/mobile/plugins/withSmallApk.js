// Memperkecil APK yang diunduh dari web. Cloudflare menolak file statis di atas 25 MiB.
//
// - expo.useLegacyPackaging=true: pustaka native (.so) disimpan terkompresi di APK.
//   Tanpa ini .so disimpan mentah supaya bisa dimuat langsung, yang menambah beberapa
//   MB. APK kita dipasang manual (bukan lewat Play Store), jadi kompresi aman.
// - android.enableShrinkResourcesInReleaseBuilds=true: resource yang tidak terpakai
//   dibuang. Butuh R8 (enableMinifyInReleaseBuilds), yang sudah aktif.
const { withGradleProperties } = require("expo/config-plugins");

const PROPS = {
  "expo.useLegacyPackaging": "true",
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

module.exports = function withSmallApk(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const item = cfg.modResults.find((p) => p.type === "property" && p.key === key);
      if (item) item.value = value;
      else cfg.modResults.push({ type: "property", key, value });
    }
    return cfg;
  });
};
