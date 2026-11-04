// Invoices use simple whole-number prices (no cents): every amount is held as an
// integer number of currency units, and all arithmetic is done with BigInt so
// totals never drift the way floating-point sums do.
export const AMOUNT_DIGITS = 0;

const digitsCache = new Map();

/** Number of decimal places a currency normally uses (USD → 2, JPY → 0). Used only to read older data. */
export function currencyDigits(code) {
  if (!digitsCache.has(code)) {
    let digits = 2;
    try {
      digits = new Intl.NumberFormat('en', { style: 'currency', currency: code })
        .resolvedOptions().maximumFractionDigits;
    } catch {
      /* unknown code: fall back to 2 */
    }
    digitsCache.set(code, digits);
  }
  return digitsCache.get(code);
}

/**
 * Parse a user-entered, non-negative decimal string into a BigInt scaled by 10^scale.
 * Strict: returns null for malformed input or more decimals than `scale` allows,
 * so nothing is ever silently rounded away. Empty input is 0.
 */
export function parseScaled(input, scale) {
  const s = String(input ?? '').trim().replace(/[,\s]/g, '');
  if (s === '') return 0n;
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) return null;
  const frac = m[2] ?? '';
  if (frac.length > scale) return null;
  return BigInt((m[1] || '0') + frac.padEnd(scale, '0'));
}

/** Divide two BigInts, rounding half away from zero (standard commercial rounding). */
export function divRound(n, d) {
  const negative = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const q = (a * 2n + b) / (2n * b);
  return negative ? -q : q;
}

/** Parse an amount string into whole currency units (BigInt), or null if it has decimals or isn't a number. */
export function toMinor(input) {
  return parseScaled(input, AMOUNT_DIGITS);
}

/** Format a whole-unit amount as a localized currency string, without decimals ("€7,262"). */
export function formatMoney(amount, code, { locale = 'en-US' } = {}) {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString(locale)}`;
  }
}

/** Format a whole-unit amount as a plain number string for form inputs ("1250"). */
export function minorToInput(amount) {
  return BigInt(amount).toString();
}

/** Format a scaled quantity/percentage for display, trimming trailing zeros. */
export function formatDecimal(input, { locale = 'en-US', maxDigits = 4 } = {}) {
  const v = parseScaled(input, maxDigits);
  if (v === null) return String(input ?? '');
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits })
    .format(Number(v) / 10 ** maxDigits);
}

export const COMMON_CURRENCIES = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['PKR', 'Pakistani Rupee'],
  ['AED', 'UAE Dirham'],
  ['SAR', 'Saudi Riyal'],
  ['QAR', 'Qatari Riyal'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['NZD', 'New Zealand Dollar'],
  ['CHF', 'Swiss Franc'],
  ['SGD', 'Singapore Dollar'],
  ['INR', 'Indian Rupee'],
  ['JPY', 'Japanese Yen'],
  ['CNY', 'Chinese Yuan'],
  ['SEK', 'Swedish Krona'],
  ['NOK', 'Norwegian Krone'],
  ['DKK', 'Danish Krone'],
  ['ZAR', 'South African Rand'],
  ['TRY', 'Turkish Lira'],
  ['KWD', 'Kuwaiti Dinar'],
  ['BHD', 'Bahraini Dinar'],
  ['OMR', 'Omani Rial'],
  ['MYR', 'Malaysian Ringgit'],
];

/** All ISO currencies the browser knows, common ones first. */
export function currencyOptions() {
  const common = new Set(COMMON_CURRENCIES.map(([c]) => c));
  let rest = [];
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'currency' });
    rest = Intl.supportedValuesOf('currency')
      .filter((c) => !common.has(c))
      .map((c) => [c, names.of(c)]);
  } catch {
    /* older browsers: common list only */
  }
  return { common: COMMON_CURRENCIES, rest };
}
