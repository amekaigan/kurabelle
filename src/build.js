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
// 外した・まとめた商品の古いURLの案内（data/redirects.txt → Cloudflare Pages の _redirects）
const RED = path.join(ROOT, "data/redirects.txt");
// 手で書いた転送を先に、作り直しで消えたページの自動の転送（gen.js が作る _redirects-auto）を後ろに並べる（先に書いたほうが優先される）
const AUTO = path.join(DIST, "_redirects-auto");
fs.writeFileSync(path.join(DIST, "_redirects"), (fs.existsSync(RED) ? fs.readFileSync(RED, "utf8").replace(/\n*$/, "\n") : "") + (fs.existsSync(AUTO) ? fs.readFileSync(AUTO, "utf8") : ""));
if (fs.existsSync(AUTO)) fs.rmSync(AUTO);
// いつ作ったサイトかを記録（自動の反映が動いているかの確認に使う）
fs.writeFileSync(path.join(DIST, "version.txt"), `built ${new Date().toISOString()} ${process.env.CF_PAGES_COMMIT_SHA || ""}\n`);
console.log("built:", DIST);
