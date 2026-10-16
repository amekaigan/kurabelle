#!/usr/bin/env node
/* クラベル（kurabelle.com）静的サイト生成
   使い方: node src/gen.js <products.json> <出力フォルダ> [--site https://example.com]
   商品データから、トップ・カテゴリ・商品・成分・ブランド・目的別のページを作る。
   リンクはすべて相対パス（どこに置いても動く）。--site を渡すと canonical と sitemap.xml に使う。 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const C = require("./core.js");

const [, , SRC, OUT, ...rest] = process.argv;
if (!SRC || !OUT) { console.error("usage: gen.js products.json outdir [--site URL]"); process.exit(1); }
const SITE = rest.includes("--site") ? (rest[rest.indexOf("--site") + 1] || "").replace(/\/$/, "") : "";
// 楽天の画像は、Cloudflare に RAKUTEN_APP_ID が入っているときだけ出す（鍵は functions/api/rk.js だけが使い、ページには出さない）
const RK_ON = !!process.env.RAKUTEN_APP_ID;
const PREVIEW = rest.includes("--preview"); // ファイルを直接開く見本用：リンクの末尾に index.html を付ける
const DATA = JSON.parse(fs.readFileSync(SRC, "utf8"));
const PRODUCTS = DATA.products;
const UPDATED = DATA.updated || "";
const SITE_NAME = "クラベル";
const OPERATOR_OK = false; // 「運営者より」の文章をユーザーが確かめたら true（それまでは見本にだけ出す）

/* 手書き風の絵（src/hand.json。作り直しは npm run hand）。ページで使っているものだけを埋め込む */
const HAND = JSON.parse(fs.readFileSync(path.join(__dirname, "hand.json"), "utf8"));
const SYM = new Map([...HAND.symbols.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)].map(m => [m[1], m[0]]));
const sprite = (html, extra = []) => { const ids = [...new Set([...[...html.matchAll(/href="#([a-z][\w-]*)"/g)].map(m => m[1]), ...extra])].filter(id => SYM.has(id));
  return ids.length ? `<svg class="sprite kb-sprite" aria-hidden="true" focusable="false"><defs>${ids.map(id => SYM.get(id)).join("")}</defs></svg>` : ""; };
const PH = { shampoo: "ph-bottle", colorrinse: "ph-bottle", skincare: "ph-jar", facewash: "ph-tube" };

/* ---------- 共通 ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hid = (pre, s) => pre + crypto.createHash("sha1").update(C.norm(s)).digest("hex").slice(0, 8); // 名前から決まる短いID（毎回同じ）
const slug = s => String(s).replace(/[^A-Za-z0-9_-]/g, "-");
const CAT_N = { shampoo: "シャンプー", skincare: "保湿クリーム・乳液", facewash: "洗顔料", colorrinse: "カラーリンス・白髪染め" };
const CAT_ORDER = ["shampoo", "skincare", "facewash", "colorrinse"];
const KIND_N = { quasi: "医薬部外品", cosme: "化粧品" };
const TARGET_N = { men: "メンズ向け", women: "レディース向け", all: "" };
const ROLE_N = r => (C.ROLES[r] || C.ROLES.unk).n;
const ROLE_C = r => (C.ROLES[r] && C.ROLES[r].c) || "--line2";
const TAG_EXPLAIN = {
  strongSurf: "洗浄力の強い洗浄成分（硫酸系など）", midSurf: "中程度の洗浄成分", mildSurf: "やさしい洗浄成分（アミノ酸系・ベタイン系・糖系など）",
  cond: "髪の指通りをよくする", repair: "髪の補修", scalp: "頭皮をすこやかに保つ", scalpA: "医薬部外品で有効成分になることがある殺菌成分",
  sebum: "皮脂を取り除く", hum1: "基本の保湿剤", hum2: "高機能な保湿成分", occS: "水分の蒸発を防ぐ強い保護油", occM: "一般的な油分", light: "軽い使用感を出す",
  beauty: "美容成分", extract: "植物などのエキス", fragrance: "香料", essoil: "精油", alcohol: "アルコール（エタノール）", uvabs: "紫外線吸収剤",
  silicone: "シリコーン", paraben: "パラベン類", mineral: "鉱物油", menthol: "清涼剤", colorant: "着色料・染料", preserv: "防腐剤", strongpres: "少量で効く防腐剤（イソチアゾリノン系）",
  dry: "乾燥", oily: "ベタつき", rough: "肌あれ", spot: "シミ", firm: "ハリ", sensitive: "刺激を感じやすい肌"
};
const FLAGS = [["fragrance", "香料"], ["silicone", "シリコーン"], ["strongSurf", "硫酸系など強めの洗浄成分"], ["paraben", "パラベン"], ["alcohol", "アルコール"], ["menthol", "メントール"], ["colorant", "着色料"], ["mineral", "鉱物油"]];

/* ---------- 解析 ---------- */
const P = PRODUCTS.map(p => {
  const a = C.analyzeText(p.ingredients);
  const names = [...new Set(a.items.map(i => i.name))];
  const tags = new Set(a.items.flatMap(i => i.tags));
  const cat = C.CATS[p.category];
  const sc = cat && cat.scored ? cat.score(a.items, null) : null;
  const ev = cat && cat.scored ? C.evaluate([p], p.category, null, () => a)[0] : null;
  return { p, a, names, tags, sc, match: ev ? ev.match : null, grade: ev ? ev.grade : null, url: `products/${slug(p.id)}/` };
});
const byId = new Map(P.map(x => [x.p.id, x]));

/* 成分：表示名ごとに集計 */
const ING = new Map();
P.forEach(x => x.a.items.forEach((it, idx) => {
  if (it.role === "unk") return;
  let g = ING.get(it.name);
  if (!g) { g = { name: it.name, role: it.role, tags: it.tags, desc: it.desc, src: it.src, aliases: new Set(), uses: [] }; ING.set(it.name, g); }
  g.aliases.add(C.norm(it.raw));
  if (!g.uses.some(u => u.x === x)) g.uses.push({ x, pos: idx + 1, of: x.a.items.length, active: it.active });
}));
/* ページを作る条件：辞書で役割が分かっていて、2商品以上に入っている（中身の薄いページを作らない） */
const ING_PAGES = [...ING.values()].filter(g => g.src === "dict" && g.uses.length >= 2 && g.role !== "base")
  .sort((a, b) => b.uses.length - a.uses.length || a.name.localeCompare(b.name, "ja"));
const ingUrl = new Map(ING_PAGES.map(g => [g.name, `ingredients/${hid("i-", g.name)}/`]));

/* ブランド：3商品以上 */
const BR = new Map();
P.forEach(x => { const b = x.p.brand || ""; if (!b) return; if (!BR.has(b)) BR.set(b, []); BR.get(b).push(x); });
const BRAND_PAGES = [...BR.entries()].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length);
const brandUrl = new Map(BRAND_PAGES.map(([b]) => [b, `brands/${hid("b-", b)}/`]));

