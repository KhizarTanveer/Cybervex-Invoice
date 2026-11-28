import { computeTotals } from './calc';
import { deriveStatus } from './status';

const pad = (n) => String(n).padStart(2, '0');
export const monthKey = (iso) => iso.slice(0, 7);

/** The `count` calendar months ending with the month of `todayISO`, oldest first, as "YYYY-MM". */
export function lastMonths(todayISO, count = 12) {
  let y = Number(todayISO.slice(0, 4));
  let m = Number(todayISO.slice(5, 7));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Money received, per currency and month: every recorded payment counts in the
 * month it was received, so advances show up as soon as they are paid. Payments
 * settle the advance first (as in computeTotals), and that part is reported as
 * `advance`; the rest is `amount - advance`. Drafts and void documents are left out.
 * Returns Map<currency, Map<"YYYY-MM", { amount, advance, count }>>, where `count`
 * is how many documents received a payment that month.
 */
export function receivedByMonth(invoices, today) {
  const out = new Map();
  for (const inv of invoices) {
    const totals = computeTotals(inv);
    const status = deriveStatus(inv, totals, today);
    if (status === 'void' || status === 'draft') continue;

    const amountById = new Map(totals.paymentList.map((p) => [p.id, p.amount]));
    const payments = (inv.payments ?? [])
      .filter((p) => ISO.test(p.date ?? '') && (amountById.get(p.id) ?? 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!payments.length) continue;

    if (!out.has(inv.currency)) out.set(inv.currency, new Map());
    const months = out.get(inv.currency);
    let advanceLeft = totals.advance;
    const seen = new Set();
    for (const p of payments) {
      const amount = amountById.get(p.id);
      const advance = Math.min(amount, advanceLeft);
      advanceLeft -= advance;
      const key = monthKey(p.date);
      const cur = months.get(key) ?? { amount: 0, advance: 0, count: 0 };
      months.set(key, {
        amount: cur.amount + amount,
        advance: cur.advance + advance,
        count: cur.count + (seen.has(key) ? 0 : 1),
      });
      seen.add(key);
    }
  }
  return out;
}

/**
 * Everything the revenue report PDF lists for one currency over `months`
 * ("YYYY-MM", oldest first): each payment with its client and document, a
 * per-client summary and the monthly totals. Same rules as receivedByMonth.
 */
export function revenueReport(invoices, today, currency, months) {
  const inRange = new Set(months);
  const payments = [];
  const clients = new Map();

  for (const inv of invoices) {
    if (inv.currency !== currency) continue;
    const totals = computeTotals(inv);
    const status = deriveStatus(inv, totals, today);
    if (status === 'void' || status === 'draft') continue;

    const company = inv.to?.company?.trim() || 'Untitled client';
    const key = company.toLowerCase();
    const client = clients.get(key) ?? {
      company, contact: '', email: '', documents: 0, payments: 0, received: 0, outstanding: 0,
    };
    client.contact ||= inv.to?.contact?.trim() || '';
    client.email ||= inv.to?.email?.trim() || '';

    const amountById = new Map(totals.paymentList.map((p) => [p.id, p.amount]));
    const list = (inv.payments ?? [])
      .filter((p) => ISO.test(p.date ?? '') && (amountById.get(p.id) ?? 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    let advanceLeft = totals.advance;
    let counted = false;
    for (const p of list) {
      const amount = amountById.get(p.id);
      const advance = Math.min(amount, advanceLeft);
      advanceLeft -= advance;
      if (!inRange.has(monthKey(p.date))) continue;
      counted = true;
      let type = 'Payment';
      if (advance === amount) type = 'Advance';
      else if (advance > 0) type = 'Advance + balance';
      else if (totals.advance > 0) type = 'Balance';
      payments.push({
        date: p.date, month: monthKey(p.date), company, number: inv.number || '—',
        kind: inv.kind === 'quotation' ? 'Quotation' : 'Invoice',
        type, method: p.method || '', reference: p.reference || '', amount, advance,
      });
      client.payments += 1;
      client.received += amount;
    }
    // A client is listed when they paid in the period or still owe something.
    const owed = ['unpaid', 'partial', 'advance', 'overdue'].includes(status) ? Math.max(totals.balance, 0) : 0;
    if (counted || owed > 0) {
      client.documents += 1;
      client.outstanding += owed;
      clients.set(key, client);
    }
  }

  payments.sort((a, b) => b.date.localeCompare(a.date) || a.company.localeCompare(b.company));
  const monthly = months.map((key) => {
    const rows = payments.filter((p) => p.month === key);
    const amount = rows.reduce((s, p) => s + p.amount, 0);
    const advance = rows.reduce((s, p) => s + p.advance, 0);
    return { key, amount, advance, payments: rows.length };
  });
  return {
    currency,
    months,
    monthly,
    payments,
    clients: [...clients.values()].sort((a, b) => b.received - a.received || b.outstanding - a.outstanding),
    total: monthly.reduce((s, m) => s + m.amount, 0),
    advances: monthly.reduce((s, m) => s + m.advance, 0),
  };
}

/** A round axis maximum at or above `v` (1, 2, 2.5, 5 × 10ⁿ). */
export function niceMax(v) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].find((f) => f * exp >= v) * exp;
}
