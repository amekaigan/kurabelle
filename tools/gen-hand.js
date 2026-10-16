/* クラベル：手書き風の絵（SVGのsymbol）を作る。npm run hand で src/hand.json を作り直す（ふだんのビルドでは使わない）。
   線の揺れは seed で固定しているので、何度作っても同じ絵になる。色はCSS変数（--ink, --c, --hl など）で後から決める。 */
const rough = require("roughjs");
const G = rough.generator();
const r1 = n => Math.round(n * 10) / 10;
const shrink = d => d.replace(/-?\d+\.\d+/g, m => String(r1(parseFloat(m))));

let seed = 11;
function draw(drawable, extra = "") {
  return G.toPaths(drawable).map(p => {
    const fill = p.fill && p.fill !== "none" ? p.fill : "none";
    const stroke = p.stroke && p.stroke !== "none" ? p.stroke : "none";
    return `<path d="${shrink(p.d)}" fill="${fill}" stroke="${stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  }).join("");
}
const O = (o = {}) => Object.assign({ seed: seed++, roughness: 1.1, bowing: 1.2, stroke: "var(--ink)", strokeWidth: 2.2 }, o);
const pen = (d, o) => draw(G.path(d, O(o)));
const line = (x1, y1, x2, y2, o) => draw(G.line(x1, y1, x2, y2, O(o)));
const circ = (x, y, d, o) => draw(G.circle(x, y, d, O(o)));
const box = (x, y, w, h, o) => draw(G.rectangle(x, y, w, h, O(o)));
// 蛍光ペン：太く、少し傾いた一本線。端は丸く、少し透ける
const marker = (x1, y1, x2, y2, w = 9) => draw(G.line(x1, y1, x2, y2, O({ stroke: "var(--hl)", strokeWidth: w, roughness: 0.7, bowing: 0.6, disableMultiStroke: true })), ' opacity=".9"');
const fillShape = (d, o) => draw(G.path(d, O(Object.assign({ fill: "var(--c)", fillStyle: "solid" }, o))));
const txt = (x, y, s, size, o = {}) => `<text x="${x}" y="${y}" font-family="Klee One, 'Zen Kurenaido', cursive" font-size="${size}" font-weight="${o.w || 600}" fill="${o.fill || "var(--ink)"}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ""}>${s}</text>`;

const S = {};

/* ロゴの印：タグの形＋成分表の3行、真ん中に蛍光ペン */
S.mark = ["0 0 48 48",
  fillShape("M10 6 L30 6 L41 17 L41 40 Q41 43 38 43 L10 43 Q7 43 7 40 L7 9 Q7 6 10 6 Z", { strokeWidth: 2.6, disableMultiStroke: true, roughness: 0.9 }) +
  circ(31, 14.5, 5, { strokeWidth: 2.2, disableMultiStroke: true }) +
  marker(12, 27, 35, 26.2, 7.5) +
  line(13, 20, 26, 19.6, { strokeWidth: 2.6, disableMultiStroke: true }) +
  line(13, 27, 33, 26.6, { strokeWidth: 2.6, disableMultiStroke: true }) +
  line(13, 34.2, 29, 34, { strokeWidth: 2.6, disableMultiStroke: true })];

/* メインの絵：ノートに描いたボトル2本と、全成分の大事な1行に蛍光ペン、手書きのメモ */
S.hero = ["0 0 340 210",
  // 表のボトル
  fillShape("M76 40 L98 40 L98 54 L76 54 Z") + fillShape("M68 54 L106 54 L106 64 L68 64 Z") +
  fillShape("M58 64 L116 64 Q124 64 124 72 L124 168 Q124 176 116 176 L58 176 Q50 176 50 168 L50 72 Q50 64 58 64 Z") +
  line(62, 102, 110, 101) + line(62, 112, 92, 112) +
  // 裏返したボトル
  fillShape("M180 22 L208 22 L208 40 L180 40 Z") + line(206, 28, 226, 27) +
  fillShape("M170 40 L218 40 L218 52 L170 52 Z") +
  fillShape("M150 52 L238 52 Q248 52 248 62 L248 166 Q248 176 238 176 L150 176 Q140 176 140 166 L140 62 Q140 52 150 52 Z") +
  box(152, 66, 84, 98, { stroke: "var(--ink2)", strokeWidth: 1.4, roughness: 0.8 }) +
  txt(160, 84, "全成分", 12) +
  marker(158, 107, 222, 106, 9) +
  line(160, 95, 226, 94.5, { stroke: "var(--ink2)" }) + line(160, 107, 216, 106.5, { stroke: "var(--ink)" }) +
  line(160, 119, 222, 118.5, { stroke: "var(--ink2)" }) + line(160, 131, 206, 130.5, { stroke: "var(--ink2)" }) +
  line(160, 143, 218, 142.5, { stroke: "var(--ink2)" }) + line(160, 155, 196, 154.5, { stroke: "var(--ink2)" }) +
  // 手書きのメモ：矢印と「ここ大事」
  pen("M300 96 Q276 92 236 104", { strokeWidth: 2 }) + pen("M243 98 L234 104.5 L243 110", { strokeWidth: 2 }) +
  txt(262, 86, "ここ大事", 14, { rot: -4 }) +
  // 点数を丸で囲む
  txt(282, 150, "5.0", 22, { anchor: "middle", w: 700 }) +
  draw(G.ellipse(282, 143, 52, 36, O({ strokeWidth: 2, roughness: 1.6 }))) +
  txt(282, 186, "やさしさ", 12, { anchor: "middle", fill: "var(--ink2)" }) +
  // 下線（机の線）
  line(30, 198, 316, 197, { stroke: "var(--ink2)", strokeWidth: 1.6 })];

/* 悩みのアイコン */
const icon = body => ["0 0 48 48", body];
const I = o => Object.assign({ strokeWidth: 2.6, disableMultiStroke: true, stroke: "var(--ic)" }, o || {});
S["i-smell"] = icon(line(10, 39, 38, 38.5, I()) + pen("M16 33 C12 29 19 26 15 21 C11 16 17 13 15 9", I()) + pen("M24 33 C20 29 27 26 23 21 C19 16 25 13 23 9", I()) + pen("M32 33 C28 29 35 26 31 21 C27 16 33 13 31 9", I()));
S["i-volume"] = icon(pen("M11 39 C11 26 15 16 24 11 C33 16 37 26 37 39", I()) + pen("M18 39 C18 30 20 23 24 19", I()) + pen("M30 39 C30 30 28 23 24 19", I()) + line(24, 11, 24.4, 5, I()));
S["i-flake"] = icon(line(8, 39, 40, 38.4, I()) + [[15, 21], [29, 13], [34, 27], [21, 31]].map(([x, y]) => line(x - 2.5, y - 2.5, x + 2.5, y + 2.5, I()) + line(x + 2.5, y - 2.5, x - 2.5, y + 2.5, I())).join(""));
S["i-oil"] = icon(pen("M24 7 C30 16 36 21 36 28 A12 12 0 0 1 12 28 C12 21 18 16 24 7 Z", I()) + pen("M18 29 C18 33 21 35 24 35", I()));
S["i-spot"] = icon(circ(24, 24, 31, I()) + circ(19, 21, 7, I({ fill: "var(--hl)", fillStyle: "solid" })) + circ(29.5, 29.5, 4.6, I({ fill: "var(--hl)", fillStyle: "solid" })));
S["i-dry"] = icon(pen("M8 18 C13 21 17 21 24 18 C31 15 35 15 40 18", I()) + pen("M8 28 C13 31 17 31 24 28 C31 25 35 25 40 28", I()) + line(16, 35, 18, 40, I()) + line(28, 35, 30, 40, I()));
S["i-search"] = icon(circ(21, 21, 24, I({ stroke: "var(--ink)" })) + line(30, 30, 40, 40, I({ stroke: "var(--ink)", strokeWidth: 3 })));

/* 画像がないときの代わりの絵 */
const ph = body => ["0 0 120 120", body];
S["ph-bottle"] = ph(fillShape("M52 16 L68 16 L68 28 L52 28 Z") + line(66, 20, 80, 19.5) + fillShape("M46 28 L74 28 L74 37 L46 37 Z") +
  fillShape("M38 37 L82 37 Q88 37 88 43 L88 100 Q88 106 82 106 L38 106 Q32 106 32 100 L32 43 Q32 37 38 37 Z") + marker(41, 78, 72, 77.5, 7) + line(42, 62, 78, 61.5, { stroke: "var(--ink2)" }) + line(42, 70, 66, 69.5, { stroke: "var(--ink2)" }) + line(42, 78, 70, 77.6, { stroke: "var(--ink2)" }));
S["ph-jar"] = ph(fillShape("M28 44 L92 44 L92 55 L28 55 Z") + fillShape("M32 55 L88 55 L88 88 Q88 96 80 96 L40 96 Q32 96 32 88 Z") + marker(39, 84, 68, 83.5, 7) + line(40, 68, 80, 67.5, { stroke: "var(--ink2)" }) + line(40, 76, 66, 75.6, { stroke: "var(--ink2)" }) + line(40, 84, 64, 83.6, { stroke: "var(--ink2)" }));
S["ph-tube"] = ph(fillShape("M48 94 L72 94 L72 105 L48 105 Z") + fillShape("M34 16 L86 16 L74 94 L46 94 Z") + line(35, 23, 85, 22.5) + marker(47, 60, 70, 59.5, 7) + line(46, 44, 74, 43.5, { stroke: "var(--ink2)" }) + line(48, 52, 68, 51.6, { stroke: "var(--ink2)" }) + line(48, 60, 66, 59.6, { stroke: "var(--ink2)" }));

/* 点数を囲む手書きの丸 */
S.ring = ["0 0 60 44", G.toPaths(G.ellipse(30, 22, 54, 38, { seed: 5, roughness: 1.5, stroke: "var(--ink)", strokeWidth: 2 })).map(p => `<path d="${shrink(p.d)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>`).join("")];

/* 見出しの下に引く蛍光ペン（CSSの背景に使う。色は固定） */
function markerBg(color) {
  const p = G.toPaths(G.line(4, 15, 196, 13, { seed: 7, roughness: 0.8, bowing: 0.5, stroke: color, strokeWidth: 14, disableMultiStroke: true }))[0];
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 26" preserveAspectRatio="none"><path d="${shrink(p.d)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" opacity=".92"/></svg>`)}`;
}

const out = { symbols: Object.entries(S).map(([id, [vb, body]]) => `<symbol id="${id}" viewBox="${vb}">${body}</symbol>`).join("\n"), markerLight: markerBg("#F5DF7E"), markerDark: markerBg("#8C7A1E") };
require("fs").writeFileSync(process.argv[2] || "hand.json", JSON.stringify(out));
console.log("symbols:", Object.keys(S).length, "bytes:", out.symbols.length);
