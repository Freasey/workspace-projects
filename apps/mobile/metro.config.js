// Paket bersama (tipe dan konstanta) berada di luar folder aplikasi ini,
// jadi Metro perlu diberi tahu letaknya.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const shared = path.resolve(__dirname, "../../packages/shared");
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), "@app/shared": shared };

module.exports = config;
