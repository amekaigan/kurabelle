#!/usr/bin/env node
/* 成分くらべ 静的サイト生成
   使い方: node src/gen.js <products.json> <出力フォルダ> [--site https://example.com]
   商品データから、トップ・カテゴリ・商品・成分・ブランド・目的別のページを作る。
   リンクはすべて相対パス（どこに置いても動く）。--site を渡すと canonical と sitemap.xml に使う。 */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const C = require("./core.js");

const [, , SRC, OUT, ...rest] = process.argv;
if (!SRC || !OUT) { console.error("usage: gen.js products.json outdir [--site URL]"); process.exit(1); }
const SITE = rest.includes("--site") ? (rest[rest.indexOf("--site") + 1] || "").replace(/\/$/, "") : "";
const RK_APP = process.env.RAKUTEN_APP_ID || "", RK_AFF = process.env.RAKUTEN_AFFILIATE_ID || ""; // 楽天ウェブサービスのアプリID・アフィリエイトID（画像の表示に使う）
const RK_ON = !!RK_APP;
const PREVIEW = rest.includes("--preview"); // ファイルを直接開く見本用：リンクの末尾に index.html を付ける
const DATA = JSON.parse(fs.readFileSync(SRC, "utf8"));
const PRODUCTS = DATA.products;
const UPDATED = DATA.updated || "";
const SITE_NAME = "成分くらべ";

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

