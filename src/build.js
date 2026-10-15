/* 本番用のビルド：Cloudflare Pages が push のたびに実行する
   node src/build.js  →  dist/ にサイト一式ができる */
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), DIST = path.join(ROOT, "dist");
const SITE = process.env.SITE_URL || "https://kurabelle.com";
// 楽天アフィリエイトIDはリンクにそのまま出る値なので、ここに書いてよい。アプリIDは Cloudflare の環境変数 RAKUTEN_APP_ID に入れる
process.env.RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || "588643c2.b560f3b3.588643c3.4dd69634";
fs.rmSync(DIST, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(__dirname, "gen.js"), path.join(ROOT, "data/products.json"), DIST, "--site", SITE], { stdio: "inherit", env: process.env });
fs.mkdirSync(path.join(DIST, "app"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "app/index.html"), path.join(DIST, "app/index.html"));
fs.copyFileSync(path.join(ROOT, "data/products.json"), path.join(DIST, "app/products.json"));
console.log("built:", DIST);
