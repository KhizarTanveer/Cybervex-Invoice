// Invoice numbers look like CVD-2026-0007. The next number is one past the highest
// number ever issued for that prefix and year, including deleted invoices (tracked
// by a persisted counter), so a number is never handed out twice.

export function normalizeNumber(n) {
  return String(n ?? '').trim().toUpperCase();
}

export function sanitizePrefix(prefix) {
  return String(prefix ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'INV';
}

export function seriesKey(prefix, year) {
  return `${sanitizePrefix(prefix)}-${year}`;
}

export function formatNumber(prefix, year, seq) {
  return `${seriesKey(prefix, year)}-${String(seq).padStart(4, '0')}`;
}

function highestSeq(invoices, key) {
  const re = new RegExp(`^${key}-(\\d+)$`);
  return invoices.reduce((max, inv) => {
    const m = re.exec(normalizeNumber(inv.number));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}

export function nextInvoiceNumber(invoices, counters, prefix, year) {
  const key = seriesKey(prefix, year);
  let seq = Math.max(highestSeq(invoices, key), counters?.[key] ?? 0) + 1;
  const taken = new Set(invoices.map((i) => normalizeNumber(i.number)));
  while (taken.has(formatNumber(prefix, year, seq))) seq += 1;
  return formatNumber(prefix, year, seq);
}

export function isDuplicateNumber(number, invoices, excludeId) {
  const n = normalizeNumber(number);
  return invoices.some((i) => i.id !== excludeId && normalizeNumber(i.number) === n);
}

/** Counter update after saving `number`: keeps the series high-water mark. */
/** Combine two counter sets, keeping the highest number used for each prefix and year. */
export function mergeCounters(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(out[k] ?? 0, Number(v) || 0);
  return out;
}

export function bumpCounters(counters, number) {
  const m = /^([A-Z0-9]+-\d{4})-(\d+)$/.exec(normalizeNumber(number));
  if (!m) return counters;
  const [, key, seq] = m;
  return Number(seq) > (counters?.[key] ?? 0) ? { ...counters, [key]: Number(seq) } : counters;
}
