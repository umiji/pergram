/**
 * 待機リストのフォームが扱う値の**唯一の出所**。
 *
 * 🔒 LP のチップ（src/templates/lp/）と Worker の許可リスト（worker/waitlist.js）を
 *    別々に持つと必ずずれる。実際 protein / other が LP から外れたあとも Worker 側だけ
 *    許可リストに残っていた。表示順も許可リストもここ1箇所から配る。
 * 🔒 自由記述の長さ上限もここ。画面の maxlength と Worker の切り詰めが食い違うと、
 *    「入力できたのに保存されない」という説明のつかない挙動になる。
 *
 * このモジュールは Worker からも読むので、テンプレートや i18n に依存させない。
 */

/** LP のロードマップに出す成分。表示順そのもの */
export const ROADMAP_NUTRIENTS = [
  'creatine',
  'eaa_bcaa',
  'hmb',
  'vitamins',
  'iron_zinc',
  'multivitamin',
];

/**
 * 受け付ける成分。想定外の値は保存しない。
 * protein / other は LP のチップから外したが、過去の登録が残っているので受け付け続ける。
 */
export const ALLOWED_NUTRIENTS = new Set([...ROADMAP_NUTRIENTS, 'protein', 'other']);

/** 普段の購入先。🔒 単一選択（design.md §4.3）。表示順そのもの */
export const CHANNEL_CHIPS = [
  'rakuten',
  'amazon',
  'yahoo',
  'iherb',
  'myprotein',
  'store',
  'other',
];

export const ALLOWED_CHANNELS = new Set(CHANNEL_CHIPS);

export const EMAIL_MAX_LENGTH = 254;

/** 成分名を1つ2つ書ける長さ。文章を書かせる欄ではない */
export const NUTRIENTS_OTHER_MAX = 120;

/** 要望を数行。これ以上は保存しない */
export const REQUESTS_MAX = 500;
