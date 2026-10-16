/* クラベル：商品画像と楽天市場へのリンクを読み込む（取り次ぎ役 /api/rk を通す）
   規約上、取得した情報をサイト側に保存しない（ページを開いた人のブラウザで、その都度読み込む）。
   同じ人が何度も開いたときの負荷を減らすため、その人のブラウザにだけ1日だけ覚えておく。 */
(function () {
  var C = window.RK || {};
  if (!C.api) return;
  var DAY = 864e5, GAP = 1100; // 楽天の決まり（1秒に1回まで）に合わせて間をあける
  function get(k) { try { var v = JSON.parse(localStorage.getItem("rk:" + k)); if (v && Date.now() - v.t < DAY) return v.d; } catch (e) {} return undefined; }
  function put(k, d) { try { localStorage.setItem("rk:" + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function fetchOne(k, isJan) {
    return fetch(C.api + "?k=" + encodeURIComponent(k) + (isJan ? "&jan=1" : ""), { cache: "no-store" })
      .then(function (r) { return r.status === 429 ? { retry: true } : r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function paint(k, d) {
    document.querySelectorAll('[data-rk="' + CSS.escape(k) + '"]').forEach(function (el) {
      if (!d || !d.img) return; // 見つからないときは種類別の絵のまま
      var img = new Image(); img.alt = ""; img.decoding = "async"; // 画面に置く前に読み込むので loading="lazy" は付けない（付けると読み込まれない）
      img.onload = function () { el.innerHTML = ""; el.appendChild(img); el.classList.add("on"); };
      img.src = d.img;
    });
    document.querySelectorAll('[data-rk-link="' + CSS.escape(k) + '"]').forEach(function (a) { if (d && d.url) { a.href = d.url; a.hidden = false; } });
  }
  var queue = [], seen = {}, busy = false;
  function pump() {
    if (busy || !queue.length) return;
    var it = queue.shift(); busy = true;
    fetchOne(it.k, it.jan).then(function (d) {
      if (d && d.retry) { if ((it.n = (it.n || 0) + 1) < 3) queue.push(it); }
      else { if (d && !d.error) put(it.k, d); paint(it.k, d); }
      setTimeout(function () { busy = false; pump(); }, d && d.retry ? GAP * 3 : GAP);
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
