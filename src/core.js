var SKCore = (function(){
"use strict";
const ROLES = {
  active:{n:'有効成分',c:'--r-active'}, clean:{n:'洗浄',c:'--r-clean'}, cond:{n:'指通り',c:'--r-cond'},
  hum:{n:'保湿',c:'--r-hum'}, beauty:{n:'美容・補修',c:'--r-beauty'}, oil:{n:'油性',c:'--r-oil'},
  emul:{n:'乳化・増粘',c:'--r-emul'}, uv:{n:'紫外線',c:'--r-uv'}, pres:{n:'防腐・安定化',c:'--r-pres'},
  other:{n:'香料・pH・その他',c:'--r-other'}, base:{n:'水',c:'--r-base'}, unk:{n:'未分類',c:''}
};
const ROLE_ORDER = ['active','clean','cond','hum','beauty','oil','emul','uv','pres','other','base','unk'];
const TAGSET = ['hum1','hum2','occS','occM','light','beauty','extract','dry','oily','rough','spot','firm','sensitive','fragrance','alcohol','uvabs','silicone','paraben','mineral','menthol','colorant','preserv','strongpres','strongSurf','midSurf','mildSurf','cond','repair','scalp','scalpA','essoil','sebum'];

const ESS = 'ユーカリ油|ハッカ油|オレンジ油|スペアミント油|ペパーミント油|ラベンダー油|ローズマリー油|ローズマリー葉油|ティーツリー油|ティーツリー葉油|レモン果皮油|ベルガモット果実油|ニオイテンジクアオイ油|オレンジ果皮油|ヒノキ油'.split('|').map(n=>[n,'other','essoil','精油。香りづけや清涼感']);
const D = [
['水|精製水|常水|純水','base','','全体のベースになる水'],
['エタノール|無水エタノール|変性アルコール|アルコール','other','alcohol','清涼感を出し、成分を溶かす'],
['グリセリン|濃グリセリン','hum','hum1','定番の保湿剤。水分を引き寄せる'],
['BG|1,3-ブチレングリコール|1.3-ブチレングリコール|ブチレングリコール','hum','hum1','保湿と溶剤を兼ねる定番成分'],
['DPG|ジプロピレングリコール','hum','hum1','保湿・溶剤'],
['PG|プロピレングリコール','hum','hum1','保湿・溶剤'],
['ペンチレングリコール|1,2-ペンタンジオール|1,2ペンタンジオール','hum','hum1','保湿。防腐を助ける働きもある'],
['ヘキシレングリコール','hum','hum1','保湿・溶剤'],
['イソペンチルジオール','hum','hum1','保湿・溶剤。べたつきにくい'],
['グリセリンモノイソデシルエーテル|イソデシルグリセリルエーテル','hum','hum1','保湿・使用感の調整'],
['PEG|ポリエチレングリコール|ポリエチレングリコール1500|ポリエチレングリコール400|ポリエチレングリコール300|PEG-6|PEG-8|PEG-32|PEG-75','hum','hum1','保湿・粘度の調整'],
['マルチトール|マルチトール液|還元麦芽糖水アメ','hum','hum1','糖由来の保湿剤'],
['ソルビトール|D-ソルビトール|D-ソルビット液|ソルビット','hum','hum1','糖由来の保湿剤'],
['キシリトール','hum','hum1','糖由来の保湿剤'],
['トレハロース','hum','hum1','糖由来の保湿剤'],
['グルコース|ブドウ糖','hum','hum1','糖由来の保湿剤'],
['デキストラン','hum','hum1','糖由来の保湿成分'],
['ベタイン|トリメチルグリシン','hum','hum1','アミノ酸系の保湿剤'],
['メチルグルセス-10|POE(10)メチルグルコシド|グリセレス-26','hum','hum1','べたつきにくい保湿剤'],
['ヒアルロン酸Na|ヒアルロン酸ナトリウム|ヒアルロン酸','hum','hum2 beauty dry','水分を抱え込む代表的な保湿成分'],
['加水分解ヒアルロン酸','hum','hum2 beauty dry','小さく分解したヒアルロン酸'],
['アセチルヒアルロン酸Na','hum','hum2 beauty dry','ヒアルロン酸の誘導体'],
['ポリグルタミン酸|ポリグルタミン酸塩|ポリグルタミン酸Na','hum','hum2 dry','納豆由来の保湿成分'],
['ヒドロキシエチルウレア','hum','hum2 dry','尿素の仲間の保湿成分'],
['尿素','hum','hum2 dry','角層をやわらげる保湿成分'],
['PCA-Na|DL-ピロリドンカルボン酸ナトリウム液|ピロリドンカルボン酸ナトリウム','hum','hum2 dry','肌の天然保湿因子の一つ'],
['長鎖二塩基酸ビス3-メトキシプロピルアミド|ビスメトキシプロピルアミドイソドコサン','hum','hum2','保湿成分'],
['フィトステロールズ|フィトステロール','beauty','hum2','植物由来の保湿成分'],
['アセチルヒドロキシプロリン|N-アセチル-L-ヒドロキシプロリン','beauty','hum2 beauty firm','肌をととのえるアミノ酸誘導体'],
['加水分解シルク|加水分解シルク液','beauty','hum2 beauty repair','シルク由来の保湿・補修成分'],
['シルク末|シルク','beauty','repair','シルクの粉末'],
['加水分解コンキオリン','beauty','hum2 beauty','真珠層由来のたんぱく質。保湿'],
['水溶性コラーゲン|水溶性コラーゲン液|コラーゲン|水溶性コラーゲン(F)|水溶性コラーゲン液-3','beauty','hum2 beauty firm repair','コラーゲン由来の保湿成分'],
['加水分解コラーゲン','beauty','hum2 beauty firm repair','コラーゲンを分解した保湿・補修成分'],
['加水分解ケラチン|加水分解ケラチン(羊毛)|加水分解ケラチン液','beauty','repair','髪と同じケラチン由来の補修成分'],
['ジラウロイルグルタミン酸リシンNa|ジラウロイルグルタミン酸リシンナトリウム液','beauty','repair hum2','髪の内部を補修する成分（ペリセア）'],
['γ-ドコサラクトン','beauty','repair','熱で髪に結合する補修成分'],
['ヘマチン','beauty','repair','髪の補修成分'],
['加水分解ローヤルゼリータンパク','beauty','repair hum2','ローヤルゼリー由来のたんぱく質'],
['ヒスチジン','beauty','repair','アミノ酸。髪の補修'],
['パンテニルエチル','beauty','repair','プロビタミンB5の仲間'],
['タウリン','beauty','repair','アミノ酸の仲間。髪を補修'],
['アスパラギン酸|L-アスパラギン酸','beauty','repair','アミノ酸。髪を補修'],
['テアニン','beauty','repair hum2','お茶に含まれるアミノ酸'],
['加水分解エンドウタンパク','beauty','repair','エンドウ由来の補修成分'],
['イノシトール|イノシット','beauty','hum2 beauty','ビタミンに近い働きをする保湿成分'],
['セリン|L-セリン','hum','hum2 dry','アミノ酸の保湿成分'],
['グリシン','hum','hum2 dry','アミノ酸の保湿成分'],
['プロリン|L-プロリン','hum','hum2 dry','アミノ酸の保湿成分'],
['アルギニン|L-アルギニン','hum','hum2 repair','アミノ酸。pH調整にも使われる'],
['ポリクオタニウム-51','hum','hum2 dry','うるおいを保つ保湿ポリマー'],
['グリセリル-N-(2-メタクリロイルオキシエチル)カルバメート・メタクリル酸ステアリル共重合体','hum','hum2','保湿性の膜をつくるポリマー'],
['ワセリン|白色ワセリン','oil','occS','水分の蒸発を防ぐ代表的な保護剤'],
['ミツロウ|サラシミツロウ','oil','occS','ミツバチ由来のロウ。膜で保護する'],
['ミネラルオイル|流動パラフィン|鉱物油','oil','occS mineral','石油由来の保護オイル'],
['パラフィン','oil','occS mineral','石油由来の固形ロウ'],
['マイクロクリスタリンワックス','oil','occS mineral','石油由来のロウ。硬さと保護膜を出す'],
['シア脂|シアバター','oil','occS','植物性の固形脂'],
['ラノリン|精製ラノリン|ラノリンアルコール','oil','occS','羊毛由来の脂。保護力が高い'],
['キャンデリラロウ|カルナウバロウ|コメヌカロウ','oil','occS','植物性のロウ'],
['水添ポリイソブテン|水添ポリデセン','oil','occM','合成の保湿オイル'],
['スクワラン|植物性スクワラン','oil','occM','肌なじみのよい保湿オイル'],
['ホホバ種子油|ホホバ油','oil','occM','植物性の液状ロウ'],
['マカデミアナッツ脂肪酸フィトステリル','oil','occM','植物由来の油性成分'],
['トリエチルヘキサノイン|トリ2-エチルヘキサン酸グリセリル|トリ(2-エチルヘキサン酸)グリセリル|トリオクタン酸グリセリル','oil','occM','さらっとした合成オイル'],
['トリ(カプリル酸/カプリン酸)グリセリル|カプリル酸/カプリン酸トリグリセリド|トリ(カプリル・カプリン酸)グリセリル','oil','occM','軽い使用感のオイル'],
['エチルヘキサン酸セチル|2-エチルヘキサン酸セチル','oil','occM','軽い合成オイル'],
['パルミチン酸エチルヘキシル','oil','occM','軽い合成オイル'],
['オレイン酸デシル','oil','occM','なめらかさを出す合成オイル'],
['オクチルドデカノール','oil','occM','なめらかさを出す油性成分'],
['イソステアリルグリセリルエーテル','oil','occM','油性の保湿成分'],
['ジメチコン|メチルポリシロキサン|ジメチルポリシロキサン','oil','occM silicone','なめらかな膜をつくるシリコーン'],
['高重合ジメチコン-1|高重合メチルポリシロキサン','oil','occM silicone','髪をなめらかにする重合シリコーン'],
['アモジメチコン','oil','occM silicone','髪に付着しやすいシリコーン'],
['シクロペンタシロキサン|デカメチルシクロペンタシロキサン|シクロメチコン|シクロジメチコン','oil','light silicone','揮発して軽さを出すシリコーン'],
['トリシロキサン','oil','light silicone','揮発性の軽いシリコーン'],
['(ジメチコン/ビニルジメチコン)クロスポリマー|ジメチコンクロスポリマー|架橋型メチルポリシロキサン','oil','light silicone','さらさら感を出すシリコーン'],
['フェニルトリメチコン|メチルフェニルポリシロキサン','oil','light silicone','軽いシリコーン'],
['(C13,14)イソパラフィン|イソドデカン|イソヘキサデカン|軽質イソパラフィン|軽質流動イソパラフィン','oil','light','軽い揮発性のオイル'],
['シリカ|無水ケイ酸|含水シリカ','other','light sebum','皮脂を吸ってさらっとさせるパウダー'],
['ケイ酸Al・Mg|ケイ酸(Al/Mg)','other','','粘度を整えるパウダー'],
['ベヘニルアルコール|セタノール|ステアリルアルコール|セテアリルアルコール|セトステアリルアルコール|ステアリンアルコール','oil','occM','クリームの硬さを出す高級アルコール'],
['水添ヒマシ油|モノヒドロキシステアリン酸硬化ヒマシ油|ヒドロキシステアリン酸水添ヒマシ油|硬化ヒマシ油','oil','occM','ヒマシ油由来の油性成分'],
['ステアリン酸|パルミチン酸|ミリスチン酸|ベヘン酸|ラウリン酸','oil','occM','脂肪酸。乳化や硬さの調整、石けんの原料'],
['ポリソルベート80|ポリソルベート60|ポリソルベート20|ステアリン酸POEソルビタン','emul','','水と油をなじませる乳化剤'],
['ステアリン酸ポリグリセリル-10|モノステアリン酸ポリグリセリル|イソステアリン酸ポリグリセリル-3|モノラウリン酸ポリグリセリル|ラウリン酸ポリグリセリル-10','emul','','水と油をなじませる乳化剤'],
['ステアリン酸グリセリル|親油型モノステアリン酸グリセリル|モノステアリン酸グリセリル|ステアリン酸グリセリル(SE)','emul','','乳化を助ける'],
['ラウレス-7|イソセテス-10|POEステアリルエーテル|ステアレス-2','emul','','乳化剤'],
['セテアレス-60ミリスチルグリコール|ジステアリン酸PEG-150','emul','','とろみをつける成分'],
['イソステアリン酸ポリオキシエチレングリセリル|イソステアリン酸PEG-60グリセリル','emul','','乳化・可溶化'],
['PEG-10ジメチコン|POE・ジメチコン共重合体|POE・POPジメチコン共重合体|PEG-12ジメチコン|ポリエーテル変性シリコーン','emul','silicone','シリコーン系の乳化剤'],
['水添レシチン|レシチン','emul','','大豆などに由来する乳化剤'],
['ポリアクリルアミド','emul','','とろみをつける増粘剤'],
['アクリル酸Na/アクリロイルジメチルタウリンNa共重合体|アクリル酸ナトリウム・アクリロイルジメチルタウリン酸ナトリウム共重合体|(アクリル酸Na/アクリロイルジメチルタウリンNa)コポリマー','emul','','とろみをつける増粘剤'],
['カルボマー|カルボキシビニルポリマー','emul','','とろみをつける増粘剤'],
['(アクリレーツ/アクリル酸アルキル(C10-30))クロスポリマー|アクリル酸・メタクリル酸アルキル共重合体','emul','','とろみをつけ、乳化を安定させるポリマー'],
['(PEG-240/デシルテトラデセス-20/HDI)コポリマー','emul','','とろみをつけるポリマー'],
['アクリル樹脂アルカノールアミン液','emul','','とろみ・ハリを出すポリマー'],
['キサンタンガム|タマリンドガム','emul','','植物由来の増粘剤'],
['カンテン|寒天','emul','','寒天。ジェル状にする'],
['ヒドロキシエチルセルロース|ヒドロキシプロピルメチルセルロース|カルボキシメチルセルロースNa','emul','','セルロース由来の増粘剤'],
['ジステアリン酸Al|ステアリン酸Al|ステアリン酸Mg','emul','','油性クリームの形を保つ'],
['PEG-60水添ヒマシ油|ポリオキシエチレン硬化ヒマシ油','emul','','乳化・可溶化'],
['ポリエステル-37','other','','使用感を整えるポリマー'],
['ポリクオタニウム-10|塩化O-[2-ヒドロキシ-3-(トリメチルアンモニオ)プロピル]ヒドロキシエチルセルロース|塩化トリメチルアンモニオヒドロキシプロピルヒドロキシエチルセルロース','cond','cond','髪をなめらかにするカチオン性ポリマー'],
['塩化ポリプロピレングリコールヒドロキシプロピルトリモニウムセルロース液(2P.O.)','cond','cond','髪をなめらかにするカチオン性ポリマー'],
['ポリクオタニウム-7|塩化ジメチルジアリルアンモニウム・アクリルアミド共重合体液|塩化ジメチルジアリルアンモニウム・アクリルアミド共重合体','cond','cond','すすぎ時のきしみを抑えるポリマー'],
['アクリルアミド・アクリル酸・塩化ジメチルジアリルアンモニウム共重合体液|ポリクオタニウム-39','cond','cond','なめらかさを出すポリマー'],
['ポリ塩化ジメチルジメチレンピロリジニウム液|ポリクオタニウム-6|ポリクオタニウム-22','cond','cond','なめらかさを出すポリマー'],
['グアーヒドロキシプロピルトリモニウムクロリド|塩化O-[2-ヒドロキシ-3-(トリメチルアンモニオ)プロピル]グアーガム','cond','cond','グアーガム由来のコンディショニング成分'],
['ポリクオタニウム-47','cond','cond','髪に吸着するコンディショニングポリマー'],
['ベヘントリモニウムクロリド|塩化ベヘニルトリメチルアンモニウム','cond','cond','髪をやわらかくするカチオン界面活性剤'],
['セトリモニウムクロリド|塩化セチルトリメチルアンモニウム|ステアルトリモニウムクロリド|塩化ステアリルトリメチルアンモニウム','cond','cond','髪をやわらかくするカチオン界面活性剤'],
['クオタニウム-18','cond','cond','髪をやわらかくするカチオン成分'],
['ヒドロキシプロピルキトサン|ヒドロキシプロピルキトサン液','cond','cond repair','カニ殻由来の皮膜成分。髪をコートする'],
['塩化N-[2-ヒドロキシ-3-(ラウリルジメチルアンモニオ)プロピル]加水分解ケラチン','cond','cond repair','髪に吸着するケラチン誘導体'],
['セテアラミドエチルジエトニウムサクシノイル加水分解エンドウタンパク','cond','cond repair','エンドウ由来の補修・コンディショニング成分'],
['ナイアシンアミド|ニコチン酸アミド','beauty','beauty spot firm oily','ビタミンB3の一種。医薬部外品では美白やシワ改善の有効成分になる'],
['ユビキノン|ユビデカレノン|コエンザイムQ10','beauty','beauty firm','コエンザイムQ10。酸化から守る'],
['トコフェロール|酢酸トコフェロール|酢酸DL-α-トコフェロール|天然ビタミンE','beauty','beauty','ビタミンE。酸化を防ぐ'],
['アスコルビルグルコシド|アスコルビン酸|リン酸アスコルビルMg|アスコルビン酸2-グルコシド|L-アスコルビン酸2-グルコシド|3-O-エチルアスコルビン酸|テトラヘキシルデカン酸アスコルビル|パルミチン酸アスコルビルリン酸3Na|ビタミンCリン酸Mg','beauty','beauty spot oily','ビタミンCやその誘導体'],
['トラネキサム酸','beauty','beauty spot rough','医薬部外品では美白の有効成分になる'],
['アルブチン|α-アルブチン','beauty','beauty spot','美白で知られる成分'],
['レチノール|パルミチン酸レチノール|酢酸レチノール','beauty','beauty firm','ビタミンAやその誘導体'],
['パンテノール|D-パンテノール|プロビタミンB5','beauty','beauty rough repair','ビタミンB5の前駆体。肌や髪をととのえる'],
['アラントイン','beauty','beauty rough sensitive scalp','肌あれ・頭皮のあれを防ぐ成分'],
['グリチルリチン酸2K|グリチルリチン酸ジカリウム|グリチルリチン酸2カリウム','beauty','beauty rough sensitive scalp','甘草由来。肌や頭皮のあれを防ぐ'],
['セラミドNP|セラミド2|セラミドAP|セラミドEOP|セラミドNG|セラミドAG|セラミド','beauty','hum2 beauty dry rough sensitive repair','うるおいを保つ角層の成分'],
['セチルPGヒドロキシエチルパルミタミド|ヘキサデシロキシPGヒドロキシエチルヘキサデカナミド','beauty','hum2 beauty dry rough sensitive','セラミドに似た働きをする成分（セラミド機能成分）'],
['ピロクトンオラミン','beauty','scalp','フケ・かゆみを防ぐ殺菌成分'],
['サリチル酸','beauty','scalp sebum','角質をやわらげる。医薬部外品ではフケを防ぐ有効成分'],
['ジンクピリチオン|ジンクピリチオン液','beauty','scalp','フケを防ぐ成分'],
['ミコナゾール硝酸塩','beauty','scalp','フケを防ぐ抗真菌成分'],
['イソプロピルメチルフェノール|o-シメン-5-オール|シメン-5-オール','pres','scalpA preserv','殺菌成分。医薬部外品ではフケ・ニオイを防ぐ有効成分'],
['塩酸ピリドキシン|ピリドキシンHCl|ピリドキシン塩酸塩|ピリドキシン塩酸塩(ビタミンB6)','beauty','scalp','ビタミンB6。皮脂バランスを整える'],
['グルコシルヘスペリジン','beauty','scalp','頭皮をすこやかに保つ成分'],
['ピロリジニルジアミノピリミジンオキシド','beauty','scalp','頭皮・毛髪をととのえる成分'],
['アセチルテトラペプチド-3','beauty','scalp','頭皮をととのえるペプチド'],
['トシルバリンNa','beauty','scalp','頭皮をととのえる成分'],
['カンゾウ抽出末|カンゾウエキス|カンゾウ根エキス','beauty','extract rough','甘草由来の成分'],
['チャ乾留液','other','extract','茶由来の消臭成分'],
['カキタンニン','other','extract','柿由来の消臭成分'],
['メトキシケイヒ酸エチルヘキシル|パラメトキシケイ皮酸2-エチルヘキシル|パラメトキシケイ皮酸オクチル','uv','uvabs','紫外線吸収剤'],
['t-ブチルメトキシジベンゾイルメタン|オクトクリレン|ビスエチルヘキシルオキシフェノールメトキシフェニルトリアジン|ジエチルアミノヒドロキシベンゾイル安息香酸ヘキシル','uv','uvabs','紫外線吸収剤'],
['酸化亜鉛|酸化Zn|酸化チタン','uv','','紫外線散乱剤（パウダー）'],
['フェノキシエタノール','pres','preserv','防腐剤'],
['メチルパラベン|プロピルパラベン|エチルパラベン|ブチルパラベン|パラベン|パラオキシ安息香酸エステル|パラオキシ安息香酸メチル','pres','preserv paraben','防腐剤（パラベン類）'],
['ブチルカルバミン酸ヨウ化プロピニル','pres','preserv','防腐剤'],
['メチルイソチアゾリノン|メチルクロロイソチアゾリノン','pres','preserv strongpres','少量で効く防腐剤'],
['安息香酸Na|安息香酸ナトリウム|安息香酸塩','pres','preserv','防腐剤'],
['ソルビン酸K|ソルビン酸カリウム','pres','preserv','防腐剤'],
['デヒドロ酢酸Na|デヒドロ酢酸ナトリウム','pres','preserv','防腐剤'],
['クロルフェネシン','pres','preserv','防腐剤'],
['トリクロサン','pres','preserv','殺菌剤'],
['エチルヘキシルグリセリン|グリセリンモノ2-エチルヘキシルエーテル|グリセリルエチルヘキシルエーテル','pres','','防腐を補助する保湿成分'],
['カプリリルグリコール|1,2-ヘキサンジオール','pres','','防腐を補助する成分'],
['EDTA-2Na|EDTA-4Na|エデト酸塩|エデト酸二ナトリウム|エチレンジアミン四酢酸二ナトリウム','pres','','品質を安定させるキレート剤'],
['ヒドロキシエタンジホスホン酸|ヒドロキシエタンジホスホン酸液|エチドロン酸','pres','','品質を安定させるキレート剤'],
['BHT|ジブチルヒドロキシトルエン','pres','','酸化防止剤'],
['ピロ亜硫酸Na|ピロ亜硫酸ナトリウム','pres','','酸化防止剤'],
['ヒドロキシプロピルシクロデキストリン','other','','成分を包み込んで安定させる'],
['香料|フレグランス|合成香料','other','fragrance','香りづけ'],
['メントール|l-メントール','other','menthol','清涼剤'],
['水酸化K|水酸化カリウム|水酸化カリウム液(A)|水酸化Na|水酸化ナトリウム|水酸化ナトリウム液','other','','pH調整'],
['クエン酸|無水クエン酸|クエン酸Na|クエン酸ナトリウム|乳酸|乳酸Na|リンゴ酸|DL-リンゴ酸|コハク酸|炭酸水素Na|HCl|塩酸','other','','pH調整'],
['TEA|トリエタノールアミン|アミノメチルプロパノール','other','','pH調整'],
['pH調整剤','other','','pH調整'],
['粘度調整剤','other','','粘度の調整'],
['硫酸Mg|塩化Na|塩化ナトリウム','other','','形や粘度を安定させる'],
['PPG','other','','溶剤・使用感の調整'],
['ジステアリン酸グリコール','other','','パールのような見た目を出す'],
['キシレンスルホン酸Na','other','','粘度の調整'],
['シクロヘキサンジカルボン酸ビスエトキシジグリコール|エトキシジグリコール','other','','溶剤'],
['ラウレス硫酸Na|ポリオキシエチレンラウリルエーテル硫酸ナトリウム','clean','strongSurf','洗浄力の強い硫酸系洗浄成分'],
['ポリオキシエチレンラウリルエーテル硫酸アンモニウム(1E.O.)液|ラウレス硫酸アンモニウム','clean','strongSurf','洗浄力の強い硫酸系洗浄成分'],
['ラウリル硫酸Na|ラウリル硫酸ナトリウム|ラウリル硫酸アンモニウム','clean','strongSurf','洗浄力の強い硫酸系洗浄成分'],
['オレフィン(C14-16)スルホン酸Na|テトラデセンスルホン酸Na|テトラデセンスルホン酸ナトリウム液','clean','strongSurf','洗浄力の強い洗浄成分'],
['スルホコハク酸ラウリル2Na|スルホコハク酸ラウリル二ナトリウム|スルホコハク酸(C12-14)パレス-2Na','clean','midSurf','中程度の洗浄力の洗浄成分'],
['コカミドプロピルベタイン','clean','mildSurf','両性の洗浄成分。泡立ちを助ける'],
['ラウラミドプロピルベタイン|ラウリン酸アミドプロピルベタイン液','clean','mildSurf','両性の洗浄成分。泡立ちを助ける'],
['ラウリルヒドロキシスルタイン|ラウリルヒドロキシスルホベタイン液|ラウリルヒドロキシスルホベタイン','clean','mildSurf','両性の洗浄成分。泡質を整える'],
['ココアンホ酢酸Na|アルキルカルボキシメチルヒドロキシエチルイミダゾリニウムベタイン','clean','mildSurf','両性の洗浄成分'],
['ラウラミドプロピルアミンオキシド|ラウリルジメチルアミンオキシド','clean','mildSurf','泡を安定させる洗浄成分'],
['ココイルメチルタウリンNa|ヤシ油脂肪酸メチルタウリンナトリウム','clean','mildSurf','タウリン系のやさしい洗浄成分'],
['ラウロイルメチルタウリンNa','clean','mildSurf','タウリン系のやさしい洗浄成分'],
['ラウロイルメチルアラニンNa|ラウロイルメチル-β-アラニンナトリウム液','clean','mildSurf','アミノ酸系の洗浄成分'],
['ココイルアラニンTEA|N-ヤシ油脂肪酸アシル-DL-アラニントリエタノールアミン液','clean','mildSurf','アミノ酸系の洗浄成分'],
['ラウラミドDEA|ラウリン酸ジエタノールアミド','clean','','泡立ちを助ける'],
['ラウロイルアスパラギン酸Na|N-ラウロイル-L-アスパラギン酸ナトリウム液','clean','mildSurf','アミノ酸系の洗浄成分'],
['ココイルグルタミン酸Na|ヤシ油脂肪酸アシルグルタミン酸Na|ココイルグルタミン酸ナトリウム','clean','mildSurf','アミノ酸系の洗浄成分'],
['ココイルグリシンK|ヤシ油脂肪酸アシルグリシンK液|N-ヤシ油脂肪酸アシルグリシンカリウム液','clean','mildSurf','アミノ酸系の洗浄成分'],
['ココイル加水分解ケラチンK|ココイル加水分解ケラチンK(羊毛)|ヤシ油脂肪酸加水分解ケラチンカリウム液','clean','mildSurf repair','ケラチン由来のやさしい洗浄成分'],
['ラウロイル加水分解シルクNa','clean','mildSurf repair','シルク由来のやさしい洗浄成分'],
['ラウリルグルコシド|デシルグルコシド|ココグルコシド|アルキルグリコシド','clean','mildSurf','糖由来のやさしい洗浄成分'],
['コカミドMEA|ヤシ油脂肪酸エタノールアミド|コカミドメチルMEA|ヤシ油脂肪酸Nメチルエタノールアミド|ヤシ油脂肪酸N-メチルエタノールアミド','clean','','泡立ちを助ける'],
['コカミドDEA|ヤシ油脂肪酸ジエタノールアミド','clean','','泡立ちを助ける'],
/* --- 2026-10-17 追加（コンディショナーを中心に、未分類だった成分） --- */
['ステアロキシプロピルジメチルアミン|N-ジメチルオクタデシロキシプロピルアミン|N,N-ジメチルオクタデシロキシプロピルアミン|ステアラミドプロピルジメチルアミン|ステアリン酸ジメチルアミノプロピルアミド','cond','cond','酸と組み合わせて髪をなめらかにする成分（アミドアミン系）'],
['ジステアリルジモニウムクロリド|塩化ジステアリルジメチルアンモニウム|ジアルキル(C12-18)ジモニウムクロリド|塩化ジアルキル(12~18)ジメチルアンモニウム液|塩化ジアルキル(12-18)ジメチルアンモニウム液','cond','cond','髪をやわらかくするカチオン界面活性剤'],
['塩化アルキルトリメチルアンモニウム|ベヘントリモニウムメトサルフェート|ビス((イソステアロイル/オレオイル)イソプロピル)ジモニウムメトサルフェート|イソアルキル(C10-40)アミドプロピルエチルジモニウムエトサルフェート','cond','cond','髪をやわらかくするカチオン界面活性剤'],
['セテアラミドエチルジエトニウム加水分解コメタンパク','cond','cond repair','カチオン化した米タンパク。髪に吸着する'],
['アルキル(C12,14)オキシヒドロキシプロピルアルギニンHCl','cond','cond','アルギニン由来のカチオン成分。髪になじむ'],
['ジヒドロキシプロピルアルギニンHCl|ジヒドロキシプロピルアルギニンHCI','hum','hum1','アルギニン由来の保湿成分'],
['ジメチコノール|ポリシリコーン-9','oil','occM silicone','シリコーンの一種'],
['ラノリン脂肪酸','oil','occM','羊毛の脂（ラノリン）由来の脂肪酸。なじみのよい油性成分'],
['PPG-3カプリリルエーテル','oil','light','油性の溶剤。仕上がりを軽くする'],
['イソノナン酸イソノニル|セバシン酸ジエチル','oil','occM light','さらっとしたエステル油'],
['パルミチン酸イソプロピル|オレイン酸オレイル|ラウリン酸PG|イソステアリン酸|オリーブ油脂肪酸セトステアリル','oil','occM','油性成分（エステル油・脂肪酸）'],
['ヘキサ(ヒドロキシステアリン酸/ステアリン酸/ロジン酸)ジペンタエリスリチル|脂肪酸ジペンタエリスリチル-1|ジペンタエリトリット脂肪酸エステル|ジリノール酸ジ(フィトステリル/イソステアリル/セチル/ステアリル/ベヘニル)','oil','occM','こってりした油性成分'],
['ラウロイルグルタミン酸ジ(フィトステリル/オクチルドデシル)|ラウロイルグルタミン酸ジ(フィトステリル・オクチルドデシル)|ラウロイルグルタミン酸ジ(コレステリル・オクチルドデシル)|N-ラウロイル-L-グルタミン酸ジ(フィトステリル・2-オクチルドデシル)','oil','occM','アミノ酸由来の油性成分。肌や髪になじむ'],
['コレステロール|イソステアリン酸コレステリル|長鎖分岐脂肪酸コレステリル|シトステロール|ダイズステロール|ザクロステロールズ','oil','occM','肌の油分に近いステロール類'],
['ミリスチルアルコール|イソステアリルアルコール|オレイルアルコール|2-オクチルドデカノール|オクチルドデカノール','oil','occM','油性のアルコール（高級アルコール）'],
['シュガースクワラン|ヒマワリ油-2','oil','occM','なじみのよい保湿オイル'],
['流動イソパラフィン|オレフィンオリゴマー','oil','occM','石油由来の軽い油性成分'],
['アラニン|L-アラニン|バリン|L-バリン|イソロイシン|L-イソロイシン|トレオニン|スレオニン|L-トレオニン|フェニルアラニン|L-フェニルアラニン|ロイシン|L-ロイシン|シトルリン|グルタミン酸|L-グルタミン酸|リシンHCl|ヒドロキシプロリン','hum','hum1','アミノ酸の保湿成分'],
['PCA|L-ピロリドンカルボン酸|DL-PCA・Na液|DL-PCA・Na','hum','hum2 dry','肌の天然保湿因子の一つ'],
['クレアチン','hum','hum1','保湿成分'],
['トウミツ|ハチミツ','hum','hum1','はちみつ。保湿'],
['ジグリセリン|グリセリルグルコシド液|グリセリルグルコシド|プロパンジオール|1,3-プロパンジオール|3-メチル-1,3-ブタンジオール|PPG-10メチルグルコース|ポリブチレングリコール-8','hum','hum1','保湿・溶剤'],
['スイゼンジノリ多糖体|シロキクラゲ多糖体|α-グルカン|マルトデキストリン|イソマルト|加水分解水添デンプン','hum','hum1','糖由来の保湿成分'],
['糖脂質','hum','hum1','糖と脂質が結びついた保湿成分'],
['フィトスフィンゴシン|スフィンゴ糖脂質','beauty','hum2 beauty','セラミドに近い成分'],
['加水分解野菜タンパク|加水分解コンキオリンタンパク|加水分解ハチミツタンパク|加水分解パール|大豆たん白加水分解物|加水分解ダイズタンパク','beauty','repair','加水分解したタンパク質。髪をコーティングする'],
['ガラクトミセス/シラカンバ樹液発酵液|ガラクトミセス培養液|シラカンバ樹液|茶乾留液|加水分解キノア種子','beauty','extract','植物や酵母由来の成分'],
['乳酸球菌/ヒアルロン酸発酵液','hum','hum2 beauty dry','ヒアルロン酸を含む発酵液'],
['PEG/PPG/ポリブチレングリコール-8/5/3グリセリン','hum','hum1','保湿・使用感の調整'],
['ビサボロール','beauty','','カミツレ（カモミール）にも含まれる成分'],
['ヒト脂肪細胞順化培養液エキス|ヒト幹細胞順化培養液|ヒト脂肪由来幹細胞順化培養液|ヒト幹細胞培養液','beauty','beauty','ヒト幹細胞培養液（ヒトの幹細胞を培養した液から得た成分）'],
['カモミラET','beauty','beauty','カミツレ（カモミール）由来の成分'],
['ビタミンCテトライソパルミテート|テトライソパルミチン酸アスコルビル','beauty','beauty spot','油になじむビタミンC誘導体'],
['ビタミンE|d-δ-トコフェロール','beauty','beauty','ビタミンE。酸化を防ぐ'],
['トコフェリルリン酸Na|dl-α-トコフェリルリン酸ナトリウム','beauty','beauty','ビタミンEの誘導体'],
['グルコノラクトン|グルコノデルタラクトン','other','','酸性度（pH）をととのえる成分'],
['ヒノキチオール','beauty','scalp','ヒバなどの木に含まれる成分。頭皮用の製品によく使われる'],
['エルゴチオネイン','beauty','beauty','キノコなどに含まれるアミノ酸の一種。酸化を防ぐ'],
['アロエベラ液汁|アロエベラ葉汁','beauty','extract','アロエの葉の汁'],
['ラウラミンオキシド','clean','mildSurf','泡を安定させる洗浄成分'],
['ラウレス-6カルボン酸Na|ラウレス-4カルボン酸Na|ラウレス-5カルボン酸Na','clean','mildSurf','酸性石けん系の洗浄成分。肌あたりがやわらかい'],
['トランス-3,4′-ジメチル-3-ヒドロキシフラバノン|トランス-3,4\'-ジメチル-3-ヒドロキシフラバノン|トランス-3,4’-ジメチル-3-ヒドロキシフラバノン|t-フラバノン','beauty','scalp','フラバノン系の成分（医薬部外品の有効成分として使われる）'],
['タマサキツヅラフジアルカロイド|セファランチン','beauty','scalp','植物由来のアルカロイド（医薬部外品の有効成分として使われる）'],
['塩化亜鉛','other','','亜鉛の塩'],
['dl-カンフル|カンフル','other','','清涼感を出す成分（カンフル）'],
['イソプレゴール','other','','清涼感のある香りの成分'],
['ドデシルベンゼンスルホン酸TEA','clean','midSurf','スルホン酸系の洗浄成分'],
['ラウロイルサルコシンNa|ラウロイルサルコシンTEA','clean','mildSurf','アミノ酸系の洗浄成分（サルコシン系）'],
['N-ヤシ油脂肪酸アシル-L-グルタミン酸トリエタノールアミン液|ココイルグルタミン酸TEA','clean','mildSurf','アミノ酸系の洗浄成分'],
['アルキル(8~16)グルコシド|アルキル(8-16)グルコシド','clean','mildSurf','糖由来のやさしい洗浄成分'],
['コカミドプロピルヒドロキシスルタイン','clean','mildSurf','両性の洗浄成分'],
['ミリスタミンオキシド|PPG-2コカミド|ヤシ油脂肪酸モノエタノールアミド','clean','','泡立ちを助ける'],
['ジラウラミドグルタミドリシンNa','emul','','髪になじみやすい界面活性剤'],
['水添リゾレシチン|水添ホスファチジルコリン','emul','','レシチン由来の乳化成分'],
['グリセリン脂肪酸エステル|親油型ステアリン酸グリセリル|ステアリン酸ソルビタン|セスキオレイン酸ソルビタン|カプリル酸グリセリル|モノオレイン酸ポリオキシエチレンソルビタン(20E.O.)|PPG-12ブテス-16|PPG-17ブテス-17|PPG-6デシルテトラデセス-30|オリーブ油脂肪酸セトステアリル・オリーブ油脂肪酸ソルビット混合物','emul','','乳化剤・界面活性剤'],
['トリヒドロキシステアリン|パルミチン酸デキストリン|ポリアクリル酸アミド','emul','','とろみをつけ、油を固める成分'],
['PEG1540|PEG6000|PEG20000|PEG混合物','hum','hum1','保湿・粘度の調整'],
['PPG-7|PPG-17','other','','溶剤・使用感の調整'],
['二酸化炭素|DME|ジメチルエーテル','other','','噴射剤（泡やスプレーにするためのガス）'],
['カオリン|海シルト|炭|ベントナイト','other','','汚れを吸着する粉体（泥・粘土・炭）'],
['クチナシ青','other','colorant','植物由来の着色料'],
['ポリスチレンエマルション','other','','乳白色にする成分'],
['コハク酸2Na|コハク酸-ナトリウム|コハク酸一ナトリウム|リン酸|リン酸Na|リン酸2Na|リン酸一水素ナトリウム|リン酸二水素ナトリウム|酢酸|トルエンスルホン酸|モノエタノールアミン','other','','pH調整'],
['キシレンスルホン酸アンモニウム液|キシレンスルホン酸アンモニウム|ナフタレンスルホン酸Na','other','','粘度や溶け方の調整'],
['クエン酸トリエチル','other','','香りの保留・溶剤'],
['ベンジルアルコール|イソプロパノール|イソプロピルアルコール','other','','溶剤'],
['安息香酸','pres','preserv','防腐剤'],
['メチルクロロイソチアゾリノン・メチルイソチアゾリノン液','pres','preserv strongpres','少量で効く防腐剤'],
['カプリルヒドロキサム酸','pres','','防腐を助ける成分'],
['EDTA|EDTA-3Na|HEDTA・3Na|HEDTA-3Na','pres','','品質を安定させるキレート剤'],
/* --- 2026-10-17 追加（チャップアップシャンプー） --- */
['ペンテト酸5Na|フィチン酸','pres','','品質を安定させるキレート剤'],
['リンゴ酸ジイソステアリル','oil','occM','油性成分（エステル油）'],
['メチルグルセス-20','hum','hum1','保湿成分'],
['グルコシルルチン','beauty','','柑橘などに含まれる成分を水に溶けやすくしたもの'],
['酸化銀','other','','銀の化合物（品質を保つために使われる）'],
/* --- 2026-10-24 追加（未分類だった成分をまとめて分類。案・ユーザーの確認待ち） ---
   既にある成分の表記ゆれ・出典の誤字（シメン-5-オール、ステアリンアルコールなど11件）は、既存の行の別名に足した（成分表の写しは変えない）。 */
['ラウロイルグルタミン酸ジ(オクチルドデシル/フィトステリル/ベヘニル)|N-ラウロイル-L-グルタミン酸ジ(フィトステリル・ベヘニル・2-オクチルドデシル)','oil','occM','アミノ酸由来の油性成分。肌や髪になじむ'],
['メタリン酸Na|メタリン酸ナトリウム','pres','','品質を安定させるキレート剤'],
['エチドロン酸4Na','pres','','品質を安定させるキレート剤'],
['PEG1000','hum','hum1','保湿・粘度の調整'],
['ポリエチレングリコール4000','hum','hum1','保湿・粘度の調整'],
['PEG/PPG-14/7ジメチルエーテル','hum','hum1','保湿・粘度の調整'],
['ポリグリセリン','hum','hum1','グリセリンがつながった保湿成分'],
['ポリグリセリン-3','hum','hum1','グリセリンが3つつながった保湿成分'],
['エリスリトール','hum','hum1','糖アルコールの保湿剤'],
['アセチルグルコサミン','hum','hum1','糖の仲間（アミノ糖）の保湿成分'],
['メチルセリン','hum','hum1','アミノ酸（セリン）の誘導体の保湿成分'],
['アミジノプロリン','hum','hum1','アミノ酸（プロリン）の誘導体の保湿成分'],
['乳清','hum','hum1','乳清（ホエイ）由来の保湿成分'],
['グリコシルトレハロース','hum','hum1','糖由来の保湿成分'],
['異性化糖','hum','hum1','糖由来の保湿成分'],
['チューベロース多糖体|チューベロースポリサッカライド液-BG','hum','hum1','糖由来の保湿成分'],
['ポリメタクリロイルオキシエチルホスホリルコリン液','hum','hum1','細胞膜の成分に似せたポリマー。保湿'],
['システイン','beauty','','アミノ酸の一種'],
['チオタウリン','beauty','','タウリンの仲間'],
['コハク酸ジグリコールグアニジン','beauty','','肌をととのえる目的で配合される成分'],
['デヒドロジクレオソール','beauty','','肌をととのえる目的で配合される成分'],
['水解コンキオリン液','beauty','','肌をととのえる目的で配合される成分'],
['10-ヒドロキシウンデカン酸','beauty','','肌をととのえる目的で配合される成分'],
['D-パンテテインスルホン酸Ca液','beauty','','ビタミン（パントテン酸）の仲間'],
['ジパルミチン酸ピリドキシン','beauty','','ビタミンB6の誘導体（油に溶けやすい形）'],
['リボフラビンリン酸Na','beauty','','ビタミンB2の誘導体'],
['(ジヒドロキシメチルシリルプロポキシ)ヒドロキシプロピル加水分解コラーゲン','beauty','repair','コラーゲン由来の補修成分。髪に吸着する'],
['ジメチルジアセチルシスチネート','beauty','','シスチン（髪のケラチンに多いアミノ酸）の誘導体'],
['モウソウチク成長点細胞溶解質','beauty','extract','竹（モウソウチク）の細胞から得た成分'],
['ココイル加水分解コラーゲンK','clean','mildSurf repair','コラーゲン由来のやさしい洗浄成分'],
['ココイルグルタミン酸2Na','clean','mildSurf','やさしい洗浄成分（アミノ酸系・両性など）'],
['ラウラミドプロピルヒドロキシスルタイン','clean','mildSurf','やさしい洗浄成分（アミノ酸系・両性など）'],
['ラウリミノジプロピオン酸Na','clean','mildSurf','やさしい洗浄成分（アミノ酸系・両性など）'],
['ラウリルグリコールカルボン酸Na','clean','mildSurf','やさしい洗浄成分（アミノ酸系・両性など）'],
['ステアルトリモニウムブロミド','cond','cond','髪をやわらかくするカチオン界面活性剤'],
['ポリシリコーン-13','oil','occM silicone','シリコーンの一種'],
['(C10-13)イソパラフィン','oil','light','軽い揮発性のオイル'],
['(C13-16)イソパラフィン','oil','light','軽い揮発性のオイル'],
['ドデカン','oil','light','軽い揮発性のオイル'],
['イソステアリン酸イソセチル','oil','occM','油性成分（エステル油）'],
['イソステアリン酸ヘキシルデシル','oil','occM','油性成分（エステル油）'],
['ステアリン酸ステアリル','oil','occM','油性成分（エステル油）'],
['テトライソステアリン酸ペンタエリトリット','oil','occM','油性成分（エステル油）'],
['ミリスチン酸イソプロピル','oil','occM','油性成分（エステル油）'],
['ミリスチン酸ミリスチル','oil','occM','油性成分（エステル油）'],
['マカデミアナッツ脂肪酸エチル','oil','occM','油性成分（エステル油）'],
['飽和脂肪酸グリセリル','oil','occM','油性成分（エステル油）'],
['トリ(カプリル酸/カプリン酸/ミリスチン酸/ステアリン酸)グリセリル|トリ(カプリル・カプリン・ミリスリン・ステアリン酸)グリセリル','oil','occM','油性成分（植物由来の脂肪酸のグリセリド）'],
['ダイマージリノール酸ダイマージリノレイルビス(ベヘニル/イソステアリル/フィトステリル)','oil','occM','こってりした油性成分'],
['バチルアルコール','oil','occM','クリームの硬さを出す高級アルコール'],
['イソステアリン酸ソルビタン','emul','','水と油をなじませる乳化剤'],
['オレイン酸ソルビタン','emul','','水と油をなじませる乳化剤'],
['モノステアリン酸ソルビタン','emul','','水と油をなじませる乳化剤'],
['ラウリン酸POE(20)ソルビタン','emul','','水と油をなじませる乳化剤'],
['モノステアリン酸ポリオキシエチレングリセリル','emul','','水と油をなじませる乳化剤'],
['自己乳化型モノステアリン酸グリセリル','emul','','水と油をなじませる乳化剤'],
['ステアリン酸PEG','emul','','水と油をなじませる乳化剤'],
['ベヘン酸グリセリル','emul','','水と油をなじませる乳化剤'],
['リン酸モノセチル','emul','','水と油をなじませる乳化剤'],
['アラキルグルコシド・アラキルアルコール・ベヘニルアルコール','emul','','水と油をなじませる乳化剤'],
['水添大豆リン脂質','emul','','水と油をなじませる乳化剤'],
['ステアロイルグルタミン酸','emul','','水と油をなじませる乳化剤'],
['ラウロイルラクチレートNa','emul','','水と油をなじませる乳化剤'],
['PPG-13デシルテトラデセス-24','emul','','水と油をなじませる乳化剤'],
['PPG-2-デセス-12','emul','','水と油をなじませる乳化剤'],
['オクチルドデセス-20','emul','','水と油をなじませる乳化剤'],
['ポリアクリル酸','emul','','とろみや膜をつくる成分'],
['ポリアクリル酸Na','emul','','とろみや膜をつくる成分'],
['プルラン','emul','','でんぷんから作る多糖類。膜をつくる'],
['ヒドロキシプロピルデンプン','emul','','とろみや膜をつくる成分'],
['オクテニルコハク酸デンプンAl|オクテニルコハク酸コーンスターチAl','other','','使用感を整える粉体（でんぷん由来）'],
['コーンスターチ','other','','とうもろこしのでんぷん。使用感を整える粉体'],
['2-[4-(ジエチルアミノ)-2-ヒドロキシベンゾイル]安息香酸ヘキシルエステル','uv','uvabs','紫外線吸収剤'],
['ビスエチルヘキシルオキスフェノールメトキシフェニルトリアジン','uv','uvabs','紫外線吸収剤'],
['ベンガラ','other','colorant','着色料（酸化鉄）'],
['(クロロフィリン/銅)複合体','other','colorant','緑色の着色料（葉緑素由来）'],
['ポリ-ε-リシン','pres','preserv','防腐剤（アミノ酸のリシンがつながったもの）'],
['フェネチルアルコール','other','','香りづけ・溶剤（防腐を助ける働きもある）'],
['2-アミノ-2-メチル-1-プロパノール','other','','pH調整'],
['無水リン酸水素2Na','other','','pH調整'],
['リン酸1K','other','','pH調整'],
['酢酸Na','other','','pH調整'],
['グルコン酸Ca','other','','ミネラル（カルシウム）'],
['グルコン酸亜鉛','other','','ミネラル（亜鉛）'],
['グルコン酸銅','other','','ミネラル（銅）'],
['アスパラギン酸Mg','other','','ミネラル（マグネシウム）とアミノ酸の塩'],
['塩化Ca','other','','ミネラル（カルシウム）'],
['塩化Mg','other','','ミネラル（マグネシウム）'],
['海塩','other','','海水から得た塩（ミネラル）'],
['チャ乾溜液','other','','茶葉を乾留して得た液。消臭の目的で配合される'],
['薬用炭(特殊吸着炭)','other','','汚れを吸着する炭'],
['モロッコ溶岩クレイ','other','','汚れを吸着する粘土'],
['火山土抽出物','other','','火山性の土から得た成分'],
['温泉水','base','','温泉の水']
].concat(ESS);
const PAT = [
  [/セラミド/,'beauty','hum2 beauty dry rough sensitive repair','セラミドの一種（推定）'],
  [/ヒアルロン/,'hum','hum2 beauty dry','ヒアルロン酸の仲間（推定）'],
  [/ペプチド/,'beauty','beauty firm','ペプチド（推定）'],
  [/ケラチン/,'beauty','repair','ケラチン由来の補修成分（推定）'],
  [/アスコルビ/,'beauty','beauty spot oily','ビタミンC誘導体（推定）'],
  [/パラベン/,'pres','preserv paraben','パラベン類（推定）'],
  [/香料/,'other','fragrance','香りづけ（推定）'],
  [/^(塩基性|hc|酸性)(青|茶|黄|赤|紫|橙|黒)\d+/,'other','colorant','髪を染める染料'],
  [/((赤|青|黄|緑|紫|橙|褐)\d+|酸化鉄|カラメル)/,'other','colorant','着色料（推定）'],
  [/硫酸(na|ナトリウム|アンモニウム|tea)/,'clean','strongSurf','硫酸系の洗浄成分（推定）'],
  [/ベタイン/,'clean','mildSurf','両性の洗浄成分（推定）'],
  [/(グルタミン酸|アラニン|グリシン|タウリン)(na|k|ナトリウム|カリウム|tea)/,'clean','mildSurf','アミノ酸系の洗浄成分（推定）'],
  [/(トリモニウム|ジモニウム|クオタニウム|アンモニウム).*(クロリド|サルフェート|-\d+)|クオタニウム/,'cond','cond','髪をなめらかにするカチオン成分（推定）'],
  [/(メチコン|メチコノール|シロキサン)/,'oil','occM silicone','シリコーンの仲間（推定）'],
  [/(エキス|発酵液|培養液|花水|葉水|抽出液|抽出末)(-\d+)?$/,'beauty','extract','植物などのエキス（推定）'],
  [/(油|脂)$/,'oil','occM','植物性などの油（推定）'],
  [/ロウ$/,'oil','occS','ロウ（推定）'],
  [/(共重合体|クロスポリマー|コポリマー|ポリマー|ガム|セルロース)/,'emul','','とろみや膜をつくるポリマー（推定）'],
  [/^(poe|ポリオキシエチレン)|ポリソルベート|ポリグリセリル|ラウレス|セテス|セテアレス|ステアレス|ベヘネス|パレス-|トリデセス|ポロキサマー|peg-\d+/,'emul','','乳化剤・界面活性剤（推定）'],
  [/グリコール$/,'hum','hum1','保湿剤（推定）']
];

function norm(s){ return String(s==null?'':s).normalize('NFKC').replace(/[‐-―−－]/g,'-'); }
function key(s){ return norm(s).replace(/\s+/g,'').replace(/[?？]+$/,'').replace(/^\(\+\/-\)/,'').toLowerCase(); }
function tagArr(t){ return Array.isArray(t) ? t : String(t||'').split(/\s+/).filter(Boolean); }
const DICT = new Map();
D.forEach(([names,role,tags,desc])=>{
  const list = names.split('|');
  const ent = {name:list[0], role, tags:tagArr(tags), desc};
  list.forEach(a=>DICT.set(key(a), ent));
});

function splitTop(s, seps){
  const out=[]; let cur='', d=0;
  const push=()=>{ const v=cur.replace(/^[\s・\-*※]+/,'').replace(/[\s。.*※]+$/,'').trim(); if(v) out.push(v); cur=''; };
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='('||ch==='[') d++;
    else if((ch===')'||ch===']')&&d>0) d--;
    if(d===0 && seps.includes(ch)){
      if(ch===',' && /\d/.test(s[i-1]||'') && /\d/.test(s[i+1]||'')){ cur+=ch; continue; }
      if(ch===',' && /(^|[^A-Za-z])[A-Z]$/.test(cur) && /^[A-Z]-/.test(s.slice(i+1))){ cur+=ch; continue; } /* N,N-ジメチル… */
      push(); continue;
    }
    cur+=ch;
  }
  push(); return out;
}
function splitNames(s){
  const out=[];
  splitTop(s, '、,\n\r').forEach(chunk=>{
    if(/(エキス|抽出液|発酵液|培養液|ろ液)$/.test(chunk) || /\/\d/.test(chunk)) out.push(chunk);   /* 「A/B/Cエキス」は混合エキスとして1成分 */
    else splitTop(chunk,'/').forEach(x=>out.push(x));
  });
  return out;
}
function parseText(t){
  t = norm(t);
  let actives=[], rest=t;
  const mA = t.match(/有効成分\s*[:：]?/);
  const mO = t.match(/(その他の?成分|添加物)\s*[:：]?/);
  if(mA && mO && mO.index>mA.index){
    actives = splitNames(t.slice(mA.index+mA[0].length, mO.index));
    rest = t.slice(mO.index+mO[0].length);
  } else if(mO){ rest = t.slice(mO.index+mO[0].length); }
  rest = rest.replace(/^\s*[【\[]?(全成分|成分)[】\]]?\s*[:：]?/,'');
  return {actives, others:splitNames(rest)};
}
function lookup(raw, learned){
  learned = learned || {};
  const k = key(raw);
  const k2 = k.replace(/\(\d\)$/,'');
  const cands = [k, k2, k.replace(/液$/,''), k2.replace(/液$/,'')];
  for(const c of cands){
    if(learned[c]) { const L=learned[c]; return {name:L.name, role:L.role, tags:tagArr(L.tags), desc:L.desc, src:'ai'}; }
    if(DICT.has(c)) { const L=DICT.get(c); return {name:L.name, role:L.role, tags:L.tags, desc:L.desc, src:'dict'}; }
  }
  const disp = norm(raw).replace(/\s+/g,'').replace(/[?？]+$/,'');
  for(const [re,role,tags,desc] of PAT){ if(re.test(k) || re.test(k2.replace(/\([a-z]\)$/,''))) return {name:disp, role, tags:tagArr(tags), desc, src:'pattern'}; }
  return {name:disp, role:'unk', tags:[], desc:'', src:'unk'};
}
function analyzeText(text, learned){
  const parsed = parseText(text);
  const items = [];
  parsed.actives.forEach(r=>items.push(Object.assign(lookup(r, learned), {raw:r, active:true})));
  parsed.others.forEach(r=>items.push(Object.assign(lookup(r, learned), {raw:r, active:false})));
  return {items, unknown: items.filter(i=>i.role==='unk')};
}
function compRole(it){ return it.active ? 'active' : it.role; }
const clampR = v => Math.round(Math.max(0.5, Math.min(5, v))*2)/2;
const uniq = a => [...new Set(a)];
const namesWith = (items,t) => uniq(items.filter(i=>i.tags.includes(t)).map(i=>i.name));
const has = (items,t) => items.some(i=>i.tags.includes(t));
function gentleScore(items, opt){
  const ded=[];
  if(has(items,'fragrance')) ded.push(['香料',1]);
  if(has(items,'alcohol')) ded.push(['アルコール',1]);
  if(has(items,'uvabs')) ded.push(['紫外線吸収剤',0.75]);
  if(has(items,'menthol')) ded.push(['メントール',0.75]);
  if(has(items,'essoil')) ded.push(['精油',0.5]);
  if(has(items,'colorant')) ded.push(['着色料',0.5]);
  if(has(items,'strongpres')) ded.push(['イソチアゾリノン系',1]);
  if(opt && opt.surf && has(items,'strongSurf')) ded.push(['強い洗浄成分',0.75]);
  const pr = uniq(items.filter(i=>i.tags.includes('preserv') && !i.active).map(i=>i.name));
  if(pr.length>1) ded.push([`防腐剤${pr.length}種`, 0.5*(pr.length-1)]);
  return {v: 5 - ded.reduce((a,x)=>a+x[1],0), why: ded.length ? ded.map(x=>`${x[0]} −${x[1]}`).join('、') : '減点なし'};
}