/* ---------- 書き出し ---------- */
const PAGES = [];
function rel(from, to) { // from, to: サイトのルートからのパス（"products/x/" など）
  const depth = from.split("/").filter(Boolean).length;
  const t = PREVIEW && (to === "" || to.endsWith("/")) ? to + "index.html" : to;
  return "../".repeat(depth) + t;
}
function write(p, title, desc, body, opts = {}) {
  const dir = path.join(OUT, p); fs.mkdirSync(dir, { recursive: true });
  const r = to => rel(p, to);
  const canon = SITE ? `${SITE}/${p}` : "";
  const crumbs = opts.crumbs || [];
  const ld = crumbs.length ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c[0], item: SITE ? `${SITE}/${c[1]}` : undefined })) })}</script>` : "";
  const html = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}${p ? "｜" + SITE_NAME : ""}</title>
<meta name="description" content="${esc(desc)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${p ? "article" : "website"}"><meta property="og:site_name" content="${SITE_NAME}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="${r("assets/site.css")}">
${ld}
</head><body>
<header class="top"><div class="wrap topin"><a class="logo" href="${r("")}">成分くらべ<span>INGREDIENT COMPARE</span></a>
<nav aria-label="サイト内"><a href="${r("categories/shampoo/")}">シャンプー</a><a href="${r("ingredients/")}">成分</a><a href="${r("concerns/")}">目的から選ぶ</a><a href="${r("brands/")}">ブランド</a></nav></div></header>
<main class="wrap">
${crumbs.length > 1 ? `<nav class="crumbs" aria-label="現在地">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${r(c[1])}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join("<i>›</i>")}</nav>` : ""}
${body(r)}
</main>
<footer class="foot"><div class="wrap">
<p>成分表示は、メーカーの製品ページ・販売ページ・パッケージの記載をそのまま写しています。リニューアルで成分が変わることがあるため、商品ごとに出典と確認日を載せています。</p>
<p>点数は、成分表から読み取れる処方の傾向を、決まったルールで数えたものです。配合量・使い心地・効果を表すものではなく、髪や肌に合うかどうかには個人差があります。医薬部外品の効能は、各商品の表示で確かめてください。</p>
${RK_ON || PREVIEW ? `<p class="rk-credit">商品画像と販売ページへのリンクは、楽天ウェブサービスから提供されています。<a href="https://webservice.rakuten.co.jp/" rel="noopener" target="_blank">Supported by Rakuten Developers</a></p>` : ""}
<p>商品データ ${PRODUCTS.length}件・最終更新 ${esc(UPDATED)}　<a href="${r("about/")}">点数のつけ方</a></p>
</div></footer>
${RK_ON ? `<script>window.RK={app:${JSON.stringify(RK_APP)},aff:${JSON.stringify(RK_AFF)}}</script><script src="${r("assets/rk.js")}" defer></script>` : ""}
</body></html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
  PAGES.push(p);
}

/* ---------- 部品 ---------- */
const chips = x => `<span class="chip">${KIND_N[x.p.kind] || ""}</span>${TARGET_N[x.p.target] ? `<span class="chip">${TARGET_N[x.p.target]}</span>` : ""}${x.p.volume ? `<span class="chip mono">${x.p.volume}${esc(x.p.unit || "")}</span>` : ""}`;
const mix = x => { const cnt = {}; x.a.items.forEach(i => { const r = C.compRole(i); cnt[r] = (cnt[r] || 0) + 1; });
  return `<div class="mix" aria-hidden="true">${C.ROLE_ORDER.filter(r => cnt[r]).map(r => `<span style="flex:${cnt[r]};background:var(${ROLE_C(r)})"></span>`).join("")}</div>`; };
const rkKey = x => x.p.jan || `${x.p.brand || ""} ${x.p.name}`.trim();
const imgSlot = (x, cls) => RK_ON || PREVIEW ? `<span class="${cls}" data-rk="${esc(rkKey(x))}"${x.p.jan ? ' data-jan="1"' : ""}><i>画像</i></span>` : "";
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
  <p class="small muted">成分表に何が入っているかを、決まったルールで5点満点に数えたものです。効果や使い心地を表すものではありません。数え方は<a href="${r("about/")}">点数のつけ方</a>に、自分の髪や頭皮に合わせた順位は<a href="${r("app/")}">診断つきの比較ツール</a>にあります。</p>
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
  const maker = x.p.scent ? `<p><b>メーカーの説明：</b>${esc(x.p.scent)}</p>` : "";
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
  ${RK_ON || PREVIEW ? `<a class="rk-buy" data-rk-link="${esc(rkKey(x))}" hidden rel="sponsored noopener" target="_blank">楽天市場で見る</a>` : ""}
  </div></div>
  <p class="lead">${esc(leadText(x))}</p>
  ${p.desc ? `<p><b>メーカーの説明：</b>${esc(p.desc)}</p>` : ""}
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
</article>`, { crumbs });
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
write("ingredients/", "成分の一覧｜シャンプー・スキンケアの成分を役割で調べる", `成分くらべに登録した商品に2件以上入っている成分${ING_PAGES.length}種類を、洗浄・保湿・指通りなどの役割ごとに並べました。`, r => `
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
write("brands/", "ブランドの一覧", `成分くらべに登録した商品のブランド一覧です。`, r => `
<h1>ブランドの一覧</h1><p class="lead">商品が3件以上あるブランドは、ブランドのページで比べられます。</p>
<div class="tags">${[...BR.entries()].sort((a, b) => b[1].length - a[1].length).map(([b, l]) => brandUrl.has(b) ? `<a class="tagl" href="${r(brandUrl.get(b))}">${esc(b)}<span class="mono">${l.length}</span></a>` : `<span class="tagl plain">${esc(b)}<span class="mono">${l.length}</span></span>`).join("")}</div>`,
  { crumbs: [["トップ", ""], ["ブランド", "brands/"]] });

/* ---------- 目的別 ---------- */
CONCERNS.forEach(c => {
  const u = concernUrl(c);
  const sorted = c.list.slice().sort((a, b) => (c.sort === "match" ? b.match - a.match : (b.sc.v[c.sort] - a.sc.v[c.sort]) || (b.match - a.match)));
  const T = C.CATS.shampoo.themes.find(t => t.k === c.sort);
  write(u, c.n, `${c.lead} 登録している${SH.length}件のうち${c.list.length}件が当てはまります。成分の役割つきで比べられます。`, r => `
<h1>${esc(c.n)}</h1><p class="lead">${esc(c.lead)}</p>
<div class="rule"><b>この一覧に入る条件</b><p>${esc(c.rule)}</p><p class="small muted">登録しているシャンプー${SH.length}件のうち、${c.list.length}件が当てはまります。${T ? `並び順は「${esc(T.n)}」の点数が高い順です。` : "並び順は成分の傾向スコアの高い順です。"}</p></div>
<div class="plist">${sorted.map(x => productCard(x, r, T ? `${T.s} ${x.sc.v[T.k].toFixed(1)}` : "")).join("")}</div>`,
    { crumbs: [["トップ", ""], ["目的から選ぶ", "concerns/"], [c.short, u]] });
});
write("concerns/", "目的からシャンプーを選ぶ", "やさしい洗浄成分・硫酸系なし・ノンシリコン・香料なし・フケかゆみ・補修成分など、目的ごとにシャンプーを成分から選べます。", r => `
<h1>目的から選ぶ</h1><p class="lead">成分表から決まった条件で選んだ一覧です。条件はそれぞれのページに書いています。</p>
<div class="clist">${CONCERNS.map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><span>${esc(c.n)}</span><i class="mono">${c.list.length}件</i></a>`).join("")}</div>`,
  { crumbs: [["トップ", ""], ["目的から選ぶ", "concerns/"]] });

/* ---------- カテゴリ ---------- */
CAT_ORDER.forEach(cat => {
  const list = P.filter(x => x.p.category === cat); if (!list.length) return;
  const u = `categories/${cat}/`;
  write(u, `${CAT_N[cat]}の成分を比べる`, `${CAT_N[cat]}${list.length}件の全成分を、役割つきで比べられます。`, r => `
<h1>${esc(CAT_N[cat])}</h1><p class="lead">登録している${esc(CAT_N[cat])}は${list.length}件です。${C.CATS[cat] && C.CATS[cat].scored ? "成分の傾向スコアが高い順に並べています。" : "このカテゴリはまだ点数をつけていません。"}</p>
${cat === "shampoo" ? `<div class="clist">${CONCERNS.map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><i class="mono">${c.list.length}件</i></a>`).join("")}</div>` : ""}
<div class="plist">${list.slice().sort((a, b) => (b.match || 0) - (a.match || 0)).map(x => productCard(x, r)).join("")}</div>`,
    { crumbs: [["トップ", ""], [CAT_N[cat], u]] });
});

/* ---------- 点数のつけ方 ---------- */
const appHtml = fs.existsSync(path.join(__dirname, "rules.html")) ? fs.readFileSync(path.join(__dirname, "rules.html"), "utf8") : "";
write("about/", "点数のつけ方", "成分くらべの点数は、成分表から読み取れる処方の傾向を、決まったルールで数えたものです。", r => `
<h1>点数のつけ方</h1><p class="lead">成分表に書かれた成分を辞書で役割ごとに分け、決まったルールで数えています。配合量・使い心地・効果は点数に入っていません。</p>${appHtml}`,
  { crumbs: [["トップ", ""], ["点数のつけ方", "about/"]] });

/* ---------- トップ ---------- */
const topIngs = ING_PAGES.slice(0, 24);
write("", "成分くらべ｜シャンプーの全成分を、役割つきで比べる", `シャンプーやスキンケアの全成分を、洗浄・保湿・指通りなどの役割に分けて比べられます。商品${PRODUCTS.length}件・成分${ING_PAGES.length}種類。`, r => `
<section class="hero"><p class="eyebrow">INGREDIENT COMPARE</p><h1>シャンプーの全成分を、<br>役割つきで比べる。</h1>
<p class="lead">パッケージの裏の「全成分」は、読み方さえ分かれば商品選びのいちばん確かな手がかりです。成分くらべは、成分を洗浄・保湿・指通りなどの役割に分け、商品どうしを比べられるようにしました。</p>
<div class="stats"><div><b class="mono">${PRODUCTS.length}</b><span>商品</span></div><div><b class="mono">${ING_PAGES.length}</b><span>成分のページ</span></div><div><b class="mono">${BR.size}</b><span>ブランド</span></div></div></section>
<section><h2>目的から選ぶ</h2><div class="clist">${CONCERNS.map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><span>${esc(c.n)}</span><i class="mono">${c.list.length}件</i></a>`).join("")}</div></section>
<section><h2>よく使われている成分</h2><div class="tags">${topIngs.map(g => `<a class="tagl" href="${r(ingUrl.get(g.name))}"><i class="dot" style="background:var(${ROLE_C(g.role)})"></i>${esc(g.name)}<span class="mono">${g.uses.length}</span></a>`).join("")}</div><p><a href="${r("ingredients/")}">成分の一覧を見る ›</a></p></section>
<section><h2>カテゴリ</h2><div class="clist">${CAT_ORDER.filter(c => P.some(x => x.p.category === c)).map(c => `<a class="cl" href="${r(`categories/${c}/`)}"><b>${esc(CAT_N[c])}</b><i class="mono">${P.filter(x => x.p.category === c).length}件</i></a>`).join("")}</div></section>
<section><h2>ブランド</h2><div class="tags">${BRAND_PAGES.map(([b, l]) => `<a class="tagl" href="${r(brandUrl.get(b))}">${esc(b)}<span class="mono">${l.length}</span></a>`).join("")}</div></section>`, {});

/* ---------- CSS・sitemap・robots ---------- */
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "site.css"), path.join(OUT, "assets/site.css"));
if (RK_ON) fs.copyFileSync(path.join(__dirname, "rk.js"), path.join(OUT, "assets/rk.js"));
if (SITE) {
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `  <url><loc>${SITE}/${encodeURI(p)}</loc>${UPDATED ? `<lastmod>${UPDATED}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
}
console.log(JSON.stringify({ pages: PAGES.length, products: P.length, ingredients: ING_PAGES.length, brands: BRAND_PAGES.length, concerns: CONCERNS.map(c => [c.id, c.list.length]) }));
