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
const ROOT_DIR = path.join(__dirname, "..");
const PREVIEW = rest.includes("--preview"); // ファイルを直接開く見本用：リンクの末尾に index.html を付ける
const DATA = JSON.parse(fs.readFileSync(SRC, "utf8"));
const PRODUCTS = DATA.products;
const UPDATED = DATA.updated || "";
const SITE_NAME = "クラベル";
/* Googleアナリティクス4の測定ID。見本（--preview）では入れない。使っていることは「クラベルとは」の #analytics に書いている */
const ICONS = `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">`;
const GA4_ID = "G-DJ0D89ETX9";
const GA = GA4_ID && !PREVIEW ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${GA4_ID}")</script>` : "";
const OPERATOR_OK = false; // 「運営者より」の文章をユーザーが確かめたら true（それまでは見本にだけ出す）

/* 手書き風の絵（src/hand.json。作り直しは npm run hand）。ページで使っているものだけを埋め込む */
const HAND = JSON.parse(fs.readFileSync(path.join(__dirname, "hand.json"), "utf8"));
const SYM = new Map([...HAND.symbols.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)].map(m => [m[1], m[0]]));
const sprite = (html, extra = []) => { const ids = [...new Set([...[...html.matchAll(/href="#([a-z][\w-]*)"/g)].map(m => m[1]), ...extra])].filter(id => SYM.has(id));
  return ids.length ? `<svg class="sprite kb-sprite" aria-hidden="true" focusable="false"><defs>${ids.map(id => SYM.get(id)).join("")}</defs></svg>` : ""; };
const PH = { shampoo: "ph-bottle", conditioner: "ph-bottle", scalp: "ph-bottle", serum: "ph-bottle", handsoap: "ph-bottle", colorrinse: "ph-bottle", skincare: "ph-jar", facewash: "ph-tube" };

/* ---------- 共通 ---------- */
/* CSS・JSの版番号（中身が変わると番号が変わり、スマホに古いファイルが残っていても新しいものを読み込む） */
const AV = {};
const av = n => AV[n] || (AV[n] = crypto.createHash("sha1").update(fs.readFileSync(path.join(__dirname, n), "utf8") + (n === "site.css" ? HAND.markerLight + HAND.markerDark : "")).digest("hex").slice(0, 8));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hid = (pre, s) => pre + crypto.createHash("sha1").update(C.norm(s)).digest("hex").slice(0, 8); // 名前から決まる短いID（毎回同じ）
const slug = s => String(s).replace(/[^A-Za-z0-9_-]/g, "-");
const CAT_N = { shampoo: "シャンプー", conditioner: "コンディショナー・トリートメント", scalp: "育毛剤・頭皮用エッセンス", skincare: "保湿クリーム・乳液", serum: "美容液", facewash: "洗顔料", handsoap: "ハンドソープ", colorrinse: "カラーリンス・白髪染め" };
const CAT_ORDER = ["shampoo", "conditioner", "scalp", "skincare", "serum", "facewash", "handsoap", "colorrinse"];
const KIND_N = { quasi: "医薬部外品", cosme: "化粧品" };
const TARGET_N = { men: "メンズ向け", women: "レディース向け", all: "" };
const ROLE_N = r => (C.ROLES[r] || C.ROLES.unk).n;
const ROLE_C = r => (C.ROLES[r] && C.ROLES[r].c) || "--line2";
const TAG_EXPLAIN = {
  strongSurf: "洗浄力の強い洗浄成分（硫酸系など）", midSurf: "中程度の洗浄成分", mildSurf: "やさしい洗浄成分（アミノ酸系・ベタイン系・糖系など）",
  cond: "髪の指通りをよくする", repair: "髪の補修", scalp: "頭皮をすこやかに保つ", scalpA: "医薬部外品で有効成分になることがある殺菌成分",
  sebum: "皮脂を取り除く", hum1: "基本の保湿剤", hum2: "高機能な保湿成分", occS: "水分の蒸発を防ぐ強い保護油", occM: "一般的な油分", light: "軽い使用感を出す",
  beauty: "ケア成分（ビタミン類など）", extract: "植物などのエキス", fragrance: "香料", essoil: "精油", alcohol: "アルコール（エタノール）", uvabs: "紫外線吸収剤",
  silicone: "シリコーン", paraben: "パラベン類", mineral: "鉱物油", menthol: "清涼剤", colorant: "着色料・染料", preserv: "防腐剤", strongpres: "少量で効く防腐剤（イソチアゾリノン系）",
  dry: "乾燥", oily: "ベタつき", rough: "肌あれ", spot: "シミ", firm: "ハリ", sensitive: "刺激を感じやすい肌"
};
const FLAGS = [["fragrance", "香料", "香りをつける成分"], ["silicone", "シリコーン", "髪の表面をおおって、指通りをなめらかにする成分"], ["strongSurf", "硫酸系など強めの洗浄成分", "泡立ちがよく、洗う力が強めの洗浄成分（ラウレス硫酸Naなど）"], ["paraben", "パラベン", "中身の品質を保つための防腐剤の一種"], ["alcohol", "アルコール", "さっぱり感を出したり、ほかの成分を溶かしたりする成分（エタノールなど）"], ["menthol", "メントール", "スーッとした清涼感を出す成分"], ["colorant", "着色料", "中身に色をつける成分"], ["mineral", "鉱物油", "石油からつくる油（ミネラルオイルなど）"]];

/* ---------- 解析 ---------- */
const PA = PRODUCTS.map(p => {
  const a = C.analyzeText(p.ingredients);
  const names = [...new Set(a.items.map(i => i.name))];
  const tags = new Set(a.items.flatMap(i => i.tags));
  const cat = C.CATS[p.category];
  const sc = cat && cat.scored ? cat.score(a.items, null) : null;
  const ev = cat && cat.scored ? C.evaluate([p], p.category, null, () => a)[0] : null;
  return { p, a, names, tags, sc, match: ev ? ev.match : null, grade: ev ? ev.grade : null, url: `products/${slug(p.id)}/` };
});
/* 製造終了品（discontinued）：ページは残し、いま買える近い商品へ案内する（2026-10-27、ユーザーの指示）。
   一覧・点数の順位・比較・成分の集計・比較ツールには入れない（買えない商品をすすめないため） */
const P = PA.filter(x => !x.p.discontinued), OFF = PA.filter(x => x.p.discontinued);
OFF.forEach(x => { x.off = true; });
const byId = new Map(PA.map(x => [x.p.id, x]));

/* 成分：表示名ごとに集計 */
const ING = new Map();
P.forEach(x => x.a.items.forEach((it, idx) => {
  if (it.role === "unk") return;
  let g = ING.get(it.name);
  if (!g) { g = { name: it.name, role: it.role, tags: it.tags, desc: it.desc, src: it.src, aliases: new Set(), uses: [] }; ING.set(it.name, g); }
  g.aliases.add(C.norm(it.raw));
  if (!g.uses.some(u => u.x === x)) g.uses.push({ x, pos: idx + 1, of: x.a.items.length, active: it.active, raw: it.raw });
}));
/* 説明（data/ingredient-notes.json）に「知っておくと分かりやすいこと」「よくある疑問」まで書いた成分は、
   1商品でもページを作る（2026-10-26。検索に出ていたチャ乾留液のページが、商品の取り直しで1件になり消えていたため） */
const RICH_NOTES = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/ingredient-notes.json"), "utf8")); return new Set(Object.entries(j).filter(([k, v]) => v && typeof v === "object" && (v.faq || v.points)).map(([k]) => C.key(k))); } catch (e) { return new Set(); } })();
/* 一度公開したページ（data/published-pages.json）。2026-10-27、ユーザーの指示：ページは間違った情報でない限り消さない。
   新しく作るときは下の条件（中身の薄いページを作らない）で選ぶが、一度公開したページは、その対象（成分・ブランド・2つの商品）が
   サイトに残っている限り、条件を下回っても残す。消えたURLは検索での評価と「商品名＋成分」「AとBの違い」からの入口を失うため */