/* --- 保湿クリーム --- */
const SK_CONCERNS = {dry:'乾燥', oily:'ベタつき', rough:'肌あれ', spot:'シミ', firm:'ハリ', sensitive:'敏感'};
function scoreSkincare(items, a){
  const concerns = a && a.concerns;
  const v={}, why={};
  const h1=namesWith(items,'hum1'), h2=namesWith(items,'hum2');
  v.moist = 0.5 + Math.min(2, 0.5*h1.length) + 0.75*h2.length;
  why.moist = h2.length||h1.length ? [...h2,...h1].join('、') : '保湿剤なし';
  const oS=namesWith(items,'occS'), oM=namesWith(items,'occM'), lt=namesWith(items,'light');
  v.barrier = 0.5 + 1.25*oS.length + 0.5*oM.length;
  why.barrier = (oS.length?'強い保護油：'+oS.join('、'):'強い保護油なし') + (oM.length?' ／ 油分：'+oM.join('、'):'');
  v.light = 3.5 - 0.75*oS.length - 0.25*Math.max(0,oM.length-2) + Math.min(1.5, 0.5*lt.length);
  why.light = `強い保護油${oS.length}種・油分${oM.length}種` + (lt.length?` ／ 軽さを出す：${lt.join('、')}`:'');
  const b=namesWith(items,'beauty'), ex=namesWith(items,'extract');
  v.beauty = 0.5 + 0.75*b.length + Math.min(1, 0.25*ex.length);
  why.beauty = (b.length?b.join('、'):'ケア成分なし') + (ex.length?` ＋ エキス${ex.length}種`:'');
  const cs = concerns && concerns.length ? concerns : Object.keys(SK_CONCERNS);
  const parts=[]; let sum=0;
  cs.forEach(c=>{
    const m = items.filter(i=>i.tags.includes(c));
    const names=uniq(m.map(i=>i.name));
    const act = m.some(i=>i.active);
    sum += Math.min(5, 0.5 + 1.25*names.length + (act?0.5:0));
    parts.push(`${SK_CONCERNS[c]}：${names.length?names.join('、'):'なし'}`);
  });
  v.concern = sum/cs.length; why.concern = parts.join(' ／ ');
  const g = gentleScore(items,{surf:true}); v.gentle=g.v; why.gentle=g.why;
  for(const k in v) v[k]=clampR(v[k]);
  return {v, why};
}
function adjSkincare(a){
  const out=[];
  if(!a) return out;
  if(a.gender==='men') out.push(['メンズ', {moist:0.5, light:0.5}, {}]);
  const age = {teen:['10代',{light:0.5,gentle:0.5},{}], '30s':['30代',{moist:0.5,beauty:0.25},{}], '40s':['40代',{moist:1,barrier:0.5,beauty:0.5},{}], '50s':['50代以上',{moist:1,barrier:1,beauty:0.5},{light:0.8}]}[a.age];
  if(age) out.push(age);
  return out;
}
function weightsSkincare(w, a){
  /* 2026-10-17 見直し：肌のタイプや使い心地の好みより、選んだ悩みが強く効くようにした
     （「脂性肌」「さっぱり」を選ぶと、シミやハリの悩みを選んでも「軽さ」がいちばん重くなっていたため） */
  if(a.skin==='dry'){w.moist+=1;w.barrier+=1;w.light*=0.6;}
  else if(a.skin==='oily'){w.light+=1.25;w.barrier*=0.6;}
  else if(a.skin==='combo'){w.light+=0.5;w.moist+=0.5;}
  const c=a.concerns||[];
  if(c.includes('dry')){w.moist+=1.5;w.barrier+=0.5;w.concern+=1;}
  if(c.includes('oily')){w.light+=1;w.concern+=1;}
  if(c.includes('rough')){w.gentle+=1;w.concern+=2;}
  if(c.includes('spot')){w.concern+=2;w.beauty+=0.5;}
  if(c.includes('firm')){w.concern+=2;w.beauty+=0.5;}
  if(c.includes('sensitive')){w.gentle+=2;w.concern+=1;}
  if(a.texture==='rich'){w.barrier+=0.75;w.light*=0.5;}
  else if(a.texture==='light'){w.light+=1;w.barrier*=0.6;}
  if(a.beauty==='high') w.beauty+=1.5; else if(a.beauty==='low') w.beauty*=0.3;
}