/* 目的別（シャンプー） */
const SH = P.filter(x => x.p.category === "shampoo");
const CONCERNS = [
  { id: "amino", n: "アミノ酸系など、やさしい洗浄成分が主のシャンプー", short: "やさしい洗浄成分が主",
    lead: "最初に出てくる洗浄成分（主洗浄成分）が、アミノ酸系・ベタイン系・タウリン系・糖系などのやさしい洗浄成分のシャンプーです。",
    rule: "成分表で最初に出てくる洗浄成分が「やさしい洗浄成分」に分類されるもの。医薬部外品は表示順が配合量の順とは限らないため目安です。",
    pick: x => x.sc && x.sc.mainSurf && x.sc.mainSurf.kind === "mild", sort: "mild" },
  { id: "sulfate-free", n: "硫酸系の洗浄成分が入っていないシャンプー", short: "硫酸系なし",
    lead: "ラウレス硫酸Na・ラウリル硫酸Naなど、洗浄力の強い硫酸系の洗浄成分を含まないシャンプーです。",
    rule: "成分表に、硫酸系など洗浄力の強い洗浄成分として分類される成分が1つもないもの。", pick: x => !x.tags.has("strongSurf"), sort: "mild" },
  { id: "non-silicone", n: "シリコーンが入っていないシャンプー（ノンシリコン）", short: "ノンシリコン",
    lead: "ジメチコン・アモジメチコンなどのシリコーンを含まないシャンプーです。シリコーンが悪いわけではなく、指通りやまとまりの出し方が違います。",
    rule: "成分表に、シリコーンとして分類される成分が1つもないもの。", pick: x => !x.tags.has("silicone"), sort: "smooth" },
  { id: "fragrance-free", n: "香料が入っていないシャンプー", short: "香料なし",
    lead: "成分表に「香料」がないシャンプーです。精油（植物の油）で香りをつけているものは別に印を付けています。",
    rule: "成分表に香料として分類される成分がないもの。", pick: x => !x.tags.has("fragrance"), sort: "gentle" },
  { id: "dandruff", n: "フケ・かゆみを防ぐ有効成分が入った薬用シャンプー", short: "フケ・かゆみ",
    lead: "医薬部外品（薬用）で、ピロクトンオラミン・グリチルリチン酸2K・サリチル酸など、フケ・かゆみや頭皮のあれを防ぐ成分を有効成分としているシャンプーです。",
    rule: "医薬部外品で、有効成分に頭皮ケアの成分があるもの。効能は各商品の表示で確かめてください。",
    pick: x => x.p.kind === "quasi" && x.a.items.some(i => i.active && (i.tags.includes("scalp") || i.tags.includes("scalpA"))), sort: "scalp" },
  { id: "damage", n: "髪の補修成分が多いシャンプー", short: "補修成分が多い",
    lead: "ケラチン・シルク・セラミド・ペリセアなど、髪の補修成分が3種類以上入っているシャンプーです。",
    rule: "髪の補修成分として分類される成分が3種類以上あるもの。配合量は分かりません。",
    pick: x => x.a.items.filter(i => i.tags.includes("repair")).map(i => i.name).filter((v, i, s) => s.indexOf(v) === i).length >= 3, sort: "repair" },
  { id: "men", n: "メンズ向けシャンプー", short: "メンズ向け", lead: "メーカーが男性向けとしているシャンプーです。", rule: "商品の対象が男性向けのもの。", pick: x => x.p.target === "men", sort: "match" }
].map(c => ({ ...c, list: SH.filter(c.pick) })).filter(c => c.list.length >= 2);
const concernUrl = c => `concerns/${c.id}/`;

/* ---------- 悩みから選ぶ（メーカーの説明の言葉で集める） ---------- */
const descHas = (x, re) => re.test(x.p.desc || "");
const dandruff = CONCERNS.find(c => c.id === "dandruff");
const WORRIES = [
  { id: "smell", icon: "i-smell", short: "頭皮のにおい", hint: "汗臭・ニオイの表示", n: "頭皮のにおいが気になるときのシャンプー",
    lead: "メーカーが、においへの配慮を説明に書いているシャンプーです。医薬部外品（薬用）には「汗臭を防ぐ」などの効能が認められたものがあります。",
    rule: "メーカーの説明に「汗臭」「ニオイ」などの言葉があるシャンプー。効能は各商品の表示で確かめてください。点数はにおいへの効果を表すものではありません。",
    pick: x => x.p.category === "shampoo" && descHas(x, /臭|ニオイ|におい/) },
  { id: "volume", icon: "i-volume", short: "髪のボリューム", hint: "ハリ・コシ・ふんわり", n: "髪のボリュームが気になるときのシャンプー",
    lead: "メーカーが「ハリ・コシ」「ふんわり」「ボリューム」などを説明に書いているシャンプーです。",
    rule: "メーカーの説明に「ボリューム」「ハリ」「コシ」「ふんわり」の言葉があるシャンプー。化粧品の「ハリ・コシを与える」は髪の手ざわりについての表現で、髪が増えることを意味するものではありません。",
    pick: x => x.p.category === "shampoo" && descHas(x, /ボリューム|ハリ|コシ|ふんわり/) },
  dandruff ? { id: "dandruff", icon: "i-flake", short: "フケ・かゆみ", hint: "医薬部外品が中心", n: dandruff.n, existing: true, list: dandruff.list } : null,
  { id: "oily", icon: "i-oil", short: "ベタつき・テカリ", hint: "皮脂に向けた商品", n: "皮脂のベタつき・テカリが気になるときの商品",
    lead: "メーカーが、皮脂やベタつきに向けた商品だと説明しているシャンプー・洗顔料・スキンケアです。",
    rule: "メーカーの説明に「皮脂」「ベタつき」「アブラ」「テカリ」の言葉がある商品。",
    pick: x => descHas(x, /皮脂|ベタつ|アブラ|テカリ/) },
  { id: "spot", icon: "i-spot", short: "シミ・ソバカス", hint: "防ぐと表示のある商品", n: "シミ・ソバカスを防ぐと表示のあるスキンケア",
    lead: "医薬部外品（薬用）で、「メラニンの生成を抑え、シミ・ソバカスを防ぐ」などの効能が表示されているスキンケアです。",
    rule: "メーカーの説明に「シミ」「ソバカス」「メラニン」の言葉がある、保湿クリーム・乳液・洗顔料。この効能は、できてしまったシミを消すという意味ではありません。",
    pick: x => (x.p.category === "skincare" || x.p.category === "facewash") && descHas(x, /シミ|メラニン|ソバカス|そばかす/) },
  { id: "dry", icon: "i-dry", short: "乾燥・小じわ", hint: "保湿クリーム・乳液", n: "乾燥・小じわが気になるときの保湿クリーム・乳液",
    lead: "メーカーが、乾燥やうるおいに向けた商品だと説明している保湿クリーム・乳液・ジェルです。",
    rule: "保湿クリーム・乳液のうち、メーカーの説明に「乾燥」「小じわ」「うるおい」「潤い」の言葉があるもの。化粧品で「乾燥による小じわを目立たなくする」と表示するには、決められた試験で確かめる必要があります。",
    pick: x => x.p.category === "skincare" && descHas(x, /乾燥|小じわ|うるお|潤い/) }
].filter(Boolean).map(w => w.existing ? w : { ...w, list: P.filter(w.pick) }).filter(w => w.list.length >= 2);
const worryUrl = w => `concerns/${w.id}/`;

