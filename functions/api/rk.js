/* クラベル：楽天市場の商品検索を取り次ぐ（Cloudflare Pages Functions、/api/rk）
   アクセスキーはページに出さず、Cloudflare の環境変数（RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY）だけで使う。
   楽天の規約に合わせ、取得した情報はここでは保存しない（Cache-Control: no-store）。
   返すのは、商品画像のURL・販売ページへのリンク・その時点の価格（送料の扱い・お店の名前）と、
   楽天のレビューの平均と件数（JANで探したときは、同じ商品を扱う複数のお店の分を合計。2026年10月23日、ユーザーのOK）。 */
const API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const AFF = "588643c2.b560f3b3.588643c3.4dd69634";

function firstImg(it) {
  let img = (it.mediumImageUrls || [])[0];
  return typeof img === "string" ? img : img && (img.imageUrl || img.url) || "";
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const k = (u.searchParams.get("k") || "").trim().slice(0, 120);
  const isJan = u.searchParams.get("jan") === "1";
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (!k) return json({ error: "no keyword" }, 400);
  if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY) return json({ error: "not configured" }, 503);
  const q = new URL(API);
  q.searchParams.set("applicationId", env.RAKUTEN_APP_ID);
  q.searchParams.set("affiliateId", env.RAKUTEN_AFFILIATE_ID || AFF);
  q.searchParams.set("keyword", k);
  q.searchParams.set("hits", "10");
  q.searchParams.set("imageFlag", "1");
  q.searchParams.set("availability", "1");
  q.searchParams.set("formatVersion", "2");
  let r;
  try {
    r = await fetch(q, { headers: { accessKey: env.RAKUTEN_ACCESS_KEY, Referer: "https://kurabelle.com/", Origin: "https://kurabelle.com" } });
  } catch (e) { return json({ error: "fetch failed" }, 502); }
  if (!r.ok) return json({ error: "rakuten " + r.status }, r.status === 429 ? 429 : 502);
  const j = await r.json().catch(() => null);
  const list = ((j && (j.items || j.Items)) || []).map(it => it && (it.item || it.Item || it)).filter(Boolean);
  const head = k.replace(/\s+/g, "").slice(0, 6);
  // まとめ売り・セット・ケースは、画像も価格も1個の商品と違うので後回しにする
  const SET = /[×xX✕]\s*\d|\d+\s*(個|本|袋|点|箱)\s*(セット|組)|セット|ケース|まとめ買い|まとめ売り|お得用|\d+個入/;
  const ok = it => (isJan || (it.itemName || "").replace(/\s+/g, "").indexOf(head) >= 0) && firstImg(it);
  const pick = list.find(it => ok(it) && !SET.test(it.itemName || "")) || list.find(ok);
  if (pick) {
    /* レビュー：JANで探した結果は同じ商品なので、まとめ売りを除いたお店の分を件数で重み付けして合計する。名前で探したときは選んだ1店の分だけ */
    const rvItems = isJan ? list.filter(it => ok(it) && !SET.test(it.itemName || "")) : [pick];
    let rn = 0, rs = 0, shops = 0;
    rvItems.forEach(it => { const n = Number(it.reviewCount) || 0, a = Number(it.reviewAverage) || 0; if (n > 0 && a > 0) { rn += n; rs += n * a; shops++; } });
    const rv = rn ? { avg: Math.round(rs / rn * 10) / 10, n: rn, shops } : null;
    return json({
      rv,
      img: firstImg(pick).replace(/\?_ex=\d+x\d+/, ""),
      url: pick.affiliateUrl || pick.itemUrl || "",
      price: Number(pick.itemPrice) || null,
      postage: pick.postageFlag === 0 ? "送料込" : pick.postageFlag === 1 ? "送料別" : "",
      shop: pick.shopName || "",
      at: new Date().toISOString()
    });
  }
  return json({ img: "", url: "" });
}