/* --- シャンプー --- */
const SURF_KIND = it => it.tags.includes('strongSurf')?'strong' : it.tags.includes('midSurf')?'mid' : it.tags.includes('mildSurf')?'mild' : null;
const SURF_LABEL = {strong:'硫酸系・強め', mid:'中程度', mild:'マイルド'};
function scoreShampoo(items){
  const v={}, why={};
  const surfs = items.filter(i=>i.role==='clean' && SURF_KIND(i));
  const main = surfs[0] || null, mk = main ? SURF_KIND(main) : null;
  const rest = surfs.slice(1);
  const restStrong = uniq(rest.filter(i=>SURF_KIND(i)==='strong').map(i=>i.name));
  const restMild = uniq(rest.filter(i=>SURF_KIND(i)==='mild').map(i=>i.name));
  v.mild = 3 + (mk==='strong'?-1.5:mk==='mid'?0.5:mk==='mild'?1.5:0) - 0.5*restStrong.length + Math.min(1, 0.25*restMild.length);
  why.mild = main ? `主洗浄成分：${main.name}（${SURF_LABEL[mk]}）` + (restStrong.length?` ／ ほかの硫酸系：${restStrong.join('、')}`:'') + (restMild.length?` ／ マイルドな洗浄成分${restMild.length}種`:'') : '洗浄成分が見つかりません';
  const sebum = namesWith(items,'sebum');
  v.clean = 2.5 + (mk==='strong'?2:mk==='mid'?1:0) + 0.5*restStrong.length + (sebum.length?0.5:0);
  why.clean = (main?`主洗浄成分が${SURF_LABEL[mk]}`:'主洗浄成分なし') + (restStrong.length?` ＋ 硫酸系${restStrong.length}種`:'') + (sebum.length?` ＋ 皮脂を除く成分：${sebum.join('、')}`:'');
  const sc = items.filter(i=>i.tags.includes('scalp') || (i.tags.includes('scalpA') && i.active));
  const scN = uniq(sc.map(i=>i.name)), scAct = uniq(sc.filter(i=>i.active).map(i=>i.name));
  const ex = namesWith(items,'extract');
  v.scalp = 0.5 + 1.0*scN.length + 0.5*scAct.length + Math.min(1, 0.25*ex.length);
  why.scalp = (scN.length?scN.map(n=>scAct.includes(n)?n+'（有効成分）':n).join('、'):'頭皮ケア成分なし') + (ex.length?` ＋ エキス${ex.length}種`:'');
  const rp = namesWith(items,'repair');
  v.repair = 0.5 + 0.75*rp.length;
  why.repair = rp.length ? rp.join('、') : '補修成分なし';
  const cd = namesWith(items,'cond');
  const si = namesWith(items,'silicone').filter(n=>!cd.includes(n));
  const oils = namesWith(items,'occM').filter(n=>!si.includes(n));
  v.smooth = 0.5 + 1.0*cd.length + 0.75*si.length + Math.min(1, 0.25*oils.length);
  why.smooth = (cd.length?'コンディショニング成分：'+cd.join('、'):'コンディショニング成分なし') + (si.length?` ／ シリコーン：${si.join('、')}`:'') + (oils.length?` ／ 油分${oils.length}種`:'');
  const g = gentleScore(items,{surf:false}); v.gentle=g.v; why.gentle=g.why;
  for(const k in v) v[k]=clampR(v[k]);
  return {v, why, mainSurf: main ? {name:main.name, kind:mk} : null};
}
function adjShampoo(a){
  const out=[];
  if(!a) return out;
  if(a.gender==='men') out.push(['メンズ', {clean:0.25, scalp:0.25}, {}]);
  const age = {teen:['10代',{clean:0.5},{}], '30s':['30代',{scalp:0.25},{}], '40s':['40代',{scalp:0.5,repair:0.25},{}], '50s':['50代以上',{scalp:0.5,mild:0.5,repair:0.5},{}]}[a.age];
  if(age) out.push(age);
  return out;
}
function weightsShampoo(w, a){
  /* 2026-10-17 見直し：頭皮のタイプや洗い上がりの好みより、選んだ悩みが強く効くようにした（保湿クリーム・コンディショナーと同じ考え方）
     （「脂っぽい」「さっぱり」を選ぶと、ボリュームやフケの悩みより「洗浄力」が重くなっていたため） */
  if(a.scalp==='dry'){w.mild+=1;w.gentle+=0.5;w.clean*=0.6;}
  else if(a.scalp==='oily'){w.clean+=1;w.mild*=0.8;}
  const c=a.concerns||[];
  if(c.includes('dandruff')) w.scalp+=2.5;
  if(c.includes('oily')){w.clean+=1.5;w.scalp+=1;}
  if(c.includes('damage')){w.repair+=2.5;w.smooth+=1;}
  if(c.includes('volume')){w.scalp+=2.5;w.smooth*=0.3;}   // 2026-10-20：髪に残る成分が多いと根元が寝やすいので、ボリュームを選んだ人には指通りを重く見ない
  if(c.includes('dry')){w.mild+=2;w.gentle+=0.5;w.clean*=0.7;}
  if(c.includes('sensitive')){w.gentle+=2.5;w.mild+=1;}
  if(a.texture==='rich'){w.smooth+=0.75;w.clean*=0.7;}
  else if(a.texture==='light'){w.clean+=0.75;w.smooth*=0.7;}
  if(a.color==='yes'){w.repair+=1;w.mild+=0.5;}
}

