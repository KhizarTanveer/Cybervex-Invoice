// Dates are stored as ISO calendar dates ("2026-11-02") with no time zone,
// so an invoice dated the 2nd never shows as the 1st in another region.

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isValidISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso, days) {
  if (!isValidISO(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from one ISO date to another (negative when `to` is earlier). */
export function daysBetween(from, to) {
  if (!isValidISO(from) || !isValidISO(to)) return null;
  const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

/** "02 Nov 2026": unambiguous for international clients. */
export function formatDate(iso) {
  if (!isValidISO(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export const PAYMENT_TERMS = [
  { value: 'receipt', label: 'Due on receipt', days: 0 },
  { value: 'net7', label: 'Net 7', days: 7 },
  { value: 'net14', label: 'Net 14', days: 14 },
  { value: 'net15', label: 'Net 15', days: 15 },
  { value: 'net30', label: 'Net 30', days: 30 },
  { value: 'net45', label: 'Net 45', days: 45 },
  { value: 'net60', label: 'Net 60', days: 60 },
  { value: 'custom', label: 'Custom', days: null },
];

/**
 * A quotation states terms for the invoice that follows acceptance, so they
 * count from that invoice, not from the quotation's own date.
 */
export function termLabelFor(term, quote = false) {
  if (!quote || term.days === null) return term.label;
  return term.days === 0 ? 'Due on receipt of invoice' : `${term.label} from invoice date`;
}

export function termsLabel(invoice, quote = false) {
  if (invoice.terms === 'custom') return invoice.customTerms?.trim() || 'Custom';
  const t = PAYMENT_TERMS.find((x) => x.value === invoice.terms);
  return t ? termLabelFor(t, quote) : '';
}

/** How long a quotation's prices stand, in days from its issue date. */
export const QUOTE_VALIDITY_DAYS = [7, 15, 30, 60];
export const DEFAULT_QUOTE_VALIDITY = 15;

export function dueDateForTerms(issueDate, terms) {
  const t = PAYMENT_TERMS.find((x) => x.value === terms);
  return t && t.days !== null ? addDays(issueDate, t.days) : null;
}
