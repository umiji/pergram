# data/

本番データ。GitHub Actions が更新してコミットする層。

## 🔒 保存してよい変数

`requirements.md` §4.2 により、**保存する独立変数は3つだけ**。

```
Product.serving_size_g            1食のグラム数
Product.servings_per_unit         1容器あたりの回数
NutrientContent.amount_elemental  1 serving あたりの有効成分量（元素量換算後）
```

`net_weight_g` / 含有率 / 100gあたり含有量 / 1食あたり価格 / 単価は**すべて導出値**。
ここに保存してはならない。二重に持つと片方だけ更新され、必ず矛盾する。

導出は `src/lib/cost.js` が一手に引き受ける。

> **要件定義との差分**: `requirements.md` §6 の `Product` は `net_weight_g` を列挙しているが、
> これは `serving_size_g × servings_per_unit` で導出できるため §4.2 🔒 と衝突する。
> 本実装は §4.2 を優先し、`net_weight_g` を保存しない。
> ラベルに内容量しか書かれていない製品は、取り込み時に `normalize_protein()` が
> `servings_per_unit = net_weight_g / serving_size_g` に変換して正規形へ落とす。

## ファイル

| ファイル | 対応するモデル | 備考 |
|---|---|---|
| `nutrients.json` | `Nutrient` | |
| `nutrient_i18n.json` | `NutrientI18n` | 成分名を `name_ja` `name_en` のカラムで持たない 🔒 |
| `products.json` | `Product` | |
| `product_i18n.json` | `ProductI18n` | |
| `nutrient_contents.json` | `NutrientContent` | |
| `product_attributes.json` | `ProductAttribute` | 品質ファセット |
| `price_snapshots.json` | `PriceSnapshot` | 日次更新 |
| `reference_values.json` | `ReferenceValue` | **空欄のまま推定値で埋めない** 🔒 |

## `reference_values.json` が空である件

タンパク質は `has_reference_value: true`（食事摂取基準に推奨量・目標量が存在する）だが、
一次資料からの転記が未了のため空にしてある。

- `has_reference_value: true` かつ該当行なし → UI は**何も表示しない**（未転記）
- `has_reference_value: false` → UI は「公的な推奨量・上限量は定められていません」と明示

この2つを混同しないこと。前者で「定められていません」と表示すると事実に反する。

## `Product.country` を持たない 🔒

購入可能性は「その市場の merchant の `PriceSnapshot` が存在するか」で決まる。

```
日本から買える = EXISTS(PriceSnapshot WHERE merchant IN market.merchants AND in_stock)
```