/* ---------- 書き出し ---------- */
const PAGES = [];
function rel(from, to) { // from, to: サイトのルートからのパス（"products/x/" など）
  const depth = from.split("/").filter(Boolean).length;
  const t = PREVIEW && (to === "" || to.endsWith("/")) ? to + "index.html" : to;
  return "../".repeat(depth) + t;
}
/* 全ページ共通のヘッダー・フッター（比較ツールにも同じものを差し込む） */
const MENU_SHORT = { volume: "ボリューム", oily: "ベタつき", spot: "シミ" }; // メニューの狭い枠に入る短い名前
const QUIZ_N = 7; // 比較ツールの診断の質問数（シャンプー・保湿クリームとも7問）
function chrome(r, cur) {
  const on = u => (u === "" ? cur === "" : cur.startsWith(u)) ? ' aria-current="page"' : "";
  const logo = `<a class="kb-logo" href="${r("")}"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#mark"/></svg>クラベル<span>kurabelle</span></a>`;
  const cats = CAT_ORDER.filter(c => P.some(x => x.p.category === c));
  const menu = `<details class="kb-menu"><summary>メニュー</summary><div class="panel">
<a class="mi" href="${r("")}"${on("")}>トップ</a>
<p class="mh">悩みから選ぶ</p><div class="mg">${WORRIES.map(w => `<a href="${r(worryUrl(w))}"${on(worryUrl(w))}><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${w.icon}"/></svg>${esc(MENU_SHORT[w.id] || w.short)}</a>`).join("")}</div>
<a class="mi quiz" href="${r("app/")}"${on("app/")}><b>迷ったら診断</b><span>${QUIZ_N}問・1分ほど</span></a>
<p class="mh">種類から選ぶ</p>${cats.map(c => `<a class="mi" href="${r(`categories/${c}/`)}"${on(`categories/${c}/`)}>${esc(CAT_N[c])}<i>${P.filter(x => x.p.category === c).length}件</i></a>`).join("")}
<p class="mh">ほかの探し方</p>
<a class="mi" href="${r("")}#q">商品名・成分名で調べる</a>
<a class="mi" href="${r("concerns/")}"${cur === "concerns/" ? ' aria-current="page"' : ""}>成分の条件から選ぶ<i>硫酸系なしなど</i></a>
<a class="mi" href="${r("ingredients/")}"${on("ingredients/")}>成分の一覧<i>${ING_PAGES.length}種類</i></a>
<a class="mi" href="${r("brands/")}"${on("brands/")}>ブランドの一覧<i>${BR.size}ブランド</i></a>
<a class="mi" href="${r("")}#favs">お気に入り</a>
<p class="mh">クラベルについて</p>
<a class="mi" href="${r("about/")}"${cur === "about/" ? ' aria-current="page"' : ""}>クラベルとは</a>
<a class="mi" href="${r("about/scoring/")}"${on("about/scoring/")}>点数のつけ方</a>
<a class="mi" href="${r("about/")}#ad">広告について</a>
</div></details>`;
  const head = `<header class="kb-top"><div class="in">${logo}
<nav class="kb-nav" aria-label="おもなページ"><a href="${r("concerns/")}"${on("concerns/")}>悩みから選ぶ</a><a href="${r("app/")}"${on("app/")}>診断</a><a href="${r("ingredients/")}"${on("ingredients/")}>成分</a><a href="${r("about/")}"${on("about/")}>クラベルとは</a></nav>
${menu}
</div></header>`;
  const foot = `<footer class="kb-foot"><div class="in">
${logo}
<nav aria-label="サイトの案内"><a href="${r("")}">トップ</a><a href="${r("concerns/")}">悩み・目的から選ぶ</a><a href="${r("app/")}">診断つきの比較ツール</a>${cats.map(c => `<a href="${r(`categories/${c}/`)}">${esc(CAT_N[c])}</a>`).join("")}<a href="${r("ingredients/")}">成分の一覧</a><a href="${r("brands/")}">ブランド</a><a href="${r("about/")}">クラベルとは</a><a href="${r("about/scoring/")}">点数のつけ方</a></nav>
<p>成分表示は、メーカーの製品ページ・販売ページ・パッケージの記載をそのまま写しています。リニューアルで成分が変わることがあるため、商品ごとに出典と確認日を載せています。</p>
<p>点数は、成分表から読み取れる処方の傾向を、決まったルールで数えたものです。配合量・使い心地・効果を表すものではなく、髪や肌に合うかどうかには個人差があります。医薬部外品の効能は、各商品の表示で確かめてください。</p>
${RK_ON || PREVIEW ? `<p>商品画像と販売ページへのリンクは、楽天ウェブサービスから提供されています。<a href="https://webservice.rakuten.co.jp/" rel="noopener" target="_blank">Supported by Rakuten Developers</a></p>` : ""}
<p>商品データ ${PRODUCTS.length}件・最終更新 ${esc(UPDATED)}</p>
</div></footer>`;
  return { head, foot };
}
/* 各ページの下に置く「迷ったら診断」 */
const quizCta = (r, cat) => `<aside class="quiz-cta" aria-label="診断の案内"><div class="sticky">
  <h2>迷ったら、<br>${QUIZ_N}つの質問で。</h2>
  <p>年代や${cat === "skincare" ? "肌" : "頭皮"}のタイプ、気になること、仕上がりの好みなどを選ぶと、成分表から合いそうな順に並べます。1分ほどで終わります。</p>
  <a href="${r("app/")}${cat === "skincare" ? "#skincare" : ""}">${cat === "skincare" ? "保湿クリームの" : "シャンプーの"}診断をはじめる</a>
</div></aside>`;
function write(p, title, desc, body, opts = {}) {
  const dir = path.join(OUT, p); fs.mkdirSync(dir, { recursive: true });
  const r = to => rel(p, to);
  const canon = SITE ? `${SITE}/${p}` : "";
  const crumbs = opts.crumbs || [];
  const ld = crumbs.length ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: SITE ? `${SITE}/${c[1]}` : undefined })) })}</script>` : "";
  const main = body(r);
  const root = "../".repeat(p.split("/").filter(Boolean).length) || "./";
  const { head, foot } = chrome(r, p);
  const html = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}${p ? "｜" + SITE_NAME : ""}</title>
<meta name="description" content="${esc(desc)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${p ? "article" : "website"}"><meta property="og:site_name" content="${SITE_NAME}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@600&text=${encodeURIComponent("全成分ここ大事5.0やさしさ")}&display=swap">
<link rel="stylesheet" href="${r("assets/site.css")}"><link rel="stylesheet" href="${r("assets/chrome.css")}">
${ld}
</head><body>
${sprite(head + main, opts.sym || [])}
${head}
<main class="wrap">
${crumbs.length > 1 ? `<nav class="crumbs" aria-label="現在地">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${r(c[1])}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join("<i>›</i>")}</nav>` : ""}
${main}
${p && !opts.noQuiz ? quizCta(r, opts.cat) : ""}
</main>
${foot}
<script>window.KB={root:${JSON.stringify(root)},pv:${PREVIEW}}</script><script src="${r("assets/kb.js")}" defer></script>
${RK_ON ? `<script>window.RK={api:${JSON.stringify(root + "api/rk")}}</script><script src="${r("assets/rk.js")}" defer></script>` : ""}
</body></html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
  PAGES.push(p);
}

/* ---------- 部品 ---------- */
const chips = x => `<span class="chip">${KIND_N[x.p.kind] || ""}</span>${TARGET_N[x.p.target] ? `<span class="chip">${TARGET_N[x.p.target]}</span>` : ""}${x.p.volume ? `<span class="chip mono">${x.p.volume}${esc(x.p.unit || "")}</span>` : ""}`;
const mix = x => { const cnt = {}; x.a.items.forEach(i => { const r = C.compRole(i); cnt[r] = (cnt[r] || 0) + 1; });
  return `<div class="mix" aria-hidden="true">${C.ROLE_ORDER.filter(r => cnt[r]).map(r => `<span style="flex:${cnt[r]};background:var(${ROLE_C(r)})"></span>`).join("")}</div>`; };