/* --- コンディショナー・トリートメント（2026-10-17 案） ---
   洗い流すものなので「洗浄」の観点はなく、髪の表面に残る成分を数える。
   指通りはほぼどの商品にもあるカチオン成分を基本に、シャンプーより1種あたりの重みを小さくして差が出るようにしている。 */
function scoreConditioner(items){
  const v={}, why={};
  const cd = namesWith(items,'cond');
  const si = namesWith(items,'silicone').filter(n=>!cd.includes(n));
  const oils = namesWith(items,'occM').filter(n=>!si.includes(n));
  v.smooth = 0.5 + 0.75*cd.length + 0.5*si.length + Math.min(1, 0.25*oils.length);
  why.smooth = (cd.length?'カチオン成分：'+cd.join('、'):'カチオン成分なし') + (si.length?` ／ シリコーン：${si.join('、')}`:'') + (oils.length?` ／ 油分${oils.length}種`:'');
  const rp = namesWith(items,'repair');
  v.repair = 0.5 + 0.75*rp.length;
  why.repair = rp.length ? rp.join('、') : '補修成分なし';
  const h1=namesWith(items,'hum1'), h2=namesWith(items,'hum2');
  v.moist = 0.5 + Math.min(2, 0.5*h1.length) + 0.75*h2.length;
  why.moist = h2.length||h1.length ? [...h2,...h1].join('、') : '保湿成分なし';
  const oS=namesWith(items,'occS'), lt=namesWith(items,'light');
  const heavy = oils.length + si.length;
  v.light = 5 - 0.75*oS.length - 0.5*Math.max(0, heavy-3) + Math.min(1, 0.5*lt.length);
  why.light = `強い保護油${oS.length}種・油分とシリコーン${heavy}種（4種目から減点）` + (lt.length?` ／ 軽さを出す：${lt.join('、')}`:'');
  const g = gentleScore(items,{surf:false}); v.gentle=g.v; why.gentle=g.why;
  for(const k in v) v[k]=clampR(v[k]);
  return {v, why};
}

