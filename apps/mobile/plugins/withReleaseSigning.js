// Menandatangani build rilis Android dengan keystore milik Spaces, bukan kunci debug.
//
// Keystore dan password-nya TIDAK disimpan di repo. Saat build, nilainya dibaca dari
// variabel lingkungan:
//   SPACES_UPLOAD_STORE_FILE      path absolut ke file .jks
//   SPACES_UPLOAD_STORE_PASSWORD  password keystore
//   SPACES_UPLOAD_KEY_ALIAS       alias kunci
//   SPACES_UPLOAD_KEY_PASSWORD    password kunci
// Kalau variabel itu tidak ada, build rilis jatuh ke kunci debug (hanya untuk uji).
const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING = `
        release {
            def storePath = System.getenv("SPACES_UPLOAD_STORE_FILE")
            if (storePath) {
                storeFile file(storePath)
                storePassword System.getenv("SPACES_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("SPACES_UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("SPACES_UPLOAD_KEY_PASSWORD")
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("SPACES_UPLOAD_STORE_FILE")) return cfg;
    src = src.replace(/signingConfigs \{\n(\s*debug \{[\s\S]*?\n\s*\})/, (m) => `${m}${SIGNING}`);
    src = src.replace(
      /(release \{\n(?:\s*\/\/.*\n)*)\s*signingConfig signingConfigs\.debug/,
      `$1            signingConfig System.getenv("SPACES_UPLOAD_STORE_FILE") ? signingConfigs.release : signingConfigs.debug`,
    );
    if (!src.includes('signingConfigs.release : signingConfigs.debug')) {
      throw new Error("withReleaseSigning: pola build.gradle tidak dikenali, perbarui plugin ini.");
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