const rkKey = x => x.p.jan || `${x.p.brand || ""} ${x.p.name}`.trim();
const imgSlot = (x, cls) => `<span class="${cls}" data-rk="${esc(rkKey(x))}"${x.p.jan ? ' data-jan="1"' : ""}><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#${PH[x.p.category] || "ph-bottle"}"/></svg></span>`;
const scoreBadge = x => x.match == null ? "" : `<span class="score"><b class="mono">${x.match}</b><i class="g g-${x.grade}">${x.grade}</i></span>`;
function productCard(x, r, extra, opt = {}) {
  const ms = x.sc && x.sc.mainSurf ? `主洗浄成分 ${esc(x.sc.mainSurf.name)}・` : "";
  const meta = opt.posOnly ? extra : `${ms}${x.a.items.length}成分${extra ? "・" + extra : ""}`;
  return `<a class="pcard" href="${r(x.url)}"><div class="pc-top">${imgSlot(x, "thumb")}<div class="pc-name"><span class="brand">${esc(x.p.brand || "")}</span><b>${esc(x.p.name)}</b></div>${scoreBadge(x)}</div>
  ${mix(x)}<div class="pc-meta">${chips(x)}<span class="small muted">${meta}</span></div></a>`;
}
function themesBlock(x) {
  if (!x.sc) return "";
  const T = C.CATS[x.p.category].themes;
  return `<div class="themes">${T.map(t => `<div class="th"><span class="tn">${t.n}</span><span class="bar"><i style="width:${x.sc.v[t.k] / 5 * 100}%"></i></span><span class="tv mono">${x.sc.v[t.k].toFixed(1)}</span><span class="why">${esc(x.sc.why[t.k])}</span></div>`).join("")}</div>`;
}
/* ---------- 成分から見たタイプ（レーダーグラフ） ---------- */
const AX_LABEL = {
  shampoo: { mild: "やさしい洗浄", clean: "洗浄力", scalp: "頭皮ケア", repair: "髪の補修", smooth: "指通り", gentle: "低刺激" },
  skincare: { moist: "うるおい", barrier: "保護（フタ）", light: "軽さ", beauty: "美容成分", concern: "悩み対応", gentle: "低刺激" }
};
const CAT_AVG = {}, CAT_RANK = {};
Object.keys(C.CATS).filter(k => C.CATS[k].scored).forEach(cat => {
  const L = P.filter(x => x.p.category === cat && x.sc);
  if (!L.length) return;
  CAT_AVG[cat] = {};
  C.CATS[cat].themes.forEach(t => CAT_AVG[cat][t.k] = L.reduce((a, x) => a + x.sc.v[t.k], 0) / L.length);
  const sorted = [...L].sort((a, b) => b.match - a.match);
  CAT_RANK[cat] = { n: L.length, rank: new Map(sorted.map((x, i) => [x, sorted.findIndex(y => y.match === x.match) + 1])) };
});
function typeOf(x) {
  const cat = x.p.category, T = C.CATS[cat].themes, L = AX_LABEL[cat] || {};
  const vals = T.map(t => ({ k: t.k, n: L[t.k] || t.s, v: x.sc.v[t.k] })).sort((a, b) => b.v - a.v);
  const max = vals[0].v;
  const top = vals.filter(a => a.v >= 3.5 && a.v >= max - 0.5).slice(0, 2);
  const low = vals[vals.length - 1];
  const avg = CAT_AVG[cat] || {};
  const above = T.filter(t => avg[t.k] != null && x.sc.v[t.k] > avg[t.k] + 0.01).length;
  return { top, low, above, total: T.length, title: top.length ? `${top.map(a => a.n).join("・")}寄り` : "控えめでシンプルな処方" };
}
function radarSVG(x) {
  const cat = x.p.category, T = C.CATS[cat].themes, L = AX_LABEL[cat] || {}, avg = CAT_AVG[cat] || {};
  const W = 360, H = 304, cx = 180, cy = 154, R = 104, n = T.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v / 5, cy + Math.sin(a) * R * v / 5]; };
  const poly = f => T.map((t, i) => pt(i, f(t)).map(z => z.toFixed(1)).join(",")).join(" ");
  const rings = [1, 2, 3, 4, 5].map(l => `<polygon points="${poly(() => l)}" class="rg${l === 5 ? " out" : ""}"/>`).join("");
  const spokes = T.map((t, i) => { const [ex, ey] = pt(i, 5); return `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" class="sp"/>`; }).join("");
  const labels = T.map((t, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, lx = cx + Math.cos(a) * (R + 26), ly = cy + Math.sin(a) * (R + 22);
    const anc = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    return `<text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="${anc}" class="ln">${esc(L[t.k] || t.s)}</text><text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${anc}" class="lv">${x.sc.v[t.k].toFixed(1)}</text>`; }).join("");
  const dots = T.map((t, i) => { const [px, py] = pt(i, x.sc.v[t.k]); return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" class="dt"/>`; }).join("");
  const hasAvg = Object.keys(avg).length;
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.map(t => `${L[t.k] || t.s} ${x.sc.v[t.k]}`).join("、"))}（5点満点）">
${rings}${spokes}${hasAvg ? `<polygon points="${poly(t => avg[t.k])}" class="avg"/>` : ""}<polygon points="${poly(t => x.sc.v[t.k])}" class="me"/>${dots}${labels}</svg>`;
}
function typeBlock(x, r) {
  if (!x.sc) return "";
  const cat = x.p.category, catN = CAT_N[cat] || cat, ty = typeOf(x), rk = CAT_RANK[cat];
  const rank = rk ? rk.rank.get(x) : null;
  return `<section class="type">
  <div class="type-head"><div><span class="lbl">成分から見たタイプ</span><b class="tt">${esc(ty.title)}</b></div>${scoreBadge(x)}</div>
  ${radarSVG(x)}
  <p class="legend small"><span class="lg me"></span>この商品<span class="lg avg"></span>${esc(catN)}の平均</p>
  <ul class="facts">
    ${rank ? `<li><span>総合</span><b class="mono">${rank}位</b><i>${esc(catN)}${rk.n}件中</i></li>` : ""}
    <li><span>平均より上</span><b class="mono">${ty.above}</b><i>${ty.total}つの観点のうち</i></li>
    <li><span>いちばん控えめ</span><b>${esc(ty.low.n)}</b><i>${ty.low.v.toFixed(1)}点</i></li>
  </ul>
  <p class="small muted">成分表に何が入っているかを、決まったルールで5点満点に数えたものです。効果や使い心地を表すものではありません。数え方は<a href="${r("about/scoring/")}">点数のつけ方</a>に、自分の髪や頭皮に合わせた順位は<a href="${r("app/")}">診断つきの比較ツール</a>にあります。</p>
