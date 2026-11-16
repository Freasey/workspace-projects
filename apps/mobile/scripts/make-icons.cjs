// Membuat ikon aplikasi dari logo Spaces. Jalankan: node scripts/make-icons.cjs
const { chromium } = require("playwright");
const path = require("path");

const tiles = (c1, c2, door) => `
  <rect x="143" y="143" width="344" height="344" rx="56" fill="${c1}"/>
  <rect x="143" y="537" width="344" height="344" rx="56" fill="${c1}"/>
  <rect x="537" y="537" width="344" height="344" rx="56" fill="${c1}"/>
  <rect x="537" y="143" width="344" height="344" rx="56" fill="${c2}"/>
  ${door ? `<path fill="${door}" d="M621 407V220a14 14 0 0 1 14-14h146a14 14 0 0 1 14 14v12H647v175z"/>
  <path fill="${door}" stroke="${door}" stroke-width="12" stroke-linejoin="round" d="M687 268l102-36v165l-102 35z"/>` : ""}`;

// scale: bagian kanvas yang ditempati logo (ikon adaptif butuh zona aman ~60%).
const svg = (inner, scale, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${inner}</g></svg>`;

const files = {
  "icon.png": svg(tiles("#332AAA", "#8058FC", "#fff"), 0.82, "#ffffff"),
  "android-icon-foreground.png": svg(tiles("#332AAA", "#8058FC", "#fff"), 0.52, null),
  "android-icon-background.png": svg("", 1, "#ffffff"),
  "android-icon-monochrome.png": svg(tiles("#000", "#000", null), 0.52, null),
  "splash-icon.png": svg(tiles("#332AAA", "#8058FC", "#fff"), 0.9, null),
  "favicon.png": svg(tiles("#332AAA", "#8058FC", "#fff"), 1, null),
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [name, markup] of Object.entries(files)) {
    await page.setContent(`<body style="margin:0;background:transparent">${markup}</body>`);
    await page.screenshot({ path: path.join(__dirname, "..", "assets", name), omitBackground: true });
  }
  await browser.close();
})();
