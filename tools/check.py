"""クラベル 商品追加の道具。

  python3 tools/check.py find <JAN か 商品名の一部>   … 作業の前に、登録済み・待機中・見送り済みかを調べる
  python3 tools/check.py                              … tools/cands/*.py の候補を照合して結果を表示
  python3 tools/check.py --write                      … 一致した候補を登録し、だめだったものを見送りリストに記録

候補ファイル（tools/cands/*.py）の書き方は tools/cands/cands.py を見本にする。
A = 採用する出典、B = 照合用（別サイト。なければ同じページを番号つき一覧とJSON配列で2回取得）。
list には取得結果をそのまま貼る（2回目も1回目を流用せず、取得した結果を貼る）。

登録先：
  data/products.json … サイトに出る商品
  data/pending.json  … まだ公開していないカテゴリの商品（そのカテゴリが MIN_NEW_CAT 件たまったら products.json に移す）
  data/skipped.json  … 照合で止まった・見送った商品と理由（次回また調べ直さないため）
"""
import json, re, sys, glob, os, unicodedata, difflib, importlib.util, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P_PROD = os.path.join(ROOT, "data/products.json")
P_PEND = os.path.join(ROOT, "data/pending.json")
P_SKIP = os.path.join(ROOT, "data/skipped.json")
MIN_NEW_CAT = 10
TODAY = datetime.date.today().isoformat()

def load(p, empty):
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else empty
def save(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1); f.write("\n")

def norm(s):
    s = unicodedata.normalize("NFKC", s).replace("＊", "").replace("*", "").strip()
    s = re.sub(r"[‐－―−–]", "-", s)
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s*,\s*", ",", s)
    return s
def key(s):
    return re.sub(r"[\s・･]+", "", norm(s))
def jan_ok(j):
    if not re.fullmatch(r"\d{13}", j): return False
    d = list(map(int, j))
    return (10 - sum(x * (3 if i % 2 else 1) for i, x in enumerate(d[:12])) % 10) % 10 == d[12]

D = load(P_PROD, {"products": []})
PEND = load(P_PEND, {"products": []})
SKIP = load(P_SKIP, {"items": []})

def find(q):
    qk = key(q); hits = []
    for where, items in (("公開中", D["products"]), ("待機中（カテゴリ未公開）", PEND["products"])):
        for p in items:
            if q == p.get("jan") or qk in key(p.get("name", "")):
                hits.append(f"{where}: {p.get('jan')} {p['name']}（{p['category']}）")
    for s in SKIP["items"]:
        if q == s.get("jan") or qk in key(s.get("name", "")):
            hits.append(f"見送り: {s.get('jan')} {s['name']} — {s['reason']}（{s['date']}）")
    print("\n".join(hits) if hits else "見つかりません（新規）")

if len(sys.argv) > 2 and sys.argv[1] == "find":
    for q in sys.argv[2:]: print(f"[{q}]"); find(q)
    sys.exit()

C = []
for f in sorted(glob.glob(os.path.join(ROOT, "tools/cands/*.py"))):
    spec = importlib.util.spec_from_file_location(os.path.basename(f), f)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); C += m.C

have = {p.get("jan") for p in D["products"]} | {p.get("jan") for p in PEND["products"]}
skipped = {s["jan"] for s in SKIP["items"]}
public_cats = {p["category"] for p in D["products"]}
ok, ng = [], []
for c in C:
    if c["jan"] in have: continue          # 登録済みは黙って飛ばす
    a = [norm(x) for x in c["A"]["list"]]; b = [norm(x) for x in c["B"]["list"]]
    errs = []
    if [key(x) for x in a] != [key(x) for x in b]:
        d = [l for l in difflib.unified_diff([key(x) for x in a], [key(x) for x in b], n=0, lineterm="") if l[:1] in "+-" and not l.startswith(("+++", "---"))]
        errs.append("2つの出典で成分が違う（" + " / ".join(d[:8]) + "）")
    if not jan_ok(c["jan"]): errs.append("JANのチェックデジットが合わない")
    act = [norm(x) for x in c["A"].get("active", [])]
    if c["kind"] == "quasi" and not act: errs.append("医薬部外品なのに有効成分がない")
    for x in act:
        if x not in a: errs.append(f"有効成分{x}が成分欄にない")
    others = [x for x in a if x not in act]
    if c["kind"] == "cosme" and others and others[0] != "水": errs.append("化粧品なのに先頭が水でない")
    dup = sorted({x for x in a if a.count(x) > 1})
    if dup: errs.append(f"成分が重複{dup}")
    if len(a) < 8: errs.append(f"成分が{len(a)}個しかない")
    if errs: ng.append((c, errs)); continue
    p = {"id": f"jan-{c['jan']}", "jan": c["jan"], "category": c["category"], "brand": c["brand"], "name": c["name"],
         "kind": c["kind"], "target": c["target"], "volume": c["volume"], "unit": c["unit"], "price": None,
         "ingredients": ("有効成分：" + "、".join(act) + "　その他の成分：" + "、".join(others)) if act else "、".join(a)}
    if c.get("note"): p["note"] = c["note"]
    p["source"] = {"type": c["A"]["type"], "label": c["A"]["label"], "url": c["A"]["url"], "date": c.get("date", TODAY)}
    ok.append((c, p)); have.add(c["jan"])

for c, p in ok: print("✅", c["category"], c["name"], f"（{c['A']['label']}＋{c['B']['label']}）")
for c, e in ng: print("⚠️", c["category"], c["name"], "→", "；".join(e))
print(f"新しく一致 {len(ok)}件 / 止まった {len(ng)}件")

if "--write" in sys.argv:
    for c, p in ok:
        (D if p["category"] in public_cats else PEND)["products"].append(p)
    for c, e in ng:
        if c["jan"] not in skipped:
            SKIP["items"].append({"jan": c["jan"], "name": c["name"], "category": c["category"], "reason": "；".join(e), "date": TODAY})
    # 待機中のカテゴリが規定数に達したら公開側へ移す
    from collections import Counter
    cnt = Counter(p["category"] for p in PEND["products"])
    for cat, n in cnt.items():
        if n >= MIN_NEW_CAT:
            D["products"] += [p for p in PEND["products"] if p["category"] == cat]
            PEND["products"] = [p for p in PEND["products"] if p["category"] != cat]
            print(f"カテゴリ {cat} が{n}件になったので公開側へ移しました")
    D["updated"] = TODAY
    save(P_PROD, D); save(P_PEND, PEND); save(P_SKIP, SKIP)
    print("公開", len(D["products"]), "／待機", len(PEND["products"]), "／見送り", len(SKIP["items"]))