</section>`;
}
function leadText(x) {
  const p = x.p, catN = CAT_N[p.category] || p.category;
  const spec = [KIND_N[p.kind], p.volume ? `${p.volume}${p.unit || ""}` : ""].filter(Boolean).join("・");
  let t = `${p.brand ? p.brand + "の" : ""}${catN}です${spec ? `（${spec}）` : ""}。`;
  if (x.sc && x.sc.mainSurf) t += `洗浄成分の中心は${x.sc.mainSurf.name}（${{ strong: "洗浄力が強めのタイプ", mid: "中くらいの洗浄力", mild: "やさしいタイプ" }[x.sc.mainSurf.kind]}）です。`;
  if (x.sc) { const ty = typeOf(x); t += ty.top.length ? `成分表から見ると「${ty.top.map(a => a.n).join("」と「")}」の点数が高く、「${ty.low.n}」はいちばん控えめです。` : "どの観点も控えめな、シンプルな処方です。"; }
  t += `全成分は${x.a.items.length}種類。`;
  return t;
}
function similar(x, n) {
  const A = new Set(x.names);
  return P.filter(y => y !== x && y.p.category === x.p.category).map(y => { const B = new Set(y.names); let i = 0; A.forEach(v => B.has(v) && i++); return { y, s: i / (A.size + B.size - i) }; })
    .sort((a, b) => b.s - a.s).slice(0, n);
}

/* 香り：成分表から分かること（香料・精油の有無）＋ メーカーの説明（scent 項目があれば） */
function scentBlock(x) {
  const ess = [...new Set(x.a.items.filter(i => i.tags.includes("essoil")).map(i => C.norm(i.raw)))];
  const fr = x.tags.has("fragrance");
  const fromLabel = fr && ess.length ? `香料と精油（${ess.map(esc).join("、")}）で香りをつけています。`
    : fr ? "香料で香りをつけています。" : ess.length ? `香料は入っていません。精油（${ess.map(esc).join("、")}）が入っています。` : "香料も精油も入っていません（無香料）。";
  const maker = x.p.scent ? `<p>メーカーの説明では「${esc(x.p.scent)}」です。</p>` : "";
  return `<p>${fromLabel}</p>${maker}<p class="small muted">香りの好みは人それぞれなので、点数には入れていません。成分表から分かるのは、香料や精油が入っているかどうかまでです。</p>`;
}
/* 使った感想：運営者が実際に使ったものだけ（reviews 項目）。点数とは分けて、個人の感想とはっきり書く */
function reviewBlock(x) {
  const rv = Array.isArray(x.p.reviews) ? x.p.reviews.filter(v => v && v.text) : [];
  if (!rv.length) return "";
  return `<section class="review"><h2>運営者が使ってみた感想</h2>${rv.map(v => `<div class="rv"><p>${esc(v.text)}</p>
    <dl>${v.scent ? `<div><dt>香り</dt><dd>${esc(v.scent)}</dd></div>` : ""}${v.feel ? `<div><dt>使い心地</dt><dd>${esc(v.feel)}</dd></div>` : ""}${v.period ? `<div><dt>使った期間</dt><dd>${esc(v.period)}</dd></div>` : ""}</dl>
    <p class="small muted">${esc(v.by || "運営者")}の個人の感想です${v.date ? `（${esc(v.date)}）` : ""}。髪質や好みによって感じ方は違います。</p></div>`).join("")}</section>`;
}

/* ---------- 商品ページ ---------- */
P.forEach(x => {
  const p = x.p, catN = CAT_N[p.category] || p.category;
  const crumbs = [["トップ", ""], [catN, `categories/${p.category}/`]];
  if (brandUrl.has(p.brand)) crumbs.push([p.brand, brandUrl.get(p.brand)]);
  crumbs.push([p.name, x.url]);
  const flags = FLAGS.map(([t, n]) => [n, x.tags.has(t)]);
  const s = p.source || {};
  const desc = `${p.name}の全成分${x.a.items.length}種類を、成分ごとの役割つきで一覧にしました。${x.sc && x.sc.mainSurf ? `主洗浄成分は${x.sc.mainSurf.name}。` : ""}香料・シリコーンなどの有無と、似た成分の商品も。`;
  write(x.url, `${p.name}の成分`, desc, r => `
<article class="prod">
  <p class="eyebrow">${esc(p.brand || "")}・${esc(catN)}</p>
  <div class="phead">${imgSlot(x, "pimg")}<div>
  <h1>${esc(p.name)} の成分</h1>
  <div class="row">${chips(x)}</div>
  <div class="acts"><button class="fav-btn" type="button" hidden aria-pressed="false" data-fav="${esc(JSON.stringify({ id: p.id, name: p.name, brand: p.brand || "", url: x.url, match: x.match, grade: x.grade, type: x.sc ? typeOf(x).title : "", ph: PH[p.category] || "ph-bottle" }))}">お気に入りに追加</button>${RK_ON || PREVIEW ? `<a class="rk-buy" data-rk-link="${esc(rkKey(x))}" hidden rel="sponsored noopener" target="_blank">楽天市場で見る</a>` : ""}</div>
  </div></div>
  <p class="lead">${esc(leadText(x))}</p>
  ${p.desc || p.scent ? `<div class="maker"><span class="lbl">メーカーの説明</span>${p.desc ? `<p>${esc(p.desc)}</p>` : ""}${p.scent ? `<p class="mk-scent"><b>香り</b>${esc(p.scent)}</p>` : ""}${p.infoSource && p.infoSource.url ? `<p class="small muted">出典：<a href="${esc(p.infoSource.url)}" rel="nofollow noopener" target="_blank">${esc((p.infoSource.url.split("/")[2] || "").replace(/^www\./, ""))}</a>（${esc(p.infoSource.date || "")}確認）。メーカーの説明を短くまとめたもので、効果を保証するものではありません。</p>` : ""}</div>` : ""}
  ${typeBlock(x, r)}
  ${reviewBlock(x)}
  <section><h2>全成分と、それぞれの役割</h2>
    <p class="small muted">${p.kind === "quasi" ? "医薬部外品は、有効成分とその他の成分に分けて表示されます。その他の成分は配合量の順とは限りません。" : "化粧品は、配合量の多い順に並びます（1%以下の成分は順不同）。"}</p>
    ${mix(x)}
    ${x.a.items.some(i => i.active) ? `<p class="small"><span class="actkey"></span>青い行は<b>有効成分</b>です。医薬部外品で、効能を表示するために配合が認められている成分です。</p>` : ""}
    <div class="scroll"><table class="ings"><thead><tr><th>#</th><th>成分名</th><th>役割</th></tr></thead><tbody>
    ${x.a.items.map((it, i) => { const u = ingUrl.get(it.name); const nm = esc(C.norm(it.raw));
      return `<tr${it.active ? ' class="act"' : ""}><td class="mono">${i + 1}</td><td>${u ? `<a href="${r(u)}">${nm}</a>` : nm}${it.active ? '<span class="chip acc">有効成分</span>' : ""}<span class="desc">${esc(it.desc || (it.role === "unk" ? "辞書にない成分" : ""))}</span></td><td><span class="role" style="--c:var(${ROLE_C(C.compRole(it))})">${esc(ROLE_N(C.compRole(it)))}</span></td></tr>`; }).join("")}
    </tbody></table></div>
  </section>
  <section><h2>香りと、よく気にされる成分</h2>
    ${scentBlock(x)}
    <p class="small muted">成分で商品を選ぶときによく確かめられる項目です。入っていること自体が良い・悪いということではありません。</p>
    <ul class="flags">${flags.map(([n, on]) => `<li class="${on ? "on" : "off"}"><span>${on ? "入っている" : "入っていない"}</span>${esc(n)}</li>`).join("")}</ul>
  </section>
  <section><h2>成分が似ている${esc(catN)}</h2><div class="plist">${similar(x, 4).map(({ y, s }) => productCard(y, r, `共通の成分 ${Math.round(s * 100)}%`)).join("")}</div></section>
  <p class="src">出典：${s.url ? `<a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.label || s.url)}</a>` : esc(s.label || "")}${s.date ? `（${esc(s.date)}確認）` : ""}${p.jan ? `　JAN ${esc(p.jan)}` : ""}${p.note ? `<br>${esc(p.note)}` : ""}</p>
