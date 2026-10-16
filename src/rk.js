/* クラベル：商品画像と楽天市場へのリンクを読み込む（取り次ぎ役 /api/rk を通す）
   規約上、取得した情報をサイト側に保存しない（ページを開いた人のブラウザで、その都度読み込む）。
   同じ人が何度も開いたときの負荷を減らすため、その人のブラウザにだけ1日だけ覚えておく。 */
(function () {
  var C = window.RK || {};
  if (!C.api) return;
  var DAY = 864e5, GAP = 1100; // 楽天の決まり（1秒に1回まで）に合わせて間をあける
  function get(k) { try { var v = JSON.parse(localStorage.getItem("rk2:" + k)); if (v && Date.now() - v.t < DAY) return v.d; } catch (e) {} return undefined; }
  function esc(v) { return String(v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function put(k, d) { try { localStorage.setItem("rk2:" + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function fetchOne(k, isJan) {
    return fetch(C.api + "?k=" + encodeURIComponent(k) + (isJan ? "&jan=1" : ""), { cache: "no-store" })
      .then(function (r) { return r.status === 429 ? { retry: true } : r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function paint(k, d) {
    document.querySelectorAll('[data-rk="' + CSS.escape(k) + '"]').forEach(function (el) {
      if (!d || !d.img || el.classList.contains("on")) return; // 見つからないときは種類別の絵のまま
      var img = new Image(); img.alt = ""; img.decoding = "async"; // 画面に置く前に読み込むので loading="lazy" は付けない（付けると読み込まれない）
      img.onload = function () { el.innerHTML = ""; el.appendChild(img); el.classList.add("on"); };
      img.src = d.img.replace(/\?_ex=\d+x\d+/, "") + (el.classList.contains("pimg") ? "?_ex=500x500" : "?_ex=240x240"); // 商品ページは大きく、一覧は中くらい
    });
    document.querySelectorAll('[data-rk-link="' + CSS.escape(k) + '"]').forEach(function (a) { if (d && d.url) { a.href = d.url; a.hidden = false; } });
    document.querySelectorAll('[data-rk-price="' + CSS.escape(k) + '"]').forEach(function (p) {
      if (!d || !d.price) return;
      var yen = "¥" + Number(d.price).toLocaleString("ja-JP");
      if (p.classList.contains("sm")) { p.innerHTML = "<b>" + yen + "</b>楽天市場"; }
      else {
        var t = d.at ? new Date(d.at) : new Date();
        p.innerHTML = "<b>" + yen + "</b>" + (d.postage ? "（" + esc(d.postage) + "）" : "") + "楽天市場" + (d.shop ? "・" + esc(d.shop) : "") +
          "<small>" + (t.getMonth() + 1) + "月" + t.getDate() + "日 " + t.getHours() + "時" + ("0" + t.getMinutes()).slice(-2) + "分時点の一例です。価格や在庫は変わることがあります。</small>";
      }
      p.hidden = false;
    });
  }
  var queue = [], seen = {}, mem = {}, busy = false;
  function pump() {
    if (busy || !queue.length) return;
    var it = queue.shift(); busy = true;
    fetchOne(it.k, it.jan).then(function (d) {
      if (d && d.retry) { if ((it.n = (it.n || 0) + 1) < 3) queue.push(it); }
      else { if (d && !d.error) put(it.k, d); mem[it.k] = d; paint(it.k, d); }
      setTimeout(function () { busy = false; pump(); }, d && d.retry ? GAP * 3 : GAP);
    });
  }
  function want(el) {
    var k = el.getAttribute("data-rk");
    if (k in mem) { paint(k, mem[k]); return; } // 読み込み済み（描き直された一覧など）
    if (seen[k]) return; seen[k] = 1;            // 読み込み中。届いたら同じ商品の枠をまとめて埋める
    var c = get(k); if (c !== undefined) { mem[k] = c; paint(k, c); return; }
    queue.push({ k: k, jan: el.hasAttribute("data-jan") }); pump();
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); want(e.target); } }); }, { rootMargin: "200px" }) : null;
  /* ページを開いたときと、診断ツールが一覧を描き直したときに呼ぶ */
  function scan() {
    document.querySelectorAll("[data-rk]:not([data-rk-w])").forEach(function (el) {
      el.setAttribute("data-rk-w", "");
      var k = el.getAttribute("data-rk");
      if (k in mem) paint(k, mem[k]); else if (io) io.observe(el); else want(el);
    });
  }
  C.scan = scan;
  scan();
})();
