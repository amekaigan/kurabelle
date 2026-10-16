/* クラベル：楽天市場の商品検索を取り次ぐ（Cloudflare Pages Functions、/api/rk）
   アクセスキーはページに出さず、Cloudflare の環境変数（RAKUTEN_APP_ID・RAKUTEN_ACCESS_KEY）だけで使う。
   楽天の規約に合わせ、取得した情報はここでは保存しない（Cache-Control: no-store）。
   返すのは、商品画像のURLと販売ページへのリンクだけ。 */
const API = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const AFF = "588643c2.b560f3b3.588643c3.4dd69634";

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
  q.searchParams.set("hits", "3");
  q.searchParams.set("imageFlag", "1");
  q.searchParams.set("availability", "1");
  q.searchParams.set("formatVersion", "2");
  let r;
  try {
    r = await fetch(q, { headers: { accessKey: env.RAKUTEN_ACCESS_KEY, Referer: "https://kurabelle.com/", Origin: "https://kurabelle.com" } });
  } catch (e) { return json({ error: "fetch failed" }, 502); }
  if (!r.ok) return json({ error: "rakuten " + r.status }, r.status === 429 ? 429 : 502);
  const j = await r.json().catch(() => null);
  const list = (j && (j.items || j.Items)) || [];
  const head = k.replace(/\s+/g, "").slice(0, 6);
  for (let it of list) {
    it = it && (it.item || it.Item || it);
    if (!it) continue;
    if (!isJan && (it.itemName || "").replace(/\s+/g, "").indexOf(head) < 0) continue; // 商品名で探したときは、名前が合うものだけ
    let img = (it.mediumImageUrls || [])[0];
    img = typeof img === "string" ? img : img && (img.imageUrl || img.url) || "";
    if (!img) continue;
    return json({ img: img.replace(/\?_ex=\d+x\d+/, "?_ex=300x300"), url: it.affiliateUrl || it.itemUrl || "" });
  }
  return json({ img: "", url: "" });
}