</article>`, { crumbs, cat: p.category });
});

/* ---------- 成分ページ ---------- */
ING_PAGES.forEach(g => {
  const u = ingUrl.get(g.name);
  const others = [...g.aliases].filter(a => C.key(a) !== C.key(g.name));
  const tagTxt = g.tags.map(t => TAG_EXPLAIN[t]).filter(Boolean);
  const same = ING_PAGES.filter(h => h !== g && h.role === g.role).slice(0, 12);
  const top = g.uses.slice().sort((a, b) => a.pos / a.of - b.pos / b.of);
  const desc = `${g.name}は「${ROLE_N(g.role)}」の成分です。${g.desc}。${g.name}が入っている商品${g.uses.length}件と、成分表のどのあたりに書かれているかを一覧にしました。`;
  write(u, `${g.name}とは｜役割と入っている商品`, desc, r => `
<article>
  <p class="eyebrow">成分</p>
  <h1>${esc(g.name)}<span class="sub">とは</span></h1>
  <div class="row"><span class="role big" style="--c:var(${ROLE_C(g.role)})">${esc(ROLE_N(g.role))}</span>${tagTxt.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
  <p class="lead">${esc(g.desc)}。</p>
  ${others.length ? `<p class="small">別の表示名：${others.map(esc).join("、")}<br><span class="muted">化粧品と医薬部外品では、同じ成分でも表示名が違うことがあります。</span></p>` : ""}
  <section><h2>${esc(g.name)}が入っている商品（${g.uses.length}件）</h2>
    <p class="small muted">「◯番目／全◯成分」は成分表での位置です。化粧品では前のほうほど配合量が多い目安になります。医薬部外品は配合量の順とは限りません。「有効成分として配合」は、医薬部外品の有効成分として表示されているものです（有効成分は成分表の先頭に別枠で書かれるため、位置は出していません）。</p>
    <div class="plist">${top.map(({ x, pos, of, active }) => productCard(x, r, active ? `有効成分として配合（全${of}成分）` : `${pos}番目／全${of}成分`, { posOnly: true })).join("")}</div>
  </section>
  ${same.length ? `<section><h2>同じ「${esc(ROLE_N(g.role))}」の成分</h2><div class="tags">${same.map(h => `<a class="tagl" href="${r(ingUrl.get(h.name))}">${esc(h.name)}<span class="mono">${h.uses.length}</span></a>`).join("")}</div></section>` : ""}
  <p class="small muted">成分の説明は、成分表示の名前から分かる一般的な役割です。安全性や効果を評価したものではありません。</p>
</article>`, { crumbs: [["トップ", ""], ["成分", "ingredients/"], [g.name, u]] });
});

/* 成分の一覧 */
write("ingredients/", "成分の一覧｜シャンプー・スキンケアの成分を役割で調べる", `クラベルに登録した商品に2件以上入っている成分${ING_PAGES.length}種類を、洗浄・保湿・指通りなどの役割ごとに並べました。`, r => `
<h1>成分の一覧</h1><p class="lead">登録している商品のうち、2件以上に入っている成分です。役割ごとに、入っている商品の数が多い順に並べています。</p>
${C.ROLE_ORDER.filter(ro => ING_PAGES.some(g => g.role === ro)).map(ro => `<section><h2><span class="role big" style="--c:var(${ROLE_C(ro)})">${esc(ROLE_N(ro))}</span></h2><div class="tags">${ING_PAGES.filter(g => g.role === ro).map(g => `<a class="tagl" href="${r(ingUrl.get(g.name))}">${esc(g.name)}<span class="mono">${g.uses.length}</span></a>`).join("")}</div></section>`).join("")}`,
  { crumbs: [["トップ", ""], ["成分", "ingredients/"]] });

/* ---------- ブランド ---------- */
BRAND_PAGES.forEach(([b, list]) => {
  const u = brandUrl.get(b);
  const common = (() => { const cnt = new Map(); list.forEach(x => x.names.forEach(n => cnt.set(n, (cnt.get(n) || 0) + 1))); return [...cnt].filter(([n, c]) => c === list.length && ingUrl.has(n)).map(([n]) => n); })();
  write(u, `${b}の商品と成分`, `${b}の商品${list.length}件の成分を一覧で比べられます。全商品に共通する成分と、商品ごとの違いも。`, r => `
<h1>${esc(b)} の商品と成分</h1><p class="lead">登録している${esc(b)}の商品は${list.length}件です。</p>
${common.length ? `<section><h2>全商品に共通する成分</h2><div class="tags">${common.map(n => `<a class="tagl" href="${r(ingUrl.get(n))}">${esc(n)}</a>`).join("")}</div></section>` : ""}
<section><h2>商品</h2><div class="plist">${list.slice().sort((a, b) => (b.match || 0) - (a.match || 0)).map(x => productCard(x, r)).join("")}</div></section>`,
    { crumbs: [["トップ", ""], ["ブランド", "brands/"], [b, u]] });
});
write("brands/", "ブランドの一覧", `クラベルに登録した商品のブランド一覧です。`, r => `
<h1>ブランドの一覧</h1><p class="lead">商品が3件以上あるブランドは、ブランドのページで比べられます。</p>
<div class="tags">${[...BR.entries()].sort((a, b) => b[1].length - a[1].length).map(([b, l]) => brandUrl.has(b) ? `<a class="tagl" href="${r(brandUrl.get(b))}">${esc(b)}<span class="mono">${l.length}</span></a>` : `<span class="tagl plain">${esc(b)}<span class="mono">${l.length}</span></span>`).join("")}</div>`,
  { crumbs: [["トップ", ""], ["ブランド", "brands/"]] });



WORRIES.filter(w => !w.existing).forEach(w => {
  const u = `concerns/${w.id}/`;
  const sorted = w.list.slice().sort((a, b) => (b.match == null) - (a.match == null) || (b.match || 0) - (a.match || 0));
  write(u, w.n, `${w.lead} 登録している商品のうち${w.list.length}件。全成分を役割つきで比べられます。`, r => `
<div class="row" style="margin:0"><svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><use href="#${w.icon}"/></svg></div>
<h1>${esc(w.n)}</h1><p class="lead">${esc(w.lead)}</p>
<div class="rule"><b>この一覧に入る条件</b><p>${esc(w.rule)}</p><p class="small muted">登録している商品${P.length}件のうち、${w.list.length}件が当てはまります。並び順は成分の傾向スコアの高い順です（点数のない種類は後ろ）。</p></div>
<div class="plist">${sorted.map(x => productCard(x, r, CAT_N[x.p.category])).join("")}</div>`,
    { crumbs: [["トップ", ""], ["悩み・目的から選ぶ", "concerns/"], [w.short, u]] });
});

/* ---------- 目的別（成分の条件） ---------- */
CONCERNS.forEach(c => {
  const u = concernUrl(c);
  const sorted = c.list.slice().sort((a, b) => (c.sort === "match" ? b.match - a.match : (b.sc.v[c.sort] - a.sc.v[c.sort]) || (b.match - a.match)));
  const T = C.CATS.shampoo.themes.find(t => t.k === c.sort);
  const W = WORRIES.find(w => w.id === c.id);
  write(u, c.n, `${c.lead} 登録している${SH.length}件のうち${c.list.length}件が当てはまります。成分の役割つきで比べられます。`, r => `
${W ? `<div class="row" style="margin:0"><svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><use href="#${W.icon}"/></svg></div>` : ""}
<h1>${esc(c.n)}</h1><p class="lead">${esc(c.lead)}</p>
<div class="rule"><b>この一覧に入る条件</b><p>${esc(c.rule)}</p><p class="small muted">登録しているシャンプー${SH.length}件のうち、${c.list.length}件が当てはまります。${T ? `並び順は「${esc(T.n)}」の点数が高い順です。` : "並び順は成分の傾向スコアの高い順です。"}</p></div>
<div class="plist">${sorted.map(x => productCard(x, r, T ? `${T.s} ${x.sc.v[T.k].toFixed(1)}` : "")).join("")}</div>`,
    { crumbs: [["トップ", ""], ["悩み・目的から選ぶ", "concerns/"], [c.short, u]] });
});
const worryTiles = r => `<div class="worries">${WORRIES.map(w => `<a class="worry" href="${r(worryUrl(w))}"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${w.icon}"/></svg><b>${esc(w.short)}</b><i>${w.list.length}件</i></a>`).join("")}</div>`;
write("concerns/", "悩み・目的から選ぶ", "頭皮のにおい・髪のボリューム・フケかゆみ・ベタつき・シミ・乾燥などの悩みや、硫酸系なし・ノンシリコンなどの条件から、商品を成分で選べます。", r => `
<h1><span class="mk">悩み</span>・目的から選ぶ</h1><p class="lead">悩みの一覧は、メーカーの説明や表示に出てくる言葉で集めています。成分の条件の一覧は、成分表から決まったルールで選んでいます。どちらも効果を約束するものではありません。</p>
<section><h2>悩みから選ぶ</h2>${worryTiles(r)}</section>
<section><h2>成分の条件から選ぶ（シャンプー）</h2><div class="clist">${CONCERNS.filter(c => c.id !== "dandruff").map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><span>${esc(c.n)}</span><i>${c.list.length}件</i></a>`).join("")}</div></section>`,
  { crumbs: [["トップ", ""], ["悩み・目的から選ぶ", "concerns/"]] });

/* ---------- カテゴリ ---------- */
CAT_ORDER.forEach(cat => {
  const list = P.filter(x => x.p.category === cat); if (!list.length) return;
  const u = `categories/${cat}/`;
  write(u, `${CAT_N[cat]}の成分を比べる`, `${CAT_N[cat]}${list.length}件の全成分を、役割つきで比べられます。`, r => `
<h1>${esc(CAT_N[cat])}</h1><p class="lead">登録している${esc(CAT_N[cat])}は${list.length}件です。${C.CATS[cat] && C.CATS[cat].scored ? "成分の傾向スコアが高い順に並べています。" : "このカテゴリはまだ点数をつけていません。"}</p>
${cat === "shampoo" ? `<div class="clist">${CONCERNS.map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><i>${c.list.length}件</i></a>`).join("")}</div>` : ""}
<div class="plist">${list.slice().sort((a, b) => (b.match || 0) - (a.match || 0)).map(x => productCard(x, r)).join("")}</div>`,
    { crumbs: [["トップ", ""], [CAT_N[cat], u]], cat });
});

/* ---------- 点数のつけ方 ---------- */
const appHtml = fs.existsSync(path.join(__dirname, "rules.html")) ? fs.readFileSync(path.join(__dirname, "rules.html"), "utf8") : "";
write("about/scoring/", "点数のつけ方", "クラベルの点数は、成分表から読み取れる処方の傾向を、決まったルールで数えたものです。", r => `
<h1>点数のつけ方</h1><p class="lead">成分表に書かれた成分を辞書で役割ごとに分け、決まったルールで数えています。配合量・使い心地・効果は点数に入っていません。</p>${appHtml}`,
  { crumbs: [["トップ", ""], ["クラベルとは", "about/"], ["点数のつけ方", "about/scoring/"]] });

/* ---------- クラベルとは ---------- */
const TRUST = [
  ["1:1", "メーカー表示のとおりに載せる", "全成分は一字一句そのまま写し、出典と確認日を載せています。"],
  ["=", "どの商品も同じルールで採点", "特定の商品を売り込みません。紹介料で点数や順番を変えることもしません。"],
  ["0", "不安をあおらない", "「危険」とは書きません。海外の規制は、一次資料の条文と日付を添えて書きます。"]
];
const showOperator = OPERATOR_OK || PREVIEW;
write("about/", "クラベルとは", "クラベルは、シャンプーやスキンケアの全成分を決まったルールで読み解き、商品どうしを比べられるようにしたサイトです。大切にしている3つのことと、広告についての考え方。", r => `
<article class="ab">
  <section><h1>クラベルとは</h1>
    <p class="lead">シャンプーやスキンケアの、パッケージの裏にある「全成分」。読み方が分かれば、商品選びのいちばん確かな手がかりになります。クラベルは、その全成分を決まったルールで読み解き、商品どうしを比べられるようにしたサイトです。</p></section>
  <div class="stats"><div><b class="mono">${PRODUCTS.length}</b><span>登録商品</span></div><div><b class="mono">${ING_PAGES.length}</b><span>成分のページ</span></div><div><b class="mono">${PRODUCTS.filter(p => p.source && (p.source.url || p.source.label)).length}</b><span>出典つきの成分表</span></div></div>
  <section class="ab-sec"><h2><b>1</b><span class="mk">メーカー表示のとおり</span>に載せる</h2><ul>
    <li>全成分は、メーカーの公式ページ・販売店のページ・パッケージの表示を、一字一句そのまま写しています。</li>
    <li>同じページを2回読み込み、写した内容が完全に一致したものだけを載せています。</li>
    <li>商品ごとに出典と確認日を載せています。リニューアルで成分が変わることがあるためです。</li>
    <li>成分の解析サイトや口コミを、成分表の出典には使いません。</li></ul></section>
  <section class="ab-sec"><h2><b>2</b>どの商品も<span class="mk">同じルール</span>で採点</h2><ul>
    <li>点数は、6つの観点（シャンプーなら、やさしい洗浄・洗浄力・頭皮ケア・髪の補修・指通り・低刺激）を、誰が数えても同じになる決まりで数えたものです。</li>
    <li>数え方はすべて公開しています。<a href="${r("about/scoring/")}">点数のつけ方</a></li>
    <li>特定の商品を売り込みません。メーカーから依頼を受けて載せることも、紹介料で点数や並び順を変えることもしません。</li>
    <li>点数は成分表に何が入っているかを数えたもので、効果や使い心地を表すものではありません。</li></ul></section>
  <section class="ab-sec"><h2><b>3</b>不安を<span class="mk">あおらない</span></h2><ul>
    <li>成分を「危険」「有害」とは書きません。入っていること自体を、良い・悪いと決めつけません。</li>
    <li>海外での規制に触れるときは、EUの化粧品規則や米国FDAなどの一次資料を確かめ、条文や日付を添えます。</li>
    <li>医薬部外品の効能は、パッケージやメーカーの表示どおりの言葉だけを使います。</li></ul></section>
  ${showOperator ? `<section class="ab-sec"><h2>運営者より${OPERATOR_OK ? "" : ' <span class="draft">下書き</span>'}</h2><div class="ab-box">
    <p>年齢を重ねるにつれて、それまで気にしていなかった頭皮のにおいや髪のボリューム、肌のシミが気になり始めました。そのとき初めてシャンプーの成分を調べ、情報によって言うことがまるで違うことに戸惑ったのが、クラベルを作ったきっかけです。</p>
    <p>同じように悩み始めた人が、落ち着いて、自分で選べるように。そのための材料をそろえていきます。</p>
    ${OPERATOR_OK ? "" : "<small>運営者自身の言葉に書き直していただく前提の下書きです。本番には、確かめてもらうまで出しません。</small>"}</div></section>` : ""}
  <section class="ab-sec" id="ad"><h2>広告について</h2><div class="ab-box">
    <p>商品ページの「楽天市場で見る」は、楽天アフィリエイトのリンクです。ここから購入されると、運営者が紹介料を受け取ることがあります。紹介料の有無は、点数や並び順には一切影響しません。</p>
    <small>商品画像と販売ページへのリンクは、楽天ウェブサービスから提供されています。</small></div></section>
  <a class="btn wide back" href="${r("")}">トップに戻る</a>
</article>`, { crumbs: [["トップ", ""], ["クラベルとは", "about/"]] });

/* ---------- トップ ---------- */
const searchIndex = [
  ...P.map(x => [x.p.name, x.p.brand || "", CAT_N[x.p.category] || "", x.url]),
  ...ING_PAGES.map(g => [g.name, [...g.aliases].filter(a => C.key(a) !== C.key(g.name)).join(" "), "成分", ingUrl.get(g.name)])
];
const latestDate = PRODUCTS.map(p => (p.source && p.source.date) || "").sort().pop() || "";
const latest = P.filter(x => ((x.p.source && x.p.source.date) || "") === latestDate).slice(0, 6);
write("", "クラベル｜成分でくらべるシャンプー・スキンケア", `気になり始めたら、まず裏ラベルから。シャンプーやスキンケアの全成分を、決まったルールで読み解いて比べられます。商品${PRODUCTS.length}件・成分${ING_PAGES.length}種類。`, r => `
<section class="home-hero">
  <svg viewBox="0 0 340 210" role="img" aria-label="ノートに描いたボトルの裏の全成分に、蛍光ペンで線を引き、ここ大事とメモした絵"><use href="#hero"/></svg>
  <h1>気になり始めたら、<br>まず<span class="mk">裏ラベル</span>から。</h1>
  <p>シャンプーやスキンケアの全成分を、決まったルールで読み解いて比べます。煽らず、出典つきで。</p>
</section>
<section class="search-w" aria-label="調べる">
  <p class="memo">いま使っている商品の名前でも<svg viewBox="0 0 26 16" aria-hidden="true"><path d="M2 3 C8 12 15 13 22 10 M17 6 L23 10 L18 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></p>
  <form class="search" role="search" id="sf"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#i-search"/></svg><input id="q" type="search" placeholder="商品名・成分名を入れる" autocomplete="off" aria-label="商品名・成分名で調べる"><button type="submit">調べる</button></form>
  <div class="hints"><small>例</small><button class="hint" type="button" data-q="メリット">メリット</button><button class="hint" type="button" data-q="キュレル">キュレル</button><button class="hint" type="button" data-q="ラウレス硫酸Na">ラウレス硫酸Na</button></div>
  <ul class="sugg" id="sugg" hidden></ul>
  <script type="application/json" id="kb-index">${JSON.stringify(searchIndex).replace(/</g, "\\u003c")}</script>
</section>
<section aria-labelledby="h-worry">
  <div class="sec-h"><h2 id="h-worry"><span class="mk">悩み</span>から選ぶ</h2><span>件数は登録している商品</span></div>
  ${worryTiles(r)}
  <p class="note">ボタンの言葉は、メーカーの表示に出てくる言葉に合わせています。効果を約束するものではありません。<a href="${r("concerns/")}">成分の条件から選ぶ（硫酸系なし・ノンシリコンなど）</a></p>
</section>
<section class="sticky" aria-labelledby="h-quiz">
  <h2 id="h-quiz">迷ったら、<br>${QUIZ_N}つの質問で。</h2>
  <p>年代や頭皮・肌のタイプ、気になること、仕上がりの好みなどを選ぶと、成分表から合いそうな順に並べます。1分ほどで終わります。</p>
  <a href="${r("app/")}">診断をはじめる</a>
</section>
<section aria-labelledby="h-fav">
  <div class="sec-h"><h2 id="h-fav">お気に入り</h2><span>このブラウザにだけ保存</span></div>
  <div class="favs" id="favs"><p class="fav-empty">商品ページの「お気に入りに追加」を押すと、ここに並びます。次に開いたときも、ここから見られます。</p></div>
</section>
<section aria-labelledby="h-about">
  <div class="sec-h"><h2 id="h-about">クラベルとは</h2></div>
  <p class="intro">シャンプーやスキンケアの全成分を、決まったルールで読み解いて比べるサイトです。大切にしていることは3つです。</p>
  <div class="trust">${TRUST.map(([b, t, d]) => `<div><b>${esc(b)}</b><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join("")}</div>
  <p style="margin-top:12px"><a class="btn wide more" href="${r("about/")}">クラベルについて詳しく見る</a></p>
</section>
${latest.length ? `<section aria-labelledby="h-new"><div class="sec-h"><h2 id="h-new">最近追加した商品</h2><span class="mono">${esc(latestDate)}</span></div><div class="plist">${latest.map(x => productCard(x, r)).join("")}</div></section>` : ""}
<section aria-labelledby="h-more"><h2 id="h-more">ほかの探し方</h2>
  <div class="clist">${CAT_ORDER.filter(c => P.some(x => x.p.category === c)).map(c => `<a class="cl" href="${r(`categories/${c}/`)}"><b>${esc(CAT_N[c])}</b><i>${P.filter(x => x.p.category === c).length}件</i></a>`).join("")}
  <a class="cl" href="${r("ingredients/")}"><b>成分の一覧</b><i>${ING_PAGES.length}種類</i></a><a class="cl" href="${r("brands/")}"><b>ブランドの一覧</b><i>${BR.size}ブランド</i></a></div>
</section>`, { sym: ["ph-bottle", "ph-jar", "ph-tube", "ring"] });

/* ---------- CSS・sitemap・robots ---------- */
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "assets/site.css"), fs.readFileSync(path.join(__dirname, "site.css"), "utf8").split("__MKL__").join(HAND.markerLight).split("__MKD__").join(HAND.markerDark));
fs.copyFileSync(path.join(__dirname, "kb.js"), path.join(OUT, "assets/kb.js"));
fs.copyFileSync(path.join(__dirname, "chrome.css"), path.join(OUT, "assets/chrome.css"));

/* ---------- 比較ツール：同じヘッダー・フッターを差し込む ---------- */
const APP = rest.includes("--app") ? rest[rest.indexOf("--app") + 1] : "";
if (APP && fs.existsSync(APP)) {
  const ap = "app/", r = to => rel(ap, to);
  const { head, foot } = chrome(r, ap);
  let h = fs.readFileSync(APP, "utf8");
  const inject = `<link rel="stylesheet" href="${r("assets/chrome.css")}">${sprite(head + foot)}${head}`;
  h = h.replace(/<!--KB:HEAD-->[\s\S]*?<!--\/KB:HEAD-->/, `<!--KB:HEAD-->${inject}<!--/KB:HEAD-->`).replace(/<!--KB:FOOT-->[\s\S]*?<!--\/KB:FOOT-->/, `<!--KB:FOOT-->${foot}<!--/KB:FOOT-->`);
  fs.mkdirSync(path.join(OUT, ap), { recursive: true });
  fs.writeFileSync(path.join(OUT, ap, "index.html"), h);
  fs.copyFileSync(SRC, path.join(OUT, ap, "products.json"));
  PAGES.push(ap);
}
if (RK_ON) fs.copyFileSync(path.join(__dirname, "rk.js"), path.join(OUT, "assets/rk.js"));
if (SITE) {
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `  <url><loc>${SITE}/${encodeURI(p)}</loc>${UPDATED ? `<lastmod>${UPDATED}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
}
console.log(JSON.stringify({ pages: PAGES.length, products: P.length, ingredients: ING_PAGES.length, brands: BRAND_PAGES.length, concerns: CONCERNS.map(c => [c.id, c.list.length]) }));