function adjConditioner(a){
  const out=[];
  if(!a) return out;
  if(a.gender==='men') out.push(['メンズ', {light:0.25}, {}]);
  const age = {teen:['10代',{light:0.25},{}], '30s':['30代',{repair:0.25},{}], '40s':['40代',{repair:0.25,moist:0.25},{}], '50s':['50代以上',{repair:0.5,moist:0.5},{}]}[a.age];
  if(age) out.push(age);
  return out;
}
function weightsConditioner(w, a){
  /* 2026-10-17 見直し：仕上がりの好みや髪の長さより、選んだ悩みが強く効くようにした（保湿クリームと同じ考え方） */
  const c=a.concerns||[];
  if(c.includes('damage')){w.repair+=2.5;w.smooth+=0.5;}
  if(c.includes('tangle')) w.smooth+=2.5;
  if(c.includes('dry')){w.moist+=2.5;w.smooth+=0.25;}
  if(c.includes('volume')){w.light+=2.5;w.smooth*=0.7;}
  if(c.includes('sensitive')) w.gentle+=2.5;
  if(a.texture==='rich'){w.moist+=0.75;w.smooth+=0.25;w.light*=0.6;}
  else if(a.texture==='light') w.light+=1;
  if(a.color==='yes'){w.repair+=1;w.gentle+=0.5;}
  if(a.length==='long'){w.smooth+=0.75;w.repair+=0.25;}
  else if(a.length==='short') w.light+=0.25;
}

