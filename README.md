# 成分くらべ（kurabelle.com）

成分表を決まったルールで読み解き、シャンプーや保湿クリームを比べるサイトです。

- 商品データ：`data/products.json`
- ページを作るプログラム：`src/gen.js`（点数のルールは `src/core.js`）
- 比較ツール：`app/index.html`
- 本番：Cloudflare Pages（ビルドコマンド `npm run build`、公開するフォルダ `dist`）
