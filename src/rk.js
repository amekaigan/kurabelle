/* 成分くらべ：楽天ウェブサービスから商品画像と販売ページのリンクを読み込む
   規約上、取得した情報をサイト側に保存しない（ページを開いた人のブラウザで、その都度読み込む）。
   同じ人が何度も開いたときの負荷を減らすため、その人のブラウザにだけ1日だけ覚えておく。 */
(function () {
  var C = window.RK || {};
  if (!C.app) return;
  var BASE = "https://app.rakuten.co.jp/services/api/";
  var DAY = 864e5, GAP = 1100; // 1秒に1回まで
  function get(k) { try { var v = JSON.parse(localStorage.getItem("rk:" + k)); if (v && Date.now() - v.t < DAY) return v.d; } catch (e) {} return undefined; }
  function put(k, d) { try { localStorage.setItem("rk:" + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function q(api, k) {
    return BASE + api + "?format=json&formatVersion=2&hits=1&applicationId=" + encodeURIComponent(C.app) +
      (C.aff ? "&affiliateId=" + encodeURIComponent(C.aff) : "") + "&keyword=" + encodeURIComponent(k);
  }
  function big(u) { return u ? u.replace(/\?_ex=\d+x\d+/, "?_ex=300x300") : ""; }
  function pick(v) { return typeof v === "string" ? v : v && (v.imageUrl || v.url) || ""; }
  /* JANがあるときは製品（カタログ）検索 → 商品検索の順。JANがないときは商品名で検索し、名前が合うものだけ使う */
  function fetchOne(k, isJan) {
    var tryItem = function () {
      return fetch(q("IchibaItem/Search/20220601", k) + "&imageFlag=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var it = j && j.Items && j.Items[0]; it = it && (it.Item || it);
        if (!it) return null;
        if (!isJan) { var head = k.replace(/\s+/g, "").slice(0, 6); if ((it.itemName || "").replace(/\s+/g, "").indexOf(head) < 0) return null; }
        return { img: big(pick((it.mediumImageUrls || [])[0])), url: it.affiliateUrl || it.itemUrl };
      });
    };
    if (!isJan) return tryItem();
    return fetch(q("Product/Search/20170426", k)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var p = j && j.Products && j.Products[0]; p = p && (p.Product || p);
      if (p && p.mediumImageUrl) return { img: big(p.mediumImageUrl), url: p.affiliateUrl || p.productUrlPC };
      return null;
    }).catch(function () { return null; }).then(function (d) { return d || new Promise(function (res) { setTimeout(function () { res(tryItem()); }, GAP); }); });
  }
  function paint(k, d) {
    document.querySelectorAll('[data-rk="' + CSS.escape(k) + '"]').forEach(function (el) {
      if (!d || !d.img) { el.classList.add("none"); return; }
      el.innerHTML = '<img src="' + d.img + '" alt="" loading="lazy" decoding="async">';
      el.classList.add("on");
    });
    document.querySelectorAll('[data-rk-link="' + CSS.escape(k) + '"]').forEach(function (a) { if (d && d.url) { a.href = d.url; a.hidden = false; } });
  }
  var queue = [], seen = {}, busy = false;
  function pump() {
    if (busy || !queue.length) return;
    var it = queue.shift(); busy = true;
    fetchOne(it.k, it.jan).catch(function () { return null; }).then(function (d) {
      put(it.k, d || null); paint(it.k, d);
      setTimeout(function () { busy = false; pump(); }, GAP);
    });
  }
  function want(el) {
    var k = el.getAttribute("data-rk"); if (seen[k]) return; seen[k] = 1;
    var c = get(k); if (c !== undefined) { paint(k, c); return; }
    queue.push({ k: k, jan: el.hasAttribute("data-jan") }); pump();
  }
  var els = document.querySelectorAll("[data-rk]");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); want(e.target); } }); }, { rootMargin: "200px" });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(want);
})();
