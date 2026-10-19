/* クラベル：お気に入り（その人のブラウザにだけ保存）と、トップの検索。
   お気に入りは localStorage の "kb-fav"。保存できない環境（プライベートモードなど）でも、ページはそのまま使える。 */
(function () {
  var KB = window.KB || {}, root = KB.root || "./", pv = !!KB.pv;
  function link(p) { return root + p + (pv && /\/$/.test(p) ? "index.html" : ""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load() { try { var v = JSON.parse(localStorage.getItem("kb-fav") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function save(l) { try { localStorage.setItem("kb-fav", JSON.stringify(l)); return true; } catch (e) { return false; } }

  /* 画面の下に短く出す知らせ */
  var tEl = null, tTimer = 0;
  function toast(msg, extra) {
    if (!tEl) { tEl = document.createElement("div"); tEl.className = "kb-toast"; tEl.setAttribute("role", "status"); tEl.setAttribute("aria-live", "polite"); document.body.appendChild(tEl); }
    tEl.innerHTML = "<span>" + esc(msg) + "</span>" + (extra || "");
    tEl.classList.add("on"); clearTimeout(tTimer); tTimer = setTimeout(function () { tEl.classList.remove("on"); }, 2600);
  }

  /* 商品ページの「お気に入りに追加」 */
  document.querySelectorAll(".fav-btn").forEach(function (b) {
    var d; try { d = JSON.parse(b.getAttribute("data-fav")); } catch (e) { return; }
    function sync() {
      var on = load().some(function (x) { return x.id === d.id; });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      var lab = on ? "お気に入りから外す" : "お気に入りに追加";
      if (b.classList.contains("star")) { b.setAttribute("aria-label", lab); b.title = lab; } else b.textContent = on ? "お気に入り済み" : "お気に入りに追加";
    }
    b.addEventListener("click", function () {
      var l = load(), i = -1, was;
      l.forEach(function (x, k) { if (x.id === d.id) i = k; });
      was = i >= 0;
      if (was) l.splice(i, 1); else l.unshift(d);
      if (!save(l.slice(0, 30))) { if (b.classList.contains("star")) b.title = "このブラウザでは保存できません"; else b.textContent = "このブラウザでは保存できません"; return; }
      sync();
      b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
      toast(was ? "お気に入りから外しました" : "お気に入りに追加しました", was ? "" : '<a href="' + esc(link("")) + '#favs">一覧を見る</a>');
    });
    /* 前に保存したお気に入りにも、画像の情報を足しておく（古い版で保存したものは画像がなかった） */
    var l0 = load(), ch = false;
    l0.forEach(function (x, k) { if (x.id === d.id && (x.img !== d.img || x.rk !== d.rk)) { l0[k] = d; ch = true; } });
    if (ch) save(l0);
    sync(); b.hidden = false;
  });

  /* 画面の下の診断の案内：×で7日間出さない。ページ下の「迷ったら診断」が見えている間は隠す */
  var bar = document.querySelector(".kb-qbar");
  if (bar) {
    var off = 0; try { off = +localStorage.getItem("kb-qbar-off") || 0; } catch (e) {}
    if (Date.now() - off > 7 * 864e5) {
      bar.hidden = false; document.body.classList.add("has-qbar");
      bar.querySelector("button").addEventListener("click", function () {
        bar.hidden = true; document.body.classList.remove("has-qbar");
        try { localStorage.setItem("kb-qbar-off", String(Date.now())); } catch (e) {}
      });
      var cta = document.querySelector(".quiz-cta");
      if (cta && "IntersectionObserver" in window) new IntersectionObserver(function (es) { es.forEach(function (e) { bar.classList.toggle("away", e.isIntersecting); }); }).observe(cta);
    }
  }

  /* トップのお気に入り */
  var box = document.getElementById("favs");
  if (box) {
    var l = load();
    if (l.length) box.innerHTML = l.slice(0, 6).map(function (x) {
      /* 画像：メーカー直販はその画像、楽天の商品は楽天の画像（rk.js が埋める）。古い保存分は商品IDのJANから探す */
      var rk = x.rk || (!x.img && /^jan-\d{8,14}$/.test(x.id || "") ? x.id.slice(4) : ""), jan = x.rk ? x.jan : (rk ? 1 : 0);
      var ph = '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#' + esc(x.ph || "ph-bottle") + '"/></svg>';
      var th = x.img ? '<span class="thumb on"><img src="' + esc(x.img) + '" alt="" loading="lazy" decoding="async"></span>'
        : '<span class="thumb"' + (rk ? ' data-rk="' + esc(rk) + '"' + (jan ? ' data-jan="1"' : "") : "") + '>' + ph + '</span>';
      return '<a class="fav" href="' + esc(link(x.url)) + '">' + th +
        '<span class="nm"><small>' + esc(x.brand) + '</small><strong>' + esc(x.name) + '</strong>' + (x.type ? '<em>' + esc(x.type) + '</em>' : "") + '</span>' +
        (x.match != null ? '<span class="n">' + esc(x.match) + '<svg viewBox="0 0 60 44" preserveAspectRatio="none" aria-hidden="true"><use href="#ring"/></svg></span>' : "<span></span>") + "</a>";
    }).join("");
    if (window.RK && window.RK.scan) window.RK.scan();
  }

  /* トップの検索：商品名・ブランド・成分名（別名も）で探す */
  var inp = document.getElementById("q"), out = document.getElementById("sugg"), form = document.getElementById("sf"), src = document.getElementById("kb-index");
  if (inp && out && src) {
    var idx = []; try { idx = JSON.parse(src.textContent); } catch (e) {}
    var norm = function (s) { return String(s).normalize("NFKC").toLowerCase().replace(/[\s・･]/g, ""); };
    var hay = idx.map(function (r) { return norm(r[0] + r[1]); });
    var hits = [];
    function find() {
      var q = norm(inp.value);
      if (!q) { out.hidden = true; out.innerHTML = ""; hits = []; return; }
      hits = [];
      for (var i = 0; i < idx.length && hits.length < 8; i++) if (hay[i].indexOf(q) >= 0) hits.push(idx[i]);
      out.innerHTML = hits.length ? hits.map(function (r) { return '<li><a href="' + esc(link(r[3])) + '"><b>' + esc(r[0]) + '</b><span>' + esc(r[2]) + "</span></a></li>"; }).join("")
        : '<li class="none">見つかりませんでした。商品名の一部や、成分名でも探せます（例：グリセリン）。</li>';
      out.hidden = false;
    }
    inp.addEventListener("input", find);
    form.addEventListener("submit", function (e) { e.preventDefault(); find(); if (hits.length === 1) location.href = link(hits[0][3]); else if (hits.length) out.querySelector("a").focus(); });
    document.querySelectorAll(".hint").forEach(function (b) { b.addEventListener("click", function () { inp.value = b.getAttribute("data-q"); find(); }); });
  }
})();
