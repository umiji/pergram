/**
 * 数値・通貨・日付の書式化。requirements.md §9
 *
 * 🔒 文字列連結で数値を組み立てない。桁区切り・小数点・記号の位置はロケールが決める。
 *    通貨記号だけは market 設定から差し込むため formatToParts を使う。
 */

/** market ごとの通貨記号。ロケールではなく市場に紐づく。 */
const CURRENCY_SYMBOL = {
  JPY: '¥',
  USD: '$',
};

/**
 * 単価の小数桁。有効数字が2桁前後になるように決める。
 * ¥3.2/g、¥38/g、¥0.05/mg のいずれも読める桁になる。
 */
function fractionDigitsFor(value) {
  const abs = Math.abs(value);
  if (abs < 1) return 2;
  if (abs < 10) return 1;
  return 0;
}

/**
 * 通貨を書式化する。数値部分は Intl が組み立てる。
 */
export function formatCurrency(value, { locale, currency, fractionDigits } = {}) {
  if (value === null || !Number.isFinite(value)) return null;
  const digits = fractionDigits ?? fractionDigitsFor(value);

  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(value);

  const symbol = CURRENCY_SYMBOL[currency];
  return parts
    .map((p) => (p.type === 'currency' && symbol ? symbol : p.value))
    .join('');
}

/** 素の数値。桁区切りはロケールに従う。 */
export function formatNumber(value, { locale, fractionDigits = 0 } = {}) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** パーセント。含有率など。 */
export function formatPercent(value, { locale, fractionDigits = 0 } = {}) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

/**
 * 内容量。1000g 以上は kg で表す。単位は文言に埋め込まず、ここで組み立てる。
 */
export function formatWeight(grams, { locale } = {}) {
  if (grams === null || !Number.isFinite(grams)) return null;
  const useKg = grams >= 1000;
  const value = useKg ? grams / 1000 : grams;
  const unit = useKg ? 'kilogram' : 'gram';
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: useKg ? 1 : 0,
  }).format(value);
}

/** 日付。ISO 文字列から。 */
export function formatDate(iso, { locale } = {}) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(
    date,
  );
}