const CATS = {
  shampoo:{n:'シャンプー', scored:true, unit:'ml',
    themes:[{k:'mild',n:'洗浄のやさしさ',s:'やさしさ'},{k:'clean',n:'洗浄力',s:'洗浄力'},{k:'scalp',n:'頭皮ケア',s:'頭皮'},{k:'repair',n:'髪の補修',s:'補修'},{k:'smooth',n:'指通り',s:'指通り'},{k:'gentle',n:'刺激の少なさ',s:'低刺激'}],
    ng:{fragrance:'香料', strongSurf:'硫酸系洗浄成分', silicone:'シリコーン', menthol:'メントール', alcohol:'アルコール', paraben:'パラベン'},
    score:scoreShampoo, adjust:adjShampoo, weigh:weightsShampoo},
  skincare:{n:'保湿クリーム・乳液', scored:true, unit:'g',
    themes:[{k:'moist',n:'うるおい補給',s:'うるおい'},{k:'barrier',n:'保護力（フタ）',s:'保護'},{k:'light',n:'軽さ',s:'軽さ'},{k:'beauty',n:'ケア成分（ビタミン類など）',s:'ケア成分'},{k:'concern',n:'悩みへの対応',s:'悩み'},{k:'gentle',n:'刺激の少なさ',s:'低刺激'}],
    ng:{fragrance:'香料', alcohol:'アルコール', uvabs:'紫外線吸収剤', silicone:'シリコーン', paraben:'パラベン', mineral:'鉱物油'},
    score:scoreSkincare, adjust:adjSkincare, weigh:weightsSkincare},
  facewash:{n:'洗顔料', scored:false, unit:'g'},
  conditioner:{n:'コンディショナー・トリートメント', scored:true, unit:'g',
    themes:[{k:'smooth',n:'指通り',s:'指通り'},{k:'repair',n:'髪の補修',s:'補修'},{k:'moist',n:'うるおい',s:'うるおい'},{k:'light',n:'仕上がりの軽さ',s:'軽さ'},{k:'gentle',n:'刺激の少なさ',s:'低刺激'}],
    ng:{fragrance:'香料', silicone:'シリコーン', alcohol:'アルコール', paraben:'パラベン'},
    score:scoreConditioner, adjust:adjConditioner, weigh:weightsConditioner},
  scalp:{n:'育毛剤・頭皮用エッセンス', scored:false, unit:'ml'},
  serum:{n:'美容液', scored:false, unit:'ml'},
  handsoap:{n:'ハンドソープ', scored:false, unit:'ml'},
  colorrinse:{n:'カラーリンス・白髪染め', scored:false, unit:'g'}
};
const CAT_ORDER = ['shampoo','conditioner','scalp','skincare','serum','facewash','handsoap','colorrinse'];
function weights(cat, a){
  const C = CATS[cat], w = {};
  C.themes.forEach(t=>w[t.k]=1);
  if(!a) return w;
  C.adjust(a).forEach(([,add,mul])=>{ for(const k in add) w[k]+=add[k]; for(const k in mul) w[k]*=mul[k]; });
  C.weigh(w, a);
  for(const k in w) w[k]=Math.round(w[k]*100)/100;
  return w;
}
const grade = m => m>=85?'S':m>=70?'A':m>=55?'B':'C';
function evaluate(products, cat, answers, analyzeFn){
  const C = CATS[cat];
  const w = weights(cat, answers);
  const ngs = answers ? (answers.ng||[]) : [];
  const wsum = Object.values(w).reduce((a,b)=>a+b,0);
  return products.map(p=>{
    const a = analyzeFn(p);
    const sc = C.score(a.items, answers);
    const matchRaw = C.themes.reduce((acc,t)=>acc + w[t.k]*sc.v[t.k],0)/wsum/5*100;
    const match = Math.round(matchRaw);
    const ngHits = ngs.filter(n=>a.items.some(i=>i.tags.includes(n)));
    const price = parseFloat(p.price), vol = parseFloat(p.volume);
    const unit = price>0 && vol>0 ? price/vol : null;
    return {p, a, sc, match, matchRaw, grade:grade(match), ngHits, unit};
  });
}
function sortValue(e,k){ return k==='match' ? e.match : k==='unit' ? e.unit : e.sc.v[k]; }
function arrange(evals, k, ngLast){
  const cmp=(x,y)=>{
    if(k==='unit'){
      const nx=x.unit==null, ny=y.unit==null;
      if(nx!==ny) return nx?1:-1;
      if(!nx && x.unit!==y.unit) return x.unit-y.unit;
    } else if(k!=='match'){
      const d=y.sc.v[k]-x.sc.v[k]; if(d) return d;
    }
    if(y.matchRaw!==x.matchRaw) return y.matchRaw-x.matchRaw;
    return String(x.p.name).localeCompare(String(y.p.name),'ja');
  };
  const all = evals.slice().sort(cmp);
  const main=[], ng=[];
  all.forEach(e=>{ (ngLast && e.ngHits.length ? ng : main).push(e); });
  let prev, rank=0, n=0;
  main.forEach(e=>{
    const v=sortValue(e,k);
    if(v==null){ e.rank=null; return; }
    n++; if(v!==prev){ rank=n; prev=v; } e.rank=rank;
  });
  ng.forEach(e=>{ e.rank=null; });
  return {main, ng};
}
return {ROLES, ROLE_ORDER, TAGSET, CATS, CAT_ORDER, SK_CONCERNS, key, norm, parseText, lookup, analyzeText, compRole, weights, grade, evaluate, arrange, sortValue};
})();
module.exports = SKCore;
