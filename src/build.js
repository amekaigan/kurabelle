/* 本番用のビルド：Cloudflare Pages が push のたびに実行する
   node src/build.js  →  dist/ にサイト一式ができる */
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), DIST = path.join(ROOT, "dist");
const SITE = process.env.SITE_URL || "https://kurabelle.com";
// 楽天アフィリエイトIDはリンクにそのまま出る値なので、ここに書いてよい。アプリIDは Cloudflare の環境変数 RAKUTEN_APP_ID に入れる
process.env.RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || "588643c2.b560f3b3.588643c3.4dd69634";
fs.rmSync(DIST, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(__dirname, "gen.js"), path.join(ROOT, "data/products.json"), DIST, "--site", SITE, "--app", path.join(ROOT, "app/index.html")], { stdio: "inherit", env: process.env });
// いつ作ったサイトかを記録（自動の反映が動いているかの確認に使う）
fs.writeFileSync(path.join(DIST, "version.txt"), `built ${new Date().toISOString()} ${process.env.CF_PAGES_COMMIT_SHA || ""}\n`);
console.log("built:", DIST);