const HAS_FEATURES = (() => { try { return (JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/features.json"), "utf8")).features || []).length > 0; } catch (e) { return false; } })();
/* 商品 → その商品が載っている特集（2026-11-05、特集ページへのサイト内リンクを増やすため） */
const FEAT_OF = (() => { const m = new Map(); try { (JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/features.json"), "utf8")).features || []).forEach(f => {
  const n = (f.items || []).length; if (n < 3) return;
  [...(f.items || []), ...((f.also && f.also.items) || [])].forEach(it => { if (!m.has(it.id)) m.set(it.id, []); m.get(it.id).push({ u: `features/${f.id}/`, short: f.short, title: f.title, n }); }); }); } catch (e) {} return m; })();
const featOfBlock = (x, r) => { const l = FEAT_OF.get(x.p.id); return l && l.length ? `<section><h2>この商品が載っている特集</h2><div class="clist">${l.map(f => `<a class="cl" href="${r(f.u)}"><b>${esc(f.short)}の比較</b><span>${f.n}商品を、何役か・薬用か・香料の有無と全成分で</span></a>`).join("")}</div></section>` : ""; };
const PUB = (() => { try { return new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/published-pages.json"), "utf8")).pages || {})); } catch (e) { return new Set(); } })();
/* ページを作る条件：辞書で役割が分かっていて、2商品以上に入っている（中身の薄いページを作らない）。一度公開した成分は1商品でも残す */
const ING_PAGES = [...ING.values()].filter(g => g.src === "dict" && (g.uses.length >= 2 || RICH_NOTES.has(C.key(g.name)) || PUB.has(`ingredients/${hid("i-", g.name)}/`)) && g.role !== "base")
  .sort((a, b) => b.uses.length - a.uses.length || a.name.localeCompare(b.name, "ja"));
const ingUrl = new Map(ING_PAGES.map(g => [g.name, `ingredients/${hid("i-", g.name)}/`]));

/* ブランド：3商品以上（一度公開したブランドは1商品でも残す） */
const BR = new Map();
P.forEach(x => { const b = x.p.brand || ""; if (!b) return; if (!BR.has(b)) BR.set(b, []); BR.get(b).push(x); });
const BRAND_PAGES = [...BR.entries()].filter(([b, l]) => l.length >= 3 || PUB.has(`brands/${hid("b-", b)}/`)).sort((a, b) => b[1].length - a[1].length);
const brandUrl = new Map(BRAND_PAGES.map(([b]) => [b, `brands/${hid("b-", b)}/`]));

/* 「AとBの違い」：同じカテゴリで、同じブランドか同じメーカー（商品名の先頭の語。例「花王」）の商品どうし。
   1商品につき成分が近い順に最大 CMP_PER 件。成分がまったく同じ組は作らない（2026年10月22日、ユーザーと決定） */
const CMP_PER = 3;
const maker = x => { const w = String(x.p.name).split(/[\s　]+/)[0]; return w && w !== x.p.name ? w : (x.p.brand || ""); };
const jac = (a, b) => { const A = new Set(a.names), B = new Set(b.names); let i = 0; A.forEach(v => B.has(v) && i++); return i / (A.size + B.size - i); };
const CMP = new Map(); // key -> {a, b, s, url}
P.forEach(x => {
  P.filter(y => y !== x && y.p.category === x.p.category && ((x.p.brand && y.p.brand === x.p.brand) || maker(y) === maker(x)))
    .map(y => ({ y, s: jac(x, y) })).filter(o => o.s < 1).sort((a, b) => b.s - a.s).slice(0, CMP_PER)
    .forEach(({ y, s }) => {
      const [a, b] = [x, y].sort((m, n) => m.p.id < n.p.id ? -1 : 1);
      const k = a.p.id + "|" + b.p.id;
      if (!CMP.has(k)) CMP.set(k, { a, b, s, url: `compare/${hid("c-", k)}/` });
    });
});
/* 一度公開した比較ページは、商品が増えて「近い3件」から外れても残す（2026-10-27、ユーザーの指示。
   10月27日の追加で16件が入れ替わって消えていた）。2つの商品がどちらも残っていて、成分がまったく同じでない限り作り続ける */
P.forEach((x, i) => P.slice(i + 1).forEach(y => {
  if (y.p.category !== x.p.category || !((x.p.brand && y.p.brand === x.p.brand) || maker(y) === maker(x))) return;
  const [a, b] = [x, y].sort((m, n) => m.p.id < n.p.id ? -1 : 1);
  const k = a.p.id + "|" + b.p.id, url = `compare/${hid("c-", k)}/`;
  if (CMP.has(k) || !PUB.has(url)) return;
  const s = jac(a, b); if (s < 1) CMP.set(k, { a, b, s, url });
}));
const CAT_S = { shampoo: "シャンプー", conditioner: "コンディショナー", scalp: "頭皮用エッセンス", skincare: "", serum: "美容液", facewash: "洗顔料", handsoap: "ハンドソープ", colorrinse: "カラーリンス" };
/* 見出し用の短い呼び名：同じブランドなら名前の違う部分だけ、違うブランドならブランド名 */
const MAKERS = new Set(["花王", "ユニリーバ", "ロート製薬", "マンダム", "ライオン", "大塚製薬", "アンファー", "アムウェイ", "第一三共ヘルスケア", "持田ヘルスケア", "コーセー", "資生堂", "カネボウ", "クラシエ", "ファイントゥデイ", "P&G", "レキットベンキーザー", "牛乳石鹸"]);
const toks = x => { const bw = new Set(String(x.p.brand || "").split(/[\s　]+/).filter(Boolean));
  return String(x.p.name).replace(/(つめかえ用|詰め替え用|本体|ポンプ)/g, " ").split(/[\s　]+/).filter(w => w && !MAKERS.has(w) && !bw.has(w)); };
/* ブランド名＋（同じブランド・カテゴリのほかの商品と区別できるだけの）商品名の語。「シャンプー」「薬用」などの一般的な語は使わない */
const GENERIC = /^(シャンプー|コンディショナー|トリートメント|薬用|リンスのいらない|クリーム|乳液)$/;
const SN = new Map();
function shortName(x) {
  if (SN.has(x)) return SN.get(x);
  const words = T => T.filter(w => !GENERIC.test(w));
  const W = words(toks(x)), sib = P.filter(y => y !== x && y.p.brand === x.p.brand && y.p.category === x.p.category).map(y => words(toks(y)));
  let k = 1; while (k < W.length && sib.some(S => S.slice(0, k).join(" ") === W.slice(0, k).join(" "))) k++;
  let w = W.slice(0, k).join(" ");
  /* 2026-11-02：種類の語（トリートメント／コンディショナーなど）だけが違う兄弟がいると同じ名前になるので、その語を足す */
  if (sib.some(S => S.join(" ") === W.join(" "))) { const g = toks(x).filter(t => GENERIC.test(t)); if (g.length) w = [w, ...g].join(" "); }
  const v = (x.p.brand && !w.startsWith(x.p.brand) ? [x.p.brand, w] : [w]).filter(Boolean).join(" ") || toks(x).join(" ");
  SN.set(x, v); return v;
}
function pairLabels(a, b) {
  const A = toks(a), B = toks(b);
  if (a.p.brand && a.p.brand === b.p.brand) {
    let i = 0; while (i < A.length - 1 && i < B.length - 1 && A[i] === B[i]) i++;
    let j = 0; while (j < A.length - i - 1 && j < B.length - i - 1 && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
    const da = A.slice(i, A.length - j).join(" "), db = B.slice(i, B.length - j).join(" ");
    if (da && db && da !== db) {
      /* 2026-11-02（SEO点検の指摘：比較ページのタイトル重複）：
         ・違いが「トリートメント／コンディショナー」などの種類だけのときは、共通の商品名（例：ふんわり軽やか）を残す
         ・共通の末尾が種類の語（例：トリートメント）のときは、カテゴリ名ではなくその語を付ける（トリートメントどうしを「コンディショナー」と書いていた） */
      const pre = GENERIC.test(da) && GENERIC.test(db) ? A.slice(0, i).join(" ") : "";
      const suf = j > 0 && GENERIC.test(A[A.length - 1]) ? A[A.length - 1] : "";
      const cs = CAT_S[a.p.category] || "";
      const tail = suf ? "の" + suf : (!cs || (da + db).includes(cs.slice(0, 4)) ? "" : "の" + cs);
      return { h: `${a.p.brand} ${pre ? pre + " " : ""}${da}と${db}${tail}`, la: da, lb: db, br: a.p.brand }; }
  }
  const na = shortName(a), nb = shortName(b), cs = CAT_S[a.p.category] || "";
  return { h: `${na}と${nb}${!cs || na.includes(cs) || nb.includes(cs) ? "" : "の" + cs}`, la: na, lb: nb };
}
CMP.forEach(c => { const L = pairLabels(c.a, c.b); Object.assign(c, L); });
const cmpOf = x => [...CMP.values()].filter(c => c.a === x || c.b === x).sort((m, n) => n.s - m.s);
/* 比較の一覧のカード：2商品の画像の中央を半分ずつ並べた正方形のサムネイル（2026年10月22日、ユーザーの依頼） */
const cmpCard = (c, r, sub) => `<a class="cl cl-duo" href="${r(c.url)}"><span class="duo">${imgSlot(c.a, "thumb")}${imgSlot(c.b, "thumb")}</span><span class="cl-t"><b>${wb(c.h)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span></a>`;

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
  const menu = `<details class="kb-menu"><summary aria-label="メニュー"><span class="vh">メニュー</span></summary><div class="panel">
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
<a class="mi" href="${r("about/")}#analytics">アクセス解析について</a>
</div></details>`;
  const head = `<header class="kb-top"><div class="in">${logo}
<nav class="kb-nav" aria-label="おもなページ"><a href="${r("concerns/")}"${on("concerns/")}>悩みから選ぶ</a><a href="${r("app/")}"${on("app/")}>診断</a><a href="${r("ingredients/")}"${on("ingredients/")}>成分</a><a href="${r("about/")}"${on("about/")}>クラベルとは</a></nav>
${menu}
</div></header>`;
  const foot = `<footer class="kb-foot"><div class="in">
${logo}
<nav aria-label="サイトの案内"><a href="${r("")}">トップ</a><a href="${r("concerns/")}">悩み・目的から選ぶ</a><a href="${r("app/")}">診断つきの比較ツール</a>${cats.map(c => `<a href="${r(`categories/${c}/`)}">${esc(CAT_N[c])}</a>`).join("")}${HAS_FEATURES ? `<a href="${r("features/")}">特集</a>` : ""}<a href="${r("ingredients/")}">成分の一覧</a><a href="${r("brands/")}">ブランド</a><a href="${r("about/")}">クラベルとは</a><a href="${r("about/scoring/")}">点数のつけ方</a></nav>
<p>成分表示は、メーカーの製品ページ・販売ページ・パッケージの記載をそのまま写しています。リニューアルで成分が変わることがあるため、商品ごとに出典と確認日を載せています。</p>
<p>点数は、成分表から読み取れる処方の傾向を、決まったルールで数えたものです。配合量・使い心地・効果を表すものではなく、髪や肌に合うかどうかには個人差があります。医薬部外品の効能は、各商品の表示で確かめてください。</p>
${RK_ON || PREVIEW ? `<p>商品画像と販売ページへのリンクは、楽天ウェブサービスから提供されています。<a href="https://webservice.rakuten.co.jp/" rel="noopener" target="_blank">Supported by Rakuten Developers</a></p>` : ""}
<p>商品データ ${PRODUCTS.length}件・最終更新 ${esc(UPDATED)}</p>
</div></footer>`;
  return { head, foot };
}
/* 各ページの下に置く「迷ったら診断」
   診断があるカテゴリは QUIZ。それ以外のカテゴリでは、準備中と書き、近い診断を2つ出す。 */
const QUIZ = {
  shampoo: { n: "シャンプー", hash: "", what: "頭皮のタイプ" },
  conditioner: { n: "コンディショナー", hash: "#conditioner", what: "髪の長さ" },
  skincare: { n: "保湿クリーム", hash: "#skincare", what: "肌のタイプ" }
};
const QUIZ_CATS = Object.keys(QUIZ);
const HAIR = new Set(["shampoo", "conditioner", "scalp", "colorrinse"]);
const quizLink = (r, c) => `<a href="${r("app/")}${QUIZ[c].hash}">${QUIZ[c].n}の診断をはじめる</a>`;
const quizCta = (r, cat) => {
  if (QUIZ[cat]) return `<aside class="quiz-cta" aria-label="診断の案内"><div class="sticky">
  <h2>迷ったら、${QUIZ_N}つの質問で。</h2>
  <p>年代や${QUIZ[cat].what}、気になること、仕上がりの好みなどを選ぶと、成分表から合いそうな順に並べます。1分ほどで終わります。</p>
  ${quizLink(r, cat)}
</div></aside>`;
  const isHair = !cat || HAIR.has(cat), name = cat ? CAT_N[cat] : "";
  const pick = isHair ? ["shampoo", "conditioner"] : ["skincare", "shampoo"];
  return `<aside class="quiz-cta" aria-label="診断の案内"><div class="sticky">
  <h2>迷ったら、診断で。</h2>
  <p>診断は、いまは${QUIZ_CATS.map(c => QUIZ[c].n).join("・")}の${QUIZ_CATS.length}つです。${name ? `${esc(name)}の診断は準備中です。` : ""}${QUIZ_N}つの質問に答えると、成分表から合いそうな順に並べます。</p>
  <div class="two">${pick.map(c => quizLink(r, c)).join("")}</div>
</div></aside>`;
};
/* 画面の下に出す小さな診断の案内（×で閉じると7日間出さない。ページ下の「迷ったら診断」が見えている間は隠れる） */
const quizBar = (r, cat) => {
  const c = QUIZ[cat] ? cat : (!cat || HAIR.has(cat)) ? "shampoo" : "skincare";
  return `<div class="kb-qbar" hidden><a href="${r("app/")}${QUIZ[c].hash}"><b>${QUIZ[c].n}の診断</b><small>${QUIZ_N}問・1分で、あなたに合う順に</small></a><button type="button" aria-label="閉じる">×</button></div>`;
};
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
${GA}${ICONS}
<title>${esc(title)}${p ? "｜" + SITE_NAME : ""}</title>
<meta name="description" content="${esc(desc)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ""}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${p ? "article" : "website"}"><meta property="og:site_name" content="${SITE_NAME}">${SITE ? `<meta property="og:image" content="${SITE}/assets/icons/ogp.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@600&text=${encodeURIComponent("全成分ここ大事5.0やさしさ")}&display=swap">
<link rel="stylesheet" href="${r("assets/site.css")}?v=${av("site.css")}"><link rel="stylesheet" href="${r("assets/chrome.css")}?v=${av("chrome.css")}">
${ld}
</head><body>
${sprite(head + main, opts.sym || [])}
${head}
<main class="wrap">
${crumbs.length > 1 ? `<nav class="crumbs" aria-label="現在地">${(opts.cat ? crumbs.slice(0, -1) : crumbs).map((c, i, L) => i < L.length - 1 || opts.cat ? `<a href="${r(c[1])}">${esc(c[0])}</a>` : `<span>${esc(c[0])}</span>`).join("<i>›</i>")}</nav>` : ""}
${main}
${p && !opts.noQuiz ? quizCta(r, opts.cat) + quizBar(r, opts.cat) : ""}
</main>
${foot}
<script>window.KB={root:${JSON.stringify(root)},pv:${PREVIEW}}</script><script src="${r("assets/kb.js")}?v=${av("kb.js")}" defer></script>
${RK_ON ? `<script>window.RK={api:${JSON.stringify(root + "api/rk")}}</script><script src="${r("assets/rk.js")}?v=${av("rk.js")}" defer></script>` : ""}
</body></html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
  PAGES.push(p);
}

/* ---------- 部品 ---------- */
/* 商品名を語のまとまりで折り返す（「シャンプ／ー」のような途中での改行を防ぐ。2026-10-23）。語が1行より長いときだけ、その語の中で折り返す */
const wb = t => esc(t).split(/([\s　]+)/).map(w => /^[\s　]+$/.test(w) || !w ? w : `<span class="w">${w}</span>`).join("");
const chips = x => `<span class="chip">${KIND_N[x.p.kind] || ""}</span>${TARGET_N[x.p.target] ? `<span class="chip">${TARGET_N[x.p.target]}</span>` : ""}${x.p.volume ? `<span class="chip mono">${x.p.volume}${esc(x.p.unit || "")}</span>` : ""}`;
const mix = x => { const cnt = {}; x.a.items.forEach(i => { const r = C.compRole(i); cnt[r] = (cnt[r] || 0) + 1; });
  return `<div class="mix" aria-hidden="true">${C.ROLE_ORDER.filter(r => cnt[r]).map(r => `<span style="flex:${cnt[r]};background:var(${ROLE_C(r)})"></span>`).join("")}</div>`; };
/* メーカー直販の商品（アフィリエイトの仲介サービス経由）は、楽天の情報（画像・価格・リンク）を使わない。
   楽天ウェブサービスの規約で、楽天の情報を使う商品に楽天以外のアフィリエイトを付けられないため。 */
const SHOP_N = { a8: "A8.net", moshimo: "もしもアフィリエイト", accesstrade: "アクセストレード", afb: "afb" };
const REL_IMG = p => "/" + p;
const isDirect = x => !!(x.p.shop && x.p.shop.url);
/* 飛び先：メーカーの公式通販（既定）か Amazon（shop.dest: "amazon"） */
const DEST = { amazon: { btn: "Amazonで見る", page: "Amazonの商品ページ", tag: "Amazonで販売", where: "Amazon" } };
const DEST_OFFICIAL = { btn: "公式サイトで見る", page: "メーカーの公式通販のページ", tag: "メーカー直販", where: "公式サイト" };
const destOf = s => DEST[s && s.dest] || DEST_OFFICIAL;
const dest = x => destOf(x.p.shop);
/* 2026-10-24：1商品に広告リンクを2つ（公式サイトとAmazonなど）出せるようにした。2つ目以降は shop.also に {asp, url, pixel, dest} で書く */
const shops = x => isDirect(x) ? [x.p.shop, ...(x.p.shop.also || []).filter(s => s && s.url)].sort((a, b) => (b.dest === "amazon") - (a.dest === "amazon")) : [];   /* Amazonを先に（2026-10-24 ユーザーの指定） */
const shopBtns = x => `<span class="pr-tag">PR</span>` + shops(x).map(s => `<a class="rk-buy" href="${esc(s.url)}" rel="sponsored noopener" target="_blank">${destOf(s).btn}</a>${s.pixel ? `<img class="px" src="${esc(s.pixel)}" width="1" height="1" alt="">` : ""}`).join("");
const shopTag = x => shops(x).map(s => destOf(s).tag).filter((v, i, a) => a.indexOf(v) === i).join("・");
const shopNote = () => `広告リンクです。紹介料は点数・順位に関係しません。価格は各サイトでご確認ください。`;   /* 2026-10-24 ユーザーの指定で短くした */
/* 商品ページの購入ボックス：PRの札・ボタン（縦に並べる）・説明文をひとつの枠に入れる（2026-10-24 ユーザーの指定） */
const buyBox = (x, r) => `<div class="buybox"><span class="pr-tag">PR</span>${shops(x).map(s => `<a class="rk-buy" href="${esc(s.url)}" rel="sponsored noopener" target="_blank">${destOf(s).btn}</a>${s.pixel ? `<img class="px" src="${esc(s.pixel)}" width="1" height="1" alt="">` : ""}`).join("")}<p class="pr-note">${shopNote(x)}<a href="${r("about/")}#ad">広告について</a></p></div>`;
const useRk = x => (RK_ON || PREVIEW) && !isDirect(x);
const rkKey = x => x.p.jan || `${x.p.brand || ""} ${x.p.name}`.trim();
const ownImg = x => (isDirect(x) && x.p.shop.img) || x.p.img || "";   /* 運営者が用意した商品画像（メーカー直販の素材、または差し替え用） */
const imgSlot = (x, cls) => ownImg(x)
  ? `<span class="${cls} on"><img src="${REL_IMG(ownImg(x))}" alt="" loading="${cls === "pimg" ? "eager" : "lazy"}" decoding="async"></span>` /* メーカーが用意した商品画像（仲介サービスの素材） */
  : `<span class="${cls}"${isDirect(x) ? "" : ` data-rk="${esc(rkKey(x))}"${x.p.jan ? ' data-jan="1"' : ""}`}><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#${PH[x.p.category] || "ph-bottle"}"/></svg></span>`;
const scoreBadge = x => x.match == null ? "" : `<span class="score"><b class="mono">${x.match}</b><i class="g g-${x.grade}">${x.grade}</i></span>`;
function productCard(x, r, extra, opt = {}) {
  const ms = x.sc && x.sc.mainSurf ? `主洗浄成分 ${esc(x.sc.mainSurf.name)}・` : "";
  const meta = opt.posOnly ? extra : `${ms}${x.a.items.length}成分${extra ? "・" + extra : ""}`;
  return `<a class="pcard" href="${r(x.url)}"><div class="pc-top">${imgSlot(x, "thumb")}<div class="pc-name"><span class="brand">${esc(x.p.brand || "")}</span><b>${esc(x.p.name)}</b></div>${scoreBadge(x)}</div>
  ${mix(x)}<div class="pc-meta">${chips(x)}<span class="small muted">${meta}</span>${useRk(x) ? `<span class="rk-rv sm" data-rk-rv="${esc(rkKey(x))}" hidden></span><span class="rk-price sm" data-rk-price="${esc(rkKey(x))}" hidden></span>` : isDirect(x) ? `<span class="small muted">${shopTag(x)}</span>` : ""}</div></a>`;
}
function themesBlock(x) {
  if (!x.sc) return "";
  const T = C.CATS[x.p.category].themes;
  return `<div class="themes">${T.map(t => `<div class="th"><span class="tn">${t.n}</span><span class="bar"><i style="width:${x.sc.v[t.k] / 5 * 100}%"></i></span><span class="tv mono">${x.sc.v[t.k].toFixed(1)}</span><span class="why">${esc(x.sc.why[t.k])}</span></div>`).join("")}</div>`;
}
/* ---------- 成分から見たタイプ（レーダーグラフ） ---------- */
const AX_LABEL = {
  shampoo: { mild: "やさしい洗浄", clean: "洗浄力", scalp: "頭皮ケア", repair: "髪の補修", smooth: "指通り", gentle: "低刺激" },
  skincare: { moist: "うるおい", barrier: "保護（フタ）", light: "軽さ", beauty: "ケア成分", concern: "悩み対応", gentle: "低刺激" },
  conditioner: { smooth: "指通り", repair: "髪の補修", moist: "うるおい", light: "軽さ", gentle: "低刺激" }
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
/* 商品ページのグラフの下に出す、観点ごとの見方（何が多いと高くなるか。効果ではなく処方の傾向として書く） */
const AX_DESC = {
  shampoo: { mild: "主な洗浄成分が、アミノ酸系・ベタイン系などのマイルドなものほど高くなります。",
    clean: "主な洗浄成分が、硫酸系などの洗浄力の高いものほど高くなります。皮脂をしっかり落とす処方の傾向です。",
    scalp: "グリチルリチン酸2K・ピロクトンオラミンなど、頭皮ケアの成分が多いほど高くなります。",
    repair: "ケラチン・セラミド・加水分解タンパクなど、髪の補修成分が多いほど高くなります。",
    smooth: "カチオン成分・シリコーン・油分が多いほど高くなります。きしみにくく、まとまりやすい処方の傾向です。髪に残る成分が多いと根元が寝やすいので、ボリュームを重視するなら低くても気にしなくて大丈夫です。",
    gentle: "香料・アルコール・メントール・着色料などが少ないほど高くなります。" },
  conditioner: { smooth: "カチオン成分・シリコーンが多いほど高くなります。髪の表面をなめらかにする処方の傾向です。",
    repair: "ケラチン・セラミド・加水分解タンパクなど、髪の補修成分が多いほど高くなります。",
    moist: "アミノ酸・ヒアルロン酸・PCA-Naなど、保湿成分が多いほど高くなります。",
    light: "油分やシリコーンが少ないほど高くなります。高いほど「さらっと軽め」、低いほど「しっとり重め」の処方の傾向です。どちらが良いではなく、好みで選ぶ観点です。",
    gentle: "香料・アルコールなどが少ないほど高くなります。" },
  skincare: { moist: "ヒアルロン酸・セラミドなど、保湿成分が多いほど高くなります。",
    barrier: "ワセリン・シア脂など、肌の表面にフタをする油分が多いほど高くなります。しっとり重めの処方の傾向です。",
    light: "油分が少ないほど高くなります。高いほど「さっぱり軽め」の処方の傾向です。「保護力」とは反対向きの観点です。",
    beauty: "ナイアシンアミド・ビタミン類・コエンザイムQ10など、ケア成分が多いほど高くなります。",
    concern: "乾燥・ベタつき・肌あれ・シミ・ハリ・敏感の6つの悩みに関係する成分を数えて平均したものです。診断で悩みを選ぶと、その悩みだけで数えます。",
    gentle: "香料・アルコール・紫外線吸収剤などが少ないほど高くなります。" }
};
function axesBlock(x, r) {
  const cat = x.p.category, T = C.CATS[cat].themes, D = AX_DESC[cat] || {}, ty = typeOf(x);
  if (!T.length) return "";
  /* 観点ごとの説明は、押したときだけ開く（説明が並びすぎて、成分表まで遠くならないように） */
  return `<div class="axes">
    <h3>それぞれの観点の見方<small>押すと、数え方とこの商品の中身が出ます</small></h3>
    <div class="axl">${T.map(t => `<details><summary><span>${esc(t.n)}</span><i class="axbar" style="--v:${(x.sc.v[t.k] / 5 * 100).toFixed(0)}%"></i><b class="mono">${x.sc.v[t.k].toFixed(1)}</b></summary><p>${esc(D[t.k] || "")}</p><p class="ax-this">この商品：${esc(x.sc.why[t.k] || "")}</p></details>`).join("")}</div>
  </div>`;
}
function typeBlock(x, r) {
  if (!x.sc) return "";
  const cat = x.p.category, catN = CAT_N[cat] || cat, ty = typeOf(x), rk = CAT_RANK[cat];
  const rank = rk ? rk.rank.get(x) : null;
  return `<section class="type">
  <div class="type-head"><div><span class="lbl">成分から見たタイプ</span><b class="tt">${ty.title.split("・").map(t => `<span class="w">${esc(t)}</span>`).join("・")}</b></div>${scoreBadge(x)}</div>
  ${radarSVG(x)}
  <p class="legend small"><span class="lg me"></span>この商品<span class="lg avg"></span>${esc(catN)}の平均</p>
  <ul class="facts">
    ${rank ? `<li><span>総合</span><b class="mono">${rank}位</b><i>${esc(catN)}${rk.n}件中</i></li>` : ""}
    <li><span>平均より上</span><b class="mono">${ty.above}</b><i>${ty.total}つの観点のうち</i></li>
    <li><span>いちばん控えめ</span><b>${esc(ty.low.n)}</b><i>${ty.low.v.toFixed(1)}点</i></li>
  </ul>
  ${axesBlock(x, r)}
  <p class="small muted">成分表の中身を決まったルールで数えた点数で、効果や使い心地ではありません。<a href="${r("about/scoring/")}">数え方</a>${QUIZ[x.p.category] ? `・<a href="${r("app/")}${QUIZ[x.p.category].hash}">自分に合う順に並べる</a>` : `（${esc(CAT_N[x.p.category])}の診断は準備中）`}</p>
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
  return `<p>${fromLabel}</p>${maker}<p class="small muted">● 入っている　－ 入っていない（良い・悪いではありません）</p>`;
}
/* 使った感想：運営者が実際に使ったものだけ（reviews 項目）。点数とは分けて、個人の感想とはっきり書く */
function reviewBlock(x) {
  const rv = Array.isArray(x.p.reviews) ? x.p.reviews.filter(v => v && v.text) : [];
  if (!rv.length) return "";
  return `<section class="review"><h2>運営者が使ってみた感想</h2>${rv.map(v => `<div class="rv"><p>${esc(v.text)}</p>
    <dl>${v.scent ? `<div><dt>香り</dt><dd>${esc(v.scent)}</dd></div>` : ""}${v.feel ? `<div><dt>使い心地</dt><dd>${esc(v.feel)}</dd></div>` : ""}${v.period ? `<div><dt>使った期間</dt><dd>${esc(v.period)}</dd></div>` : ""}</dl>
    <p class="small muted">${esc(v.by || "運営者")}の個人の感想です${v.date ? `（${esc(v.date)}）` : ""}。髪質や好みによって感じ方は違います。</p></div>`).join("")}</section>`;
}

/* この商品から、ほかの商品を探す（2026-11-07、ユーザーの依頼）：商品ページから、同じブランド・当てはまる悩みと条件・
   入っている成分の一覧ページへつなぐ。商品を足すたびに、つながりが自動で増える。数字はその一覧に入っている商品の数 */
function exploreBlock(x, r) {
  const p = x.p, catN = CAT_N[p.category] || p.category, rows = [];
  const tag = (u, t, n) => `<a class="tagl" href="${r(u)}">${esc(t)}${n != null ? `<span class="mono">${n}件</span>` : ""}</a>`;
  const bl = (BR.get(p.brand) || []).filter(y => y !== x).sort((a, b) => (b.match || 0) - (a.match || 0));
  if (bl.length) rows.push(["同じブランド", (brandUrl.has(p.brand) ? tag(brandUrl.get(p.brand), `${p.brand}の商品をすべて`, BR.get(p.brand).length) : "") + bl.slice(0, 4).map(y => tag(y.url, toks(y).join(" ") || y.p.name)).join("")]); // 名前はメーカー名・ブランド名を省いて短く
  const seen = new Set(), cw = [];
  WORRIES.forEach(w => { if (w.list.includes(x) && !seen.has(worryUrl(w))) { seen.add(worryUrl(w)); cw.push(tag(worryUrl(w), w.short, w.list.length)); } });
  CONCERNS.forEach(c => { if (c.list.includes(x) && !seen.has(concernUrl(c))) { seen.add(concernUrl(c)); cw.push(tag(concernUrl(c), c.short, c.list.length)); } });
  if (cw.length) rows.push(["当てはまる悩み・条件", cw.join("")]);
  /* 成分は、有効成分 → 美容・補修 → 洗浄 → 保湿 → 指通り → 油性 …の順。同じ役割の中は成分表の順（多く入っている順の目安） */
  const RK = { beauty: 1, clean: 2, hum: 3, cond: 4, oil: 5, uv: 6, emul: 7, pres: 8, other: 9 };
  const ings = []; x.a.items.forEach((it, i) => { if (ingUrl.has(it.name) && !ings.some(o => o.n === it.name)) ings.push({ n: it.name, rk: it.active ? 0 : (RK[ING.get(it.name).role] || 9), i, k: ING.get(it.name).uses.length }); });
  ings.sort((a, b) => (a.rk - b.rk) || (a.i - b.i));
  if (ings.length) rows.push(["入っている成分から", ings.slice(0, 8).map(o => tag(ingUrl.get(o.n), o.n, o.k)).join("")]);
  if (!x.off) rows.push(["同じカテゴリ", tag(`categories/${p.category}/`, `${catN}をすべて`, P.filter(y => y.p.category === p.category).length)]);
  return `<section class="explore"><h2>この商品から、ほかの商品を探す</h2>${rows.map(([h, b]) => `<div class="ex-row"><p class="ex-h">${esc(h)}</p><div class="tags">${b}</div></div>`).join("")}<p class="small muted">数字は、その一覧に入っている商品の数です。</p></section>`;
}

/* ---------- 商品ページ ---------- */
const jpDate = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : esc(d || ""); };
const offBlock = (x, r) => { const d = x.p.discontinued || {};
  return `<div class="offnote"><p class="off-h">製造終了品</p><p>${d.date ? `メーカーの発表では、${jpDate(d.date)}に生産を終えています。` : "メーカーの発表で、製造を終えた商品です。"}店頭の在庫がなくなり次第、販売終了です。成分表は販売していたときのものです。${d.url ? `（出典：<a href="${esc(d.url)}" rel="nofollow noopener" target="_blank">${esc(d.label || d.url)}</a>${d.checked ? `、${esc(d.checked)}確認` : ""}）` : ""}</p></div>
  <section><h2>成分が近い、いま買える${esc(CAT_N[x.p.category] || "商品")}</h2><p class="small muted">この商品の成分表と、共通する成分の多い順です。</p><div class="plist">${similar(x, 6).map(({ y, s }) => productCard(y, r, `共通の成分 ${Math.round(s * 100)}%`)).join("")}</div></section>`; };
[...P, ...OFF].forEach(x => {
  const p = x.p, catN = CAT_N[p.category] || p.category;
  const crumbs = [["トップ", ""], [catN, `categories/${p.category}/`]];
  if (brandUrl.has(p.brand)) crumbs.push([p.brand, brandUrl.get(p.brand)]);
  crumbs.push([p.name, x.url]);
  const flags = FLAGS.map(([t, n, d]) => [n, x.tags.has(t), d]);
  const s = p.source || {};
  const desc = `${p.name}の全成分${x.a.items.length}種類を、成分ごとの役割つきで一覧にしました。${x.sc && x.sc.mainSurf ? `主洗浄成分は${x.sc.mainSurf.name}。` : ""}香料・シリコーンなどの有無と、似た成分の商品も。`;
  write(x.url, `${p.name}の成分`, desc, r => `
<article class="prod">
  <div class="phead"><div class="pfig">${imgSlot(x, "pimg")}<button class="fav-btn star" type="button" hidden aria-pressed="false" aria-label="お気に入りに追加" title="お気に入りに追加" data-fav="${esc(JSON.stringify({ id: p.id, name: p.name, brand: p.brand || "", url: x.url, match: x.match, grade: x.grade, type: x.sc ? typeOf(x).title : "", ph: PH[p.category] || "ph-bottle", img: ownImg(x) ? REL_IMG(ownImg(x)) : "", rk: useRk(x) && !ownImg(x) ? rkKey(x) : "", jan: p.jan ? 1 : 0 }))}"></button></div><div>
  <h1>${wb(p.name)} <span class="w">の成分</span></h1>
  <div class="row">${chips(x)}</div>
  ${x.off ? "" : isDirect(x) ? buyBox(x, r) : ""}${!x.off && useRk(x) ? `<div class="acts"><span class="pr-tag" data-rk-pr="${esc(rkKey(x))}" hidden>PR</span><a class="rk-buy" data-rk-link="${esc(rkKey(x))}" hidden rel="sponsored noopener" target="_blank">楽天市場で見る</a></div>` : ""}
  ${!x.off && useRk(x) ? `<p class="rk-rv" data-rk-rv="${esc(rkKey(x))}" hidden></p>` : ""}
  ${!x.off && useRk(x) ? `<p class="rk-price" data-rk-price="${esc(rkKey(x))}" hidden></p><p class="pr-note" data-rk-pr="${esc(rkKey(x))}" hidden>価格・評価は<span data-rk-at="${esc(rkKey(x))}"></span>時点の楽天市場の情報です。リンクは広告で、点数や順位には影響しません。<a href="${r("about/")}#ad">広告について</a></p>` : ""}
  </div></div>
  ${x.off ? offBlock(x, r) : ""}
  ${typeBlock(x, r)}
  <p class="lead">${esc(leadText(x))}</p>
  ${p.desc || p.scent ? `<div class="maker"><span class="lbl">メーカーの説明</span>${p.desc ? `<p>${esc(p.desc)}</p>` : ""}${p.scent ? `<p class="mk-scent"><b>香り</b>${esc(p.scent)}</p>` : ""}${p.infoSource && p.infoSource.url ? `<p class="small muted">出典：<a href="${esc(p.infoSource.url)}" rel="nofollow noopener" target="_blank">${esc((p.infoSource.url.split("/")[2] || "").replace(/^www\./, ""))}</a>（${esc(p.infoSource.date || "")}確認）の要約。効果を保証するものではありません。</p>` : ""}</div>` : ""}
  ${reviewBlock(x)}
  ${featOfBlock(x, r)}
  <section><h2>全成分と、それぞれの役割</h2>
    ${mix(x)}
    <p class="small muted">${p.kind === "quasi" ? `${x.a.items.some(i => i.active) ? '<span class="actkey"></span>青い行が有効成分。' : ""}その他の成分は、配合量の順とは限りません。` : "配合量の多い順です（1%以下は順不同）。"}</p>
    <div class="scroll"><table class="ings"><thead><tr><th>#</th><th>成分名</th><th>役割</th></tr></thead><tbody>
    ${x.a.items.map((it, i) => { const u = ingUrl.get(it.name); const nm = esc(C.norm(it.raw));
      return `<tr${it.active ? ' class="act"' : ""}><td class="mono">${i + 1}</td><td>${u ? `<a href="${r(u)}">${nm}</a>` : nm}${it.active ? '<span class="chip acc">有効成分</span>' : ""}<span class="desc">${esc(it.desc || (it.role === "unk" ? "辞書にない成分" : ""))}</span></td><td><span class="role" style="--c:var(${ROLE_C(C.compRole(it))})">${esc(ROLE_N(C.compRole(it)))}</span></td></tr>`; }).join("")}
    </tbody></table></div>
  </section>
  <section><h2>香りと、よく気にされる成分</h2>
    ${scentBlock(x)}
    <p class="small muted">商品を選ぶときに「入っているか」を確かめる人が多い成分です。好みで選ぶための目印で、危険かどうかを示すものではありません。</p>
    <ul class="flags">${flags.map(([n, on, d]) => `<li class="${on ? "on" : "off"}"><span aria-label="${on ? "入っている" : "入っていない"}">${on ? "●" : "－"}</span><b>${esc(n)}</b><small>${esc(d)}</small></li>`).join("")}</ul>
  </section>
  ${cmpOf(x).length ? `<section><h2>どっちが合う？近い商品と比べる</h2><div class="clist">${cmpOf(x).map(c => { const o = c.a === x ? c.b : c.a; return cmpCard(c, r, `${o.p.name}と比べる`); }).join("")}</div></section>` : ""}
  ${x.off ? "" : `<section><h2>成分が似ている${esc(catN)}</h2><div class="plist">${similar(x, 4).map(({ y, s }) => productCard(y, r, `共通の成分 ${Math.round(s * 100)}%`)).join("")}</div></section>`}
  ${exploreBlock(x, r)}
  <p class="src">出典：${s.url ? `<a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.label || s.url)}</a>` : esc(s.label || "")}${s.date ? `（${esc(s.date)}確認）` : ""}${p.jan ? `　JAN ${esc(p.jan)}` : ""}${p.note ? `<br>${esc(p.note)}` : ""}</p>
</article>`, { crumbs, cat: p.category });
});

/* ---------- 成分ページ ---------- */
/* 「何の成分？」「何のために入っている？」（data/ingredient-notes.json）と、「気をつけることは？」（化粧品基準）。
   2026年10月23日、ユーザーのOK。安全性・規制は一次資料（厚生労働省「化粧品基準」平成12年厚生省告示第331号）の範囲で、
   「危険」「有害」など規制の中身より強い言葉は使わない。表示名と告示の名前が違うものは対応を書いておく */
const NOTES = (() => { try { const j = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/ingredient-notes.json"), "utf8")); delete j._about; return new Map(Object.entries(j).map(([k, v]) => [C.key(k), v])); } catch (e) { return new Map(); } })();
const KSRC = { label: "厚生労働省「化粧品基準」", url: "https://www.mhlw.go.jp/file/06-Seisakujouhou-11120000-Iyakushokuhinkyoku/keshouhin-standard.pdf", date: "2026-10-23" };
const REG = new Map([
  ["安息香酸", { t: "防腐剤として、化粧品に配合できる量の上限が決められています（100gあたり0.2gまで。化粧品基準 別表第3の1「安息香酸」）。" }],
  ["安息香酸Na", { t: "防腐剤として、化粧品に配合できる量の上限が決められています（安息香酸塩類の合計で100gあたり1.0gまで。化粧品基準 別表第3の1「安息香酸塩類」）。" }],
  ["サリチル酸", { t: "化粧品の防腐剤として、配合できる量の上限が決められています（100gあたり0.20gまで。化粧品基準 別表第3の1「サリチル酸」）。医薬部外品の有効成分としての配合は、別の基準で承認されます。" }],
  ["ソルビン酸K", { t: "防腐剤として、化粧品に配合できる量の上限が決められています（ソルビン酸とその塩類の合計で100gあたり0.50gまで。化粧品基準 別表第3の1「ソルビン酸及びその塩類」）。" }],
  ["メチルパラベン", { t: "防腐剤として、化粧品に配合できる量の上限が決められています（パラベン類の合計で100gあたり1.0gまで。化粧品基準 別表第3の1「パラオキシ安息香酸エステル及びそのナトリウム塩」）。" }],
  ["フェノキシエタノール", { t: "防腐剤として、化粧品に配合できる量の上限が決められています（100gあたり1.0gまで。化粧品基準 別表第3の1「フェノキシエタノール」）。" }],
  ["イソプロピルメチルフェノール", { t: "化粧品の防腐剤として、洗い流すものか、粘膜に使うものかなど、化粧品の種類ごとに配合できる量が決められています（化粧品基準 別表第3の2）。医薬部外品の有効成分としての配合は、別の基準で承認されます。" }],
  ["クロルフェネシン", { t: "防腐剤として、洗い流すものか、粘膜に使うものかなど、化粧品の種類ごとに配合できる量が決められています（化粧品基準 別表第3の2）。" }],
  ["ピロクトンオラミン", { t: "化粧品の防腐剤として、化粧品の種類ごとに配合できる量が決められています（化粧品基準 別表第3の2）。医薬部外品の有効成分としての配合は、別の基準で承認されます。" }],
  ["ブチルカルバミン酸ヨウ化プロピニル", { t: "防腐剤として、化粧品の種類ごとに配合できる量が決められています（化粧品基準 別表第3の2）。" }],
  ["メチルイソチアゾリノン", { t: "防腐剤として、化粧品の種類ごとに配合できる量が決められています（化粧品基準 別表第3の2）。" }],
  ["ラウロイルサルコシンNa", { t: "化粧品の種類や使い方によって、配合の制限がある成分です（化粧品基準 別表第2の2「ラウロイルサルコシンナトリウム」）。" }],
  ["ユビキノン", { t: "化粧品の種類によって、配合の制限がある成分です（化粧品基準 別表第2の3「ユビデカレノン」）。" }]
].map(([k, v]) => [C.key(k), v]));
const regOf = name => REG.get(C.key(name)) || { t: "化粧品基準で、配合できる量の上限が決められた成分ではありません（この表示名で確認）。", none: true };
const noteOf = name => NOTES.get(C.key(name));

ING_PAGES.forEach(g => {
  const u = ingUrl.get(g.name);
  const others = [...g.aliases].filter(a => C.key(a) !== C.key(g.name));
  const tagTxt = g.tags.map(t => TAG_EXPLAIN[t]).filter(Boolean);
  const same = ING_PAGES.filter(h => h !== g && h.role === g.role).slice(0, 12);
  const top = g.uses.slice().sort((a, b) => a.pos / a.of - b.pos / b.of);
  /* 数字で見る（2026年10月22日）：手元の商品データから計算できることだけを出す。新しい主張は書かない */
  const catStat = CAT_ORDER.map(cat => { const n = P.filter(x => x.p.category === cat).length, k = g.uses.filter(u => u.x.p.category === cat).length; return { cat, n, k, pct: n ? Math.round(k / n * 100) : 0 }; }).filter(o => o.k > 0);
  const best = catStat.slice().sort((m, n) => n.k - m.k || n.pct - m.pct)[0]; // 件数のいちばん多いカテゴリ（1件中1件の100%などを避ける）
  const posU = g.uses.filter(u => !u.active && u.x.p.kind === "cosme");
  const bk = [0, 0, 0]; posU.forEach(u => bk[Math.min(2, Math.floor((u.pos - 1) / u.of * 3))]++);
  const coCnt = new Map(); g.uses.forEach(u => new Set(u.x.names).forEach(n => { if (n !== g.name && ingUrl.has(n)) coCnt.set(n, (coCnt.get(n) || 0) + 1); }));
  const co = [...coCnt].map(([n, c]) => ({ n, c, pct: Math.round(c / g.uses.length * 100), lift: c / g.uses.length - (ING.get(n).uses.length / P.length) }))
    .filter(o => o.c >= 2 && o.lift > 0.1).sort((m, n) => n.lift - m.lift).slice(0, 8);
  const dataLead = best ? `クラベルに登録している${CAT_N[best.cat]}では、${best.n}件のうち${best.k}件（${best.pct}%）に入っています。` : "";
  const nf = noteOf(g.name), faqQ = nf && nf.faq ? nf.faq.map(o => o.q).join("／") : "";
  /* 検索結果での見え方（2026-11-01）：成分名＋「美容」「コスメ」の検索で5位前後に出てもクリックが0だったため、
     タイトルに役割（保湿など）と件数、説明文の先頭に「答え」（何の成分か）と、成分表での別の書かれ方を入れる。
     「同じ成分」と言い切るのは notes の same だけ。まとめて数えている表示名は「仲間」と書く（本文と同じ扱い） */
  const sameT = new Set(((nf && nf.same) || []).map(C.key));
  const altSame = others.filter(a => sameT.has(C.key(a))), altGroup = others.filter(a => !sameT.has(C.key(a)));
  const roleT = ["other", "unk"].includes(g.role) ? "" : `${ROLE_N(g.role)}の成分`;
  const titleName = altSame.length && (g.name + altSame[0]).length <= 24 ? `${g.name}（${altSame[0]}）` : g.name;
  const pageTitle = `${titleName}とは？${roleT ? roleT + "｜" : ""}化粧品での役割と入っている商品${g.uses.length}件`;
  const answer = (nf ? nf.what + nf.why : `${g.desc}。`).replace(/\s+/g, "");
  const altTxt = (altSame.length ? `「${altSame.slice(0, 3).join("」「")}」とも表示されます。` : "")
    + (altGroup.length ? `成分表で「${altGroup.slice(0, 3).join("」「")}」と書かれる仲間の成分もまとめて数えています。` : "");
  const desc = `${g.name}とは？${altTxt}${answer}入っている商品${g.uses.length}件を成分表での位置つきで紹介。${faqQ ? `よくある疑問（${faqQ}）にも。` : ""}`;
  write(u, pageTitle, desc, r => `
<article>
  <p class="eyebrow">成分</p>
  <h1>${esc(g.name)}<span class="sub">とは</span></h1>
  <div class="row"><span class="role big" style="--c:var(${ROLE_C(g.role)})">${esc(ROLE_N(g.role))}</span>${tagTxt.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
  ${(() => { const n = noteOf(g.name), rg = regOf(g.name), srcs = [...(n && n.src || []), KSRC];
    return `<div class="qa">
    <div class="qa-c"><p class="qa-q"><span class="qa-i" aria-hidden="true">?</span>何の成分？</p><p>${esc(n ? n.what : g.desc + "。")}</p></div>
    <div class="qa-c"><p class="qa-q"><span class="qa-i" aria-hidden="true">◎</span>何のために入っている？</p><p>${esc(n ? n.why : `「${ROLE_N(g.role)}」の役割で配合されます。`)}</p></div>
    <div class="qa-c${rg.none ? "" : " reg"}"><p class="qa-q"><span class="qa-i" aria-hidden="true">!</span>気をつけることは？</p><p>${esc(rg.t)}</p></div>
    <p class="qa-src">出典：${srcs.map(o => `<a href="${esc(o.url)}" rel="nofollow noopener" target="_blank">${esc(o.label)}</a>`).join("・")}（${esc(srcs.map(o => o.date || KSRC.date).sort().pop())}確認）。効果や安全性を保証するものではありません。</p>
  </div>`; })()}
  <p class="lead">${esc(dataLead)}</p>
  <p class="jump"><a class="btn solid wide" href="#ing-products">${esc(g.name)}が入っている商品（${g.uses.length}件）を見る<span aria-hidden="true">↓</span></a></p>
  ${(() => { /* 2026-10-26：辞書は似た働きの成分を1つにまとめて数えているので、「別の表示名」と言い切れるのは
       説明に same として書いたものだけ。ほかは「まとめて数えている表示名」と書く */
    const n = noteOf(g.name) || {}, sameK = new Set((n.same || []).map(C.key));
    const same = others.filter(a => sameK.has(C.key(a))), grouped = others.filter(a => !sameK.has(C.key(a)));
    return (same.length ? `<p class="small">同じ成分の別の表示名：${same.map(esc).join("、")}<br><span class="muted">化粧品と医薬部外品では、同じ成分でも表示名が違うことがあります。</span></p>` : "")
      + (grouped.length ? `<p class="small">クラベルでは、次の表示名もこの成分の仲間としてまとめて数えています：${grouped.map(esc).join("、")}<br><span class="muted">似た働きの成分を1つにまとめているもので、同じ成分とは限りません。</span></p>` : ""); })()}
  ${(() => { const n = noteOf(g.name); return n && n.points ? `<section class="ipoints"><h2>知っておくと分かりやすいこと</h2><ul>${n.points.map(t => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""; })()}
  <section class="idata"><h2>数字で見る${esc(g.name)}</h2>
    <p class="big-stat"><b class="mono">${g.uses.length}</b><span>件に入っている<small>（登録している${P.length}件のうち）</small></span></p>
    <div class="cbars">${catStat.map(o => `<div class="cbar"><span class="cl-n">${esc(CAT_N[o.cat])}</span><span class="st"><i style="width:${o.pct}%"></i></span><b class="mono">${o.pct}%</b><small class="mono">${o.k}/${o.n}</small></div>`).join("")}</div>
    ${(() => { /* 成分表での書かれ方（2026-10-26）：まとめて数えている表示名ごとの件数。手元の商品データから数えるだけ */
      const m = new Map(); g.uses.forEach(u => { const nm = C.norm(u.raw || g.name), k = C.key(nm); const o = m.get(k) || { nm, c: 0 }; o.c++; m.set(k, o); });
      if (m.size < 2) return "";
      const L = [...m.values()].sort((a, b) => b.c - a.c), mx = L[0].c;
      return `<h3>成分表での書かれ方</h3><div class="cbars names">${L.map(o => `<div class="cbar"><span class="cl-n">${esc(o.nm)}</span><span class="st"><i style="width:${Math.round(o.c / mx * 100)}%"></i></span><b class="mono">${o.c}件</b></div>`).join("")}</div><p class="small muted">商品の成分表に書かれている名前ごとの件数です。</p>`; })()}
    ${posU.length >= 2 ? `<h3>成分表での位置</h3><div class="pbar" role="img" aria-label="前のほう${bk[0]}件、真ん中${bk[1]}件、後ろのほう${bk[2]}件"><i class="p0" style="flex:${bk[0]}"></i><i class="p1" style="flex:${bk[1]}"></i><i class="p2" style="flex:${bk[2]}"></i></div>
      <div class="pleg"><span><b class="mono">${bk[0]}</b>前のほう</span><span><b class="mono">${bk[1]}</b>真ん中</span><span><b class="mono">${bk[2]}</b>後ろのほう</span></div>
      <p class="small muted">化粧品${posU.length}件で数えています。化粧品の成分表は配合量の多い順（1%以下は順不同）です。</p>` : ""}
    ${co.length ? `<h3>よく一緒に入っている成分</h3><div class="tags">${co.map(o => `<a class="tagl" href="${r(ingUrl.get(o.n))}">${esc(o.n)}<span class="mono">${o.pct}%</span></a>`).join("")}</div><p class="small muted">${esc(g.name)}が入っている商品のうち、その成分も入っている割合です。</p>` : ""}
  </section>
  ${(() => { const n = noteOf(g.name); return n && n.faq ? `<section class="ifaq"><h2>${esc(g.name)}のよくある疑問</h2>${n.faq.map(o => `<div class="qa-c"><h3 class="qa-q"><span class="qa-i" aria-hidden="true">Q</span>${esc(o.q)}</h3><p>${esc(o.a)}</p></div>`).join("")}</section>` : ""; })()}
  <section id="ing-products"><h2>${esc(g.name)}が入っている商品（${g.uses.length}件）</h2>
    <p class="small muted">「◯番目／全◯成分」は成分表での位置です。化粧品では前のほうほど配合量が多い目安になります。医薬部外品は配合量の順とは限りません。「有効成分として配合」は、医薬部外品の有効成分として表示されているものです（有効成分は成分表の先頭に別枠で書かれるため、位置は出していません）。</p>
    <div class="plist">${top.map(({ x, pos, of, active, raw }) => { const rn = raw ? C.norm(raw) : "", shown = rn && C.key(rn) !== C.key(g.name) ? `・表示名「${esc(rn)}」` : "";
      return productCard(x, r, (active ? `有効成分として配合（全${of}成分）` : `${pos}番目／全${of}成分`) + shown, { posOnly: true }); }).join("")}</div>
  </section>
  ${same.length ? `<section><h2>同じ「${esc(ROLE_N(g.role))}」の成分</h2><div class="tags">${same.map(h => `<a class="tagl" href="${r(ingUrl.get(h.name))}">${esc(h.name)}<span class="mono">${h.uses.length}</span></a>`).join("")}</div></section>` : ""}
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
  /* 検索の言葉（「アムウェイ シャンプー 成分」など）とそろえるため、商品名の先頭がそろってメーカー名になっていれば添え、
     カテゴリが1つならその名前を使う（2026年10月22日、ユーザーと決定）。URLは変えない */
  const heads = new Set(list.map(x => String(x.p.name).split(/[\s　]+/)[0]));
  const mk = heads.size === 1 && ![...heads][0].includes(b) && !b.includes([...heads][0]) ? [...heads][0] : "";
  const full = mk ? `${mk} ${b}` : b;
  const cats = [...new Set(list.map(x => x.p.category))];
  const what = cats.length === 1 ? (CAT_N[cats[0]] || "商品") : "商品";
  write(u, `${full}の${what}と成分`, `${full}の${what}${list.length}件の成分を一覧で比べられます。全商品に共通する成分と、商品ごとの違いも。`, r => `
<h1>${esc(full)} の${esc(what)}と成分</h1><p class="lead">登録している${esc(b)}の商品は${list.length}件です。</p>
${common.length ? `<section><h2>全商品に共通する成分</h2><div class="tags">${common.map(n => `<a class="tagl" href="${r(ingUrl.get(n))}">${esc(n)}</a>`).join("")}</div></section>` : ""}
<section><h2>商品</h2><div class="plist">${list.slice().sort((a, b) => (b.match || 0) - (a.match || 0)).map(x => productCard(x, r)).join("")}</div></section>
${(() => { const L = OFF.filter(x => x.p.brand === b); return L.length ? `<section><h2>製造終了品</h2><p class="small muted">いまは作られていない商品です。成分表と、成分が近い商品を見られます。</p><div class="plist">${L.map(x => productCard(x, r, "製造終了品")).join("")}</div></section>` : ""; })()}
${(() => { const L = [...CMP.values()].filter(c => c.a.p.brand === b && c.b.p.brand === b); return L.length ? `<section><h2>${esc(b)}の商品どうし、どっちが合う？</h2><div class="clist">${L.map(c => cmpCard(c, r, "")).join("")}</div></section>` : ""; })()}`,
    { crumbs: [["トップ", ""], ["ブランド", "brands/"], [b, u]] });
});
/* ---------- AとBの違い ----------
   2026-10-22 ユーザーの指摘で作り直し：長い商品名を見出しにしない／点数とグラフで「読まなくても分かる」／
   「で、どっちが合うの？」に答える（成分表から見た向き・不向きを言い切る。効果は約束しない） */
const buyLink = (x, r) => isDirect(x)
  ? shopBtns(x)
  : useRk(x) ? `<span class="pr-tag" data-rk-pr="${esc(rkKey(x))}" hidden>PR</span><a class="rk-buy" data-rk-link="${esc(rkKey(x))}" hidden rel="sponsored noopener" target="_blank">楽天市場で見る</a>` : "";
const ingList = (L, r) => L.length ? `<div class="tags">${L.map(it => { const u = ingUrl.get(it.name); const nm = esc(C.norm(it.raw)); return u ? `<a class="tagl" href="${r(u)}">${nm}</a>` : `<span class="tagl plain">${nm}</span>`; }).join("")}</div>` : `<p class="small muted">ありません。</p>`;
/* 観点ごとに「こんな人に」。成分表から見た処方の傾向として書き、効果は書かない */
const REC = {
  mild: "洗浄成分のやさしさ重視", clean: "皮脂をしっかり落としたい", scalp: "頭皮ケアの成分がほしい", repair: "補修成分がほしい",
  smooth: "指通り・まとまり重視", gentle: "刺激になりやすい成分を減らしたい", moist: "うるおい成分がほしい", barrier: "油分でしっかり保護したい",
  light: "軽い使い心地が好き", beauty: "ビタミン類などのケア成分がほしい", concern: "シミ・ハリ向けの成分がほしい"
};
function recs(x, y) {
  const out = [];
  if (x.sc && y.sc) C.CATS[x.p.category].themes.map(t => ({ k: t.k, d: x.sc.v[t.k] - y.sc.v[t.k] })).filter(g => g.d >= 0.5 && REC[g.k]).sort((m, n) => n.d - m.d).slice(0, 2).forEach(g => out.push(REC[g.k]));
  const has = (z, t) => z.tags.has(t);
  if (!has(x, "fragrance") && has(y, "fragrance")) out.push("無香料がいい");
  if (has(x, "fragrance") && !has(y, "fragrance")) out.push("香りも楽しみたい");
  if (has(x, "menthol") && !has(y, "menthol")) out.push("スーッとする感じが好き");
  if (!has(x, "menthol") && has(y, "menthol")) out.push("スーッとする感じが苦手");
  if (!has(x, "silicone") && has(y, "silicone")) out.push("ノンシリコンがいい");
  if (!has(x, "strongSurf") && has(y, "strongSurf")) out.push("硫酸系の洗浄成分を避けたい");
  if (x.p.kind === "quasi" && y.p.kind !== "quasi") out.push("医薬部外品がいい");
  if (x.p.target === "men" && y.p.target !== "men") out.push("男性向けがいい");
  return out.slice(0, 4);
}
function radar2(a, b, la, lb) {
  const cat = a.p.category, T = C.CATS[cat].themes, L = AX_LABEL[cat] || {};
  const W = 440, H = 310, cx = 220, cy = 156, R = 100, n = T.length;
  const pt = (i, v) => { const g = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(g) * R * v / 5, cy + Math.sin(g) * R * v / 5]; };
  const poly = f => T.map((t, i) => pt(i, f(t)).map(z => z.toFixed(1)).join(",")).join(" ");
  const rings = [1, 2, 3, 4, 5].map(l => `<polygon points="${poly(() => l)}" class="rg${l === 5 ? " out" : ""}"/>`).join("");
  const spokes = T.map((t, i) => { const [ex, ey] = pt(i, 5); return `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" class="sp"/>`; }).join("");
  const labels = T.map((t, i) => { const g = -Math.PI / 2 + i * 2 * Math.PI / n, lx = cx + Math.cos(g) * (R + 26), ly = cy + Math.sin(g) * (R + 22);
    const anc = Math.abs(Math.cos(g)) < 0.2 ? "middle" : Math.cos(g) > 0 ? "start" : "end";
    return `<text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="${anc}" class="ln">${esc(L[t.k] || t.s)}</text><text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${anc}" class="lv"><tspan class="va">${a.sc.v[t.k].toFixed(1)}</tspan> / <tspan class="vb">${b.sc.v[t.k].toFixed(1)}</tspan></text>`; }).join("");
  return `<svg class="radar r2" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.map(t => `${L[t.k] || t.s} ${la}${a.sc.v[t.k]}・${lb}${b.sc.v[t.k]}`).join("、"))}（5点満点）">
${rings}${spokes}<polygon points="${poly(t => b.sc.v[t.k])}" class="pb"/><polygon points="${poly(t => a.sc.v[t.k])}" class="pa"/>${labels}</svg>`;
}
CMP.forEach(c => {
  const { a, b } = c;
  const { h, la, lb } = c;
  const uniqIt = x => { const seen = new Set(); return x.a.items.filter(it => !seen.has(it.name) && seen.add(it.name)); };
  const IA = uniqIt(a), IB = uniqIt(b), NA = new Set(a.names), NB = new Set(b.names);
  const common = IA.filter(it => NB.has(it.name)), onlyA = IA.filter(it => !NB.has(it.name)), onlyB = IB.filter(it => !NA.has(it.name));
  const scored = !!(a.sc && b.sc);
  const ra = recs(a, b), rb = recs(b, a);
  const win = scored && a.match !== b.match ? (a.match > b.match ? "a" : "b") : "";
  const title = `${h}の違い｜どっちが合う？成分で比較`;
  const desc = `${a.p.name}と${b.p.name}を成分表で比べ、どんな人に向くかをまとめました。${scored ? "点数とグラフ、" : ""}香料・シリコーンなどの有無、片方だけに入っている成分。`;
  const nameA = `<b class="na">${esc(la)}</b>`, nameB = `<b class="nb">${esc(lb)}</b>`;
  const card = (x, lab, cls, r) => `<div class="cmp-p ${cls}${win === cls ? " win" : ""}">${win === cls ? `<span class="crown">迷ったらこっち</span>` : ""}<a href="${r(x.url)}">${imgSlot(x, "thumb")}<span class="cmp-lab">${wb(lab)}</span>${scored ? `<span class="cmp-sc">${scoreBadge(x)}</span>` : ""}${useRk(x) ? `<span class="rk-rv sm" data-rk-rv="${esc(rkKey(x))}" hidden></span>` : ""}<span class="cmp-full">${esc(x.p.name)}</span></a><div class="acts">${buyLink(x, r)}</div></div>`;
  const near = c.s >= 0.78 || onlyA.length + onlyB.length <= 4; // ほぼ同じ商品どうし
  const diffChips = L => L.length ? `<ul class="chk dif">${L.slice(0, 6).map(it => `<li>${esc(C.norm(it.raw))}<small>${esc(ROLE_N(C.compRole(it)))}</small></li>`).join("")}${L.length > 6 ? `<li>ほか${L.length - 6}種類</li>` : ""}</ul>` : `<p class="small">この商品だけの成分はありません</p>`;
  const forWho = (lab, R, cls, only) => `<div class="fw ${cls}">${R.length && !near ? `<p class="fw-h"><b>${esc(lab)}</b> が合う人</p><ul class="chk">${R.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="fw-h"><b>${esc(lab)}</b> だけに入っている成分</p>${diffChips(only)}`}</div>`;
  const bar = (n, v, cls) => `<div class="sbar ${cls}"><span class="sl">${n}</span><span class="st"><i style="width:${v}%"></i></span><b class="mono">${v}</b></div>`;
  const tot = common.length + onlyA.length + onlyB.length || 1;
  const mark = on => on ? `<span class="mk-on" aria-label="入っている">●</span>` : `<span class="mk-off" aria-label="入っていない">－</span>`;
  write(c.url, title, desc, r => `
<article class="cmp">
  <p class="eyebrow">どっちが合う？${c.br ? "　" + esc(c.br) : ""}</p>
  <h1><span class="ha">${wb(la)}</span><span class="hv">と</span><span class="hb">${wb(lb)}</span><span class="sub">の違い</span></h1>
  <div class="cmp-head">${card(a, la, "a", r)}${card(b, lb, "b", r)}</div>
  <section class="verdict"><h2>結論</h2>
    ${near ? `<p class="vd">ほぼ同じ商品です</p><p>全成分の<b>${Math.round(c.s * 100)}%</b>が共通。違いは下の成分だけです。${scored && win ? `点数は ${win === "a" ? nameA : nameB} が少し上です。` : ""}</p>${scored ? bar(esc(la), a.match, "a") + bar(esc(lb), b.match, "b") : ""}`
      : scored ? `<p class="vd">${win ? `迷ったら ${win === "a" ? nameA : nameB}` : "点数は同じ。合う人で選ぶ"}</p>${bar(esc(la), a.match, "a")}${bar(esc(lb), b.match, "b")}<p class="small muted">クラベルの点数（100点満点）</p>` : `<p class="vd">合う人で選ぶ</p>`}
    <div class="fws">${forWho(la, ra, "a", onlyA)}${forWho(lb, rb, "b", onlyB)}</div>
    <p class="small muted">成分表から見た向き・不向きです。効果や使い心地を約束するものではありません。</p></section>
  ${scored ? `<section><h2>成分のバランス</h2><p class="legend l2"><span><span class="lg la"></span>${esc(la)}</span><span><span class="lg lb"></span>${esc(lb)}</span></p>${radar2(a, b, la, lb)}
    <p class="small muted">5点満点。<a href="${r("about/scoring/")}">点数のつけ方</a></p></section>` : ""}
  <section><h2>よく気にされる成分</h2><div class="scroll"><table class="ings cmp-t"><thead><tr><th></th><th class="ca">${esc(la)}</th><th class="cb">${esc(lb)}</th></tr></thead><tbody>
    ${FLAGS.map(([t, n]) => `<tr${a.tags.has(t) !== b.tags.has(t) ? ' class="diff"' : ""}><td>${esc(n)}</td><td>${mark(a.tags.has(t))}</td><td>${mark(b.tags.has(t))}</td></tr>`).join("")}
    </tbody></table></div><p class="small muted">● 入っている　－ 入っていない　色つきの行は違いがあるところ（良い・悪いではありません）</p></section>
  <section><h2>成分の違い</h2>
    <div class="vbar" role="img" aria-label="共通${common.length}種類、${esc(la)}だけ${onlyA.length}種類、${esc(lb)}だけ${onlyB.length}種類"><i class="va" style="flex:${onlyA.length}"></i><i class="vc" style="flex:${common.length}"></i><i class="vb" style="flex:${onlyB.length}"></i></div>
    <div class="vleg"><span class="a"><b class="mono">${onlyA.length}</b>${esc(la)}だけ</span><span class="c"><b class="mono">${common.length}</b>共通</span><span class="b"><b class="mono">${onlyB.length}</b>${esc(lb)}だけ</span></div>
    <details class="more"><summary>${esc(la)}だけの成分</summary>${ingList(onlyA, r)}</details>
    <details class="more"><summary>${esc(lb)}だけの成分</summary>${ingList(onlyB, r)}</details>
    <details class="more"><summary>共通の成分</summary>${ingList(common, r)}</details></section>
  ${(isDirect(a) || isDirect(b) || useRk(a) || useRk(b)) ? `<p class="pr-note">「楽天市場で見る」などは広告のリンクです。紹介料の有無は、点数や順位に関係しません。<a href="${r("about/")}#ad">広告について</a></p>` : ""}
  <p class="small muted">全成分・出典は商品のページで：<a href="${r(a.url)}">${esc(a.p.name)}</a>／<a href="${r(b.url)}">${esc(b.p.name)}</a></p>
</article>`, { crumbs: [["トップ", ""], ["どっちが合う？", "compare/"], [h, c.url]], cat: a.p.category });
});
if (CMP.size) write("compare/", "どっちが合う？成分で比べる", `同じブランド・同じメーカーの近い商品どうし${CMP.size}組を、成分表から見てどんな人に向くかで比べました。`, r => `\n<h1>どっちが合う？</h1><p class="lead">同じブランドや同じメーカーの近い商品どうしを、成分表から見て「どんな人に向くか」で比べています。</p>
${CAT_ORDER.filter(cat => [...CMP.values()].some(c => c.a.p.category === cat)).map(cat => `<section><h2>${esc(CAT_N[cat])}</h2><div class="clist">${[...CMP.values()].filter(c => c.a.p.category === cat).sort((m, n) => (m.a.p.brand || "").localeCompare(n.a.p.brand || "", "ja")).map(c => cmpCard(c, r, `${c.a.p.name} ／ ${c.b.p.name}`)).join("")}</div></section>`).join("")}`,
  { crumbs: [["トップ", ""], ["どっちが合う？", "compare/"]] });

write("brands/", "ブランドの一覧",`クラベルに登録した商品のブランド一覧です。`, r => `
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

/* ---------- 特集（企画ページ）：data/features.json（2026-11-04、ユーザーの依頼で新設。手順は spec.md 12章） ----------
   需要がありそうなテーマ・流行りそうなテーマを先取りして、決まった型で比べるページ。
   一覧に入れる根拠（メーカー・販売店の説明の言葉）と出典を商品ごとに載せ、効果は書かない。 */
const FEATURES = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data/features.json"), "utf8")).features || []; } catch (e) { return []; } })();
const F_FAMOUS = [[/ナイアシンアミド|ニコチン酸アミド/, "ナイアシンアミド"], [/アスコルビ/, "ビタミンC誘導体"], [/トラネキサム/, "トラネキサム酸"], [/グリチルリチン/, "グリチルリチン酸2K"],
  [/セチルpgヒドロキシエチルパルミタミド|セラミド/, "セラミド（擬似セラミドを含む）"], [/ヒアルロン/, "ヒアルロン酸"], [/コラーゲン/, "コラーゲン"], [/トコフェロール|ビタミンe/, "ビタミンE"],
  [/ユビキノン|ユビデカレノン/, "コエンザイムQ10"], [/レチノ/, "レチノール"], [/サリチル酸/, "サリチル酸"], [/アラントイン/, "アラントイン"], [/パンテノール/, "パンテノール"], [/スクワラン/, "スクワラン"], [/尿素|ウレア/, "尿素"]];
const F_ROLE_COLS = [["化粧水", /化粧水/], ["乳液", /乳液/], ["美容液", /美容液/], ["クリーム", /クリーム/], ["パック・マスク", /パック|マスク/]];
const F_FLAGS = [["fragrance", "香料"], ["alcohol", "アルコール"], ["menthol", "メントール"]];
const featureUrl = f => `features/${f.id}/`;
const fItems = L => (L || []).map(it => ({ ...it, x: byId.get(it.id) })).filter(it => it.x && !it.x.off);
FEATURES.forEach(f => { f.L = fItems(f.items); f.A = fItems(f.also && f.also.items); });
const FEATURES_ON = FEATURES.filter(f => f.L.length >= 3);
const shortOf = p => (p.name || "").replace(/^(花王|マンダム|ロート製薬|ファイントゥデイ|小林製薬|コーセー)\s*/, "");
const activesOf = x => [...new Set(x.a.items.filter(i => i.active).map(i => C.norm(i.raw)))];
FEATURES_ON.forEach(f => {
  /* 2026-11-05 書き直し（ユーザーの依頼）：結論を先に・目次・「オールインワンとは」・選び方の説明・ブランドごとの違い・1商品ずつの紹介文・疑問を増やす。
     注意書きは各所に散らさず、結論の下の1行と、最後の「このページの見方」にまとめる。文章はすべて商品データから作り、効果は書かない */
  const u = featureUrl(f), L = f.L, all = L.concat(f.A), n = L.length;
  const T = C.CATS[f.category].themes, TN = Object.fromEntries(T.map(t => [t.k, t.n]));
  /* テーマの種類：何役の表示がある商品の特集（オールインワン）か、それ以外（シミ対策など）か。点数のない種類（美容液など）も混ざる */
  const aio = f.L.some(it => it.n), sv = (it, k) => it.x.sc && it.x.sc.v ? it.x.sc.v[k] : 0, fill = t => String(t || "").replace(/\{n\}/g, f.L.length);
  const nameOf = it => shortOf(it.x.p);
  const link = (it, r) => `<a href="${r(it.x.url)}">${esc(nameOf(it))}</a>`;
  const jn = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join("、") + "と" + a[a.length - 1];
  const sorted = L.slice().sort((a, b) => (b.x.match || 0) - (a.x.match || 0));
  const avgOf = (l, fn) => l.length ? Math.round(l.reduce((s, it) => s + fn(it), 0) / l.length * 10) / 10 : 0;
  const cnt = (it, role) => it.x.a.items.filter(i => i.role === role).length;
  const byN = [...new Set(L.map(it => it.n).filter(v => v))].sort((a, b) => b - a);
  const nMin = byN.length ? Math.min(...byN) : 0, nMax = byN.length ? Math.max(...byN) : 0;
  const quasi = L.filter(it => it.x.p.kind === "quasi");
  const famOf = it => F_FAMOUS.filter(([re]) => it.x.a.items.some(i => re.test(C.key(i.raw)) || re.test(C.key(i.name)))).map(([, d]) => d);
  const fam = F_FAMOUS.map(([re, d]) => { const hit = L.filter(it => it.x.a.items.some(i => re.test(C.key(i.raw)) || re.test(C.key(i.name))));
    const one = L.map(it => it.x.a.items.find(i => re.test(C.key(i.raw)) || re.test(C.key(i.name)))).find(Boolean);
    return { d, hit, link: one && ingUrl.get(one.name) }; }).filter(o => o.hit.length).sort((a, b) => b.hit.length - a.hit.length).slice(0, 8);
  const light = L.filter(it => /ジェル|乳液|化粧水|美容液|ローション/.test(it.type) && !/クリーム|バーム/.test(it.type)), rich = L.filter(it => /クリーム|バーム/.test(it.type));
  const free = L.filter(it => F_FLAGS.every(([t]) => !it.x.tags.has(t)));
  const noFlag = F_FLAGS.map(([t, nm]) => ({ nm, l: L.filter(it => !it.x.tags.has(t)) }));
  const actAll = [...new Set(quasi.flatMap(it => activesOf(it.x)))];
  const actLink = (a, r) => { const i = quasi.map(it => it.x.a.items.find(v => v.active && C.norm(v.raw) === a)).find(Boolean); const lu = i && ingUrl.get(i.name); return lu ? `<a class="tagl" href="${r(lu)}">${esc(a)}</a>` : `<span class="tagl">${esc(a)}</span>`; };
  const ACTG = [[/トラネキサム/, "トラネキサム酸"], [/ナイアシンアミド|ニコチン酸アミド/, "ナイアシンアミド"], [/アスコルビン酸|アスコルビ|ビタミンc/i, "ビタミンC（誘導体を含む）"], [/カモミラ/, "カモミラET"], [/グリチルリチン|グリチルレチン/, "甘草由来の成分（グリチルリチン酸2Kなど）"], [/サリチル酸/, "サリチル酸"], [/ピリドキシン/, "ビタミンB6"], [/トコフェロール/, "ビタミンE誘導体"], [/イソプロピルメチルフェノール/, "イソプロピルメチルフェノール"]];
  const actGroups = ACTG.map(([re, d]) => ({ d, l: L.filter(it => activesOf(it.x).some(a => re.test(C.key(a)))) })).filter(o => o.l.length);
  const actsTxt = jn(actGroups.slice(0, 3).map(o => o.d)) + (actGroups.length > 3 ? "など" : "");
  const anyUv = L.some(it => it.x.tags.has("uvabs") || it.x.a.items.some(i => i.role === "uv"));
  const top2 = it => !(it.x.sc && it.x.sc.v) ? [] : T.map(t => [t.k, it.x.sc.v[t.k]]).filter(([, v]) => v >= 4).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => TN[k]);
  const brands = [...new Set(L.map(it => it.x.p.brand))].map(b => ({ b, l: L.filter(it => it.x.p.brand === b) })).filter(o => o.l.length >= 2).sort((a, b) => ((f.brandFirst || []).indexOf(a.b) + 1 || 99) - ((f.brandFirst || []).indexOf(b.b) + 1 || 99) || b.l.length - a.l.length);
  const oilL = avgOf(light, it => cnt(it, "oil")), oilR = avgOf(rich, it => cnt(it, "oil"));
  const flagTxt = it => { const on = F_FLAGS.filter(([t]) => it.x.tags.has(t)).map(([, nm]) => nm), off = F_FLAGS.filter(([t]) => !it.x.tags.has(t)).map(([, nm]) => nm);
    return on.length === 3 ? "香料・アルコール・メントールは、3つとも入っています。" : off.length === 3 ? "香料・アルコール・メントールは、3つとも入っていません。" : `${jn(on)}は入っていて、${jn(off)}は入っていません。`; };
  const introOf = it => { const p = it.x.p, act = activesOf(it.x), fm = famOf(it).slice(0, 4), tp = top2(it);
    return `${it.type}のタイプで、メーカーの表示では${it.n ? `${it.n}役${it.roles.length ? `（${it.roles.join("・")}）` : ""}` : "オールインワン"}です。` +
      (p.kind === "quasi" ? `医薬部外品（薬用）で、有効成分は${jn(act)}です。` : "化粧品です。") +
      (fm.length ? `よく知られた成分では、${jn(fm)}が成分表に入っています。` : "") +
      `全成分は${it.x.a.items.length}種類${cnt(it, "oil") ? `で、そのうち油性の成分は${cnt(it, "oil")}種類` : ""}。` +
      (tp.length ? `成分の傾向スコアでは「${tp.join("」「")}」が高めに出ています。` : "") + flagTxt(it); };
  const sumOf = it => { const tp = top2(it); return (aio ? `${it.type}のタイプで、メーカーの表示では${it.n ? `${it.n}役` : "オールインワン"}。` : `${it.type}のタイプで、有効成分は${jn(activesOf(it.x))}。`) + (tp.length ? `成分の傾向スコアでは「${tp.join("」「")}」が高めです。` : "") + (!(it.x.sc && it.x.sc.v) ? "美容液は点数を付けていない種類です。" : cnt(it, "oil") <= oilL ? "油性の成分は少なめです。" : cnt(it, "oil") >= oilR ? "油性の成分は多めです。" : ""); };
  const factsOf = (it, r) => { const act = activesOf(it.x), fm = famOf(it);
    return `<dl class="ffx"><div><dt>区分</dt><dd>${it.x.p.kind === "quasi" ? `医薬部外品（有効成分：${act.map(esc).join("・")}）` : "化粧品"}</dd></div>` +
      (aio ? `<div><dt>兼ねる役割</dt><dd>${it.roles.length ? esc(it.roles.join("・")) : `${it.n ? it.n + "役" : "―"}（内訳の表示なし）`}</dd></div>` : `<div><dt>説明の表示</dt><dd>「${esc(it.say)}」</dd></div>`) +
      (fm.length ? `<div><dt>よく知られた成分</dt><dd>${esc(fm.join("・"))}</dd></div>` : "") +
      `<div><dt>全成分</dt><dd>${it.x.a.items.length}種類（うち油性の成分${cnt(it, "oil")}種類）</dd></div>` +
      `<div><dt>香り・清涼感</dt><dd class="ffl">${F_FLAGS.map(([t, nm]) => `<span class="${it.x.tags.has(t) ? "on" : ""}">${nm} ${it.x.tags.has(t) ? "あり" : "なし"}</span>`).join("")}</dd></div></dl>`; };
  const bars = it => !(it.x.sc && it.x.sc.v) ? "" : `<div class="fth">${T.map(t => `<div><span>${esc(t.n.replace(/（.*）/, ""))}</span><i aria-hidden="true"><b style="width:${it.x.sc.v[t.k] / 5 * 100}%"></b></i><em class="mono">${it.x.sc.v[t.k].toFixed(1)}</em></div>`).join("")}</div>`;
  const mini = (l, r) => l.length ? `<div class="tags">${l.map(it => `<a class="tagl" href="${r(it.x.url)}">${esc(nameOf(it))}</a>`).join("")}</div>` : `<p class="small muted">当てはまる商品はありません。</p>`;
  const brandTxt = o => { const b = o.l, q = b.filter(it => it.x.p.kind === "quasi"), sn = it => nameOf(it).replace(o.b, "").trim() || nameOf(it);
    return `${o.b}の${aio ? "オールインワン" : "商品"}は${b.length}種類です。タイプは${jn([...new Set(b.map(it => it.type))])}で、` +
      (!aio ? `有効成分は${b.map(it => `${sn(it)}が${activesOf(it.x).join("・")}`).join("、")}です。` : q.length ? `${q.map(it => `${nameOf(it)}は医薬部外品（有効成分：${activesOf(it.x).join("・")}）`).join("、")}${q.length < b.length ? "、ほかは化粧品" : ""}です。` : "すべて化粧品です。") +
      (b.some(it => !it.x.sc) ? "" : aio ? `いちばん大きな違いは、油性の成分の数（${b.map(it => `${sn(it)} ${cnt(it, "oil")}種類`).join("・")}）です。` : `使い心地の目安になる油性の成分の数は、${b.map(it => `${sn(it)}が${cnt(it, "oil")}種類`).join("、")}です。`); };
  const faqAio = [
    { q: "オールインワンは、化粧水や乳液と何が違うの？", a: `ふつうは化粧水・乳液・クリームと順に重ねるところを、1つで済ませられるようにした商品です。このページの商品は、メーカーが「1品で◯役」「オールインワン」と表示しているもので、何役を兼ねるかは${nMin}役から${nMax}役まで商品ごとに違います。` },
    { q: "オールインワンだけで、ほかに何も塗らなくていい？", a: `メーカーが「1品で◯役」と表示している役割は、その1つで済ませる前提の商品です。${anyUv ? "" : "ただし、このページの商品には紫外線吸収剤・散乱剤が入っていないため、日中の紫外線対策は日焼け止めなどで別に考えます。"}使う量と使い方は、各商品の表示どおりにしてください。` },
    { q: "ジェルとクリーム、どっちを選べばいい？", a: `成分表で油性の成分を数えると、ジェル・乳液・化粧水のタイプは平均${oilL}種類、クリームのタイプは平均${oilR}種類でした。一般に、油性の成分が少ないほど軽い使い心地、多いほどしっとりした使い心地の商品になりやすい傾向があります。ベタつきが苦手ならジェル寄り、乾燥しやすい季節はクリーム寄り、と季節で使い分ける人もいます。` },
    { q: "医薬部外品（薬用）と化粧品は、どう違うの？", a: `医薬部外品は、有効成分と、表示できる効能・効果が国に認められた商品です。このページでは${n}件中${quasi.length}件が医薬部外品で、有効成分は${jn(actAll)}でした。効能の言葉は、パッケージや公式ページの表示で確かめてください。` },
    ...brands.slice(0, 1).map(o => ({ q: `${o.b}のオールインワンは、どれがどう違うの？`, a: brandTxt(o) })),
    { q: "「◯役」の数が多いほど、良い商品なの？", a: `役の数は、メーカーが何の役割を兼ねるとしているかの表示です。このページの商品では、${byN.map(v => `${v}役の商品の成分数は平均${avgOf(L.filter(it => it.n === v), it => it.x.a.items.length)}種類`).join("、")}でした。役の数で成分の量や効き目が決まるわけではありません。` },
    { q: "香料やアルコールが入っていないものはある？", a: `${noFlag.map(o => `${o.nm}が入っていないのは${!o.l.length ? "0件" : o.l.length === n ? `全${n}件` : o.l.length <= 5 ? `${o.l.map(nameOf).join("、")}の${o.l.length}件` : `${o.l.length}件（${[...new Set(o.l.map(it => it.x.p.brand))].map(b => `${b}${o.l.filter(it => it.x.p.brand === b).length}`).join("・")}）`}`).join("、")}です。${free.length ? `3つとも入っていないのは${free.length}件です。` : "3つとも入っていない商品はありませんでした。"}香りやスーッとする感じの好みで選ぶ目印にしてください。` }
  ];
  const faq = aio ? faqAio : [...(f.faq || []).map(o => ({ q: fill(o.q), a: fill(o.a) })),
    ...(!anyUv ? [{ q: "日焼け止めは別に要る？", a: "このページの商品には、紫外線吸収剤・散乱剤が入っていません。日中の紫外線対策は、日焼け止めなどで別に考えます。" }] : []),
    ...brands.slice(0, 1).map(o => ({ q: `${o.b}の商品は、どれがどう違うの？`, a: brandTxt(o) })),
    faqAio[faqAio.length - 1]];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "FAQPage", mainEntity: faq.map(o => ({ "@type": "Question", name: o.q, acceptedAnswer: { "@type": "Answer", text: o.a } })) },
    { "@type": "ItemList", name: f.title, itemListElement: sorted.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.x.p.name, url: SITE ? `${SITE}/${it.x.url}` : undefined })) }] };
  const anyRk = all.some(it => useRk(it.x)), anyDirect = all.some(it => isDirect(it.x));
  const rowOf = (it, r) => `<tr><th scope="row">${link(it, r)}</th><td>${esc(it.type)}</td>${aio ? `<td class="mono">${it.n ? it.n + "役" : "―"}</td>` : ""}<td>${it.x.p.kind === "quasi" ? `<span class="fq">薬用</span>` : "化粧品"}</td><td class="fa">${activesOf(it.x).map(esc).join("<br>") || "―"}</td>${F_FLAGS.map(([t]) => `<td>${it.x.tags.has(t) ? "あり" : `<span class="fn">なし</span>`}</td>`).join("")}</tr>`;
  const roleRow = (it, r) => `<tr><th scope="row">${link(it, r)}</th>${F_ROLE_COLS.map(([nm, re]) => `<td>${it.roles.some(v => re.test(v)) ? `<span class="fd" title="${esc(nm)}">●</span>` : it.roles.length ? `<span class="fe">・</span>` : ""}</td>`).join("")}<td class="mono">${it.n ? it.n + "役" : "―"}${it.roles.length ? "" : `<small>内訳の表示なし</small>`}</td></tr>`;
  /* 目的別の1本：同じ商品が重ならないよう、上から順に、まだ選んでいない中でいちばん当てはまるものを選ぶ */
  const used = new Set(), pick = (l, key) => { const c = l.filter(it => !used.has(it)).sort((a, b) => key(b) - key(a) || (b.x.match || 0) - (a.x.match || 0))[0]; if (c) used.add(c); return c; };
  const conc = [];
  { const it = pick(L, it => it.x.match || 0); conc.push(["迷ったら", it, `成分の傾向スコアがいちばん高い（${it.x.match}点）`]); }
  { const it = pick(light.filter(it => it.x.sc), it => sv(it, "light")); if (it) conc.push(["軽いつけ心地なら", it, `${it.type}のタイプで、「軽さ」が${sv(it, "light").toFixed(1)}`]); }
  { const it = quasi.length < n && pick(quasi, it => it.x.match || 0); if (it) conc.push(["薬用で選ぶなら", it, `医薬部外品。有効成分は${activesOf(it.x).join("・")}`]); }
  { const it = pick(L.filter(it => it.x.sc), it => sv(it, "barrier") * 10 + sv(it, "moist")); if (it) conc.push(["しっとり重視なら", it, `「保護力（フタ）」が${sv(it, "barrier").toFixed(1)}、「うるおい補給」が${sv(it, "moist").toFixed(1)}`]); }
  { const it = pick(L.filter(it => !it.x.tags.has("fragrance")), it => it.x.match || 0); if (it && conc.length < 4) conc.push(["香りが苦手なら", it, "成分表に香料が入っていない"]); }
  const toc = [["fc-what", aio ? "オールインワンとは" : (f.what ? f.what.h : "このテーマとは")], ["fc-table", "早見表"], ["fc-pick", "選び方は3つ"], ...(brands.length ? [["fc-brand", "ブランドごとの違い"]] : []), ["fc-ing", "よく知られた成分"], ["fc-list", `おすすめ${n}選`], ["fc-faq", "よくある疑問"]];
  const h1 = (f.h1 || f.title).replace("{n}", n);
  write(u, f.seoTitle ? f.seoTitle.replace("{n}", n) : `${f.title}｜${n}商品`, f.seoDesc ? f.seoDesc.replace("{n}", n) : `${f.lead.replace(/。.*$/, "。")}男性向けの${n}商品を成分で比べられます。`, r => `
<p class="eyebrow">特集・${esc(f.published)}</p>
<h1>${esc(h1)}</h1><p class="lead">${esc(f.lead)}</p>
<ul class="facts"><li><span>のせた商品</span><b class="mono">${n}</b><i>男性向け</i></li><li><span>医薬部外品</span><b class="mono">${quasi.length}</b><i>薬用</i></li>${aio ? `<li><span>何役か</span><b class="mono">${nMin}〜${nMax}</b><i>メーカーの表示</i></li>` : `<li><span>有効成分</span><b class="mono">${actGroups.length}</b><i>種類</i></li>`}</ul>
<section class="fconc" aria-labelledby="fc-conc"><h2 id="fc-conc">先に結論：目的別の1本</h2>
<div class="fcg">${conc.map(([k, it, why]) => `<a class="fci" href="${r(it.x.url)}"><span class="fck">${esc(k)}</span>${imgSlot(it.x, "thumb")}<b>${esc(nameOf(it))}</b><small>${esc(why)}</small></a>`).join("")}</div>
<p class="fnote">点数は、成分表を決まったルールで数えた「成分の傾向スコア」です（<a href="${r("about/scoring/")}">数え方</a>）。</p></section>
<nav class="ftoc" aria-label="このページの目次"><b>目次</b><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join("")}</ol></nav>
${aio ? `<section><h2 id="fc-what">そもそも、オールインワンとは</h2>
<div class="fstep"><div><span class="fsl">ふつうのお手入れ</span><span class="fss"><i>化粧水</i><em aria-hidden="true">→</em><i>乳液</i><em aria-hidden="true">→</em><i>クリーム</i></span></div><div><span class="fsl">オールインワン</span><span class="fss"><i class="on">これ1つ</i></span></div></div>
<p>洗顔のあとに化粧水・乳液・クリームと何本も重ねるのは面倒、という人のために、その役割を1つにまとめた商品です。メーカーは「1品で5役」のように、何の役割を兼ねるかを表示しています。</p>
<p>このページの${n}商品は、${nMin}役から${nMax}役まで。形はジェル・クリーム・乳液・化粧水とさまざまで、同じ「オールインワン」でも、つけ心地や入っている成分はかなり違います。下の早見表と選び方で、自分に合いそうなものを絞り込めます。</p></section>` : f.what ? `<section><h2 id="fc-what">${esc(f.what.h)}</h2>${f.what.steps ? `<div class="fstep">${f.what.steps.map(([a, b]) => `<div><span class="fsl">${esc(a)}</span><span class="fss"><i class="${/薬用/.test(a) ? "on" : ""}">${esc(b)}</i></span></div>`).join("")}</div>` : ""}${f.what.paras.map(t => `<p>${esc(fill(t).replace("{acts}", actsTxt).replace("{nAct}", actGroups.length))}</p>`).join("")}</section>` : ""}
<section><h2 id="fc-table">まず早見表で</h2><p class="small muted">商品名から全成分のページへ進めます。</p>
<div class="scroll ftab"><table><thead><tr><th scope="col">商品</th><th scope="col">タイプ</th>${aio ? `<th scope="col">何役</th>` : ""}<th scope="col">区分</th><th scope="col">有効成分</th>${F_FLAGS.map(([, nm]) => `<th scope="col">${nm}</th>`).join("")}</tr></thead><tbody>${sorted.map(it => rowOf(it, r)).join("")}</tbody></table></div>
${aio ? `<h3>何の役割を1つにまとめている？</h3><p class="small muted">●が、メーカー・販売店の説明で兼ねるとしている役割です。</p>
<div class="scroll ftab frole"><table><thead><tr><th scope="col">商品</th>${F_ROLE_COLS.map(([nm]) => `<th scope="col">${esc(nm)}</th>`).join("")}<th scope="col">合計</th></tr></thead><tbody>${L.slice().sort((a, b) => (b.n || 0) - (a.n || 0)).map(it => roleRow(it, r)).join("")}</tbody></table></div>` : ""}</section>
<section><h2 id="fc-pick">選び方は3つ</h2><div class="fpick">
<div class="fp"><b>1. つけ心地のタイプで</b><p>${esc(jn([...new Set(light.map(it => it.type))]))}は水分が多めで軽い使い心地、クリームは油分が多めでしっとりした使い心地の商品が多いタイプです。このページの商品の成分表で油性の成分を数えても、軽めのタイプは平均${oilL}種類、クリームは平均${oilR}種類でした。ベタつきが苦手なら軽めのタイプから見るのがおすすめです。</p><p class="small"><b>${esc([...new Set(light.map(it => it.type))].join("・"))}（${light.length}件）</b></p>${mini(light, r)}<p class="small"><b>クリーム（${rich.length}件）</b></p>${mini(rich, r)}</div>
${quasi.length < n ? `<div class="fp"><b>2. 薬用（医薬部外品）かどうかで</b><p>医薬部外品は、有効成分と、表示できる効能・効果が国に認められた商品です。気になる悩みがはっきりしているなら、まず薬用の${quasi.length}件から、パッケージに表示されている効能を見比べると選びやすくなります。</p>${actAll.length ? `<p class="small"><b>このページの有効成分</b></p><div class="tags">${actAll.map(a => actLink(a, r)).join("")}</div>` : ""}<p class="small"><b>薬用の商品</b></p>${mini(quasi, r)}</div>` : `<div class="fp"><b>2. 有効成分で</b><p>どの商品も医薬部外品で、有効成分は${esc(actsTxt)}の${actGroups.length}種類に分かれます（1つの商品に2つ以上入っていることもあります）。有効成分の種類で効き目の順位は決められないので、名前を聞いたことがある成分や、使い心地のタイプと合わせて選ぶ目印にしてください。</p>${actGroups.map(o => `<p class="small"><b>${esc(o.d)}（${o.l.length}件）</b></p>${mini(o.l, r)}`).join("")}</div>`}
<div class="fp"><b>3. 香り・スーッとする感じで</b><p>香料は香り、アルコール（エタノール）やメントールはスッとした使用感につながる成分です。毎日使うものなので、香りや清涼感の好みで選ぶのも大事なポイントです。</p>${noFlag.filter(o => o.l.length && o.l.length < n).map(o => `<p class="small"><b>${esc(o.nm)}が入っていない（${o.l.length}件）</b></p>${mini(o.l, r)}`).join("") || `<p class="small muted">どの商品にも入っています。</p>`}</div>
</div></section>
${brands.length ? `<section><h2 id="fc-brand">ブランドごとの違い</h2>${brands.map(o => `<h3>${aio ? `${esc(o.b)}のオールインワン（${o.l.length}種類）` : `${esc(o.b)}の${o.l.length}種類、どれがどう違う？`}</h3><p>${esc(brandTxt(o))}</p><div class="fbw">${o.l.map(it => `<a class="fbi" href="${r(it.x.url)}">${imgSlot(it.x, "thumb")}<b>${esc(nameOf(it).replace(o.b, "").trim() || nameOf(it))}</b><span>${esc(it.type)}・${it.x.p.kind === "quasi" ? "薬用" : "化粧品"}・油性の成分${cnt(it, "oil")}種類</span></a>`).join("")}</div>`).join("")}</section>` : ""}
${fam.length ? `<section><h2 id="fc-ing">よく知られた成分は、どれに入っている？</h2><p class="small muted">成分表に入っているかどうかを数えています。</p>
<div class="fbars">${fam.map(o => `<div class="fbar"><div class="fb-h">${o.link ? `<a href="${r(o.link)}">${esc(o.d)}</a>` : esc(o.d)}<span class="mono">${o.hit.length}/${n}件</span></div><div class="fb-t" aria-hidden="true"><span style="width:${Math.round(o.hit.length / n * 100)}%"></span></div><p class="small muted">${o.hit.map(it => esc(nameOf(it))).join("・")}</p></div>`).join("")}</div></section>` : ""}
<section><h2 id="fc-list">${esc(fill(f.listH || "おすすめ{n}選"))}</h2><p class="small muted">成分の傾向スコアの高い順です。${QUIZ[f.category] ? `<a href="${r("app/")}${QUIZ[f.category].hash}">7つの質問で、自分に合う順に並べ替える</a>` : ""}</p>
${sorted.map((it, i) => `<article class="fit"><h3><span class="fno mono">${i + 1}</span><span class="fnm">${esc(nameOf(it))}</span></h3>${productCard(it.x, r, aio ? `${it.n ? it.n + "役" : "オールインワン"}・${it.type}` : it.type)}<p>${esc(sumOf(it))}</p>${factsOf(it, r)}${bars(it)}<p class="fmore"><a href="${r(it.x.url)}">全成分${it.x.a.items.length}種類と、それぞれの役割を見る</a></p></article>`).join("")}
${anyRk || anyDirect ? `<p class="pr-note">商品ページの「楽天市場で見る」などは広告のリンクです。紹介料の有無は、点数や順位に関係しません。<a href="${r("about/")}#ad">広告について</a></p>` : ""}</section>
${f.A.length ? `<section><h2>${esc(f.also.h)}</h2><p class="small muted">${esc(f.also.note)}</p><div class="plist">${f.A.map(it => productCard(it.x, r, aio ? `${it.n ? it.n + "役" : "オールインワン"}・${it.type}` : it.type)).join("")}</div></section>` : ""}
<section class="ifaq"><h2 id="fc-faq">よくある疑問</h2>${faq.map(o => `<div class="qa-c"><h3 class="qa-q"><span class="qa-i" aria-hidden="true">Q</span>${esc(o.q)}</h3><p>${esc(o.a)}</p></div>`).join("")}</section>
<section><h2>この一覧に入れた条件と出典</h2><div class="rule"><b>条件</b><p>${esc(f.rule)}</p>${f.near ? `<p class="small muted">${esc(f.near.note)}</p>` : ""}</div>
<div class="scroll ftab fsrc"><table><thead><tr><th scope="col">商品</th><th scope="col">説明に書かれていること（要約）</th><th scope="col">出典</th></tr></thead><tbody>${all.map(it => `<tr><th scope="row">${link(it, r)}</th><td>${esc(it.say)}</td><td><a href="${esc(it.src.url)}" rel="nofollow noopener" target="_blank">${esc(it.src.label)}</a><br><small class="mono">${esc(it.src.date)}確認</small></td></tr>`).join("")}</tbody></table></div></section>
<details class="fhow"><summary>このページの見方</summary><ul>
<li>成分の傾向スコアは、成分表に何が入っているかを決まったルールで数えたもので、効果や使い心地の順位ではありません。</li>
<li>「あり／なし」は成分表に入っているかどうかで、良い悪いではありません。量や効き目は成分表からは分かりません。</li>
<li>何役か・タイプは、メーカーや販売店の表示です。表示が変わることがあるため、購入の前にパッケージや公式ページで確かめてください。全成分の出典は各商品のページにあります。</li>
</ul></details>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
    { crumbs: [["トップ", ""], ["特集", "features/"], [f.short, u]], cat: f.category });
});
if (FEATURES_ON.length) write("features/", "特集：テーマで成分をくらべる", `いま気になるテーマごとに、商品を集めて成分で比べた特集ページの一覧です。${FEATURES_ON.map(f => f.short).join("・")}。`, r => `
<h1><span class="mk">特集</span>：テーマでくらべる</h1><p class="lead">「これが気になる」というテーマごとに商品を集めて、成分表と表示から比べたページです。一覧に入れた条件と出典は、各ページの最後に載せています。</p>
<div class="clist">${FEATURES_ON.map(f => `<a class="cl cl-duo" href="${r(featureUrl(f))}"><span class="duo">${f.L.slice(0, 2).map(it => imgSlot(it.x, "thumb")).join("")}</span><span class="cl-t"><b>${esc(f.short)}</b><span>${esc(f.title)}・${f.L.length}商品・${esc(f.published)}</span></span></a>`).join("")}</div>`,
  { crumbs: [["トップ", ""], ["特集", "features/"]] });
const featureLinks = (r, cat) => { const l = FEATURES_ON.filter(f => !cat || f.category === cat); return l.length ? `<section><h2>特集</h2><div class="clist">${l.map(f => `<a class="cl" href="${r(featureUrl(f))}"><b>${esc(f.short)}</b><span>${esc(f.title)}</span><i>${f.L.length}件</i></a>`).join("")}</div></section>` : ""; };

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
${featureLinks(r)}
<section><h2>成分の条件から選ぶ（シャンプー）</h2><div class="clist">${CONCERNS.filter(c => c.id !== "dandruff").map(c => `<a class="cl" href="${r(concernUrl(c))}"><b>${esc(c.short)}</b><span>${esc(c.n)}</span><i>${c.list.length}件</i></a>`).join("")}</div></section>`,
  { crumbs: [["トップ", ""], ["悩み・目的から選ぶ", "concerns/"]] });

/* ---------- カテゴリ ---------- */
CAT_ORDER.forEach(cat => {
  const list = P.filter(x => x.p.category === cat); if (!list.length) return;
  const u = `categories/${cat}/`;
  write(u, `${CAT_N[cat]}の成分を比べる`, `${CAT_N[cat]}${list.length}件の全成分を、役割つきで比べられます。`, r => `
<h1>${esc(CAT_N[cat])}</h1><p class="lead">登録している${esc(CAT_N[cat])}は${list.length}件です。${C.CATS[cat] && C.CATS[cat].scored ? "成分の傾向スコアが高い順に並べています。" : "このカテゴリはまだ点数をつけていません。"}</p>
${featureLinks(r, cat)}
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
  <section class="ab-sec"><h2><b>1</b><span><span class="mk">メーカー表示のとおり</span>に載せる</span></h2><ul>
    <li>全成分は、メーカーの公式ページ・販売店のページ・パッケージの表示を、一字一句そのまま写しています。</li>
    <li>同じページを2回読み込み、写した内容が完全に一致したものだけを載せています。</li>
    <li>商品ごとに出典と確認日を載せています。リニューアルで成分が変わることがあるためです。</li>
    <li>成分の解析サイトや口コミを、成分表の出典には使いません。</li></ul></section>
  <section class="ab-sec"><h2><b>2</b><span>どの商品も<span class="mk">同じルール</span>で採点</span></h2><ul>
    <li>点数は、6つの観点（シャンプーなら、やさしい洗浄・洗浄力・頭皮ケア・髪の補修・指通り・低刺激）を、誰が数えても同じになる決まりで数えたものです。</li>
    <li>数え方はすべて公開しています。<a href="${r("about/scoring/")}">点数のつけ方</a></li>
    <li>特定の商品を売り込みません。メーカーから依頼を受けて載せることも、紹介料で点数や並び順を変えることもしません。</li>
    <li>点数は成分表に何が入っているかを数えたもので、効果や使い心地を表すものではありません。</li></ul></section>
  <section class="ab-sec"><h2><b>3</b><span>不安を<span class="mk">あおらない</span></span></h2><ul>
    <li>成分を「危険」「有害」とは書きません。入っていること自体を、良い・悪いと決めつけません。</li>
    <li>海外での規制に触れるときは、EUの化粧品規則や米国FDAなどの一次資料を確かめ、条文や日付を添えます。</li>
    <li>医薬部外品の効能は、パッケージやメーカーの表示どおりの言葉だけを使います。</li></ul></section>
  ${showOperator ? `<section class="ab-sec"><h2>運営者より${OPERATOR_OK ? "" : ' <span class="draft">下書き</span>'}</h2><div class="ab-box">
    <p>年齢を重ねるにつれて、それまで気にしていなかった頭皮のにおいや髪のボリューム、肌のシミが気になり始めました。そのとき初めてシャンプーの成分を調べ、情報によって言うことがまるで違うことに戸惑ったのが、クラベルを作ったきっかけです。</p>
    <p>同じように悩み始めた人が、落ち着いて、自分で選べるように。そのための材料をそろえていきます。</p>
    ${OPERATOR_OK ? "" : "<small>運営者自身の言葉に書き直していただく前提の下書きです。本番には、確かめてもらうまで出しません。</small>"}</div></section>` : ""}
  <section class="ab-sec" id="ad"><h2>広告について</h2><div class="ab-box">
    <p>商品ページの「楽天市場で見る」は楽天アフィリエイトの、「公式サイトで見る」「Amazonで見る」はA8.netなどのアフィリエイトの仲介サービスのリンクです。ここから購入されると、運営者が紹介料を受け取ることがあります。紹介料の有無は、点数や並び順には一切影響しません。</p>
    <small>商品画像と販売ページへのリンクは、楽天ウェブサービスから提供されています。</small></div></section>
  <section class="ab-sec" id="analytics"><h2>アクセス解析について</h2><div class="ab-box">
    <p>クラベルでは、どのページがよく読まれているかを知ってサイトを良くするために、Googleが提供するアクセス解析の仕組み「Googleアナリティクス」を使っています。Googleアナリティクスはクッキー（Cookie）を使って、閲覧したページや滞在時間、おおまかな地域、使っている端末の種類などの情報を集めます。お名前やメールアドレスなど、個人を特定する情報は集めていません。</p>
    <p>集めた情報は、Googleのプライバシーポリシーに基づいて管理されます。計測を止めたいときは、ブラウザの設定でクッキーを無効にするか、Googleが配布している「<a href="https://tools.google.com/dlpage/gaoptout?hl=ja" rel="noopener" target="_blank">Googleアナリティクス オプトアウト アドオン</a>」をお使いください。</p>
    <small>Googleによるデータの使われ方は「<a href="https://policies.google.com/technologies/partner-sites?hl=ja" rel="noopener" target="_blank">Googleのサービスを使用するサイトやアプリから収集した情報のGoogleによる使用</a>」をご覧ください。</small></div></section>
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
${featureLinks(r)}
<section class="sticky" aria-labelledby="h-quiz">
  <h2 id="h-quiz">迷ったら、${QUIZ_N}つの質問で。</h2>
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
  <a class="cl" href="${r("ingredients/")}"><b>成分の一覧</b><i>${ING_PAGES.length}種類</i></a><a class="cl" href="${r("brands/")}"><b>ブランドの一覧</b><i>${BR.size}ブランド</i></a>${CMP.size ? `<a class="cl" href="${r("compare/")}"><b>どっちが合う？（比較）</b><i>${CMP.size}組</i></a>` : ""}</div>
</section>`, { sym: ["ph-bottle", "ph-jar", "ph-tube", "ring"] });

/* ---------- CSS・sitemap・robots ---------- */
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "assets/site.css"), fs.readFileSync(path.join(__dirname, "site.css"), "utf8").split("__MKL__").join(HAND.markerLight).split("__MKD__").join(HAND.markerDark));
fs.copyFileSync(path.join(__dirname, "kb.js"), path.join(OUT, "assets/kb.js"));
fs.copyFileSync(path.join(__dirname, "chrome.css"), path.join(OUT, "assets/chrome.css"));
/* サイトのアイコン（2026-11-01）：検索結果でタイトルの上に出る印。設定がなく、Googleが仮の地球のマークを出していた。
   ヘッダーのロゴマーク（ノートの絵）から作ったもの（assets/icons/）。favicon.ico はブラウザが直下を探しに来るので直下にも置く */
fs.cpSync(path.join(ROOT_DIR, "assets/icons"), path.join(OUT, "assets/icons"), { recursive: true });
fs.copyFileSync(path.join(ROOT_DIR, "assets/icons/favicon.ico"), path.join(OUT, "favicon.ico"));
/* メーカー直販の商品画像（assets/products/） */
if (fs.existsSync(path.join(ROOT_DIR, "assets/products"))) fs.cpSync(path.join(ROOT_DIR, "assets/products"), path.join(OUT, "assets/products"), { recursive: true });

/* ---------- 見つからないページ（404） ----------
   Cloudflare Pages は 404.html がないと、存在しないURLにもトップページを200で返す。
   ページのリンクは相対パスなので、巡回ロボットが「URLの迷路」に入り込み、大量に読み込まれていた（2026-10-17）。
   どの深さのURLで表示されても壊れないよう、リンクはすべて「/」から始める。 */
{
  const r = to => "/" + to;
  const { head, foot } = chrome(r, "404");
  fs.writeFileSync(path.join(OUT, "404.html"), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${GA}${ICONS}<title>ページが見つかりません｜クラベル</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/site.css?v=${av("site.css")}"><link rel="stylesheet" href="/assets/chrome.css?v=${av("chrome.css")}"></head>
<body>${sprite(head + foot)}${head}<main class="wrap"><article class="ab"><section><h1>ページが見つかりません</h1>
<p class="lead">URLが変わったか、まだ用意していないページです。</p></section>
<a class="btn wide back" href="/">トップに戻る</a></article></main>${foot}</body></html>`);
}

/* ---------- 比較ツール：同じヘッダー・フッターを差し込む ---------- */
const APP = rest.includes("--app") ? rest[rest.indexOf("--app") + 1] : "";
if (APP && fs.existsSync(APP)) {
  const ap = "app/", r = to => rel(ap, to);
  const { head, foot } = chrome(r, ap);
  let h = fs.readFileSync(APP, "utf8");
  const core = fs.readFileSync(path.join(__dirname, "core.js"), "utf8").replace(/\nmodule\.exports = SKCore;\s*$/, "\n");
  const cs = h.indexOf("var SKCore = (function(){"), ce = h.indexOf("\n})();", cs);
  if (cs < 0 || ce < 0) throw new Error("app/index.html に採点ロジックの位置が見つかりません");
  h = h.slice(0, cs) + core.trim() + h.slice(ce + "\n})();".length);
  const rk = RK_ON ? `<script>window.RK={api:${JSON.stringify(r("api/rk"))}}</script><script src="${r("assets/rk.js")}?v=${av("rk.js")}" defer></script>` : "";
  const inject = `<link rel="stylesheet" href="${r("assets/chrome.css")}?v=${av("chrome.css")}">${rk}${sprite(head + foot, Object.values(PH))}${head}`;
  if (GA) h = h.replace("</head>", GA + "</head>");
  h = h.replace("</head>", ICONS + "</head>");
  /* 2026-11-02（SEO点検の指摘）：比較ツールに説明文・正式なURL・SNSで共有したときの表示を付ける */
  {
    const D = "7つの質問に答えると、登録しているシャンプーなどを、成分表から数えたあなたに合う順に並べ替えます。点数は成分表の中身を決まったルールで数えたもので、効果や使い心地ではありません。";
    const meta = `<meta name="description" content="${esc(D)}">` + (SITE ? `<link rel="canonical" href="${SITE}/app/"><meta property="og:title" content="比較ツール｜クラベル"><meta property="og:description" content="${esc(D)}"><meta property="og:type" content="website"><meta property="og:url" content="${SITE}/app/"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:image" content="${SITE}/assets/icons/ogp.png"><meta name="twitter:card" content="summary_large_image">` : "");
    if (!/<meta name="description"/.test(h)) h = h.replace("</head>", meta + "</head>");
  }
  h = h.replace(/<!--KB:HEAD-->[\s\S]*?<!--\/KB:HEAD-->/, `<!--KB:HEAD-->${inject}<!--/KB:HEAD-->`).replace(/<!--KB:FOOT-->[\s\S]*?<!--\/KB:FOOT-->/, `<!--KB:FOOT-->${foot}<!--/KB:FOOT-->`);
  fs.mkdirSync(path.join(OUT, ap), { recursive: true });
  fs.writeFileSync(path.join(OUT, ap, "index.html"), h);
  fs.writeFileSync(path.join(OUT, ap, "products.json"), JSON.stringify(Object.assign({}, DATA, { products: PRODUCTS.filter(p => !p.discontinued) })));
  PAGES.push(ap);
}
if (RK_ON) fs.copyFileSync(path.join(__dirname, "rk.js"), path.join(OUT, "assets/rk.js"));

/* ---------- 一度公開したページの記録と、消えたページの自動の転送（2026-10-27、ユーザーのOK） ----------
   成分ページは「2商品以上」、ブランドは「3商品以上」など、作り直すたびに条件で選び直すため、商品の取り直しや辞書の直しで
   ページが知らないうちに消えることがある（10月17〜18日にチャ乾留液・ヒドロキシエチルウレア・オクチルドデカノールなど11ページ）。
   data/published-pages.json に一度公開したURLを貯め、今回なくなったURLは近い移り先へ301で転送する（dist/_redirects-auto）。
   記録の更新は手元のビルドだけ（Cloudflare のビルドでは書き戻せないため）。変わったら一緒に保存する */
if (SITE) {
  const REG_F = path.join(ROOT_DIR, "data/published-pages.json");
  let reg = { pages: {} };
  try { reg = JSON.parse(fs.readFileSync(REG_F, "utf8")); } catch (e) { }
  const now = new Set(PAGES), byUrl = new Map();
  ING_PAGES.forEach(g => byUrl.set(ingUrl.get(g.name), { k: "ingredient", n: g.name }));
  PA.forEach(x => byUrl.set(x.url, { k: "product", n: x.p.name, b: x.p.brand || "", c: x.p.category }));
  CMP.forEach((c, k) => byUrl.set(c.url, { k: "compare", p: k }));
  PAGES.forEach(u => { if (!byUrl.has(u)) byUrl.set(u, { k: u.split("/")[0] || "top" }); });
  const dest = (u, o) => {
    if (o.k === "ingredient" && o.n) { /* まとめた先の成分ページ（辞書で仲間に入った・表示名が同じ）があればそこへ */
      const key = C.key(o.n), g = ING_PAGES.find(h => C.key(h.name) === key || [...h.aliases].some(a => C.key(a) === key));
      return g ? ingUrl.get(g.name) : "ingredients/";
    }
    if (o.k === "product") { const b = o.b && brandUrl.get(o.b); return b && now.has(b) ? b : now.has(`categories/${o.c}/`) ? `categories/${o.c}/` : ""; }
    const top = { compare: "compare/", brands: "brands/", concerns: "concerns/", categories: "", ingredients: "ingredients/" }[o.k];
    return top && now.has(top) ? top : "";
  };
  const manual = (() => { try { return new Set(fs.readFileSync(path.join(ROOT_DIR, "data/redirects.txt"), "utf8").split("\n").map(l => l.trim().split(/\s+/)[0]).filter(s => s && !s.startsWith("#"))); } catch (e) { return new Set(); } })();
  const gone = Object.entries(reg.pages || {}).filter(([u]) => !now.has(u));
  const lines = gone.filter(([u]) => !manual.has("/" + u)).map(([u, o]) => `/${u} /${dest(u, o)} 301`);
  fs.writeFileSync(path.join(OUT, "_redirects-auto"), lines.join("\n") + (lines.length ? "\n" : ""));
  /* 新しく消えたものだけを知らせる。消えたと分かった日を gone に書いておき、次からは件数だけ出す。戻ったら gone を消す */
  const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  const fresh = gone.filter(([, o]) => !o.gone), back = Object.entries(reg.pages || {}).filter(([u, o]) => o.gone && now.has(u));
  if (fresh.length) console.warn(`[消えたページ] 今回新しくなくなったページが${fresh.length}件あります（転送を自動で付けました）：\n` + fresh.map(([u, o]) => `  /${u}（${o.n || o.p || o.k}）→ ${manual.has("/" + u) ? "data/redirects.txt の転送" : "/" + dest(u, o)}`).join("\n"));
  /* ページを消すのはCの扱い（2026-10-27、ユーザーの指示：消す前に理由を伝えて相談する）。手元のビルドでは、新しく消えるページがあると止める。
     ユーザーのOKを得てから ALLOW_GONE=1 npm run build で記録する（Cloudflare のビルドは止めない） */
  if (fresh.length && process.env.CF_PAGES !== "1" && process.env.ALLOW_GONE !== "1") {
    console.error("[消えたページ] ページを消すには先にユーザーの確認が要ります（C）。理由を伝えてOKをもらってから ALLOW_GONE=1 npm run build を実行してください。記録はまだ書き換えていません");
    process.exit(1);
  }
  if (gone.length > fresh.length) console.log(`[消えたページ] 以前に消えたページ${gone.length - fresh.length}件は、転送を続けています`);
  const added = [...byUrl].filter(([u]) => !(reg.pages || {})[u]);
  /* 前から記録にあるページにも、比較の組み合わせ（p）など今分かる情報を足しておく（あとで消えたときに何のページか分かるように） */
  let filled = 0;
  byUrl.forEach((o, u) => { const r = (reg.pages || {})[u]; if (r) Object.keys(o).forEach(f => { if (r[f] === undefined) { r[f] = o[f]; filled++; } }); });
  if ((added.length || fresh.length || back.length || filled) && process.env.CF_PAGES !== "1") {
    fresh.forEach(([u, o]) => { o.gone = today; }); back.forEach(([u, o]) => { delete o.gone; });
    reg.pages = Object.fromEntries([...Object.entries(reg.pages || {}), ...added].sort(([a], [b]) => a < b ? -1 : 1));
    reg._about = reg._about || "一度公開したページのURL。作り直しで消えたURLは gen.js が近い移り先へ301で転送する（dist/_redirects-auto）。手元のビルドで新しいURLが足される。変わったら一緒に保存する。消さない。";
    fs.writeFileSync(REG_F, `{"_about":${JSON.stringify(reg._about)},\n"pages":{\n${Object.entries(reg.pages).map(([u, o]) => `${JSON.stringify(u)}:${JSON.stringify(o)}`).join(",\n")}\n}}\n`);
    console.log(`[公開ページの記録] 新しいURL${added.length}件・消えたURL${fresh.length}件・戻ったURL${back.length}件を data/published-pages.json に書きました`);
  }
}
if (SITE) {
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `  <url><loc>${SITE}/${encodeURI(p)}</loc>${UPDATED ? `<lastmod>${UPDATED}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
}
console.log(JSON.stringify({ pages: PAGES.length, products: P.length, ingredients: ING_PAGES.length, brands: BRAND_PAGES.length, concerns: CONCERNS.map(c => [c.id, c.list.length]) }));
